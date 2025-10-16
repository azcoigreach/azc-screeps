/* ***********************************************************
 *	[sec03b] DEFINITIONS: CREEP ROLES
 * *********************************************************** */

 global.Creep_Roles = {

	moveToDestination: function (creep) {
		if (creep.memory.room != null && creep.room.name != creep.memory.room) {
			creep.travelToRoom(creep.memory.room, true);
			return true;
		} else
			return false;
	},

	goToRoom: function (creep, room_name, is_refueling) {
		if (creep.room.name != room_name) {
			creep.travelToRoom(room_name, is_refueling);
			return true;
		}
		return false;
	},

	Scout: function (creep) {
		if (creep.memory.room != null) {
			if (creep.room.name != creep.memory.room) {
				creep.travelToRoom(creep.memory.room, true);
			} else {
				let controller = _.get(Game, ["rooms", creep.memory.room, "controller"]);
				if (controller != null && !creep.pos.inRangeTo(controller, 3)) {
					creep.travel(controller);
					return;
				}

				if (controller == null && creep.pos.isEdge()) {
					creep.travel(new RoomPosition(25, 25, creep.room.name));
					return;
				}
			}
		}
	},

	Portal_Scout: function (creep) {
		// Phase 3 Portal Testing Role
		
		// If in test mode and has portal target, use cross-shard travel
		if (creep.memory.test_mode && creep.memory.portal_target_shard) {
			let currentShard = Game.shard ? Game.shard.name : "sim";
			
			// Check if we're already on the target shard
			if (currentShard === creep.memory.portal_target_shard) {
				console.log(`<font color="#00FF00">[Scout]</font> ${creep.name} successfully arrived on ${currentShard}!`);
				
				// Move to target room on this shard
				if (creep.room.name !== creep.memory.portal_target_room) {
					let targetPos = new RoomPosition(25, 25, creep.memory.portal_target_room);
					creep.travel(targetPos);
				} else {
					console.log(`<font color="#00FF00">[Scout]</font> ${creep.name} reached destination room ${creep.room.name}!`);
					// Mission complete - suicide or wander
					creep.say("✓Portal!");
				}
			} else {
				// Use Phase 3 cross-shard travel
				let result = creep.travelToShard(
					creep.memory.portal_target_shard,
					creep.memory.portal_target_room
				);
				
				if (result === ERR_NO_PATH) {
					console.log(`<font color="#FF0000">[Scout]</font> ${creep.name} cannot find portal route`);
					creep.say("No portal");
				} else {
					creep.say("→Portal");
				}
			}
			return;
		}
		
		// Normal exploration mode - travel toward target room
		if (creep.memory.target_room) {
			if (creep.room.name !== creep.memory.target_room) {
				// Use simple travel method to move toward target room
				let targetPos = new RoomPosition(25, 25, creep.memory.target_room);
				creep.travel(targetPos);
				creep.say("Exploring");
				
				// Report if portals found in current room
				let portals = creep.room.find(FIND_STRUCTURES, {
					filter: s => s.structureType === STRUCTURE_PORTAL
				});
				
				if (portals.length > 0) {
					// Report portals to main portal system
					let currentShard = Game.shard ? Game.shard.name : "sim";
					
					// Initialize portal storage in memory
					if (!_.get(Memory, ["shard", "portals"])) {
						_.set(Memory, ["shard", "portals"], {});
					}
					
					_.each(portals, portal => {
						let dest = portal.destination;
						let destShard = dest.shard || currentShard;
						let destRoom = dest.roomName || dest.room || "unknown";
						
						// Store portal in main portal system
						let portalId = `${creep.room.name}_${portal.pos.x}_${portal.pos.y}`;
						_.set(Memory, ["shard", "portals", portalId], {
							pos: {
								x: portal.pos.x,
								y: portal.pos.y,
								roomName: creep.room.name
							},
							destination: {
								shard: destShard,
								room: destRoom
							},
							discovered: Game.time,
							discoveredBy: "scout"
						});
					});
				}
			} else {
				// Reached target room - explore around it
				
				// Move to center of current room to scan for portals
				if (creep.pos.x < 20 || creep.pos.x > 30 || creep.pos.y < 20 || creep.pos.y > 30) {
					creep.travel(new RoomPosition(25, 25, creep.room.name));
					creep.say("Moving to center");
				} else {
					creep.say("Scanning");
					
					// Look for portals in current room
					let portals = creep.room.find(FIND_STRUCTURES, {
						filter: s => s.structureType === STRUCTURE_PORTAL
					});
					
					if (portals.length > 0) {
						// Report portals to main portal system
						let currentShard = Game.shard ? Game.shard.name : "sim";
						
						// Initialize portal storage in memory
						if (!_.get(Memory, ["shard", "portals"])) {
							_.set(Memory, ["shard", "portals"], {});
						}
						
						_.each(portals, portal => {
							let dest = portal.destination;
							let destShard = dest.shard || currentShard;
							let destRoom = dest.roomName || dest.room || "unknown";
							
							// Store portal in main portal system
							let portalId = `${creep.room.name}_${portal.pos.x}_${portal.pos.y}`;
							_.set(Memory, ["shard", "portals", portalId], {
								pos: {
									x: portal.pos.x,
									y: portal.pos.y,
									roomName: creep.room.name
								},
								destination: {
									shard: destShard,
									room: destRoom
								},
								discovered: Game.time,
								discoveredBy: "scout"
							});
						});
						
						creep.say(`Found ${portals.length}!`);
						
						// Auto-test: Try to traverse to shard3 if we find a portal to it
						if (!creep.memory.auto_test_attempted) {
							let shard3Portal = _.find(portals, p => p.destination.shard === "shard3");
							if (shard3Portal && currentShard !== "shard3") {
								console.log(`<font color="#00FFFF">[Scout]</font> ${creep.name} auto-testing portal traversal to shard3!`);
								creep.memory.auto_test_attempted = true;
								creep.memory.test_mode = true;
								creep.memory.portal_target_shard = "shard3";
								creep.memory.portal_target_room = "W50N50";
								creep.say("Testing!");
							}
						}
						
						// Clear target room so scout continues exploring
						creep.memory.target_room = undefined;
					}
				}
			}
		} else {
			// No target - pick a new room to explore
			let exploredRooms = _.get(creep.memory, "explored_rooms", []);
			let currentRoom = creep.room.name;
			
			// Mark current room as explored
			if (!exploredRooms.includes(currentRoom)) {
				exploredRooms.push(currentRoom);
				creep.memory.explored_rooms = exploredRooms;
			}
			
			// Find adjacent rooms we haven't explored
			let exits = Game.map.describeExits(currentRoom);
			let unexploredRooms = [];
			
			_.each(exits, (roomName, direction) => {
				if (roomName && !exploredRooms.includes(roomName)) {
					unexploredRooms.push(roomName);
				}
			});
			
			if (unexploredRooms.length > 0) {
				// Pick a random unexplored room
				let targetRoom = unexploredRooms[Math.floor(Math.random() * unexploredRooms.length)];
				creep.memory.target_room = targetRoom;
				creep.say("New area!");
			} else {
				// All adjacent rooms explored, pick a random direction
				let directions = ["north", "south", "east", "west"];
				let randomDir = directions[Math.floor(Math.random() * directions.length)];
				let targetRoom = exits[randomDir];
				
				if (targetRoom) {
					creep.memory.target_room = targetRoom;
					creep.say("Random!");
				} else {
					creep.say("Wandering");
					// Just wander around current room
					if (creep.pos.isEdge()) {
						creep.travel(new RoomPosition(25, 25, creep.room.name));
					}
				}
			}
		}
	},

	Worker: function (creep, isSafe) {
		// Always prioritize picking up dropped commodities if there is free carry capacity
		// Exclude base resources (H, O, U, L, K, Z, X) and boosts that are typically used in labs
		const excludedResources = ["energy", "H", "O", "U", "L", "K", "Z", "X"];
		
		if (_.sum(creep.carry) < creep.carryCapacity) {
			let dropped = creep.room.find(FIND_DROPPED_RESOURCES, {
				filter: r => !excludedResources.includes(r.resourceType) && r.amount > 50
			});
			if (dropped.length > 0) {
				let closest = creep.pos.findClosestByPath(dropped);
				if (closest) {
					creep.memory.task = {
						type: "pickup",
						resource: closest.resourceType,
						id: closest.id,
						timer: 30
					};
					creep.runTask(creep);
					return;
				}
			}
		}
		let hostile = isSafe ? null
			: _.head(creep.pos.findInRange(FIND_HOSTILE_CREEPS, 5, {
				filter:
					c => { return c.isHostile(); }
			}));

		if (hostile == null) {
			if (creep.memory.state == "refueling") {
				if (_.sum(creep.carry) == creep.carryCapacity) {
					creep.memory.state = "working";
					delete creep.memory.task;
					return;
				}

				creep.memory.task = creep.memory.task || creep.getTask_Boost();

				if (!creep.memory.task && this.goToRoom(creep, creep.memory.room, true))
					return;

				creep.memory.task = creep.memory.task || creep.getTask_Withdraw_Link(15);
				creep.memory.task = creep.memory.task || creep.getTask_Withdraw_Storage("energy",
					_.get(Memory, ["rooms", creep.room.name, "survey", "downgrade_critical"], false));
				creep.memory.task = creep.memory.task || creep.getTask_Withdraw_Container("energy",
					_.get(Memory, ["rooms", creep.room.name, "survey", "downgrade_critical"], false));
				creep.memory.task = creep.memory.task || creep.getTask_Pickup(); // Pick up any dropped resources (prioritizes commodities)
				creep.memory.task = creep.memory.task || creep.getTask_Pickup("energy");
				creep.memory.task = creep.memory.task || creep.getTask_Mine();
				creep.memory.task = creep.memory.task || creep.getTask_Wait(10);

				creep.runTask(creep);
				return;

			} else if (creep.memory.state == "working") {
				if (creep.carry["energy"] == 0) {
					creep.memory.state = "refueling";
					delete creep.memory.task;
					return;
				}

				if (this.goToRoom(creep, creep.memory.room, false))
					return;

				// Check if room has reached RCL 6+ and has upgraders
				let roomLevel = creep.room.controller ? creep.room.controller.level : 0;
				let hasUpgraders = _.filter(Game.creeps, c => 
					c.memory.role == "upgrader" && c.memory.room == creep.room.name).length > 0;
				let isCriticalDowngrade = _.get(Memory, ["rooms", creep.room.name, "survey", "downgrade_critical"], false);

				// Early game priority: Focus on building structures for RCL progression
				if (roomLevel <= 4) {
					// Priority 1: Build critical RCL progression structures
					creep.memory.task = creep.memory.task || creep.getTask_Build();
					
					// Priority 2: Repair critical AND maintenance (ramparts/walls to target HP)
					// In early game, complete rampart repairs to avoid constant task switching
					creep.memory.task = creep.memory.task || creep.getTask_Repair(true);
					creep.memory.task = creep.memory.task || creep.getTask_Repair(false);
					
					// Priority 3: Upgrade only if no upgraders and not critical downgrade
					let shouldUpgrade = !hasUpgraders && !isCriticalDowngrade;
					if (shouldUpgrade) {
						creep.memory.task = creep.memory.task || creep.getTask_Upgrade(true);
						creep.memory.task = creep.memory.task || creep.getTask_Upgrade(false);
					}
					
					// Priority 4: Other tasks
					creep.memory.task = creep.memory.task || creep.getTask_Sign();
					creep.memory.task = creep.memory.task || creep.getTask_Deposit_Storage("mineral");
					creep.memory.task = creep.memory.task || creep.getTask_Wait(10);
				} else {
					// Mid/late game: Standard priority order
					// Only upgrade if room is below RCL 6, or if critical downgrade and no upgraders available
					let shouldUpgrade = roomLevel < 6 || (isCriticalDowngrade && !hasUpgraders);

					if (shouldUpgrade) {
						creep.memory.task = creep.memory.task || creep.getTask_Upgrade(true);
						creep.memory.task = creep.memory.task || creep.getTask_Upgrade(false);
					}

					creep.memory.task = creep.memory.task || creep.getTask_Sign();
					creep.memory.task = creep.memory.task || creep.getTask_Repair(true);
					creep.memory.task = creep.memory.task || creep.getTask_Build();
					creep.memory.task = creep.memory.task || creep.getTask_Repair(false);
					creep.memory.task = creep.memory.task || creep.getTask_Deposit_Storage("mineral");
					creep.memory.task = creep.memory.task || creep.getTask_Wait(10);
				}

				creep.runTask(creep);
				return;

			} else {
				creep.memory.state = "refueling";
				return;
			}
		} else if (hostile != null) {
			creep.moveFrom(hostile);
			return;
		}
	},

	Mining: function (creep, isSafe, canMine) {
		let hostile = isSafe ? null
			: _.head(creep.pos.findInRange(FIND_HOSTILE_CREEPS, 6, {
				filter:
					c => { return c.isHostile(); }
			}));

		if (hostile == null && canMine) {
			if (creep.memory.state == "refueling") {
				if (creep.memory.role != "burrower" && creep.carryCapacity > 0
					&& _.sum(creep.carry) == creep.carryCapacity) {
					creep.memory.state = "delivering";
					delete creep.memory.task;
					return;
				}

				creep.memory.task = creep.memory.task || creep.getTask_Boost();

				if (!creep.memory.task && this.goToRoom(creep, creep.memory.room, true))
					return;

				if (creep.memory.role == "burrower") {
					// Burrowers mine and deposit to containers/links near sources
					// They have both WORK and CARRY parts
					creep.memory.task = creep.memory.task || creep.getTask_Mine();
					creep.memory.task = creep.memory.task || creep.getTask_Withdraw_Source_Container();
					creep.memory.task = creep.memory.task || creep.getTask_Deposit_Source_Link();
					creep.memory.task = creep.memory.task || creep.getTask_Wait(5);

				} else if (creep.memory.role == "miner" || creep.memory.role == "carrier") {
					// PRIORITY 1: Mine if we have WORK parts (miners should mine, not scavenge)
					if (creep.hasPart("work") > 0)
						creep.memory.task = creep.memory.task || creep.getTask_Mine();
					
					// PRIORITY 2: Pick up dropped energy nearby (free energy on ground)
					creep.memory.task = creep.memory.task || creep.getTask_Pickup("energy");
					
					// PRIORITY 3: Withdraw from link (efficient transfer point)
					creep.memory.task = creep.memory.task || creep.getTask_Withdraw_Link(15);

					// PRIORITY 4: Withdraw from containers/storage (only if can't mine)
					let energy_level = _.get(Memory, ["rooms", creep.room.name, "survey", "energy_level"]);
					if (energy_level == CRITICAL || energy_level == LOW
						|| _.get(Memory, ["sites", "mining", creep.memory.room, "store_percent"], 0) > 0.25) {
						creep.memory.task = creep.memory.task || creep.getTask_Withdraw_Container("energy", true);
						creep.memory.task = creep.memory.task || creep.getTask_Withdraw_Storage("energy", true);
					} else {
						creep.memory.task = creep.memory.task || creep.getTask_Withdraw_Storage("energy", true);
						creep.memory.task = creep.memory.task || creep.getTask_Withdraw_Container("energy", true);
					}

					// PRIORITY 5: Pick up minerals if available
					creep.memory.task = creep.memory.task || creep.getTask_Pickup("mineral");
					
					// PRIORITY 6: Wait as last resort
					creep.memory.task = creep.memory.task || creep.getTask_Wait(10);
				}

				creep.runTask(creep);
				return;

			} else if (creep.memory.state == "delivering") {
				if (creep.carryCapacity == 0 || _.sum(creep.carry) == 0) {
					creep.memory.state = "refueling";
					delete creep.memory.task;
					return;
				}

				if (this.goToRoom(creep, creep.memory.colony, false))
					return;

				// PRIORITY 1: Fill spawns and extensions (critical for spawning)
				if (creep.room.energyAvailable < creep.room.energyCapacityAvailable * 0.75) {
					creep.memory.task = creep.memory.task || creep.getTask_Deposit_Spawns();
					creep.memory.task = creep.memory.task || creep.getTask_Deposit_Towers();
				} else {
					creep.memory.task = creep.memory.task || creep.getTask_Deposit_Towers();
					creep.memory.task = creep.memory.task || creep.getTask_Deposit_Spawns();
				}
				
				// PRIORITY 2: Deposit to links for distribution
				creep.memory.task = creep.memory.task || creep.getTask_Deposit_Link();
				
				// PRIORITY 3: Deposit minerals to storage
				creep.memory.task = creep.memory.task || creep.getTask_Deposit_Storage("mineral");
				
				// PRIORITY 4: If spawns/extensions/towers are full, deposit to containers near sources
				// (This is the fallback behavior for miners when spawns are full)
				creep.memory.task = creep.memory.task || creep.getTask_Deposit_Container("energy");
				
				// PRIORITY 5: Deposit to storage (if available)
				creep.memory.task = creep.memory.task || creep.getTask_Deposit_Storage("energy");
				
				// PRIORITY 6: If nowhere to deposit energy, upgrade controller
				// This accelerates RCL progression when energy backs up
				if (creep.carry["energy"] > 0 && creep.hasPart("work") > 0)
					creep.memory.task = creep.memory.task || creep.getTask_Upgrade(false);
				
				// PRIORITY 7: Wait as last resort
				creep.memory.task = creep.memory.task || creep.getTask_Wait(10);

				creep.runTask(creep);
				return;

			} else {
				creep.memory.state = "refueling";
				return;
			}
		} else if (hostile != null) {
			creep.moveFrom(hostile);
			return;
		}
	},

	Courier: function (creep) {
		// Always prioritize picking up dropped commodities if there is free carry capacity
		// Exclude base resources (H, O, U, L, K, Z, X) and boosts that are typically used in labs
		const excludedResources = ["energy", "H", "O", "U", "L", "K", "Z", "X"];
		
		if (_.sum(creep.carry) < creep.carryCapacity) {
			let dropped = creep.room.find(FIND_DROPPED_RESOURCES, {
				filter: r => !excludedResources.includes(r.resourceType) && r.amount > 50
			});
			if (dropped.length > 0) {
				let closest = creep.pos.findClosestByPath(dropped);
				if (closest) {
					creep.memory.task = {
						type: "pickup",
						resource: closest.resourceType,
						id: closest.id,
						timer: 30
					};
					creep.runTask(creep);
					return;
				}
			}
		}
		if (this.moveToDestination(creep))
			return;

		if (creep.memory.state == "loading") {
			if (_.sum(creep.carry) > 0) {
				creep.memory.state = "delivering";
				delete creep.memory.task;
				return;
			}

			creep.memory.task = creep.memory.task || creep.getTask_Boost();

			if (!creep.memory.task && this.goToRoom(creep, creep.memory.room, true))
				return;

			creep.memory.task = creep.memory.task || creep.getTask_Industry_Withdraw();
			creep.memory.task = creep.memory.task || creep.getTask_Withdraw_Storage_Link();
			creep.memory.task = creep.memory.task || creep.getTask_Pickup(); // Pick up any dropped resources (prioritizes commodities)
			creep.memory.task = creep.memory.task || creep.getTask_Wait(10);

			creep.runTask(creep);
			return;

		} else if (creep.memory.state == "delivering") {
			if (_.sum(creep.carry) == 0) {
				creep.memory.state = "loading";
				delete creep.memory.task;
				return;
			}

			creep.memory.task = creep.memory.task || creep.getTask_Industry_Deposit();
			creep.memory.task = creep.memory.task || creep.getTask_Deposit_Storage("mineral"); // Deposit any commodities to storage
			creep.memory.task = creep.memory.task || creep.getTask_Deposit_Storage("energy");
			creep.memory.task = creep.memory.task || creep.getTask_Wait(10);

			creep.runTask(creep);
			return;

		} else {
			creep.memory.state = "loading";
			return;
		}
	},

	Factory_Operator: function (creep) {
		if (this.moveToDestination(creep))
			return;

		// Find factories in the room
		let factories = _.filter(creep.room.find(FIND_MY_STRUCTURES), 
			s => s.structureType == "factory");
		
		if (factories.length == 0) {
			// No factories, just wait
			creep.memory.task = creep.memory.task || creep.getTask_Wait(50);
			creep.runTask(creep);
			return;
		}

		// Check if any factory has produced commodities that need to be moved
		let factoryWithCommodity = null;
		for (let factory of factories) {
			for (let resource in factory.store) {
				if (resource != "energy" && factory.store[resource] > 0) {
					factoryWithCommodity = factory;
					break;
				}
			}
			if (factoryWithCommodity) break;
		}

		if (factoryWithCommodity) {
			// Move commodities from factory to storage
			creep.memory.task = creep.memory.task || { 
				type: "factory_operate", 
				id: factoryWithCommodity.id, 
				timer: 60, 
				priority: 3 
			};
		} else {
			// No commodities to move, just wait
			creep.memory.task = creep.memory.task || creep.getTask_Wait(50);
		}

		creep.runTask(creep);
	},

	Extractor: function (creep, isSafe) {
		let hostile = isSafe ? null
			: _.head(creep.pos.findInRange(FIND_HOSTILE_CREEPS, 6, {
				filter:
					c => { return c.isHostile(); }
			}));

		if (hostile == null) {
			switch (creep.memory.state) {
				default:
				case "get_minerals":
					if (_.sum(creep.carry) == creep.carryCapacity
						|| _.get(Memory, ["rooms", creep.room.name, "survey", "has_minerals"], true) == false) {
						creep.memory.state = "deliver";
						delete creep.memory.task;
						return;
					}

					creep.memory.task = creep.memory.task || creep.getTask_Boost();

					if (!creep.memory.task && this.goToRoom(creep, creep.memory.room, true))
						return;

					creep.memory.task = creep.memory.task || creep.getTask_Extract();
					creep.memory.task = creep.memory.task || creep.getTask_Wait(10);

					creep.runTask(creep);
					return;

				case "deliver":
					if (_.sum(creep.carry) == 0
						&& _.get(Memory, ["rooms", creep.room.name, "survey", "has_minerals"], true)) {
						creep.memory.state = "get_minerals";
						delete creep.memory.task;
						return;
					}

					if (this.goToRoom(creep, creep.memory.colony, false))
						return;

					creep.memory.task = creep.memory.task || creep.getTask_Deposit_Storage("mineral");
					creep.memory.task = creep.memory.task || creep.getTask_Wait(10);

					creep.runTask(creep);
					return;
			}
		} else if (hostile != null) {
			creep.moveFrom(hostile);
			return;
		}
	},

	Reserver: function (creep) {
		if (this.moveToDestination(creep))
			return;

		let controller = _.get(creep.room, "controller", null);

		if (creep.pos.getRangeTo(controller) > 1) {
			creep.travel(creep.room.controller)
			return;
		}

		let result;
		if (_.get(controller, "owner") != null && !creep.room.controller.my) {
			result = creep.attackController(creep.room.controller);
		} else if (_.get(controller, ["reservation", "username"], null) != null
			&& _.get(controller, ["reservation", "username"], null) != getUsername()) {
			result = creep.attackController(creep.room.controller);
		} else {
			result = creep.reserveController(creep.room.controller);
		}

		if (result == ERR_NOT_IN_RANGE) {
			creep.travel(creep.room.controller)
			return;
		} else if (result == ERR_NO_BODYPART) {
			return;		// Reservers and colonizers with no "claim" parts prevent null body spawn locking
		} else if (result == OK) {
			if (Game.time % 50 == 0) {
				let room_sign = _.get(Memory, ["hive", "signs", creep.room.name]);
				let default_sign = _.get(Memory, ["hive", "signs", "default"]);
				if (room_sign != null && _.get(creep, ["room", "controller", "sign", "text"]) != room_sign)
					creep.signController(creep.room.controller, room_sign);
				else if (room_sign == null && default_sign != null && _.get(creep, ["room", "controller", "sign", "text"]) != default_sign)
					creep.signController(creep.room.controller, default_sign);
			}
			if (Game.time % 10 == 0)
				creep.moveFromSource();
			return;
		}
	},

	Colonizer: function (creep) {
		if (this.moveToDestination(creep))
			return;

		let result = creep.claimController(creep.room.controller);
		if (result == ERR_NOT_IN_RANGE) {
			creep.moveTo(creep.room.controller)
			return;
		} else if (result == ERR_NO_BODYPART) {
			return;		// Reservers and colonizers with no "claim" parts prevent null body spawn locking
		} else {
			let request = _.get(Memory, ["sites", "colonization", creep.memory.room]);
			if (_.get(request, ["target"]) == creep.room.name && creep.room.controller.my) {
				delete Memory["sites"]["colonization"][creep.room.name];
				_.set(Memory, ["rooms", creep.room.name, "spawn_assist", "rooms"], [_.get(request, ["from"])]);
				_.set(Memory, ["rooms", creep.room.name, "spawn_assist", "list_route"], _.get(request, ["list_route"]));
				_.set(Memory, ["rooms", creep.room.name, "layout"], _.get(request, "layout"));
				_.set(Memory, ["rooms", creep.room.name, "focus_defense"], _.get(request, "focus_defense"));
				_.set(Memory, ["hive", "pulses", "blueprint", "request"], creep.room.name);
				creep.memory = {};
			} else if (result != OK) {
				console.log(`<font color=\"#F0FF00\">[Colonization]</font> ${creep.name} unable to colonize ${_.get(request, ["target"])}; error ${result}`);
			}
			return;
		}
	},

	Soldier: function (creep, targetStructures, targetCreeps, listTargets) {
		if (Creep_Roles_Combat.acquireBoost(creep))
			return;
		if (Creep_Roles_Combat.moveToDestination(creep, 10))
			return;

		Creep_Roles_Combat.checkTarget_Existing(creep);
		Creep_Roles_Combat.acquireTarget_ListTarget(creep, listTargets);

		if (targetCreeps)
			Creep_Roles_Combat.acquireTarget_Creep(creep);
		if (targetStructures && creep.room.name == creep.memory.room)
			Creep_Roles_Combat.acquireTarget_Structure(creep);

		Creep_Roles_Combat.acquireTarget_InvaderCore(creep);

		if (_.get(creep, ["memory", "target", "id"]) != null) {
			Creep_Roles_Combat.clearCamp(creep);
			let target = Game.getObjectById(creep.memory.target.id);

			creep.dismantle(target);
			creep.rangedAttack(target);
			let result = creep.attack(target);

			if (result == ERR_INVALID_TARGET && target instanceof ConstructionSite == true) {
				creep.moveTo(target, { reusePath: 0 });
			} else if (result == ERR_NOT_IN_RANGE) {
				creep.heal(creep);

				if (_.get(creep, ["memory", "target", "rampart"]) != null) {
					let rampart = Game.getObjectById(creep.memory.target.rampart);
					if (rampart != null)
						creep.moveTo(rampart, { reusePath: 0 });
					else
						creep.moveTo(target, { reusePath: 0 });
				} else
					creep.moveTo(target, { reusePath: 0 });
				return;
			} else if (result == OK) {
				return;
			} else {
				creep.heal(creep);
				return;
			}
		} else {
			creep.heal(creep);
			Creep_Roles_Combat.acquireCamp(creep);
			Creep_Roles_Combat.travelCamp(creep);
			return;
		}
	},

	Archer: function (creep, targetStructures, targetCreeps, listTargets) {
		if (Creep_Roles_Combat.acquireBoost(creep))
			return;
		if (Creep_Roles_Combat.moveToDestination(creep, 10))
			return;

		Creep_Roles_Combat.checkTarget_Existing(creep);
		Creep_Roles_Combat.acquireTarget_ListTarget(creep, listTargets);

		if (targetCreeps)
			Creep_Roles_Combat.acquireTarget_Creep(creep);
		if (targetStructures && creep.room.name == creep.memory.room)
			Creep_Roles_Combat.acquireTarget_Structure(creep);

		Creep_Roles_Combat.acquireTarget_InvaderCore(creep);

		if (_.get(creep, ["memory", "target", "id"]) != null) {
			Creep_Roles_Combat.clearCamp(creep);
			let target = Game.getObjectById(creep.memory.target.id);

			creep.attack(target);
			creep.dismantle(target);
			creep.heal(creep);
			let result = creep.rangedAttack(target);

			if (result == ERR_INVALID_TARGET && target instanceof ConstructionSite == true) {
				creep.moveTo(target, { reusePath: 0 });
			} else if (result == ERR_NOT_IN_RANGE) {
				if (_.get(creep, ["memory", "target", "rampart"]) != null) {
					let rampart = Game.getObjectById(creep.memory.target.rampart);
					if (rampart != null)
						creep.moveTo(rampart, { reusePath: 0 });
					else
						creep.moveTo(target, { reusePath: 0 });
				} else
					creep.moveTo(target, { reusePath: 0 });
				return;
			} else if (result == OK) {
				if (creep.pos.getRangeTo(target < 3))
					creep.moveFrom(creep, target);
				return;
			}
		} else {
			creep.heal(creep);
			Creep_Roles_Combat.acquireCamp(creep);
			Creep_Roles_Combat.travelCamp(creep);
			return;
		}
	},

	Dismantler: function (creep, targetStructures, listTargets) {
		if (Creep_Roles_Combat.acquireBoost(creep))
			return;
		if (Creep_Roles_Combat.moveToDestination(creep, null))
			return;

		Creep_Roles_Combat.checkTarget_Existing(creep);
		Creep_Roles_Combat.acquireTarget_ListTarget(creep, listTargets);

		if (targetStructures && creep.room.name == creep.memory.room)
			Creep_Roles_Combat.acquireTarget_Structure(creep);

		if (_.get(creep, ["memory", "target", "id"]) != null) {
			let target = Game.getObjectById(creep.memory.target.id);

			creep.rangedAttack(target);
			creep.attack(target);
			let result = creep.dismantle(target);

			if (result == ERR_INVALID_TARGET && target instanceof ConstructionSite == true) {
				creep.moveTo(target, { reusePath: 0 });
			} else if (result == ERR_NOT_IN_RANGE) {
				creep.heal(creep);
				creep.moveTo(target, { reusePath: 0 });
				return;
			} else if (result == OK) {
				return;
			} else {
				creep.heal(creep);
				return;
			}
		} else {
			creep.heal(creep);
			return;
		}
	},

	Healer: function (creep, to_partner) {
		if (Creep_Roles_Combat.acquireBoost(creep))
			return;
		if (Creep_Roles_Combat.moveToDestination(creep, 10))
			return;

		Creep_Roles_Combat.checkTarget_Existing(creep);
		Creep_Roles_Combat.acquireTarget_Heal(creep);

		if (_.get(creep, ["memory", "target", "id"]) != null) {
			Creep_Roles_Combat.clearCamp(creep);
			let target = Game.getObjectById(creep.memory.target.id);
			let result = creep.heal(target);
			if (target == null || target.hits == target.hitsMax) {
				_.set(creep, ["memory", "target", "id"], null);
				return;
			} else if (result == OK) {
				return;
			} else if (result == ERR_NOT_IN_RANGE) {
				creep.rangedHeal(target);
				creep.moveTo(target);
				return;
			}
		}

		if (to_partner) {
			Creep_Roles_Combat.checkPartner_Existing(creep);
			Creep_Roles_Combat.acquireTarget_Partner(creep);

			if (_.get(creep, ["memory", "partner", "id"]) != null) {
				Creep_Roles_Combat.clearCamp(creep);
				let target = Game.getObjectById(creep.memory.partner.id);

				if (target == null) {
					_.set(creep, ["memory", "target", "id"], null);
					Creep_Roles_Combat.acquireCamp(creep);
					Creep_Roles_Combat.travelCamp(creep);
				} else if (creep.pos.getRangeTo(target) > 1) {
					creep.moveTo(target, { reusePath: 0 });
					return;
				}
			} else {
				Creep_Roles_Combat.acquireCamp(creep);
				Creep_Roles_Combat.travelCamp(creep);
				return;
			}
		} else {
			Creep_Roles_Combat.acquireCamp(creep);
			Creep_Roles_Combat.travelCamp(creep);
			return;
		}
	},

	Upgrader: function (creep, isSafe) {
		let hostile = isSafe ? null
			: _.head(creep.pos.findInRange(FIND_HOSTILE_CREEPS, 5, {
				filter:
					c => { return c.isHostile(); }
			}));

		if (hostile == null) {
			if (creep.memory.state == "refueling") {
				if (_.sum(creep.carry) == creep.carryCapacity) {
					creep.memory.state = "upgrading";
					delete creep.memory.task;
					return;
				}

				// Get energy tasks while not at full capacity
				creep.memory.task = creep.memory.task || creep.getTask_Boost();

				if (!creep.memory.task && this.goToRoom(creep, creep.memory.room, true))
					return;

				// Priority: Controller links -> Controller containers -> Storage
				creep.memory.task = creep.memory.task || creep.getTask_Withdraw_Controller_Link();
				creep.memory.task = creep.memory.task || creep.getTask_Withdraw_Controller_Container();
				creep.memory.task = creep.memory.task || creep.getTask_Withdraw_Storage("energy", true);
				creep.memory.task = creep.memory.task || creep.getTask_Pickup("energy");
				creep.memory.task = creep.memory.task || creep.getTask_Wait(10);

				creep.runTask(creep);
				return;
			} else if (creep.memory.state == "upgrading") {
				if (creep.carry["energy"] == 0) {
					creep.memory.state = "refueling";
					delete creep.memory.task;
					return;
				}

				if (this.goToRoom(creep, creep.memory.room, false))
					return;

				// Only upgrade the controller, no other tasks
				creep.memory.task = creep.memory.task || creep.getTask_Upgrade(false);
				creep.memory.task = creep.memory.task || creep.getTask_Wait(10);

				creep.runTask(creep);
				return;

			} else {
				creep.memory.state = "refueling";
				return;
			}
		} else if (hostile != null) {
			creep.moveFrom(hostile);
			return;
		}
	},



	HighwayAttacker: function (creep) {
		if (this.moveToDestination(creep))
			return;

		creep.memory.task = creep.memory.task || creep.getTask_Highway_Attack_Power();
		creep.memory.task = creep.memory.task || creep.getTask_Wait(10);

		creep.runTask(creep);
		
		// Check if target was destroyed and mark as harvested
		let highwayData = _.get(Memory, ["sites", "highway_mining", creep.memory.highway_id]);
		if (highwayData && creep.memory.target_id) {
			let target = Game.getObjectById(creep.memory.target_id);
			if (!target) {
				// Target was destroyed, mark as harvested
				let discoveredResources = highwayData.discovered_resources || [];
				let resource = _.find(discoveredResources, r => r.id == creep.memory.target_id);
				if (resource) {
					resource.harvested = true;
					delete creep.memory.target_id;
				}
			}
		}
	},

	HighwayHealer: function (creep) {
		if (this.moveToDestination(creep))
			return;

		// Heal nearby damaged creeps
		let damagedCreeps = creep.pos.findInRange(FIND_MY_CREEPS, 3, {
			filter: c => c.hits < c.hitsMax
		});

		if (damagedCreeps.length > 0) {
			creep.heal(damagedCreeps[0]);
		} else {
			creep.memory.task = creep.memory.task || creep.getTask_Wait(10);
			creep.runTask(creep);
		}
	},

	HighwayBurrower: function (creep) {
		// Initialize operation start time if not set
		let highwayData = _.get(Memory, ["sites", "highway_mining", creep.memory.highway_id]);
		if (highwayData && !highwayData.operation_start) {
			highwayData.operation_start = Game.time;
		}
		
		// Handle travel to destination if needed
		if (creep.memory.task && creep.memory.task.destination) {
			const dest = creep.memory.task.destination;
			if (creep.room.name !== dest.roomName) {
				creep.travel(new RoomPosition(dest.x, dest.y, dest.roomName));
				return;
			}
		}
		
		// Simplified state management
		let currentState = creep.memory.state || "mining";
		let carrySum = _.sum(creep.carry);
		let isInColony = creep.room.name === creep.memory.colony;
		
		// State transitions
		if (carrySum === creep.carryCapacity && currentState !== "returning") {
			currentState = "returning";
			creep.memory.state = currentState;
			console.log(`<font color=\"#FFA500\">[Highway]</font> Burrower ${creep.name} returning home from ${creep.room.name}`);
		} else if (carrySum === 0 && isInColony && currentState !== "mining") {
			currentState = "mining";
			creep.memory.state = currentState;
			delete creep.memory.task;
		}
		
		// Execute based on current state
		switch (currentState) {
			case "returning":
				if (isInColony) {
					// Deposit resources
					creep.memory.task = creep.memory.task || creep.getTask_Highway_Carry_Resource();
					creep.memory.task = creep.memory.task || creep.getTask_Wait(10);
					creep.runTask(creep);
				} else {
					// Travel to colony
					creep.memory.task = creep.getTask_Highway_Carry_Resource();
					creep.runTask(creep);
				}
				break;
				
			case "mining":
			default:
				// Travel to target room if not there
				if (creep.room.name !== highwayData.target_room) {
					creep.memory.task = { 
						type: "travel", 
						destination: new RoomPosition(25, 25, highwayData.target_room), 
						timer: 50 
					};
					creep.runTask(creep);
				} else {
					// Harvest in target room
					creep.memory.task = creep.memory.task || creep.getTask_Highway_Harvest_Commodity();
					creep.memory.task = creep.memory.task || creep.getTask_Wait(10);
					creep.runTask(creep);
				}
				break;
		}
		
		// Enhanced resource status monitoring
		if (highwayData && highwayData.resource_id) {
			let target = Game.getObjectById(highwayData.resource_id);
			if (!target || (target.structureType === "deposit" && target.ticksToDeposit <= 0)) {
				highwayData.state = "completed";
				console.log(`<font color=\"#FFA500\">[Highway]</font> Resource ${highwayData.resource_id} depleted or gone, marking operation as completed for ${creep.memory.highway_id}`);
			}
		}
	},


};