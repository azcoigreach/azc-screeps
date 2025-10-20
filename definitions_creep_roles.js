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
			// Check if this is a cross-shard spawn assist creep (worker, upgrader, etc.)
			if (creep.memory.cross_shard_assist && creep.memory.colony && creep.memory.room === room_name) {
				// Use the destination shard directly from creep memory
				let destShard = creep.memory.dest_shard;
				
				if (destShard && Game.shard && Game.shard.name !== destShard) {
					console.log(`<font color="#00FF00">[${creep.memory.role}]</font> ${creep.name}: Cross-shard travel to ${destShard}/${room_name}`);
					creep.travelToShard(destShard, room_name);
					return true;
				} else {
					// Already on correct shard, check if we have a list_route to follow
					if (creep.memory.list_route && creep.memory.list_route.length > 0) {
						// Save the list_route before travel (in case travel system clears it)
						creep.memory._saved_list_route = creep.memory.list_route;
						
						// Find current position in route and go to next room
						let currentIndex = creep.memory.list_route.indexOf(creep.room.name);
						
						if (currentIndex >= 0 && currentIndex < creep.memory.list_route.length - 1) {
							let nextRoom = creep.memory.list_route[currentIndex + 1];
							// Move toward the exit to the next room using simple range-based movement
							let exit = creep.room.findExitTo(nextRoom);
							if (exit == ERR_NO_PATH || exit == ERR_INVALID_ARGS) {
								console.log(`<font color="#FF0000">[${creep.memory.role.charAt(0).toUpperCase() + creep.memory.role.slice(1)}]</font> ${creep.name}: No exit found to ${nextRoom}`);
								return false;
							}
							// Find closest exit by range (not path) to avoid recalculation
							let exitPos = creep.pos.findClosestByRange(exit);
							if (exitPos) {
								creep.moveTo(exitPos, {reusePath: 20, visualizePathStyle: {stroke: '#ffffff'}});
							}
							return true;
						} else if (currentIndex === creep.memory.list_route.length - 1) {
							// We're at the end of the route, should be at destination
							console.log(`<font color="#FFA500">[${creep.memory.role.charAt(0).toUpperCase() + creep.memory.role.slice(1)}]</font> ${creep.name}: At end of list_route, but not in target room ${room_name}`);
						} else if (currentIndex === -1) {
							// Current room not found in route - this shouldn't happen but might cause issues
							console.log(`<font color="#FF0000">[${creep.memory.role.charAt(0).toUpperCase() + creep.memory.role.slice(1)}]</font> ${creep.name}: Current room ${creep.room.name} not found in route ${JSON.stringify(creep.memory.list_route)}`);
						}
					}
					console.log(`<font color="#FFA500">[${creep.memory.role.charAt(0).toUpperCase() + creep.memory.role.slice(1)}]</font> ${creep.name}: No list_route found, using regular travel to ${room_name}`);
				}
			}
			
			// Regular same-shard travel
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
		// Restore saved list_route if it was cleared by travel system
		if (creep.memory._saved_list_route && (!creep.memory.list_route || creep.memory.list_route.length === 0)) {
			creep.memory.list_route = creep.memory._saved_list_route;
		}
		
		// Check if this is a cross-shard spawn assist worker that needs to travel to another shard first
		if (creep.memory.cross_shard_assist && creep.memory.colony && creep.memory.room) {
			// Ensure dest_shard is set - try to get it from colonization operations if missing
			if (!creep.memory.dest_shard && creep.memory.room) {
				let colonizations = _.get(Memory, ["shard", "operations", "colonizations"], []);
				let operation = _.find(colonizations, op => op.dest_room === creep.memory.room);
				if (operation) {
					creep.memory.dest_shard = operation.dest_shard;
					console.log(`<font color="#00FF00">[Worker]</font> ${creep.name}: Set missing dest_shard to ${operation.dest_shard}`);
				}
			}
			
			// Continue with cross-shard travel if we have all required fields
			if (creep.memory.dest_shard) {
				// Check if we have an active transfer or need to start one
				let transfers = _.get(Memory, ["shard", "operations", "creep_transfers"], []);
				let activeTransfer = _.find(transfers, t => t.creep_name === creep.name && t.status === "traveling");
				
				// Check if we're on the correct shard first
				if (Game.shard && Game.shard.name === creep.memory.dest_shard) {
					// We're on the correct shard, ensure we have the destination list_route
					// Do ISM lookup if we don't have a valid route
					let needsRouteLookup = !creep.memory.list_route || !Array.isArray(creep.memory.list_route) || creep.memory.list_route.length === 0;
					
					if (needsRouteLookup && creep.memory.room) {
						// Look up the colonization operation to get the dest_list_route
						let colonizations = _.get(Memory, ["shard", "operations", "colonizations"], []);
						let operation = _.find(colonizations, op => op.dest_room === creep.memory.room);
						
						// If not found locally, try to get it from ALL shards via ISM
						if (!operation) {
							// Try to find the colonization operation from ALL known shards via ISM
							let knownShards = ["shard0", "shard1", "shard2", "shard3"];
							for (let shardName of knownShards) {
								if (shardName !== Game.shard.name) {
									let shardData = ISM.getShardStatus(shardName);
									if (shardData && shardData.operations && shardData.operations.colonizations) {
										operation = _.find(shardData.operations.colonizations, op => op.dest_room === creep.memory.room);
										if (operation) {
											break;
										}
									}
								}
							}
							if (!operation) {
								console.log(`<font color="#FF0000">[Worker]</font> ${creep.name}: Failed to find colonization operation via ISM for ${creep.memory.room} on any shard`);
							}
						}
						
						if (operation && operation.dest_list_route && operation.dest_list_route.length > 0) {
							creep.memory.list_route = operation.dest_list_route;
							console.log(`<font color="#00FF00">[Worker]</font> ${creep.name}: Set missing dest list_route from operation: ${JSON.stringify(operation.dest_list_route)}`);
						} else {
							// NO FALLBACK - the colonization operation MUST have dest_list_route configured
							// to avoid hostile rooms. Falling back to direct pathfinding would send workers
							// through occupied rooms where they will die.
							console.log(`<font color="#FF0000">[Worker]</font> ${creep.name}: MISSING dest_list_route in colonization operation for ${creep.memory.room} - this will cause workers to die in hostile rooms!`);
						}
					}
					
					// Use goToRoom which will handle list_route navigation
					if (creep.room.name !== creep.memory.room) {
						this.goToRoom(creep, creep.memory.room, false);
						return;
					}
				} else if (creep.room.name !== creep.memory.room || activeTransfer) {
					// We need to cross shards or we're still traveling
					if (activeTransfer) {
						// Continue existing transfer - use travelToShard once per tick max
						let result = creep.travelToShard(creep.memory.dest_shard, creep.memory.room);
						if (result !== OK && result !== ERR_BUSY && result !== ERR_INVALID_TARGET) {
							console.log(`<font color="#FFA500">[Worker]</font> ${creep.name}: travelToShard error ${result}`);
						}
					} else {
						console.log(`<font color="#00FF00">[Worker]</font> ${creep.name}: Starting cross-shard travel to ${creep.memory.dest_shard}/${creep.memory.room}`);
						// Use travelToShard directly for cross-shard workers instead of goToRoom
						let result = creep.travelToShard(creep.memory.dest_shard, creep.memory.room);
						if (result !== OK && result !== ERR_BUSY && result !== ERR_INVALID_TARGET && result !== ERR_NO_PATH) {
							console.log(`<font color="#FFA500">[Worker]</font> ${creep.name}: travelToShard error ${result}`);
						}
					}
					return;
				}
			}
		}

		// Only pick up dropped commodities if storage is available and we have free carry capacity
		// Exclude base resources (H, O, U, L, K, Z, X) and boosts that are typically used in labs
		const excludedResources = ["energy", "H", "O", "U", "L", "K", "Z", "X"];
		
		// Check if storage exists before picking up non-energy resources
		let hasStorage = creep.room.storage && creep.room.controller && creep.room.controller.my;
		
		if (hasStorage && _.sum(creep.carry) < creep.carryCapacity) {
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
					c => { return c.isHostile() && (c.hasPart("attack") || c.hasPart("ranged_attack")); }
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
				
				// Only pick up non-energy resources if storage exists
				if (hasStorage) {
					creep.memory.task = creep.memory.task || creep.getTask_Pickup(); // Pick up any dropped resources (prioritizes commodities)
				}
				creep.memory.task = creep.memory.task || creep.getTask_Pickup("energy");
				creep.memory.task = creep.memory.task || creep.getTask_Mine();
				creep.memory.task = creep.memory.task || creep.getTask_Wait(10);

				creep.runTask(creep);
				return;

			} else if (creep.memory.state == "working") {
				// Check if we have non-energy resources to deposit first
				let hasNonEnergyResources = false;
				for (let resourceType in creep.carry) {
					if (resourceType !== "energy" && creep.carry[resourceType] > 0) {
						hasNonEnergyResources = true;
						break;
					}
				}
				
				if (hasNonEnergyResources && hasStorage) {
					// Deposit non-energy resources to storage if available
					creep.memory.task = creep.memory.task || creep.getTask_Deposit_Storage("mineral");
					if (creep.memory.task) {
						creep.runTask(creep);
						return;
					}
				}
				
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
					// Check for sign task first - it has high priority for room branding
					let signTask = creep.getTask_Sign();
					if (signTask && (!creep.memory.task || creep.memory.task.type === "upgrade")) {
						// Sign task should override upgrade tasks when signs need updating
						creep.memory.task = signTask;
					}

					// Only upgrade if no upgraders are available and either room is below RCL 6 or critical downgrade
					let shouldUpgrade = !hasUpgraders && (roomLevel < 6 || isCriticalDowngrade);

					if (shouldUpgrade && !creep.memory.task) {
						creep.memory.task = creep.getTask_Upgrade(true);
					}
					if (shouldUpgrade && !creep.memory.task) {
						creep.memory.task = creep.getTask_Upgrade(false);
					}

					// Fallback sign task check if no task assigned yet
					if (!creep.memory.task) {
						creep.memory.task = creep.getTask_Sign();
					}
					
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
					c => { return c.isHostile() && (c.hasPart("attack") || c.hasPart("ranged_attack")); }
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
					
					// PRIORITY 2: Withdraw from link (efficient transfer point)
					creep.memory.task = creep.memory.task || creep.getTask_Withdraw_Link(15);

					// PRIORITY 3: For CARRIERS, prioritize containers before pickup to get full loads
					if (creep.memory.role == "carrier") {
						// Check source containers first for carriers - they need full loads
						creep.memory.task = creep.memory.task || creep.getTask_Withdraw_Source_Container();
						creep.memory.task = creep.memory.task || creep.getTask_Withdraw_Container("energy", true);
						creep.memory.task = creep.memory.task || creep.getTask_Withdraw_Storage("energy", true);
						// Only pick up dropped energy if no containers have enough for a reasonable load
						creep.memory.task = creep.memory.task || creep.getTask_Pickup_Energy_Smart();
					} else {
						// Miners follow original priority: containers/storage first
						let energy_level = _.get(Memory, ["rooms", creep.room.name, "survey", "energy_level"]);
						if (energy_level == CRITICAL || energy_level == LOW
							|| _.get(Memory, ["sites", "mining", creep.memory.room, "store_percent"], 0) > 0.25) {
							creep.memory.task = creep.memory.task || creep.getTask_Withdraw_Container("energy", true);
							creep.memory.task = creep.memory.task || creep.getTask_Withdraw_Storage("energy", true);
						} else {
							creep.memory.task = creep.memory.task || creep.getTask_Withdraw_Storage("energy", true);
							creep.memory.task = creep.memory.task || creep.getTask_Withdraw_Container("energy", true);
						}
						// Miners can pick up energy more liberally
						creep.memory.task = creep.memory.task || creep.getTask_Pickup("energy");
					}

					// PRIORITY 4: Pick up minerals if available
					creep.memory.task = creep.memory.task || creep.getTask_Pickup("mineral");
					
					// PRIORITY 5: Wait as last resort
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
				
				// PRIORITY 6: If nowhere to deposit energy, upgrade controller (only if no upgraders)
				// This accelerates RCL progression when energy backs up but only when no dedicated upgraders exist
				let hasUpgraders = _.filter(Game.creeps, c => 
					c.memory.role == "upgrader" && c.memory.room == creep.room.name).length > 0;
				if (creep.carry["energy"] > 0 && creep.hasPart("work") > 0 && !hasUpgraders)
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
					c => { return c.isHostile() && (c.hasPart("attack") || c.hasPart("ranged_attack")); }
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
		// Check if this is a cross-shard colonization
		if (creep.memory.shard_operation) {
			this.CrossShardColonizer(creep);
			return;
		}
		
		// Debug: Check if this should be cross-shard but missing shard_operation
		if (creep.name.includes('colonizer_shard1_E29S14')) {
			console.log(`<font color="#FFA500">[Colonizer]</font> ${creep.name}: Running regular colonizer, shard_operation=${creep.memory.shard_operation}, memory:`, JSON.stringify(creep.memory));
		}

		// Regular same-shard colonization
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

	/**
	 * Handle cross-shard colonization
	 * @param {Creep} creep - The colonizer creep
	 */
	CrossShardColonizer: function (creep) {
		// Debug logging for cross-shard colonizer activity
		if (Game.time % 50 === 0) {
			console.log(`<font color="#00FFFF">[Colonizer]</font> ${creep.name}: Current shard=${Game.shard ? Game.shard.name : 'unknown'}, target=${creep.memory.dest_shard}, room=${creep.room.name}`);
		}
		
		// First, travel to the target shard using the specific portal route
		if (creep.memory.dest_shard && Game.shard && Game.shard.name !== creep.memory.dest_shard) {
			// Use the specific portal route that was set during spawn
			if (creep.memory.portal_route && creep.memory.portal_route.portal) {
				let portal = creep.memory.portal_route.portal;
				let portalRoom = portal.pos.roomName;
				
				if (creep.room.name === portalRoom) {
					// We're in the portal room, find and use the portal
					let portalStructure = creep.pos.findClosestByRange(FIND_STRUCTURES, {
						filter: s => s.structureType === STRUCTURE_PORTAL &&
						             s.pos.x === portal.pos.x &&
						             s.pos.y === portal.pos.y
					});
					
					if (portalStructure) {
						if (creep.pos.isNearTo(portalStructure)) {
							let result = creep.moveTo(portalStructure);
							if (result === OK) {
								console.log(`<font color="#00FFFF">[Colonizer]</font> ${creep.name} entering portal to ${creep.memory.dest_shard}`);
							}
							return;
						} else {
							return creep.travel(portalStructure.pos);
						}
					}
				} else {
					// Travel to the portal room first using the provided list_route
					return creep.travelToRoom(portalRoom, true);
				}
			} else {
				// Fallback to generic travelToShard if no specific route
				creep.travelToShard(creep.memory.dest_shard, creep.memory.room);
				return;
			}
			return;
		}

		// We're on the correct shard, proceed with colonization
		if (Game.time % 50 === 0) {
			console.log(`<font color="#00FFFF">[Colonizer]</font> ${creep.name}: On correct shard, current room=${creep.room.name}, target room=${creep.memory.room}`);
			console.log(`<font color="#00FFFF">[Colonizer]</font> ${creep.name}: Body parts: ${creep.body.map(p => p.type).join(',')}, CLAIM count: ${creep.getActiveBodyparts(CLAIM)}`);
		}

		// Ensure we have a target room set (fix for undefined memory issue)
		if (!creep.memory.room) {
			console.log(`<font color="#FFA500">[Colonizer]</font> ${creep.name}: Missing room memory, shard_operation=${creep.memory.shard_operation}`);
			
			if (creep.memory.shard_operation) {
				// Try to recover from operation memory
				let operations = _.get(Memory, ["shard", "operations", "colonizations"], []);
				console.log(`<font color="#FFA500">[Colonizer]</font> ${creep.name}: Found ${operations.length} operations, looking for ${creep.memory.shard_operation}`);
				
				let operation = _.find(operations, op => op.id === creep.memory.shard_operation);
				if (operation && operation.dest_room) {
					creep.memory.room = operation.dest_room;
					console.log(`<font color="#00FF00">[Colonizer]</font> ${creep.name}: Fixed missing room memory to ${creep.memory.room}`);
				} else {
					console.log(`<font color="#FF0000">[Colonizer]</font> ${creep.name}: Operation not found or missing dest_room`);
				}
			} else {
				// Fallback: infer from creep name
				let nameParts = creep.name.split('_');
				if (nameParts.length >= 3) {
					let inferredRoom = nameParts[2]; // Should be "E29S14" from "colonizer_shard1_E29S14_71062457"
					creep.memory.room = inferredRoom;
					console.log(`<font color="#FFA500">[Colonizer]</font> ${creep.name}: Inferred room from name: ${creep.memory.room}`);
				}
			}
		}
		
		// Set up the route if we don't have one but have destination route information
		if (!creep.memory.list_route && creep.memory.dest_list_route && Array.isArray(creep.memory.dest_list_route) && creep.memory.dest_list_route.length > 0) {
			creep.memory.list_route = creep.memory.dest_list_route;
			console.log(`<font color="#00FFFF">[Colonizer]</font> ${creep.name}: Using provided destination route: ${creep.memory.list_route.join(' -> ')}`);
		}
		
		// If we're in the portal destination room but need to go to a different target room, set up the route
		if (creep.memory.portal_dest_room && 
		    creep.room.name === creep.memory.portal_dest_room && 
		    creep.memory.room !== creep.memory.portal_dest_room &&
		    !creep.memory.list_route) {
			
			// Use provided destination route if available
			if (creep.memory.dest_list_route && Array.isArray(creep.memory.dest_list_route) && creep.memory.dest_list_route.length > 0) {
				creep.memory.list_route = creep.memory.dest_list_route;
				console.log(`<font color="#00FFFF">[Colonizer]</font> ${creep.name}: Using provided destination route: ${creep.memory.list_route.join(' -> ')}`);
			} else {
				// Fallback to auto-planning if no route provided
				console.log(`<font color="#00FFFF">[Colonizer]</font> ${creep.name}: Planning route from ${creep.memory.portal_dest_room} to ${creep.memory.room}`);
				let destRoute = Game.map.findRoute(creep.memory.portal_dest_room, creep.memory.room);
				if (destRoute !== ERR_NO_PATH && destRoute.length > 0) {
					creep.memory.list_route = destRoute.map(segment => segment.room);
					console.log(`<font color="#00FFFF">[Colonizer]</font> ${creep.name}: Auto-planned route: ${creep.memory.list_route.join(' -> ')}`);
				} else {
					console.log(`<font color="#FF0000">[Colonizer]</font> ${creep.name}: No route found from ${creep.memory.portal_dest_room} to ${creep.memory.room}`);
				}
			}
		}
		
		// Check if we need to move to the target room first
		if (creep.memory.room && creep.room.name !== creep.memory.room) {
			if (Game.time % 50 === 0) {
				console.log(`<font color="#00FFFF">[Colonizer]</font> ${creep.name}: Need to move from ${creep.room.name} to ${creep.memory.room}`);
			}
			
			if (this.moveToDestination(creep)) {
				return;
			}
		}

		if (this.moveToDestination(creep)) {
			if (Game.time % 50 === 0) {
				console.log(`<font color="#00FFFF">[Colonizer]</font> ${creep.name}: Moving to destination room`);
			}
			return;
		}

		// Check if we have a valid controller to claim
		if (!creep.room.controller) {
			console.log(`<font color="#FF0000">[CrossShardColonization]</font> ${creep.name}: No controller in room ${creep.room.name}`);
			return;
		}

		let result = creep.claimController(creep.room.controller);
		if (result == ERR_NOT_IN_RANGE) {
			creep.moveTo(creep.room.controller)
			return;
		} else if (result == ERR_NO_BODYPART) {
			console.log(`<font color="#FF0000">[CrossShardColonization]</font> ${creep.name}: No CLAIM body parts! Body: ${creep.body.map(p => p.type).join(',')}, CLAIM count: ${creep.getActiveBodyparts(CLAIM)}`);
			return;		// Reservers and colonizers with no "claim" parts prevent null body spawn locking
		} else {
			// Successfully claimed controller
			if (creep.room.controller.my) {
				// Set up the new colony
				_.set(Memory, ["rooms", creep.room.name, "spawn_assist", "rooms"], [creep.memory.colony]);
				_.set(Memory, ["rooms", creep.room.name, "spawn_assist", "list_route"], creep.memory.list_route);
				_.set(Memory, ["rooms", creep.room.name, "layout"], creep.memory.layout);
				_.set(Memory, ["rooms", creep.room.name, "focus_defense"], creep.memory.focus_defense);
				_.set(Memory, ["hive", "pulses", "blueprint", "request"], creep.room.name);

				// Update the cross-shard operation status
				let operations = _.get(Memory, ["shard", "operations", "colonizations"], []);
				let operation = _.find(operations, op => op.id === creep.memory.shard_operation);
				if (operation) {
					operation.status = "establishing";
					console.log(`<font color="#00FF00">[ShardCoordinator]</font> Colonization ${operation.id}: Controller claimed, establishing colony`);
				}

				// Clear creep memory (colonization complete)
				creep.memory = {};
			} else if (result != OK) {
				console.log(`<font color=\"#F0FF00\">[CrossShardColonization]</font> ${creep.name} unable to colonize ${creep.memory.room || creep.room.name}; error ${result}, controller owner: ${creep.room.controller.owner ? creep.room.controller.owner.username : 'neutral'}`);
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
		// Restore saved list_route if it was cleared by travel system
		if (creep.memory._saved_list_route && (!creep.memory.list_route || creep.memory.list_route.length === 0)) {
			creep.memory.list_route = creep.memory._saved_list_route;
		}
		
		// Check if this is a cross-shard spawn assist upgrader that needs to travel to another shard first
		if (creep.memory.cross_shard_assist && creep.memory.colony && creep.memory.room) {
			// Ensure dest_shard is set - try to get it from colonization operations if missing
			if (!creep.memory.dest_shard && creep.memory.room) {
				let colonizations = _.get(Memory, ["shard", "operations", "colonizations"], []);
				let operation = _.find(colonizations, op => op.dest_room === creep.memory.room);
				if (operation) {
					creep.memory.dest_shard = operation.dest_shard;
					console.log(`<font color="#00FF00">[Upgrader]</font> ${creep.name}: Set missing dest_shard to ${operation.dest_shard}`);
				}
			}
			
			// Continue with cross-shard travel if we have all required fields
			if (creep.memory.dest_shard) {
				// Check if we have an active transfer or need to start one
				let transfers = _.get(Memory, ["shard", "operations", "creep_transfers"], []);
				let activeTransfer = _.find(transfers, t => t.creep_name === creep.name && t.status === "traveling");
				
				// Check if we're on the correct shard first
				if (Game.shard && Game.shard.name === creep.memory.dest_shard) {
					// We're on the correct shard, ensure we have the destination list_route
					// Do ISM lookup if we don't have a valid route
					let needsRouteLookup = !creep.memory.list_route || !Array.isArray(creep.memory.list_route) || creep.memory.list_route.length === 0;
					
					if (needsRouteLookup && creep.memory.room) {
						// Look up the colonization operation to get the dest_list_route
						let colonizations = _.get(Memory, ["shard", "operations", "colonizations"], []);
						let operation = _.find(colonizations, op => op.dest_room === creep.memory.room);
						
						// If not found locally, try to get it from ALL shards via ISM
						if (!operation) {
							// Try to find the colonization operation from ALL known shards via ISM
							let knownShards = ["shard0", "shard1", "shard2", "shard3"];
							for (let shardName of knownShards) {
								if (shardName !== Game.shard.name) {
									let shardData = ISM.getShardStatus(shardName);
									if (shardData && shardData.operations && shardData.operations.colonizations) {
										operation = _.find(shardData.operations.colonizations, op => op.dest_room === creep.memory.room);
										if (operation) {
											console.log(`<font color="#00FF00">[Upgrader]</font> ${creep.name}: Found colonization operation for ${creep.memory.room} in source shard ${shardName}`);
											break;
										}
									}
								}
							}
						}
						
						if (operation && operation.dest_list_route && operation.dest_list_route.length > 0) {
							creep.memory.list_route = operation.dest_list_route;
							console.log(`<font color="#00FF00">[Upgrader]</font> ${creep.name}: Set missing dest list_route from operation: ${JSON.stringify(operation.dest_list_route)}`);
						} else {
							// NO FALLBACK - the colonization operation MUST have dest_list_route configured
							// to avoid hostile rooms. Falling back to direct pathfinding would send workers
							// through occupied rooms where they will die.
							console.log(`<font color="#FF0000">[Upgrader]</font> ${creep.name}: MISSING dest_list_route in colonization operation for ${creep.memory.room} - this will cause workers to die in hostile rooms!`);
						}
					}
					
					// Use goToRoom which will handle list_route navigation
					if (creep.room.name !== creep.memory.room) {
						this.goToRoom(creep, creep.memory.room, false);
						return;
					}
				} else if (creep.room.name !== creep.memory.room || activeTransfer) {
					// We need to cross shards or we're still traveling
					if (activeTransfer) {
						// Continue existing transfer - use travelToShard once per tick max
						let result = creep.travelToShard(creep.memory.dest_shard, creep.memory.room);
						if (result !== OK && result !== ERR_BUSY && result !== ERR_INVALID_TARGET) {
							console.log(`<font color="#FFA500">[Upgrader]</font> ${creep.name}: travelToShard error ${result}`);
						}
					} else {
						console.log(`<font color="#00FF00">[Upgrader]</font> ${creep.name}: Starting cross-shard travel to ${creep.memory.dest_shard}/${creep.memory.room}`);
						// Use travelToShard directly for cross-shard upgraders instead of goToRoom
						let result = creep.travelToShard(creep.memory.dest_shard, creep.memory.room);
						if (result !== OK && result !== ERR_BUSY && result !== ERR_INVALID_TARGET && result !== ERR_NO_PATH) {
							console.log(`<font color="#FFA500">[Upgrader]</font> ${creep.name}: travelToShard error ${result}`);
						}
					}
					return;
				}
			}
		}

		let hostile = isSafe ? null
			: _.head(creep.pos.findInRange(FIND_HOSTILE_CREEPS, 5, {
				filter:
					c => { return c.isHostile() && (c.hasPart("attack") || c.hasPart("ranged_attack")); }
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