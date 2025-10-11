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
		
		// Find portal route
		let sourceRoom = options.sourceRoom || Object.keys(Game.rooms)[0];
		let route = Portals.getPortalRoute(sourceRoom, targetShard, targetRoom);
		
		if (!route) {
			console.log(`<font color='#FF0000'>[ShardCoordinator]</font> No portal route found to ${targetShard}`);
			return null;
		}

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
			options: options
		};

		// Add to operations queue
		if (!_.get(Memory, ["shard", "operations", "colonizations"])) {
			_.set(Memory, ["shard", "operations", "colonizations"], []);
		}
		Memory.shard.operations.colonizations.push(operation);

		console.log(`<font color="#00FF00">[ShardCoordinator]</font> Colonization planned: ${targetShard}/${targetRoom} via ${route.portal.pos.roomName}`);
		
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

