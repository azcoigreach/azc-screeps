/* ***********************************************************
 *	[sec13a] DEFINITIONS: SHARD COORDINATOR
 * *********************************************************** */

global.ShardCoordinator = {

	/**
	 * Publish current shard status to InterShardMemory
	 * Wrapper for ISM.publishStatus() with additional shard-specific logic
	 */
	publishShardStatus: function() {
		if (!Game.shard) {
			return; // Not on multi-shard server
		}

		Stats_CPU.Start("ShardCoordinator", "publishShardStatus");
		
		// Update portal information in ISM colonies data
		this.updatePortalRooms();
		
		// Publish to ISM
		ISM.publishStatus();
		
		Stats_CPU.End("ShardCoordinator", "publishShardStatus");
	},

	/**
	 * Update colony portal room information
	 * Adds portal_rooms array to each colony based on known portals
	 */
	updatePortalRooms: function() {
		let portals = Portals.getAll();
		
		// Group portals by room
		let portalsByRoom = {};
		_.each(portals, portal => {
			let roomName = portal.pos.roomName;
			if (!portalsByRoom[roomName]) {
				portalsByRoom[roomName] = [];
			}
			portalsByRoom[roomName].push(portal);
		});

		// Update Memory with portal rooms (will be picked up by ISM.publishStatus)
		_.each(Game.rooms, room => {
			if (room.controller && room.controller.my) {
				// Check if this room or nearby rooms have portals
				let nearbyPortalRooms = [];
				
				if (portalsByRoom[room.name]) {
					nearbyPortalRooms.push(room.name);
				}
				
				// Store in temporary location for ISM publishing
				if (!_.get(Memory, ["rooms", room.name, "portals"])) {
					_.set(Memory, ["rooms", room.name, "portals"], {});
				}
				_.set(Memory, ["rooms", room.name, "portals", "nearby_rooms"], nearbyPortalRooms);
			}
		});
	},

	/**
	 * Get status from a specific shard
	 * @param {string} shardName - Name of shard
	 * @returns {object|null} - Shard status or null
	 */
	getShardStatus: function(shardName) {
		return ISM.getShardStatus(shardName);
	},

	/**
	 * Get status from all shards
	 * @returns {object} - Map of shardName -> status
	 */
	getAllShardStatuses: function() {
		return ISM.getAllShardStatuses();
	},

	/**
	 * Determine if current shard should assist another shard with spawning
	 * @param {string} targetShard - Shard requesting assistance
	 * @returns {boolean} - True if can assist
	 */
	shouldAssistShard: function(targetShard) {
		if (!Game.shard) {
			return false;
		}

		let currentShard = Game.shard.name;
		
		// Don't assist self
		if (currentShard === targetShard) {
			return false;
		}

		// Check if we have available spawns and energy
		let availableSpawns = 0;
		let totalEnergy = 0;
		
		_.each(Game.rooms, room => {
			if (room.controller && room.controller.my) {
				availableSpawns += room.find(FIND_MY_SPAWNS).filter(s => !s.spawning).length;
				totalEnergy += (room.storage ? room.storage.store.energy : 0) +
				               (room.terminal ? room.terminal.store.energy : 0);
			}
		});

		// Can assist if we have spare capacity
		let canAssist = availableSpawns > 0 && 
		                totalEnergy > 100000 && 
		                Game.cpu.bucket > 5000;

		return canAssist;
	},

	/**
	 * Monitor ongoing cross-shard operations
	 * Check status and clean up completed/failed operations
	 */
	monitorOperations: function() {
		if (!Game.shard) {
			return;
		}

		Stats_CPU.Start("ShardCoordinator", "monitorOperations");

		// Monitor colonization operations
		this.monitorColonizations();
		
		// Monitor creep transfers
		this.monitorCreepTransfers();
		
		Stats_CPU.End("ShardCoordinator", "monitorOperations");
	},

	/**
	 * Monitor colonization operations
	 */
	monitorColonizations: function() {
		let colonizations = _.get(Memory, ["shard", "operations", "colonizations"], []);
		
		_.each(colonizations, op => {
			// Check operation status
			let age = Game.time - (op.start_tick || Game.time);
			
			if (op.status === "spawning") {
				// Process spawning for cross-shard colonization
				this.processColonizationSpawning(op);
				
				// Check if creeps have spawned
				let allSpawned = _.every(op.creeps || [], creepName => {
					return Game.creeps[creepName] !== undefined;
				});
				
				if (allSpawned && op.creeps && op.creeps.length > 0) {
					op.status = "traveling";
					console.log(`<font color="#00FF00">[ShardCoordinator]</font> Colonization ${op.id}: All creeps spawned, now traveling`);
				}
			}
			
			if (op.status === "traveling") {
				// Creeps should be moving to portal
				// Status will be updated by arrival processing on destination shard
			}
			
			if (op.status === "establishing") {
				// Colony being established on destination shard
				// Check if spawn has been built
			}
			
			// Timeout check
			if (age > 10000) {
				console.log(`<font color="#FF0000">[ShardCoordinator]</font> Colonization ${op.id} timed out after ${age} ticks`);
				op.status = "failed";
			}
		});

		// Clean up completed/failed operations
		Memory.shard.operations.colonizations = _.filter(colonizations, op => {
			return op.status !== "complete" && op.status !== "failed";
		});
	},

	/**
	 * Process spawning for cross-shard colonization operations
	 * @param {object} operation - Colonization operation
	 */
	processColonizationSpawning: function(operation) {
		// First, clean up any missing creeps from the operation list
		if (operation.creeps && operation.creeps.length > 0) {
			let existingCreeps = _.filter(operation.creeps, creepName => Game.creeps[creepName] !== undefined);
			let missingCreeps = _.filter(operation.creeps, creepName => Game.creeps[creepName] === undefined);
			
			if (missingCreeps.length > 0) {
				console.log(`<font color="#FFA500">[ShardCoordinator]</font> Colonization ${operation.id}: Cleaning up ${missingCreeps.length} missing creeps`);
				operation.creeps = existingCreeps; // Update list to only include existing creeps
			}
			
			// If we have existing creeps, check if we need more (only spawn one at a time)
			if (existingCreeps.length > 0) {
				return; // Already have active creeps, wait for them before spawning more
			}
		}
		
		// Check for pending spawn requests to avoid duplicates
		let pendingRequests = _.filter(Memory.shard.spawn_requests || [], request => 
			request.args && request.args.shard_operation === operation.id
		);
		if (pendingRequests.length > 0) {
			return; // Already have pending requests
		}

		// For cross-shard colonization, we only need one colonizer to claim the controller
		// But since we cleaned up missing creeps above, if we reach here we can spawn
		let existingCount = operation.creeps ? _.filter(operation.creeps, creepName => Game.creeps[creepName] !== undefined).length : 0;
		if (existingCount >= 1) {
			return; // Already have one active colonizer
		}

		// Check if we have available spawns
		let availableSpawns = _.filter(Game.spawns, spawn => !spawn.spawning);
		if (availableSpawns.length === 0) {
			return;
		}

		// Get source room
		let sourceRoom = operation.source_room;
		if (!sourceRoom || !Game.rooms[sourceRoom]) {
			// Fallback to first available room
			sourceRoom = Object.keys(Game.rooms)[0];
		}

		// We've already checked for existing creeps and pending requests at the beginning
		// Now proceed with creating the spawn request
		
		// Generate unique name for tracking
		let creepName = `colonizer_${operation.dest_shard}_${operation.dest_room}_${Game.time}`;
		
		// Determine appropriate level based on room energy capacity
		let sourceRoomObj = Game.rooms[sourceRoom];
		let energyCapacity = sourceRoomObj ? sourceRoomObj.energyCapacityAvailable : 1200;
		let colonizerLevel;
		
		if (energyCapacity >= 1700) {
			colonizerLevel = 6; // 1,700 energy - 2x CLAIM, 10x MOVE
		} else if (energyCapacity >= 850) {
			colonizerLevel = 4; // 850 energy - 1x CLAIM, 5x MOVE
		} else if (energyCapacity >= 750) {
			colonizerLevel = 3; // 750 energy - 1x CLAIM, 3x MOVE
		} else {
			// For cross-shard colonization, we MUST have CLAIM parts - Level 1/2 can't claim
			console.log(`<font color="#FF0000">[ShardCoordinator]</font> Room capacity too low for cross-shard colonizer: ${energyCapacity}/750 (minimum for CLAIM parts)`);
			return; // Don't spawn non-functional colonizers
		}
		
		// For cross-shard colonization, create the spawn request and let the spawn processing handle energy timing
		// Only prevent creation if the room capacity is insufficient for any functional colonizer
		let requiredEnergy = colonizerLevel === 6 ? 1700 : colonizerLevel === 4 ? 850 : 750; // Always at least Level 3
		if (sourceRoomObj && sourceRoomObj.energyCapacityAvailable < requiredEnergy) {
			console.log(`<font color="#FFA500">[ShardCoordinator]</font> Room capacity too low for colonizer: ${sourceRoomObj.energyCapacityAvailable}/${requiredEnergy}`);
			return; // Room can't provide enough energy even when full
		}
		
		// Log energy status but don't block request creation
		if (sourceRoomObj && sourceRoomObj.energyAvailable < requiredEnergy) {
			console.log(`<font color="#FFA500">[ShardCoordinator]</font> Low energy for colonizer: ${sourceRoomObj.energyAvailable}/${requiredEnergy}, will wait for energy`);
		}
		
		// Add spawn request for colonizer
		if (!Memory.shard.spawn_requests) {
			Memory.shard.spawn_requests = [];
		}
		
		Memory.shard.spawn_requests.push({
			room: sourceRoom,
			listRooms: null,
			priority: 15, // Higher priority than regular colonization for cross-shard
			level: colonizerLevel, // Appropriate level for room capacity
			scale: false,
			body: "reserver_at", // Colonizer body type
			name: creepName,
			args: {
				role: "colonizer",
				room: operation.dest_room,
				colony: sourceRoom,
				shard_operation: operation.id,
				dest_shard: operation.dest_shard,
				layout: operation.layout,
				focus_defense: operation.focus_defense,
				list_route: operation.list_route,
				portal_route: operation.portal_route,
				portal_dest_room: operation.portal_dest_room,
				dest_list_route: operation.dest_list_route
			}
		});

		// Debug: Verify the request was actually added to memory
		let verifyRequests = Memory.shard.spawn_requests || [];
		let verifyCrossShard = _.filter(verifyRequests, req => req.args && req.args.shard_operation);
		console.log(`<font color="#00FF00">[ShardCoordinator]</font> Verified: ${verifyRequests.length} total requests, ${verifyCrossShard.length} cross-shard in memory`);

		// Track this creep in the operation
		if (!operation.creeps) {
			operation.creeps = [];
		}
		operation.creeps.push(creepName);

		console.log(`<font color="#00FF00">[ShardCoordinator]</font> Colonization ${operation.id}: Spawn request created for colonizer ${creepName} (level ${colonizerLevel})`);
		
		// Debug: Immediately check if the request is in the array
		let currentRequests = Memory.shard.spawn_requests || [];
		let crossShardCount = _.filter(currentRequests, req => req.args && req.args.shard_operation).length;
		console.log(`<font color="#00FF00">[ShardCoordinator]</font> Total spawn requests now: ${currentRequests.length}, cross-shard: ${crossShardCount}`);
	},

	/**
	 * Monitor creep transfer operations
	 */
	monitorCreepTransfers: function() {
		let transfers = _.get(Memory, ["shard", "operations", "creep_transfers"], []);
		
		_.each(transfers, transfer => {
			// Check if creep still exists (hasn't entered portal yet)
			if (Game.creeps[transfer.creep_name]) {
				transfer.status = "traveling";
			}
			
			// Timeout check
			if (Game.time > transfer.expected_arrival_tick + 1000) {
				console.log(`<font color="#FF0000">[ShardCoordinator]</font> Transfer ${transfer.id} timed out`);
				transfer.status = "failed";
			}
		});

		// Clean up old transfers
		Memory.shard.operations.creep_transfers = _.filter(transfers, transfer => {
			return transfer.status === "traveling";
		});
	},

	/**
	 * Plan a cross-shard colonization
	 * @param {string} targetShard - Destination shard
	 * @param {string} targetRoom - Destination room
	 * @param {object} options - Colonization options
	 * @returns {string|null} - Operation ID or null if failed
	 */
	planColonization: function(targetShard, targetRoom, options = {}) {
		if (!Game.shard) {
			console.log("<font color='#FF0000'>[ShardCoordinator]</font> Not on multi-shard server");
			return null;
		}

		let currentShard = Game.shard.name;
		
		// Prevent trying to colonize the same shard we're already on
		if (currentShard === targetShard) {
			console.log(`<font color='#FFA500'>[ShardCoordinator]</font> Already on target shard ${targetShard}, colonization should be handled by local systems`);
			return null;
		}
		
		// Find portal route
		let sourceRoom = options.sourceRoom || Object.keys(Game.rooms)[0];
		let route = Portals.getPortalRoute(sourceRoom, targetShard, targetRoom);
		
		if (!route) {
			console.log(`<font color='#FF0000'>[ShardCoordinator]</font> No portal route found to ${targetShard}`);
			return null;
		}

		// Plan route from source room to portal
		let listRouteSource = null;
		let destListRoute = null;
		
		// Check if a custom route was provided
		if (options.list_route && Array.isArray(options.list_route) && options.list_route.length > 0) {
			console.log(`<font color="#00FF00">[ShardCoordinator]</font> Using custom route: ${options.list_route.join(' -> ')}`);
			
			// Find where the route crosses shards (portal destination room)
			let portalDestRoom = route.portal.destination.room;
			let portalIndex = options.list_route.indexOf(portalDestRoom);
			
			if (portalIndex > 0) {
				// Split the route: source -> portal and portal -> target
				listRouteSource = options.list_route.slice(0, portalIndex);
				destListRoute = options.list_route.slice(portalIndex);
				console.log(`<font color="#00FF00">[ShardCoordinator]</font> Source route: ${listRouteSource.join(' -> ')}`);
				console.log(`<font color="#00FF00">[ShardCoordinator]</font> Dest route: ${destListRoute.join(' -> ')}`);
			} else {
				// Portal room not found in route, use auto-generated route
				console.log(`<font color="#FFA500">[ShardCoordinator]</font> Portal room ${portalDestRoom} not found in provided route, using auto-generated`);
				let sourceToPortalRoute = Game.map.findRoute(sourceRoom, route.portal.pos.roomName);
				if (sourceToPortalRoute !== ERR_NO_PATH && sourceToPortalRoute.length > 0) {
					listRouteSource = sourceToPortalRoute.map(segment => segment.room);
				}
			}
		} else {
			// No custom route provided, use auto-generated
			let sourceToPortalRoute = Game.map.findRoute(sourceRoom, route.portal.pos.roomName);
			if (sourceToPortalRoute !== ERR_NO_PATH && sourceToPortalRoute.length > 0) {
				listRouteSource = sourceToPortalRoute.map(segment => segment.room);
			}
		}

		// Get portal destination room for reference
		let portalDestRoom = route.portal.destination.room;

		// Create colonization operation
		let opId = `colonize_${targetShard}_${targetRoom}_${Game.time}`;
		let operation = {
			id: opId,
			source_shard: currentShard,
			source_room: sourceRoom,
			dest_shard: targetShard,
			dest_room: targetRoom,
			status: "spawning",
			creeps: [],
			portal_route: route,
			start_tick: Game.time,
			layout: options.layout || null,
			focus_defense: options.focus_defense || false,
			list_route: listRouteSource,
			portal_dest_room: portalDestRoom,
			dest_list_route: destListRoute
		};

		// Add to operations queue
		if (!_.get(Memory, ["shard", "operations", "colonizations"])) {
			_.set(Memory, ["shard", "operations", "colonizations"], []);
		}
		Memory.shard.operations.colonizations.push(operation);

		console.log(`<font color="#00FF00">[ShardCoordinator]</font> Colonization planned: ${targetShard}/${targetRoom} via ${route.portal.pos.roomName}`);
		if (options.layout) {
			console.log(`<font color="#00FF00">[ShardCoordinator]</font> Layout: ${options.layout.name} at (${options.layout.origin.x}, ${options.layout.origin.y})`);
		}
		
		return opId;
	},

	/**
	 * Display shard status summary
	 */
	displayStatus: function() {
		if (!Game.shard) {
			console.log("<font color='#FF0000'>[ShardCoordinator]</font> Not on multi-shard server");
			return;
		}

		console.log(`<font color='#00FFFF'>[ShardCoordinator]</font> === Multi-Shard Status ===`);
		
		let allStatuses = this.getAllShardStatuses();
		
		_.each(Object.keys(allStatuses), shardName => {
			let status = allStatuses[shardName];
			let colonies = Object.keys(status.colonies || {}).length;
			let energy = _.get(status, ["resources", "energy"], 0);
			let cpu = _.get(status, ["cpu", "used"], 0);
			let bucket = _.get(status, ["cpu", "bucket"], 0);
			let tick = status.tick || 0;
			let age = Game.time - tick;
			
			let current = (Game.shard.name === shardName) ? " (current)" : "";
			
			console.log(`<font color='#00FFFF'>[ShardCoordinator]</font> ${shardName}${current}:`);
			console.log(`<font color='#00FFFF'>[ShardCoordinator]</font>   Colonies: ${colonies}, Energy: ${energy.toLocaleString()}`);
			console.log(`<font color='#00FFFF'>[ShardCoordinator]</font>   CPU: ${cpu.toFixed(1)}, Bucket: ${bucket}, Data age: ${age} ticks`);
		});

		// Show operations
		let colonizations = _.get(Memory, ["shard", "operations", "colonizations"], []);
		let transfers = _.get(Memory, ["shard", "operations", "creep_transfers"], []);
		
		if (colonizations.length > 0 || transfers.length > 0) {
			console.log(`<font color='#00FFFF'>[ShardCoordinator]</font> === Active Operations ===`);
			console.log(`<font color='#00FFFF'>[ShardCoordinator]</font> Colonizations: ${colonizations.length}`);
			console.log(`<font color='#00FFFF'>[ShardCoordinator]</font> Creep transfers: ${transfers.length}`);
		}
	}
};

