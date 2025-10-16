/* ***********************************************************
 * Global Creep Manager
 * 
 * Manages creeps operating on shards without colonies.
 * Enables cross-shard operations including:
 * - Portal discovery and mapping
 * - Resource scanning (power banks, deposits, minerals)
 * - Highway mining across shards
 * - Remote operations from home shard
 * 
 * *********************************************************** */

global.GlobalCreeps = {
	
	/**
	 * Run all creeps on shards without local colonies
	 * This enables creeps to function independently for exploration,
	 * resource gathering, and other cross-shard operations
	 */
	run: function() {
		// Get all creeps on this shard
		let allCreeps = _.values(Game.creeps);
		
		// Get all colonies on this shard
		let colonies = _.filter(Game.rooms, r => r.controller && r.controller.my);
		let colonyRooms = _.map(colonies, c => c.name);
		
		// Find creeps NOT assigned to any local colony
		let globalCreeps = _.filter(allCreeps, creep => {
			// If creep's assigned room is not a colony on this shard, it's a global creep
			return !colonyRooms.includes(creep.memory.room);
		});
		
		if (globalCreeps.length === 0) {
			return;
		}
		
		// Process each global creep by role
		_.each(globalCreeps, creep => {
			this.runCreep(creep);
		});
		
		return globalCreeps.length;
	},
	
	/**
	 * Run a single global creep based on its role
	 */
	runCreep: function(creep) {
		let role = creep.memory.role;
		
		switch (role) {
			case "portal_scout":
				Creep_Roles.Portal_Scout(creep);
				break;
				
			case "worker":
				// Global workers can do remote mining, building, upgrading
				this.runGlobalWorker(creep);
				break;
				
			case "miner":
			case "remote_miner":
				// Global miners for highway mining across shards
				this.runGlobalMiner(creep);
				break;
				
			case "hauler":
				// Global haulers for cross-shard resource transport
				this.runGlobalHauler(creep);
				break;
				
			case "soldier":
			case "paladin":
				// Global combat creeps for cross-shard defense
				Creep_Roles.Soldier(creep, false, true);
				break;
				
			case "ranger":
			case "archer":
				// Global ranged combat
				Creep_Roles.Archer(creep, false, true);
				break;
				
			case "resource_scout":
				// Special scout for finding power banks, deposits, minerals
				this.runResourceScout(creep);
				break;
				
			default:
				// Unknown role - log warning
				if (Game.time % 100 === 0) {
					console.log(`<font color="#FFA500">[GlobalCreeps]</font> Unknown role for global creep ${creep.name}: ${role}`);
				}
				break;
		}
	},
	
	/**
	 * Run a global worker creep
	 * Can perform remote operations like mining, building, upgrading
	 */
	runGlobalWorker: function(creep) {
		// If worker has a specific task, use standard worker behavior
		if (creep.memory.task) {
			Creep_Roles.Worker(creep, true);
			return;
		}
		
		// If no task, check for remote mining assignment
		if (creep.memory.remote_target) {
			let targetRoom = creep.memory.remote_target;
			
			// Travel to target room
			if (creep.room.name !== targetRoom) {
				creep.travel(new RoomPosition(25, 25, targetRoom));
				creep.say("→Remote");
				return;
			}
			
			// In target room - perform remote mining
			// Find energy sources
			let sources = creep.room.find(FIND_SOURCES);
			if (sources.length > 0) {
				let source = creep.pos.findClosestByPath(sources);
				if (source) {
					if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
						creep.moveTo(source);
						creep.say("⛏Mining");
					} else {
						creep.say("⛏");
					}
				}
			}
		} else {
			// No assignment - idle
			creep.say("Idle");
		}
	},
	
	/**
	 * Run a global miner creep
	 * Specializes in highway mining across shards
	 */
	runGlobalMiner: function(creep) {
		// Check for highway mining assignment
		if (creep.memory.highway_target) {
			let targetRoom = creep.memory.highway_target;
			
			// Travel to target room
			if (creep.room.name !== targetRoom) {
				creep.travel(new RoomPosition(25, 25, targetRoom));
				creep.say("→Highway");
				return;
			}
			
			// In target room - look for power banks or deposits
			let powerBanks = creep.room.find(FIND_STRUCTURES, {
				filter: s => s.structureType === STRUCTURE_POWER_BANK
			});
			
			if (powerBanks.length > 0) {
				let bank = powerBanks[0];
				if (creep.attack(bank) === ERR_NOT_IN_RANGE) {
					creep.moveTo(bank);
					creep.say("⚡Power");
				}
				return;
			}
			
			// Look for deposits
			let deposits = creep.room.find(FIND_DEPOSITS);
			if (deposits.length > 0) {
				let deposit = deposits[0];
				if (creep.harvest(deposit) === ERR_NOT_IN_RANGE) {
					creep.moveTo(deposit);
					creep.say("💎Deposit");
				}
				return;
			}
			
			// No resources - idle
			creep.say("No resources");
		} else {
			creep.say("No target");
		}
	},
	
	/**
	 * Run a global hauler creep
	 * Transports resources between shards
	 */
	runGlobalHauler: function(creep) {
		// Check if carrying resources
		let carrying = _.sum(creep.carry);
		
		if (carrying > 0) {
			// Has resources - deliver to home shard or storage
			if (creep.memory.home_shard && Game.shard.name !== creep.memory.home_shard) {
				// Need to return to home shard via portal
				creep.travelToShard(creep.memory.home_shard, creep.memory.home_room);
				creep.say("→Home");
			} else if (creep.memory.home_room) {
				// On home shard - deliver to storage
				if (creep.room.name !== creep.memory.home_room) {
					creep.travel(new RoomPosition(25, 25, creep.memory.home_room));
					creep.say("→Storage");
				} else {
					// In home room - find storage
					let storage = creep.room.storage || creep.room.terminal;
					if (storage) {
						for (let resourceType in creep.carry) {
							if (creep.transfer(storage, resourceType) === ERR_NOT_IN_RANGE) {
								creep.moveTo(storage);
								creep.say("→Deliver");
							}
						}
					}
				}
			}
		} else {
			// Empty - go pick up resources
			if (creep.memory.pickup_room) {
				let targetRoom = creep.memory.pickup_room;
				
				if (creep.room.name !== targetRoom) {
					creep.travel(new RoomPosition(25, 25, targetRoom));
					creep.say("→Pickup");
				} else {
					// In pickup room - find dropped resources
					let dropped = creep.room.find(FIND_DROPPED_RESOURCES);
					if (dropped.length > 0) {
						let resource = creep.pos.findClosestByPath(dropped);
						if (resource) {
							if (creep.pickup(resource) === ERR_NOT_IN_RANGE) {
								creep.moveTo(resource);
								creep.say("Pickup");
							}
						}
					}
				}
			}
		}
	},
	
	/**
	 * Run a resource scout
	 * Discovers power banks, deposits, and minerals across shards
	 */
	runResourceScout: function(creep) {
		// Check for target room
		if (creep.memory.scan_target) {
			let targetRoom = creep.memory.scan_target;
			
			// Travel to target room
			if (creep.room.name !== targetRoom) {
				creep.travel(new RoomPosition(25, 25, targetRoom));
				creep.say("→Scan");
				return;
			}
			
			// In target room - scan for resources
			this.scanRoomResources(creep.room);
			creep.say("Scanning");
			
			// Clear target and pick new one
			creep.memory.scan_target = undefined;
		} else {
			// Pick new room to scan
			let exploredRooms = _.get(creep.memory, "explored_rooms", []);
			let currentRoom = creep.room.name;
			
			// Mark current room as explored
			if (!exploredRooms.includes(currentRoom)) {
				exploredRooms.push(currentRoom);
				creep.memory.explored_rooms = exploredRooms;
			}
			
			// Find adjacent rooms
			let exits = Game.map.describeExits(currentRoom);
			let unexplored = [];
			
			_.each(exits, (roomName, direction) => {
				if (roomName && !exploredRooms.includes(roomName)) {
					unexplored.push(roomName);
				}
			});
			
			if (unexplored.length > 0) {
				creep.memory.scan_target = unexplored[0];
				creep.say("New scan!");
			} else {
				creep.say("No targets");
			}
		}
	},
	
	/**
	 * Scan a room for valuable resources
	 * Stores findings in Memory for later retrieval
	 */
	scanRoomResources: function(room) {
		let currentShard = Game.shard ? Game.shard.name : "sim";
		let roomName = room.name;
		
		// Initialize resource storage
		if (!Memory.global_resources) {
			Memory.global_resources = {};
		}
		
		if (!Memory.global_resources[currentShard]) {
			Memory.global_resources[currentShard] = {};
		}
		
		// Scan for power banks
		let powerBanks = room.find(FIND_STRUCTURES, {
			filter: s => s.structureType === STRUCTURE_POWER_BANK
		});
		
		if (powerBanks.length > 0) {
			_.each(powerBanks, bank => {
				let id = `${roomName}_power_${bank.id}`;
				Memory.global_resources[currentShard][id] = {
					type: "power_bank",
					room: roomName,
					pos: {x: bank.pos.x, y: bank.pos.y},
					power: bank.power,
					ticksToDecay: bank.ticksToDecay,
					discovered: Game.time
				};
				
				console.log(`<font color="#FFFF00">[Resources]</font> Found power bank in ${roomName}: ${bank.power} power`);
			});
		}
		
		// Scan for deposits
		let deposits = room.find(FIND_DEPOSITS);
		if (deposits.length > 0) {
			_.each(deposits, deposit => {
				let id = `${roomName}_deposit_${deposit.id}`;
				Memory.global_resources[currentShard][id] = {
					type: "deposit",
					depositType: deposit.depositType,
					room: roomName,
					pos: {x: deposit.pos.x, y: deposit.pos.y},
					lastCooldown: deposit.lastCooldown,
					ticksToDecay: deposit.ticksToDecay,
					discovered: Game.time
				};
				
				console.log(`<font color="#FFFF00">[Resources]</font> Found ${deposit.depositType} deposit in ${roomName}`);
			});
		}
		
		// Scan for minerals
		let minerals = room.find(FIND_MINERALS);
		if (minerals.length > 0) {
			_.each(minerals, mineral => {
				let id = `${roomName}_mineral_${mineral.id}`;
				Memory.global_resources[currentShard][id] = {
					type: "mineral",
					mineralType: mineral.mineralType,
					room: roomName,
					pos: {x: mineral.pos.x, y: mineral.pos.y},
					mineralAmount: mineral.mineralAmount,
					discovered: Game.time
				};
			});
		}
		
		// Scan for sources (for remote mining)
		let sources = room.find(FIND_SOURCES);
		if (sources.length > 0 && !room.controller) {
			// Only log sources in highway/neutral rooms
			_.each(sources, source => {
				let id = `${roomName}_source_${source.id}`;
				Memory.global_resources[currentShard][id] = {
					type: "energy_source",
					room: roomName,
					pos: {x: source.pos.x, y: source.pos.y},
					discovered: Game.time
				};
			});
		}
	},
	
	/**
	 * Get statistics about global creeps
	 */
	getStats: function() {
		let allCreeps = _.values(Game.creeps);
		let colonies = _.filter(Game.rooms, r => r.controller && r.controller.my);
		let colonyRooms = _.map(colonies, c => c.name);
		
		let globalCreeps = _.filter(allCreeps, c => !colonyRooms.includes(c.memory.room));
		
		let byRole = _.groupBy(globalCreeps, c => c.memory.role);
		
		return {
			total: globalCreeps.length,
			byRole: _.mapValues(byRole, g => g.length),
			creeps: _.map(globalCreeps, c => ({
				name: c.name,
				role: c.memory.role,
				room: c.room.name,
				assignedRoom: c.memory.room
			}))
		};
	}
};

