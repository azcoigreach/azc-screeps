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

		// Get portals to destination shard
		let portals = this.getPortalsToShard(destShard);
		
		if (portals.length === 0) {
			console.log(`<font color="#FF0000">[Portals]</font> No portals found to shard ${destShard}`);
			return null;
		}

		// Find nearest portal (simple implementation - could be improved)
		let nearest = null;
		let shortestDistance = Infinity;

		_.each(portals, portal => {
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

		return {
			portal: nearest,
			distance: shortestDistance,
			sourceRoom: sourceRoom,
			destShard: destShard,
			destRoom: destRoom || nearest.destination.room,
			estimatedTravelTime: shortestDistance * 50 // Rough estimate: 50 ticks per room
		};
	},

	/**
	 * Record expected creep arrival via portal
	 * @param {string} creepName - Name of creep
	 * @param {string} destShard - Destination shard
	 * @param {string} destRoom - Destination room
	 * @param {number} expectedTick - Expected arrival tick
	 */
	expectArrival: function(creepName, destShard, destRoom, expectedTick) {
		if (!_.get(Memory, ["shard", "operations", "creep_transfers"])) {
			_.set(Memory, ["shard", "operations", "creep_transfers"], []);
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
			departure_tick: Game.time
		};

		Memory.shard.operations.creep_transfers.push(transfer);
		
		console.log(`<font color="#00FFFF">[Portals]</font> Tracking ${creepName} transfer to ${destShard}/${destRoom}`);
	},

	/**
	 * Process expected creep arrivals on current shard
	 * Check InterShardMemory for incoming creeps
	 */
	processArrivals: function() {
		if (!Game.shard) {
			return;
		}

		Stats_CPU.Start("Portals", "processArrivals");

		let currentShard = Game.shard.name;
		
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
						console.log(`<font color="#00FF00">[Portals]</font> Creep ${transfer.creep_name} arrived from ${otherShard}`);
						
						// Assign to destination room if specified
						if (transfer.dest_room && creep.memory) {
							creep.memory.room = transfer.dest_room;
							creep.memory.origin = transfer.dest_room;
						}
						
						// Mark arrival (this will be synced to ISM on next publish)
						// Note: We can't directly modify the other shard's memory,
						// but the other shard will clean up timed-out transfers
					}
					
					// Check for timeout (creep lost)
					if (Game.time > transfer.expected_arrival_tick + 500) {
						console.log(`<font color="#FF0000">[Portals]</font> Creep ${transfer.creep_name} from ${otherShard} timed out (likely lost)`);
					}
				}
			});
		});

		// Clean up old transfer records from current shard
		let localTransfers = _.get(Memory, ["shard", "operations", "creep_transfers"], []);
		Memory.shard.operations.creep_transfers = _.filter(localTransfers, transfer => {
			// Keep if still traveling and not timed out
			return transfer.status === "traveling" && 
			       Game.time < transfer.expected_arrival_tick + 1000;
		});

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
	}
};

