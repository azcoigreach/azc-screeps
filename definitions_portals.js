/* ***********************************************************
 *	[sec12a] DEFINITIONS: PORTALS
 * *********************************************************** */

global.Portals = {

	/**
	 * Scan all visible rooms for portals
	 * Should be called on long pulse to minimize CPU usage
	 */
	scanPortals: function() {
		if (!Game.shard) {
			return; // Not on multi-shard server
		}

		Stats_CPU.Start("Portals", "scanPortals");

		let portalsFound = 0;
		let currentShard = Game.shard.name;

		// Initialize portal storage in memory
		if (!_.get(Memory, ["shard", "portals"])) {
			_.set(Memory, ["shard", "portals"], {});
		}

		// Scan all visible rooms
		_.each(Game.rooms, room => {
			// Look for portal structures
			let portals = room.find(FIND_STRUCTURES, {
				filter: s => s.structureType === STRUCTURE_PORTAL
			});

			_.each(portals, portal => {
				if (portal.destination) {
					let portalId = `${room.name}_${portal.pos.x}_${portal.pos.y}`;
					
					// Determine if destination is another shard
					let destShard = portal.destination.shard || currentShard;
					let destRoom = portal.destination.roomName || portal.destination.room || "unknown";
					
					// Store portal data
					_.set(Memory, ["shard", "portals", portalId], {
						pos: {
							x: portal.pos.x,
							y: portal.pos.y,
							roomName: room.name
						},
						destination: {
							shard: destShard,
							room: destRoom
						},
						// Portals with ticksToDecay are unstable
						stable: portal.ticksToDecay === undefined,
						ticksToDecay: portal.ticksToDecay || null,
						lastSeen: Game.time
					});

					portalsFound++;
				}
			});
		});

		// Clean up old portal data (not seen in 10000 ticks)
		let portals = _.get(Memory, ["shard", "portals"], {});
		_.each(Object.keys(portals), portalId => {
			if (Game.time - portals[portalId].lastSeen > 10000) {
				delete Memory.shard.portals[portalId];
			}
		});

		if (portalsFound > 0) {
			console.log(`<font color="#00FFFF">[Portals]</font> Detected ${portalsFound} portal(s) across ${Object.keys(Game.rooms).length} visible rooms`);
		}

		Stats_CPU.End("Portals", "scanPortals");
	},

	/**
	 * Get all known portals on current shard
	 * @returns {array} - Array of portal objects
	 */
	getAll: function() {
		let portals = _.get(Memory, ["shard", "portals"], {});
		return _.map(Object.keys(portals), portalId => {
			return {
				id: portalId,
				...portals[portalId]
			};
		});
	},

	/**
	 * Get portals that lead to a specific shard
	 * @param {string} targetShard - Destination shard name
	 * @returns {array} - Array of portal objects
	 */
	getPortalsToShard: function(targetShard) {
		let allPortals = this.getAll();
		return _.filter(allPortals, portal => {
			return portal.destination.shard === targetShard;
		});
	},

	/**
	 * Get portals in a specific room
	 * @param {string} roomName - Room name
	 * @returns {array} - Array of portal objects
	 */
	getPortalsInRoom: function(roomName) {
		let allPortals = this.getAll();
		return _.filter(allPortals, portal => {
			return portal.pos.roomName === roomName;
		});
	},

	/**
	 * Find optimal portal route from source room to destination shard
	 * Enhanced Phase 3 version with caching and stability checks
	 * @param {string} sourceRoom - Starting room name
	 * @param {string} destShard - Destination shard name
	 * @param {string} destRoom - Destination room name (optional)
	 * @returns {object|null} - Route object or null if no route found
	 */
	getPortalRoute: function(sourceRoom, destShard, destRoom) {
		if (!Game.shard) {
			return null;
		}

		let currentShard = Game.shard.name;
		
		// Already on destination shard
		if (currentShard === destShard) {
			return null;
		}

		// Check cache first (valid for 1000 ticks)
		let cacheKey = `${sourceRoom}_${destShard}`;
		let cache = _.get(Memory, ["shard", "portal_routes", cacheKey]);
		
		if (cache && Game.time - cache.tick < 1000) {
			// Verify cached portal still exists and is stable
			let portal = _.get(Memory, ["shard", "portals", cache.portalId]);
			if (portal && (portal.stable || portal.ticksToDecay > 500)) {
				return {
					portal: portal,
					portalId: cache.portalId,
					distance: cache.distance,
					sourceRoom: sourceRoom,
					destShard: destShard,
					destRoom: destRoom || portal.destination.room,
					estimatedTravelTime: cache.distance * 50,
					cached: true
				};
			}
		}

		// Get portals to destination shard
		let portals = this.getPortalsToShard(destShard);
		
		if (portals.length === 0) {
			console.log(`<font color="#FF0000">[Portals]</font> No portals found to shard ${destShard}`);
			return null;
		}

		// Filter for stable portals or unstable with >500 ticks remaining
		// For testing: Allow any portal if none are explicitly marked as stable
		let viablePortals = _.filter(portals, portal => {
			return portal.stable || (portal.ticksToDecay && portal.ticksToDecay > 500);
		});
		
		// Log portal availability status (but don't treat it as an error)
		if (viablePortals.length === 0 && portals.length > 0) {
			console.log(`<font color="#FFA500">[Portals]</font> Found ${portals.length} portal(s) to shard ${destShard}, checking stability...`);
		}

		// If no "stable" portals found, use any portal for testing
		if (viablePortals.length === 0) {
			viablePortals = portals;
			console.log(`<font color="#FFA500">[Portals]</font> No explicitly stable portals to shard ${destShard}, using available portals for cross-shard travel`);
		}

		// Find nearest viable portal
		let nearest = null;
		let shortestDistance = Infinity;

		_.each(viablePortals, portal => {
			// Calculate route distance to portal
			let route = Game.map.findRoute(sourceRoom, portal.pos.roomName);
			if (route !== ERR_NO_PATH && route.length < shortestDistance) {
				shortestDistance = route.length;
				nearest = portal;
			}
		});

		if (!nearest) {
			console.log(`<font color="#FF0000">[Portals]</font> No path to any portal from ${sourceRoom}`);
			return null;
		}

		// Cache the route
		if (!_.get(Memory, ["shard", "portal_routes"])) {
			_.set(Memory, ["shard", "portal_routes"], {});
		}
		
		_.set(Memory, ["shard", "portal_routes", cacheKey], {
			portalId: nearest.id,
			distance: shortestDistance,
			tick: Game.time
		});

		return {
			portal: nearest,
			portalId: nearest.id,
			distance: shortestDistance,
			sourceRoom: sourceRoom,
			destShard: destShard,
			destRoom: destRoom || nearest.destination.room,
			estimatedTravelTime: shortestDistance * 50,
			cached: false
		};
	},

	/**
	 * Record expected creep arrival via portal
	 * Enhanced Phase 3 version with memory preservation
	 * @param {string} creepName - Name of creep
	 * @param {string} destShard - Destination shard
	 * @param {string} destRoom - Destination room
	 * @param {number} expectedTick - Expected arrival tick
	 * @param {object} memory - Creep memory to transfer (optional)
	 */
	expectArrival: function(creepName, destShard, destRoom, expectedTick, memory) {
		if (!_.get(Memory, ["shard", "operations", "creep_transfers"])) {
			_.set(Memory, ["shard", "operations", "creep_transfers"], []);
		}

		// Preserve important creep memory for transfer
		let preservedMemory = memory || {};
		if (Game.creeps[creepName]) {
			let creep = Game.creeps[creepName];
			preservedMemory = {
				role: creep.memory.role,
				room: destRoom,
				origin: destRoom,
				level: creep.memory.level,
				site: creep.memory.site,
				// Don't preserve task, path, or other temporary data
			};
		}

		// Add transfer record
		let transfer = {
			id: `transfer_${Game.time}_${creepName}`,
			creep_name: creepName,
			source_shard: Game.shard ? Game.shard.name : "sim",
			dest_shard: destShard,
			dest_room: destRoom,
			expected_arrival_tick: expectedTick,
			status: "traveling",
			departure_tick: Game.time,
			memory: preservedMemory
		};

		Memory.shard.operations.creep_transfers.push(transfer);
		
		console.log(`<font color="#00FFFF">[Portals]</font> Tracking ${creepName} transfer to ${destShard}/${destRoom} (ETA: ${expectedTick - Game.time} ticks)`);
	},

	/**
	 * Detect and restore memory for creeps that arrived via portal but lost their memory
	 * This is a fallback for when ISM hasn't synced yet
	 */
	restoreLostCreepMemory: function() {
		if (!Game.shard) {
			return 0;
		}

		let restored = 0;

		// Find creeps with empty or minimal memory (likely just arrived)
		_.each(Game.creeps, creep => {
			// Check if creep has no role (empty memory from portal transfer)
			if (!creep.memory.role) {
				// Infer role from creep name pattern
				let role = null;
				let roomName = creep.room.name;

				// Match naming patterns: port:xxxx, work:xxxx, mine:xxxx, etc.
				if (creep.name.startsWith("port:")) {
					role = "portal_scout";
				} else if (creep.name.startsWith("work:")) {
					role = "worker";
				} else if (creep.name.startsWith("mine:")) {
					role = "miner";
				} else if (creep.name.startsWith("sold:")) {
					role = "soldier";
				} else if (creep.name.startsWith("clai:")) {
					role = "claimer";
				} else if (creep.name.startsWith("heal:")) {
					role = "healer";
				} else if (creep.name.startsWith("carr:")) {
					role = "carrier";
				} else if (creep.name.startsWith("oper:")) {
					role = "operator";
				}

				if (role) {
					console.log(`<font color="#FFA500">[Portals]</font> Restoring lost memory for ${creep.name} (detected as ${role}) in ${roomName}`);

					// Restore basic memory
					creep.memory.role = role;
					creep.memory.room = roomName;
					creep.memory.origin = roomName;

					// Role-specific memory restoration
					if (role === "portal_scout") {
						creep.memory.explore_mode = true;
						creep.memory.test_mode = false;
						creep.say("Restored!");
					}

					restored++;
				}
			}
		});

		return restored;
	},

	/**
	 * Process expected creep arrivals on current shard
	 * Enhanced Phase 3 version with memory restoration and error handling
	 */
	processArrivals: function() {
		if (!Game.shard) {
			return;
		}

		Stats_CPU.Start("Portals", "processArrivals");

		let currentShard = Game.shard.name;
		let arrivalsProcessed = 0;
		let timeoutsDetected = 0;
		
		// First, try to restore any creeps with lost memory (fallback system)
		let restoredCreeps = this.restoreLostCreepMemory();
		
		// Read all shard statuses from ISM
		let allStatuses = ISM.getAllShardStatuses();
		
		// Check for creeps expected to arrive on this shard
		_.each(Object.keys(allStatuses), otherShard => {
			if (otherShard === currentShard) {
				return; // Skip current shard
			}

			let status = allStatuses[otherShard];
			let transfers = _.get(status, ["operations", "creep_transfers"], []);
			
			_.each(transfers, transfer => {
				if (transfer.dest_shard === currentShard && transfer.status === "traveling") {
					// Check if creep has arrived
					let creep = Game.creeps[transfer.creep_name];
					
					if (creep) {
						// Creep has arrived!
						console.log(`<font color="#00FF00">[Portals]</font> Creep ${transfer.creep_name} arrived from ${otherShard} to ${transfer.dest_room}`);
						
						// Restore preserved memory
						if (transfer.memory) {
							_.each(Object.keys(transfer.memory), key => {
								creep.memory[key] = transfer.memory[key];
							});
						}
						
						// Ensure destination room is set
						if (transfer.dest_room) {
							creep.memory.room = transfer.dest_room;
							creep.memory.origin = transfer.dest_room;
						}
						
						// Clear any travel state from portal traversal
						delete creep.memory.path;
						delete creep.memory.list_route;
						
						// Auto-reset scouts to exploration mode when they arrive on a new shard
						if (creep.memory.role === "portal_scout") {
							console.log(`<font color="#00FFFF">[Portals]</font> Auto-resetting scout ${transfer.creep_name} to exploration mode on ${currentShard}`);
							creep.memory.test_mode = false;
							creep.memory.portal_target_shard = undefined;
							creep.memory.portal_target_room = undefined;
							creep.memory.auto_test_attempted = false;
							creep.memory.target_room = undefined;
							creep.memory.explore_mode = true;
							creep.say("Exploring!");
						}
						
						arrivalsProcessed++;
						
						// Mark arrival (will be synced to ISM on next publish)
						// Note: We can't directly modify the other shard's memory,
						// but the other shard will clean up based on timeout
					} else {
						// Check for timeout (creep lost)
						let travelTime = Game.time - transfer.departure_tick;
						let expectedTime = transfer.expected_arrival_tick - transfer.departure_tick;
						
						if (Game.time > transfer.expected_arrival_tick + 500) {
							console.log(`<font color="#FF0000">[Portals]</font> Creep ${transfer.creep_name} from ${otherShard} timed out after ${travelTime} ticks (expected ${expectedTime})`);
							timeoutsDetected++;
						}
					}
				}
			});
		});

		// Clean up old transfer records from current shard
		let localTransfers = _.get(Memory, ["shard", "operations", "creep_transfers"], []);
		let beforeCount = localTransfers.length;
		
		Memory.shard.operations.creep_transfers = _.filter(localTransfers, transfer => {
			// Keep if still traveling and not timed out (1000 tick grace period)
			let keepTransfer = transfer.status === "traveling" && 
			                   Game.time < transfer.expected_arrival_tick + 1000;
			
			// Log cleanup
			if (!keepTransfer && Game.time >= transfer.expected_arrival_tick + 1000) {
				console.log(`<font color="#FF6600">[Portals]</font> Cleaning up timed-out transfer: ${transfer.creep_name} to ${transfer.dest_shard}`);
			}
			
			return keepTransfer;
		});
		
		let cleanedCount = beforeCount - Memory.shard.operations.creep_transfers.length;

		// Log summary if any activity
		if (arrivalsProcessed > 0 || timeoutsDetected > 0 || cleanedCount > 0 || restoredCreeps > 0) {
			let parts = [];
			if (arrivalsProcessed > 0) parts.push(`${arrivalsProcessed} arrivals`);
			if (restoredCreeps > 0) parts.push(`${restoredCreeps} restored`);
			if (timeoutsDetected > 0) parts.push(`${timeoutsDetected} timeouts`);
			if (cleanedCount > 0) parts.push(`${cleanedCount} cleaned`);
			console.log(`<font color="#00FFFF">[Portals]</font> Arrival processing: ${parts.join(", ")}`);
		}

		Stats_CPU.End("Portals", "processArrivals");
	},

	/**
	 * Display portal information
	 */
	display: function() {
		let portals = this.getAll();
		
		if (portals.length === 0) {
			console.log("<font color='#00FFFF'>[Portals]</font> No portals detected yet. Scan will run on next long pulse.");
			return;
		}

		console.log(`<font color='#00FFFF'>[Portals]</font> === Known Portals (${portals.length}) ===`);
		
		// Group by destination shard
		let byShard = {};
		_.each(portals, portal => {
			let shard = portal.destination.shard;
			if (!byShard[shard]) {
				byShard[shard] = [];
			}
			byShard[shard].push(portal);
		});

		_.each(Object.keys(byShard), shard => {
			console.log(`<font color='#00FFFF'>[Portals]</font> → ${shard}:`);
			_.each(byShard[shard], portal => {
				let stability = portal.stable ? "stable" : `unstable (${portal.ticksToDecay} ticks)`;
				let age = Game.time - portal.lastSeen;
				console.log(`<font color='#00FFFF'>[Portals]</font>   ${portal.pos.roomName} → ${portal.destination.room} (${stability}, seen ${age} ticks ago)`);
			});
		});
	},

	// Run all scouts globally (independent of colonies)
	// This allows scouts to function on shards without colonies
	runScouts: function() {
		let scouts = _.filter(Game.creeps, c => c.memory.role === "portal_scout");
		
		_.each(scouts, scout => {
			// Execute scout behavior
			Creep_Roles.Portal_Scout(scout);
		});
		
		return scouts.length;
	}
};

