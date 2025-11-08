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
		// Check for transfer intent first - if transferring, ONLY execute transfer task
		if (creep.memory.transfer_intent) {
			// Check if scout is at portal and should transfer
			let transferCheck = Creep_Transfer.shouldTransferCreep(creep);
			if (transferCheck.should_transfer) {
				// Scout is at portal, execute transfer
				if (Creep_Transfer.processPortalTransfer(creep)) {
					console.log(`<font color="#4ECDC4">[Scout]</font> Transferring ${creep.name} to ${transferCheck.destination_shard}:${transferCheck.destination_room}`);
					return;
				}
			} else {
				// Scout is transferring to another shard, execute transfer task
				creep.runTask(creep);
				return;
			}
		}

		// Check for hostile creeps - scouts without attack parts should avoid them
		let hasAttackParts = creep.body.some(part => part.type === ATTACK || part.type === RANGED_ATTACK);
		let hostile = hasAttackParts ? null : _.head(creep.pos.findInRange(FIND_HOSTILE_CREEPS, 5, {
			filter: c => { return c.isHostile(); }
		}));

		if (hostile != null) {
			// Scout has no attack parts, avoid the hostile
			creep.moveFrom(hostile);
			return;
		}

		// Continue with normal scouting behavior
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

	Worker: function (creep, isSafe) {
		// Always prioritize picking up dropped commodities if there is free carry capacity
		if (_.sum(creep.carry) < creep.carryCapacity) {
			let dropped = creep.room.find(FIND_DROPPED_RESOURCES, {
				filter: r => r.resourceType !== "energy"
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
					
					// Priority 2: Repair critical structures (walls, ramparts)
					creep.memory.task = creep.memory.task || creep.getTask_Repair(true);
					
					// Priority 3: Upgrade only if no upgraders and not critical downgrade
					let shouldUpgrade = !hasUpgraders && !isCriticalDowngrade;
					if (shouldUpgrade) {
						creep.memory.task = creep.memory.task || creep.getTask_Upgrade(true);
						creep.memory.task = creep.memory.task || creep.getTask_Upgrade(false);
					}
					
					// Priority 4: Other tasks
					creep.memory.task = creep.memory.task || creep.getTask_Sign();
					creep.memory.task = creep.memory.task || creep.getTask_Repair(false);
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
				// Burrowers: Always try to mine (assignment happens in getTask_Mine)
				// If already assigned to a source, mine it; otherwise get assigned to a source
				creep.memory.task = creep.memory.task || creep.getTask_Mine();
				
				// Fallback tasks if no mining available (only work if already assigned to a source)
				creep.memory.task = creep.memory.task || creep.getTask_Withdraw_Source_Container();
				creep.memory.task = creep.memory.task || creep.getTask_Deposit_Source_Link();
				
				// Final fallback: wait if no tasks available
				creep.memory.task = creep.memory.task || creep.getTask_Wait(5);

			} else if (creep.memory.role == "miner" || creep.memory.role == "carrier") {
					creep.memory.task = creep.memory.task || creep.getTask_Pickup("energy");
					creep.memory.task = creep.memory.task || creep.getTask_Withdraw_Link(15);

					let energy_level = _.get(Memory, ["rooms", creep.room.name, "survey", "energy_level"]);
					if (energy_level == CRITICAL || energy_level == LOW
						|| _.get(Memory, ["sites", "mining", creep.memory.room, "store_percent"], 0) > 0.25) {
						creep.memory.task = creep.memory.task || creep.getTask_Withdraw_Container("energy", true);
						creep.memory.task = creep.memory.task || creep.getTask_Withdraw_Storage("energy", true);
					} else {
						creep.memory.task = creep.memory.task || creep.getTask_Withdraw_Storage("energy", true);
						creep.memory.task = creep.memory.task || creep.getTask_Withdraw_Container("energy", true);
					}

					if (creep.hasPart("work") > 0)
						creep.memory.task = creep.memory.task || creep.getTask_Mine();
					creep.memory.task = creep.memory.task || creep.getTask_Pickup("mineral");
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

				if (creep.room.energyAvailable < creep.room.energyCapacityAvailable * 0.75) {
					creep.memory.task = creep.memory.task || creep.getTask_Deposit_Spawns();
					creep.memory.task = creep.memory.task || creep.getTask_Deposit_Towers();
				} else {
					creep.memory.task = creep.memory.task || creep.getTask_Deposit_Towers();
					creep.memory.task = creep.memory.task || creep.getTask_Deposit_Spawns();
				}
				creep.memory.task = creep.memory.task || creep.getTask_Deposit_Link();
				creep.memory.task = creep.memory.task || creep.getTask_Deposit_Storage("mineral");
				creep.memory.task = creep.memory.task || creep.getTask_Deposit_Storage("energy");
				creep.memory.task = creep.memory.task || creep.getTask_Deposit_Container("energy");
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
		if (_.sum(creep.carry) < creep.carryCapacity) {
			let dropped = creep.room.find(FIND_DROPPED_RESOURCES, {
				filter: r => r.resourceType !== "energy"
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

					// If we're in the harvest room and have a stale "wait" task, clear it to force re-evaluation
					// This ensures extractors move to mineral location even when mineral is depleted
					if (creep.room.name == creep.memory.room && creep.memory.task && creep.memory.task.type == "wait") {
						delete creep.memory.task;
					}

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
		// Master-Slave Architecture: All shards report to shard0 master
		if (creep.name.startsWith('colo:')) {
			// Update local status to ISM for master shard0 to read
			if (Game.time % 5 === 0) {
				console.log(`<font color="#FFA500">[Colonizer]</font> ${creep.name} updating status to master shard0 (tick ${Game.time})`);
				
				// Check if this is a transferred colonizer that needs memory restoration
				if (!creep.memory.role) {
					console.log(`<font color="#FFA500">[Colonizer]</font> ${creep.name} has no role, attempting memory restoration`);
					
					// Check shard0's master ISM for transfer data
					try {
						let masterIsmData = InterShardMemory.getRemote('shard0');
						if (masterIsmData) {
							let parsed = JSON.parse(masterIsmData);
							
							if (parsed.transfers && parsed.transfers[creep.name]) {
								let transferData = parsed.transfers[creep.name];
								console.log(`<font color="#4ECDC4">[Colonizer]</font> Found transfer data for ${creep.name} in master ISM`);
								
								// Restore memory
								creep.memory.role = transferData.role;
								creep.memory.room = transferData.room;
								creep.memory.colony = transferData.colony;
								creep.memory.level = transferData.level;
								creep.memory.shard_mission = transferData.shard_mission;
								creep.memory.list_route = transferData.list_route;
								creep.memory.spawn_pos = transferData.spawn_pos;
								creep.memory.layout_config = transferData.layout_config;
								creep.memory.focus_defense = transferData.focus_defense;
								creep.memory.transferred = true;
								creep.memory.transfer_time = transferData.transfer_time;
								creep.memory.global_status = 'restored';
								
								console.log(`<font color="#4ECDC4">[Colonizer]</font> Memory restored for ${creep.name}, mission: ${transferData.shard_mission}`);
							}
						}
					} catch (e) {
						console.log(`<font color="#FFA500">[Colonizer]</font> Error reading master ISM: ${e.message}`);
					}
				} else if (creep.memory.role && !creep.memory.global_status) {
					// Creep has role but no global status - mark as restored
					creep.memory.global_status = 'restored';
					console.log(`<font color="#4ECDC4">[Colonizer]</font> ${creep.name} marked as restored`);
				}
				
				// Report status to master shard0 via local ISM
				let ismData = InterShardMemory.getLocal() ? JSON.parse(InterShardMemory.getLocal()) : {};
				if (!ismData.slave_reports) ismData.slave_reports = {};
				ismData.slave_reports[creep.name] = {
					status: creep.memory.global_status || 'active',
					shard: Game.shard.name,
					room: creep.room.name,
					last_update: Game.time,
					ticks_to_live: creep.ticksToLive,
					mission: creep.memory.shard_mission
				};
				InterShardMemory.setLocal(JSON.stringify(ismData));
				console.log(`<font color="#4ECDC4">[Colonizer]</font> ${creep.name} status reported to master`);
			}
		}
		
		// Check for transfer intent first - if transferring, move to portal and step on it
		if (creep.memory.transfer_intent) {
			let portalPos = creep.memory.transfer_intent.portal_pos;
			
			// Check if creep is at portal
			if (creep.pos.x === portalPos.x && creep.pos.y === portalPos.y && creep.room.name === portalPos.roomName) {
				// Creep is at portal, store transfer data in ISM and transfer
				console.log(`<font color="#4ECDC4">[Colonizer]</font> ${creep.name} at portal, storing transfer data and transferring to ${creep.memory.transfer_intent.destination_shard}`);
				
				// Store colonizer data in InterShardMemory for restoration on destination shard
				let transferData = {
					creepId: creep.name,
					role: creep.memory.role,
					room: creep.memory.room,
					colony: creep.memory.colony,
					level: creep.memory.level,
					shard_mission: creep.memory.shard_mission,
					destination_shard: creep.memory.transfer_intent.destination_shard,
					destination_room: creep.memory.transfer_intent.destination_room,
					list_route: creep.memory.list_route,
					spawn_pos: creep.memory.spawn_pos,
					layout_config: creep.memory.layout_config,
					focus_defense: creep.memory.focus_defense,
					transfer_time: Game.time
				};
				
				// Store in InterShardMemory for destination shard
				let ismData = InterShardMemory.getLocal() ? JSON.parse(InterShardMemory.getLocal()) : {};
				if (!ismData.transfers) ismData.transfers = {};
				ismData.transfers[creep.name] = transferData;
				
				// Mark as global creep in ISM
				if (!ismData.global_creeps) ismData.global_creeps = {};
				ismData.global_creeps[creep.name] = {
					status: 'transferring',
					shard: Game.shard.name,
					room: creep.room.name,
					last_update: Game.time,
					ticks_to_live: creep.ticksToLive
				};
				
				InterShardMemory.setLocal(JSON.stringify(ismData));
				
				console.log(`<font color="#4ECDC4">[Colonizer]</font> Transfer data stored for ${creep.name}`);
				
				// Clear transfer intent - the transfer will happen automatically
				delete creep.memory.transfer_intent;
				return;
			} else {
				// Creep is not at portal, move directly to it using moveTo
				console.log(`<font color="#FFA500">[Colonizer]</font> ${creep.name} moving to portal at ${portalPos.x},${portalPos.y} in ${portalPos.roomName}`);
				
				// Check if we're in the correct room first
				if (creep.room.name !== portalPos.roomName) {
					// Need to travel to the portal room first
					console.log(`<font color="#FFA500">[Colonizer]</font> ${creep.name} needs to travel to room ${portalPos.roomName} first`);
					creep.travelToRoom(portalPos.roomName);
					return;
				}
				
				// We're in the correct room, move to the portal position
				let moveResult = creep.moveTo(portalPos.x, portalPos.y);
				console.log(`<font color="#FFA500">[Colonizer]</font> Move result: ${moveResult}`);
				return;
			}
		}

		// Check for movement task first
		if (creep.memory.task && creep.memory.task.type === "move") {
			creep.runTask(creep);
			return;
		}

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