/* ***********************************************************
 *	[sec03b] DEFINITIONS: CREEP ROLES
 * *********************************************************** */

 global.Creep_Roles = {

	moveToDestination: function (creep) {
		// Use list_route if available (supports cross-shard travel), otherwise use room
		if (creep.memory.room != null) {
			// Extract base room name (strip shard prefix if present)
			let targetRoom = creep.memory.room;
			let baseRoom = targetRoom;
			if (targetRoom.indexOf("/") >= 0)
				baseRoom = targetRoom.split("/")[1];
			
			// Check if we're already at destination
			if (creep.room.name == baseRoom)
				return false;
			
			// Use list_route for travel if available (handles cross-shard routes)
			// But DON'T use list_route if the actual destination is already on this shard
			// (prevents trying to follow waypoints past the destination)
			if (_.isArray(creep.memory.list_route) && creep.memory.list_route.length > 0) {
				// Check if destination is in list_route - if so, use waypoint routing
				let routeContainsDestination = _.any(creep.memory.list_route, entry => {
					let roomToCheck = _.isString(entry) ? (entry.indexOf("/") >= 0 ? entry.split("/")[1] : entry) : entry;
					return roomToCheck === baseRoom;
				});
				
				if (routeContainsDestination) {
					// Use waypoint routing with the full destination
					creep.travelToRoom(targetRoom, true);
				} else {
					// Destination not in route - just go there directly
					creep.travelToRoom(creep.memory.room, true);
				}
			} else {
				creep.travelToRoom(creep.memory.room, true);
			}
			return true;
		}
		return false;
	},

	goToRoom: function (creep, room_name, is_refueling) {
		if (creep.room.name != room_name) {
			// Use list_route if available for multi-room travel (prevents getting stuck between rooms)
			if (_.isArray(creep.memory.list_route) && creep.memory.list_route.length > 0) {
				creep.travelToRoom(room_name, is_refueling, true);
			} else {
				creep.travelToRoom(room_name, is_refueling);
			}
			return true;
		}
		return false;
	},

	Scout: function (creep) {
		if (_.get(creep.memory, "_last_scout_run") === Game.time)
					return;
		creep.memory._last_scout_run = Game.time;

	// CRITICAL: Ensure mission data is always in creep memory so it survives cross-shard transfers
	// Only initialize fields if they don't exist - don't overwrite valid mission data
	if (!_.has(creep.memory, "scout_request_id"))
		creep.memory.scout_request_id = null;
	if (!_.has(creep.memory, "dest_pos"))
		creep.memory.dest_pos = null;
	if (!_.has(creep.memory, "rally_pos"))
		creep.memory.rally_pos = null;
	if (!_.has(creep.memory, "list_route"))
		creep.memory.list_route = [];
	if (!_.has(creep.memory, "transfer_intent"))
		creep.memory.transfer_intent = null;
	if (!_.has(creep.memory, "colony_shard"))
		creep.memory.colony_shard = Game.shard.name;

	const knownShards = (typeof ShardMemory !== "undefined" && _.isArray(_.get(ShardMemory, "KNOWN_SHARDS")))
		? ShardMemory.KNOWN_SHARDS
		: ["shard0", "shard1", "shard2", "shard3"];
	// Debug level: 0 = none, 1 = errors/state changes, 2 = +movement/portals, 3 = full verbose
	const debugLevel = _.get(Memory, ["hive", "debug", "scout"], 0);
	const debugEnabled = debugLevel > 0;
	const debugVerbose = debugLevel >= 3;
	const debugMovement = debugLevel >= 2;
	
	// Helper function for throttled debug logging
	const debugLog = function(level, message, throttleTicks) {
		if (debugLevel < level) return;
		if (throttleTicks && throttleTicks > 0) {
			let lastLog = _.get(creep.memory, `_scout_debug_log_${level}`, 0);
			if (Game.time - lastLog < throttleTicks) return;
			creep.memory[`_scout_debug_log_${level}`] = Game.time;
		}
		console.log(message);
	};

	const shouldWaitForTransferAck = function () {
		// TODO: re-enable once inter-shard handshake acks are flowing reliably
		return false;
	};

	const recordTransferSnapshot = function (portalPos, targetShard, targetRoom) {
		// Early return if transfer already recorded - prevent loops
		if (creep.memory._scout_transfer_recorded === true) {
			return;
		}
		
		debugLog(2, `<font color="#4ECDC4">[Scout]</font> recordTransferSnapshot called for ${creep.name} - target: ${targetShard}/${targetRoom}`, 10);

		debugLog(2, `<font color="#4ECDC4">[Scout]</font> Recording transfer snapshot for ${creep.name}`, 10);
		let snapshot;
			try {
				snapshot = JSON.parse(JSON.stringify(creep.memory || {}));
			} catch (err) {
				snapshot = _.assign({}, creep.memory);
			}

			if (_.isObject(snapshot)) {
				delete snapshot.path;
				delete snapshot._scout_transfer_recorded;
				delete snapshot._scout_restored;
			}

			let transferData = {
				creepId: creep.name,
				role: "scout",
				colony: _.get(creep.memory, "colony", null),
				room: _.get(creep.memory, "room", null),
				level: _.get(creep.memory, "level", null),
				colony_shard: _.get(creep.memory, "colony_shard", Game.shard.name),
				scout_request_id: _.get(creep.memory, "scout_request_id"),
				list_route: _.get(creep.memory, "list_route"),
				rally_pos: _.get(creep.memory, "rally_pos"),
				dest_pos: _.get(creep.memory, "dest_pos"),
				transfer_intent: _.get(creep.memory, "transfer_intent"),
				shard_mission: _.get(creep.memory, "shard_mission", "scout"),
				destination_shard: targetShard || _.get(creep.memory, ["transfer_intent", "destination_shard"]),
				destination_room: targetRoom || _.get(creep.memory, ["transfer_intent", "destination_room"]),
				origin_shard: Game.shard.name,
				origin_room: creep.room.name,
				portal: portalPos ? { x: portalPos.x, y: portalPos.y, roomName: portalPos.roomName, shard: Game.shard.name } : null,
				transfer_time: Game.time,
				memory: snapshot
			};

		if (Memory && _.get(Memory, ["hive", "ism", "debug_transfers"])) {
			console.log(`<font color="#9B5DE5">[Scout]</font> transferData for ${creep.name} -> ${JSON.stringify(_.pick(transferData, ["destination_shard","destination_room","origin_shard","portal","transfer_time"]))}`);
		}

			creep.memory.global_status = "transferring";
			creep.updateGlobalStatus("transferring", {
				target: {
					shard: transferData.destination_shard,
					room: transferData.destination_room
				},
				portal: transferData.portal
			});
		creep.memory._awaiting_transfer_ack = true;

		let descriptor = creep.getGlobalDescriptor();
		try {
			if (descriptor == null) {
				descriptor = {
					status: "transferring",
					mission: transferData.shard_mission,
					role: "scout",
					shard: Game.shard.name,
					room: creep.room.name,
					portal: transferData.portal,
					target: {
						shard: transferData.destination_shard,
						room: transferData.destination_room
					},
					last_update: Game.time,
					ttl: creep.ticksToLive
				};
			} else {
				descriptor.status = "transferring";
				descriptor.portal = transferData.portal;
				descriptor.target = {
					shard: transferData.destination_shard,
					room: transferData.destination_room
				};
				descriptor.last_update = Game.time;
			}

			if (typeof ShardMemory !== "undefined" && _.isFunction(_.get(ShardMemory, "recordCreepTransfer"))) {
				console.log(`<font color="#4ECDC4">[Scout]</font> Storing transfer via ShardMemory for ${creep.name}`);
				ShardMemory.recordCreepTransfer(creep.name, transferData, {
					descriptor: descriptor
				});
				console.log(`<font color="#4ECDC4">[Scout]</font> snapshot stored for ${creep.name}`);
			} else {
				let ismData = InterShardMemory.getLocal() ? JSON.parse(InterShardMemory.getLocal()) : {};
				if (!_.isObject(ismData))
					ismData = {};
				if (!_.has(ismData, "transfers"))
					ismData.transfers = {};
				ismData.transfers[creep.name] = transferData;
				if (!_.has(ismData, "global_creeps"))
					ismData.global_creeps = {};
				ismData.global_creeps[creep.name] = descriptor;
				InterShardMemory.setLocal(JSON.stringify(ismData));
				debugLog(2, `<font color="#4ECDC4">[Scout]</font> snapshot stored for ${creep.name}`, 10);
			}
		} catch (err) {
			debugLog(1, `<font color="#FFA500">[Scout]</font> Failed to record transfer for ${creep.name}: ${err.message}`, 0);
		}

		creep.memory._scout_next_portal_allowed = Game.time + 20;
		creep.memory._scout_transfer_recorded = true;
		
		// Register scout as remote immediately when transfer is recorded
		// This ensures proper tracking even if the creep disappears before clearDeadMemory runs
		if (typeof Control !== "undefined" && _.isFunction(Control.registerRemoteMissionCreep)) {
			Control.registerRemoteMissionCreep(creep.name, Game.time);
		}
		};

		// Allow pathing helpers to trigger snapshot recording when they detect a portal
		creep._recordTransferSnapshot = recordTransferSnapshot;

		// Define colonyShard early so tryRestoreFromTransfer can use it
		const colonyShard = _.get(creep.memory, "colony_shard", Game.shard.name);

		const tryRestoreFromTransfer = function () {
		if (_.get(creep.memory, "_scout_restored") === true)
			return;
		// Only skip if scout already has valid mission data (not just the field existing with null value)
		if (_.get(creep.memory, "role") === "scout" && _.get(creep.memory, "scout_request_id") !== null && _.get(creep.memory, "scout_request_id") !== undefined) {
			creep.memory._scout_restored = true;
				if (!_.has(creep.memory, "_scout_next_portal_allowed"))
					creep.memory._scout_next_portal_allowed = Game.time + 20;
				return;
			}
		
		// If scout is very young (< 10 ticks old), it was spawned locally, not transferred
		if (creep.ticksToLive > (CREEP_LIFE_TIME - 10)) {
			creep.memory._scout_restored = true; // Mark as restored to prevent future checks
			return;
		}

		debugLog(2, `<font color="#4ECDC4">[Scout]</font> Attempting restoration for ${creep.name} on shard ${Game.shard.name}`, 0);
		let transferData = null;

		for (let i = 0; i < knownShards.length; i++) {
			let shardName = knownShards[i];
			if (shardName === Game.shard.name)
				continue;

			let entry = null;
		if (typeof ShardMemory !== "undefined" && _.isFunction(_.get(ShardMemory, "getCreepTransfer"))) {
				entry = ShardMemory.getCreepTransfer(shardName, creep.name);
			} else {
				let raw;
				try {
					raw = InterShardMemory.getRemote(shardName);
				} catch (err) {
					continue;
				}

				if (!raw)
					continue;

				let parsed;
				try {
					parsed = JSON.parse(raw);
				} catch (err) {
					continue;
				}

				entry = _.get(parsed, ["transfers", creep.name], null);
			}

			if (entry) {
				transferData = entry;
				debugLog(2, `<font color="#4ECDC4">[Scout]</font> Found transfer for ${creep.name} from ${shardName}`, 0);
				break;
			}
		}

		if (transferData == null) {
			let offer = null;
			if (typeof ShardMemory !== "undefined" && _.isFunction(_.get(ShardMemory, "getHandshakeOffer"))) {
				offer = ShardMemory.getHandshakeOffer(creep.name, true);
			}
			if (_.get(offer, "transfer_data")) {
				debugLog(2, `<font color="#4ECDC4">[Scout]</font> Using handshake backup transfer for ${creep.name}`, 0);
				transferData = _.get(offer, "transfer_data");
			} else {
				// Log once per creep to avoid console spam when transfer data never arrives
				if (!creep.memory._scout_transfer_missing_logged) {
					creep.memory._scout_transfer_missing_logged = true;
					debugLog(1, `<font color="#FFD700">[Scout]</font> No transfer data found for ${creep.name}`, 0);
				}
				return;
			}
		}

		debugLog(2, `<font color="#4ECDC4">[Scout]</font> Restoring memory for ${creep.name} from transfer data`, 0);
		let snapshot = _.get(transferData, "memory");

		if (_.isObject(snapshot)) {
				_.forEach(_.keys(creep.memory), key => {
					delete creep.memory[key];
				});
				_.forEach(snapshot, (value, key) => {
					creep.memory[key] = value;
				});
			} else {
				creep.memory.role = "scout";
				if (_.has(transferData, "colony"))
					creep.memory.colony = transferData.colony;
				if (_.has(transferData, "room"))
					creep.memory.room = transferData.room;
				if (_.has(transferData, "level"))
					creep.memory.level = transferData.level;
				if (_.has(transferData, "list_route"))
					creep.memory.list_route = transferData.list_route;
				if (_.has(transferData, "scout_request_id"))
					creep.memory.scout_request_id = transferData.scout_request_id;
				if (_.has(transferData, "transfer_intent"))
					creep.memory.transfer_intent = transferData.transfer_intent;
				if (_.has(transferData, "dest_pos"))
					creep.memory.dest_pos = transferData.dest_pos;
				if (_.has(transferData, "rally_pos"))
					creep.memory.rally_pos = transferData.rally_pos;
				if (_.has(transferData, "colony_shard"))
					creep.memory.colony_shard = transferData.colony_shard;
				if (_.has(transferData, "spawnRooms"))
					creep.memory.spawnRooms = transferData.spawnRooms;
				if (_.has(transferData, "shard_mission"))
					creep.memory.shard_mission = transferData.shard_mission;
			}

			// Ensure critical mission fields exist even if snapshot was partial
			_.set(creep.memory, "role", "scout");
			if (_.has(transferData, "scout_request_id") && !_.has(creep.memory, "scout_request_id"))
				creep.memory.scout_request_id = transferData.scout_request_id;
			if (_.has(transferData, "dest_pos") && !_.has(creep.memory, "dest_pos"))
				creep.memory.dest_pos = transferData.dest_pos;
			if (_.has(transferData, "rally_pos") && !_.has(creep.memory, "rally_pos"))
				creep.memory.rally_pos = transferData.rally_pos;
			if (_.has(transferData, "list_route") && !_.has(creep.memory, "list_route"))
				creep.memory.list_route = transferData.list_route;
			if (_.has(transferData, "transfer_intent")) {
				if (!_.has(creep.memory, "transfer_intent"))
					creep.memory.transfer_intent = transferData.transfer_intent;
				else
					creep.memory.transfer_intent = _.defaults(creep.memory.transfer_intent || {}, transferData.transfer_intent);
			}

			creep.memory._scout_restored = true;
			creep.memory.global_status = "restored";
			delete creep.memory._scout_transfer_recorded;
			delete creep.memory._awaiting_transfer_ack;
			delete creep.memory._scout_ack_wait_log;
			if (typeof creep.travelClear === "function")
				creep.travelClear();

			// Restore patrol state based on shard and loop mode progress
			let destPosData = _.get(creep.memory, "dest_pos");
			let rallyPosData = _.get(creep.memory, "rally_pos");
			let destShard = _.get(destPosData, "shard");
			let rallyShard = _.get(rallyPosData, "shard", colonyShard);
			let patrolMode = _.get(creep.memory, "patrol_mode", "station");
			let restoredPatrolState = _.get(creep.memory, "scout_patrol_state");
			let destReached = _.get(creep.memory, "scout_dest_reached", false);
			let rallyReached = _.get(creep.memory, "scout_rally_reached", false);
			
			// Check if scout is actually at rally/destination position
			let atRallyPos = false;
			let atDestPos = false;
			if (rallyPosData && rallyShard === Game.shard.name) {
				let rallyPos = new RoomPosition(rallyPosData.x, rallyPosData.y, rallyPosData.roomName);
				atRallyPos = creep.room.name === rallyPos.roomName && creep.pos.inRangeTo(rallyPos, 1);
			}
			if (destPosData && destShard === Game.shard.name) {
				let destPos = new RoomPosition(destPosData.x, destPosData.y, destPosData.roomName);
				atDestPos = creep.room.name === destPos.roomName && creep.pos.inRangeTo(destPos, 1);
			}
			
			if (patrolMode === "loop") {
				// In loop mode, determine state based on shard, progress, and actual position
				if (destShard === Game.shard.name) {
					// On destination shard
					if (atDestPos) {
						// Actually at destination - should be heading back to rally
						creep.memory.scout_patrol_state = "to_rally";
						creep.memory.scout_dest_reached = true;
						creep.memory.scout_rally_reached = false;
					} else if (restoredPatrolState === "to_rally" && destReached) {
						// Was heading back to rally after reaching destination, keep that state
						creep.memory.scout_patrol_state = "to_rally";
						creep.memory.scout_dest_reached = true;
						creep.memory.scout_rally_reached = false;
					} else {
						// Heading to destination
						creep.memory.scout_patrol_state = "to_dest";
						creep.memory.scout_dest_reached = destReached;
						creep.memory.scout_rally_reached = rallyReached;
					}
				} else if (rallyShard === Game.shard.name) {
					// On rally shard
					if (atRallyPos) {
						// Actually at rally - should be heading to destination (start next loop)
						creep.memory.scout_patrol_state = "to_dest";
						creep.memory.scout_rally_reached = true;
						creep.memory.scout_dest_reached = false;
					} else if (restoredPatrolState === "to_rally" && destReached) {
						// Was returning to rally after completing destination leg, keep that state
						creep.memory.scout_patrol_state = "to_rally";
						creep.memory.scout_dest_reached = true;
						creep.memory.scout_rally_reached = false;
					} else if (restoredPatrolState === "to_dest" && rallyReached) {
						// Was heading to destination after reaching rally, keep that state
						creep.memory.scout_patrol_state = "to_dest";
						creep.memory.scout_rally_reached = true;
						creep.memory.scout_dest_reached = false;
					} else {
						// Default: heading to rally
						creep.memory.scout_patrol_state = "to_rally";
						creep.memory.scout_rally_reached = rallyReached;
						creep.memory.scout_dest_reached = destReached;
					}
				} else {
					// On neither shard - preserve state or default to heading to destination
					creep.memory.scout_patrol_state = restoredPatrolState || "to_dest";
					creep.memory.scout_dest_reached = destReached;
					creep.memory.scout_rally_reached = rallyReached;
				}
			} else {
				// Station mode - simple shard-based state
				if (destShard === Game.shard.name) {
					creep.memory.scout_patrol_state = "to_dest";
					creep.memory.scout_dest_reached = false;
					creep.memory.scout_rally_reached = rallyReached;
				} else if (rallyShard === Game.shard.name) {
					creep.memory.scout_patrol_state = "to_rally";
					creep.memory.scout_rally_reached = false;
					creep.memory.scout_dest_reached = destReached;
				}
			}
			
			debugLog(1, `<font color="#4ECDC4">[Scout]</font> ${creep.name} restored on ${Game.shard.name}: patrol_state=${creep.memory.scout_patrol_state}, mode=${patrolMode}, dest_reached=${creep.memory.scout_dest_reached}, rally_reached=${creep.memory.scout_rally_reached}, at_rally=${atRallyPos}, at_dest=${atDestPos}`, 0);

			creep.memory._scout_next_portal_allowed = Game.time + 20;
			creep.memory._scout_last_shard_switch = Game.time;

			if (typeof ShardMemory !== "undefined" && _.isFunction(_.get(ShardMemory, "deleteCreepTransfer"))) {
				ShardMemory.deleteCreepTransfer(creep.name);
				if (_.isFunction(_.get(ShardMemory, "completeTransfer"))) {
					ShardMemory.completeTransfer(creep.name, {
						origin_shard: _.get(transferData, "origin_shard", _.get(transferData, "colony_shard")),
						destination_shard: Game.shard.name,
						transfer_time: _.get(transferData, "transfer_time"),
						restored: Game.time
					});
				}
			}

			try {
				let localPayload = InterShardMemory.getLocal() ? JSON.parse(InterShardMemory.getLocal()) : {};
				if (!_.isObject(localPayload))
					localPayload = {};
				if (!_.has(localPayload, "global_creeps"))
					localPayload.global_creeps = {};

				let descriptor = creep.getGlobalDescriptor();
				if (descriptor == null) {
					descriptor = {
						status: _.get(creep.memory, ["global", "status"], "active"),
						mission: _.get(creep.memory, ["shard_mission"], "scout"),
						role: "scout",
						shard: Game.shard.name,
						room: _.get(creep, ["room", "name"], null),
						ttl: creep.ticksToLive,
						last_update: Game.time
					};
				}

				localPayload.global_creeps[creep.name] = descriptor;
				InterShardMemory.setLocal(JSON.stringify(localPayload));
				if (typeof ShardMemory !== "undefined" && _.isFunction(_.get(ShardMemory, "registerGlobalCreep")))
					ShardMemory.registerGlobalCreep(creep.name, descriptor);
			} catch (err) {
				debugLog(1, `<font color="#FFA500">[Scout]</font> Failed to update ISM for restored ${creep.name}: ${err.message}`, 0);
			}
		};

		tryRestoreFromTransfer();

		const ensureGlobalRegistration = function () {
			let destinationShard = _.get(creep.memory, ["dest_pos", "shard"])
				|| _.get(creep.memory, ["transfer_intent", "destination_shard"]);
			let destinationRoom = _.get(creep.memory, ["dest_pos", "roomName"])
				|| _.get(creep.memory, ["transfer_intent", "destination_room"]);

			let globalDefaults = {
				mission: _.get(creep.memory, "shard_mission", "scout"),
				status: _.get(creep.memory, "global_status", _.get(creep, ["memory", "global", "status"], "active")),
				note: "scout",
				origin: {
					shard: _.get(creep.memory, "colony_shard", Game.shard.name),
					room: _.get(creep.memory, "colony", _.get(creep.memory, "room", _.get(creep, ["room", "name"], null)))
				},
				target: (destinationShard || destinationRoom)
					? { shard: destinationShard, room: destinationRoom }
					: undefined,
				route: _.get(creep.memory, "list_route")
			};

			creep.ensureGlobal(globalDefaults);
			if (!_.has(creep.memory, "global_status"))
				creep.updateGlobalStatus(_.get(globalDefaults, "status", "active"));

			let missionData = _.get(creep.memory, ["global", "mission_data"]);
			if (!_.isObject(missionData))
				missionData = {};

			if (_.has(creep.memory, "scout_request_id"))
				missionData.scout_request_id = creep.memory.scout_request_id;
			if (_.has(creep.memory, "colony"))
				missionData.colony = creep.memory.colony;
			if (_.has(creep.memory, "colony_shard"))
				missionData.colony_shard = creep.memory.colony_shard;
			if (_.has(creep.memory, "dest_pos"))
				missionData.dest_pos = _.clone(creep.memory.dest_pos);
			if (_.has(creep.memory, "rally_pos"))
				missionData.rally_pos = _.clone(creep.memory.rally_pos);
			if (_.has(creep.memory, "list_route"))
				missionData.list_route = _.clone(creep.memory.list_route);
			if (_.has(creep.memory, "transfer_intent"))
				missionData.transfer_intent = _.cloneDeep(creep.memory.transfer_intent);
			if (_.has(creep.memory, "portals"))
				missionData.portals = _.cloneDeep(creep.memory.portals);

			_.set(creep.memory, ["global", "mission_data"], missionData);

			if (typeof ShardMemory !== "undefined" && _.isFunction(_.get(ShardMemory, "registerGlobalCreep"))) {
				let descriptor = creep.getGlobalDescriptor();
				if (descriptor != null)
					ShardMemory.registerGlobalCreep(creep.name, descriptor);
			}
		};

		ensureGlobalRegistration();

		const restoreFromGlobalMission = function () {
			let missionData = _.get(creep.memory, ["global", "mission_data"]);
			if (!_.isObject(missionData))
				return;

			if (!_.has(creep.memory, "scout_request_id") && _.has(missionData, "scout_request_id"))
				creep.memory.scout_request_id = missionData.scout_request_id;
			if (!_.has(creep.memory, "colony") && _.has(missionData, "colony"))
				creep.memory.colony = missionData.colony;
			if (!_.has(creep.memory, "colony_shard") && _.has(missionData, "colony_shard"))
				creep.memory.colony_shard = missionData.colony_shard;
			if (!_.has(creep.memory, "dest_pos") && _.has(missionData, "dest_pos"))
				creep.memory.dest_pos = _.clone(missionData.dest_pos);
			if (!_.has(creep.memory, "rally_pos") && _.has(missionData, "rally_pos"))
				creep.memory.rally_pos = _.clone(missionData.rally_pos);
			if (!_.has(creep.memory, "list_route") && _.has(missionData, "list_route"))
				creep.memory.list_route = _.clone(missionData.list_route);
			if (!_.has(creep.memory, "transfer_intent") && _.has(missionData, "transfer_intent"))
				creep.memory.transfer_intent = _.cloneDeep(missionData.transfer_intent);
			if (!_.has(creep.memory, "portals") && _.has(missionData, "portals"))
				creep.memory.portals = _.cloneDeep(missionData.portals);
		};

		restoreFromGlobalMission();

		const ensureMissionFromRequest = function () {
			let requestId = _.get(creep.memory, "scout_request_id");
			let colony = _.get(creep.memory, "colony");

			const applyRequest = function (roomName, request) {
				if (!request)
					return false;

				creep.memory.scout_request_id = request.id || creep.memory.scout_request_id;
				creep.memory.colony = roomName || creep.memory.colony;
				if (_.has(request, "colony_shard"))
					creep.memory.colony_shard = request.colony_shard;
				if (_.has(request, "dest_pos"))
					creep.memory.dest_pos = _.clone(request.dest_pos);
				if (_.has(request, "rally_pos"))
					creep.memory.rally_pos = _.clone(request.rally_pos);
				if (_.has(request, "list_route"))
					creep.memory.list_route = _.clone(request.list_route);
				if (_.has(request, "transfer_intent"))
					creep.memory.transfer_intent = _.cloneDeep(request.transfer_intent);
				if (_.has(request, "portals"))
					creep.memory.portals = _.cloneDeep(request.portals);
				if (_.has(request, "patrol_mode"))
					creep.memory.patrol_mode = request.patrol_mode;
				if (_.has(request, "wait_for_full_rally"))
					creep.memory.wait_for_full_rally = request.wait_for_full_rally;

				if (_.isArray(request.creeps) && !_.includes(request.creeps, creep.name))
					request.creeps.push(creep.name);

				creep.updateGlobalStatus("active");
				return true;
			};

			if (colony) {
				let reqs = _.get(Memory, ["rooms", colony, "scout_requests"]);
				if (_.isArray(reqs)) {
					for (let i = 0; i < reqs.length; i++) {
						let req = reqs[i];
						if (!req)
							continue;
						let matches = false;
						if (requestId && req.id === requestId)
							matches = true;
						if (!matches && _.isArray(req.creeps) && _.includes(req.creeps, creep.name))
							matches = true;
						if (matches && applyRequest(colony, req))
							return;
					}
				}
			}

			let rooms = _.keys(_.get(Memory, "rooms", {}));
			for (let r = 0; r < rooms.length; r++) {
				let roomName = rooms[r];
				let reqs = _.get(Memory, ["rooms", roomName, "scout_requests"]);
				if (!_.isArray(reqs))
					continue;
				for (let i = 0; i < reqs.length; i++) {
					let req = reqs[i];
					if (!req)
						continue;
					let matches = false;
					if (requestId && req.id === requestId)
						matches = true;
					if (!matches && _.isArray(req.creeps) && _.includes(req.creeps, creep.name))
						matches = true;
					if (matches && applyRequest(roomName, req))
						return;
				}
			}
		};

		ensureMissionFromRequest();

		// Persist latest mission data snapshot for future restores
		const persistMissionSnapshot = function () {
			let missionData = _.get(creep.memory, ["global", "mission_data"]);
			if (!_.isObject(missionData))
				missionData = {};

			if (_.has(creep.memory, "scout_request_id"))
				missionData.scout_request_id = creep.memory.scout_request_id;
			if (_.has(creep.memory, "colony"))
				missionData.colony = creep.memory.colony;
			if (_.has(creep.memory, "colony_shard"))
				missionData.colony_shard = creep.memory.colony_shard;
			if (_.has(creep.memory, "dest_pos"))
				missionData.dest_pos = _.clone(creep.memory.dest_pos);
			if (_.has(creep.memory, "rally_pos"))
				missionData.rally_pos = _.clone(creep.memory.rally_pos);
			if (_.has(creep.memory, "list_route"))
				missionData.list_route = _.clone(creep.memory.list_route);
			if (_.has(creep.memory, "transfer_intent"))
				missionData.transfer_intent = _.cloneDeep(creep.memory.transfer_intent);
			if (_.has(creep.memory, "portals"))
				missionData.portals = _.cloneDeep(creep.memory.portals);

			_.set(creep.memory, ["global", "mission_data"], missionData);
		};

		persistMissionSnapshot();

		const uniquePortalEntries = function (entries) {
			if (!_.isArray(entries))
				return [];

			let deduped = [];
			let seen = {};

			for (let i = 0; i < entries.length; i++) {
				let entry = entries[i];
				if (!entry || !entry.from || !entry.from.pos || !entry.to)
					continue;

				let from = entry.from;
				let to = entry.to;
				let pos = from.pos;

				if (!_.isString(from.shard) || !_.isString(from.roomName) || !_.isNumber(pos.x) || !_.isNumber(pos.y) || !_.isString(to.shard))
					continue;

				let key = `${from.shard}/${from.roomName}:${pos.x}:${pos.y}->${to.shard}/${to.roomName || ""}`;
				if (!seen[key]) {
					seen[key] = true;
					deduped.push(entry);
				}
			}

			return deduped;
		};

		const collectPortalEntries = function () {
			let entries = [];

			let registerEntry = function (fromShard, fromRoom, pos, toShard, toRoom) {
				if (!fromShard || !fromRoom || !pos || !toShard)
					return;
				if (fromShard !== Game.shard.name)
					return;
				if (!_.isNumber(pos.x) || !_.isNumber(pos.y) || !_.isString(pos.roomName))
					return;

				let position = new RoomPosition(pos.x, pos.y, pos.roomName);
				entries.push({
					from: {
						shard: fromShard,
						roomName: fromRoom,
						pos: position
					},
					to: {
						shard: toShard,
						roomName: toRoom || null
					}
				});
			};

			let memoryPortals = _.get(creep.memory, "portals");
			if (_.isArray(memoryPortals)) {
				_.each(memoryPortals, entry => {
					let from = _.get(entry, "from");
					let to = _.get(entry, "to");
					let pos = _.get(from, "pos") || _.get(from, "portal_pos") || from;

					let fromShard = _.get(from, "shard", Game.shard.name);
					let fromRoom = _.get(from, "roomName");
					let toShard = _.get(to, "shard");
					let toRoom = _.get(to, "roomName", null);

					registerEntry(fromShard, fromRoom, pos, toShard, toRoom);
				});
			}

			let intent = _.get(creep.memory, "transfer_intent");
			if (_.isObject(intent)) {
				let outbound = _.get(intent, "portal_pos");
				if (_.isObject(outbound) && _.isString(outbound.roomName)) {
					registerEntry(
						_.get(intent, "origin_shard", colonyShard),
						outbound.roomName,
						outbound,
						_.get(intent, "destination_shard"),
						_.get(intent, "destination_room", null)
					);
				}

				let ret = _.get(intent, "return_portal.portal_pos");
				if (_.isObject(ret) && _.isString(ret.roomName)) {
					// Return portal: from the destination shard back to origin/rally shard
					let returnFromShard = _.get(intent, "return_portal.shard", _.get(intent, "destination_shard"));
					let returnToShard = _.get(intent, "return_portal.destination_shard", colonyShard);
					let returnToRoom = _.get(intent, "return_portal.destination_room", null);
					
					debugLog(2, `<font color="#4ECDC4">[Scout]</font> ${creep.name} registering return portal: ${returnFromShard}/${ret.roomName} -> ${returnToShard}/${returnToRoom || "?"}`, 50);
					
					registerEntry(
						returnFromShard,
						ret.roomName,
						ret,
						returnToShard,
						returnToRoom
					);
				}

				let extra = _.get(intent, "portals");
				if (_.isArray(extra)) {
					_.each(extra, entry => {
						let from = _.get(entry, "from");
						let to = _.get(entry, "to");
						let pos = _.get(from, "pos") || _.get(from, "portal_pos") || from;

						let fromShard = _.get(from, "shard", Game.shard.name);
						let fromRoom = _.get(from, "roomName");
						let toShard = _.get(to, "shard");
						let toRoom = _.get(to, "roomName", null);

						registerEntry(fromShard, fromRoom, pos, toShard, toRoom);
					});
				}
			}

			return uniquePortalEntries(entries);
		};

		const findPortalEntry = function (targetShard, targetRoom) {
			if (!targetShard || targetShard === Game.shard.name)
				return null;

			let entries = collectPortalEntries();
			return _.find(entries, entry => {
				if (!entry || !entry.from || !entry.to)
					return false;
				if (entry.from.shard !== Game.shard.name)
					return false;
				if (entry.to.shard !== targetShard)
					return false;
				if (entry.to.roomName != null && targetRoom != null && entry.to.roomName !== targetRoom)
					return false;
				return true;
			});
		};

		const maybeHandlePortal = function (targetData, patrolStateOverride) {
			if (!targetData)
				return false;

			let cooldown = _.get(creep.memory, "_scout_next_portal_allowed", 0);
			if (cooldown > Game.time)
				return false;

			// Determine target shard/room based on patrol state in loop mode
			let currentPatrolMode = _.get(creep.memory, "patrol_mode", "station");
			let currentPatrolState = patrolStateOverride || _.get(creep.memory, "scout_patrol_state");
			let targetShard = _.get(targetData, "shard", null);
			let targetRoom = _.get(targetData, "roomName", null);

			// In loop mode, determine target based on patrol state
			if (currentPatrolMode === "loop" && currentPatrolState) {
				let destPosData = _.get(creep.memory, "dest_pos");
				let rallyPosData = _.get(creep.memory, "rally_pos");
				
				if (currentPatrolState === "to_dest") {
					// Heading to destination - use destination shard/room
					targetShard = _.get(destPosData, "shard", targetShard);
					targetRoom = _.get(destPosData, "roomName", targetRoom);
				} else if (currentPatrolState === "to_rally") {
					// Heading to rally - use rally shard/room (this is the return journey)
					targetShard = _.get(rallyPosData, "shard", colonyShard);
					targetRoom = _.get(rallyPosData, "roomName", targetRoom);
				}
			}

			// Fallback to transfer_intent if still not set
			if (!targetShard) {
				targetShard = _.get(creep.memory, ["transfer_intent", "destination_shard"], colonyShard);
			}
			if (!targetRoom) {
				targetRoom = _.get(creep.memory, ["transfer_intent", "destination_room"], targetRoom);
			}

			if (!targetShard || targetShard === Game.shard.name)
				return false;

			let portalEntry = findPortalEntry(targetShard, targetRoom);
			if (!portalEntry) {
				let warnTick = _.get(creep.memory, "_scout_portal_warn");
				if (!warnTick || warnTick + 50 < Game.time) {
					debugLog(1, `<font color="#FF944E">[Scout]</font> ${creep.name} missing portal entry for ${targetShard}/${targetRoom || "?"} (state=${currentPatrolState})`, 0);
					creep.memory._scout_portal_warn = Game.time;
				}
				return false;
			}

			let portalPos = _.get(portalEntry, ["from", "pos"]);
			if (!portalPos)
				return false;

			// Check cooldown again after portal lookup
			if (_.has(creep.memory, "_scout_next_portal_allowed") && creep.memory._scout_next_portal_allowed > Game.time)
				return false;

			// If transfer already recorded and we're at portal position, try to enter
			// Don't just wait - actively try to move into the portal
			if (creep.memory._scout_transfer_recorded === true && creep.room.name === portalPos.roomName && creep.pos.inRangeTo(portalPos, 1)) {
				// If exactly at portal position, we're already there - portal should transfer us
				if (creep.pos.isEqualTo(portalPos)) {
					return true;
				}
				// If within range 1 but not at portal, move towards it
				// Fall through to movement logic below
			}

			// Travel to portal room if not there yet
			if (creep.room.name !== portalPos.roomName) {
				// Don't record transfer in callback if already recorded
				if (creep.memory._scout_transfer_recorded) {
					creep.travelToRoom(portalPos.roomName, true);
				} else {
					creep.travelToRoom(portalPos.roomName, true, function (portal, nextStep) {
						let targetShardForCallback = _.get(nextStep, "shard", targetShard);
						let targetRoomForCallback = _.get(nextStep, "roomName", targetRoom);
						recordTransferSnapshot(portal.pos, targetShardForCallback, targetRoomForCallback);
					});
				}
				return true;
			}

			// Record transfer snapshot if not already recorded
			if (!creep.memory._scout_transfer_recorded) {
				recordTransferSnapshot(portalPos, targetShard, targetRoom);
			}

			let awaitingAck = shouldWaitForTransferAck(targetShard);
			if (awaitingAck) {
				creep.memory._awaiting_transfer_ack = true;
				debugLog(2, `<font color="#4ECDC4">[Scout]</font> ${creep.name} awaiting transfer acknowledgement to ${targetShard}/${targetRoom || "?"}`, 10);
			} else {
				if (_.get(creep.memory, "_awaiting_transfer_ack") === true) {
					debugLog(2, `<font color="#4ECDC4">[Scout]</font> ${creep.name} received transfer acknowledgement for ${targetShard}/${targetRoom || "?"}`, 0);
					creep.say("GO!");
				}
				delete creep.memory._awaiting_transfer_ack;
				delete creep.memory._scout_ack_wait_log;
			}

			// If at portal position, wait for transfer
			if (creep.pos.isEqualTo(portalPos)) {
				if (awaitingAck) {
					creep.travelClear();
					creep.say("ACK?");
				}
				return true;
			}

			// Move towards portal - ALWAYS move if not at portal, even if transfer is recorded
			let range = creep.pos.getRangeTo(portalPos);
			if (range > 1) {
				creep.travel(portalPos);
				return true;
			}

			if (awaitingAck) {
				creep.travelClear();
				creep.say("ACK?");
				return true;
			}

			// Try to move into portal
			let direction = creep.pos.getDirectionTo(portalPos);
			let moveResult = creep.move(direction);
			if (moveResult != OK) {
				creep.travel(portalPos);
			} else if (!creep.memory._scout_transfer_recorded) {
				// Only record if not already recorded
				recordTransferSnapshot(portalPos, targetShard, targetRoom);
			}
			return true;
		};

		// Check for hostile creeps - scouts without attack parts should avoid them
		let hasAttackParts = creep.body.some(part => part.type === ATTACK || part.type === RANGED_ATTACK);
		let hostile = hasAttackParts ? null : _.head(creep.pos.findInRange(FIND_HOSTILE_CREEPS, 5, {
			filter: c => {
				if (!c.isHostile())
					return false;
				return c.getActiveBodyparts(ATTACK) > 0 || c.getActiveBodyparts(RANGED_ATTACK) > 0;
			}
		}));

		if (hostile != null) {
			// Scout has no attack parts, avoid the hostile
			creep.moveFrom(hostile);
			return;
		}

		let patrolMode = creep.memory.patrol_mode || "station";
		if (!_.includes(["station", "loop"], patrolMode))
			patrolMode = "station";

		const updateShardState = function () {
			let current = _.get(creep.memory, "_scout_current_shard");
			if (current === Game.shard.name)
				return;

			_.set(creep.memory, "_scout_current_shard", Game.shard.name);

			let destPosData = _.get(creep.memory, "dest_pos");
			let rallyPosData = _.get(creep.memory, "rally_pos");
			let destShard = _.get(destPosData, "shard", Game.shard.name);
			let rallyShard = _.get(rallyPosData, "shard", colonyShard);
			let currentPatrolMode = _.get(creep.memory, "patrol_mode", "station");
			let destReached = _.get(creep.memory, "scout_dest_reached", false);
			let rallyReached = _.get(creep.memory, "scout_rally_reached", false);

			if (typeof creep.travelClear === "function")
				creep.travelClear();

			// In loop mode, determine state based on current shard and mission progress
			if (currentPatrolMode === "loop") {
				// If on destination shard and haven't reached destination, go to destination
				if (destShard === Game.shard.name && !destReached) {
					creep.memory.scout_patrol_state = "to_dest";
					creep.memory.scout_dest_reached = false;
				}
				// If on rally shard and haven't reached rally, go to rally
				else if (rallyShard === Game.shard.name && !rallyReached) {
					creep.memory.scout_patrol_state = "to_rally";
					creep.memory.scout_rally_reached = false;
				}
				// If on destination shard and destination reached, switch to rally (return journey)
				else if (destShard === Game.shard.name && destReached) {
					creep.memory.scout_patrol_state = "to_rally";
					creep.memory.scout_rally_reached = false; // Reset for return journey
				}
				// If on rally shard and rally reached, switch to destination (outbound journey)
				else if (rallyShard === Game.shard.name && rallyReached) {
					creep.memory.scout_patrol_state = "to_dest";
					creep.memory.scout_dest_reached = false; // Reset for outbound journey
				}
				// Default: set based on shard
				else {
					if (destShard === Game.shard.name) {
						creep.memory.scout_patrol_state = "to_dest";
						creep.memory.scout_dest_reached = false;
					} else if (rallyShard === Game.shard.name) {
						creep.memory.scout_patrol_state = "to_rally";
						creep.memory.scout_rally_reached = false;
					}
				}
			} else {
				// Station mode - simple shard matching
				if (destShard === Game.shard.name) {
					creep.memory.scout_patrol_state = "to_dest";
					creep.memory.scout_dest_reached = false;
				} else if (rallyShard === Game.shard.name) {
					creep.memory.scout_patrol_state = "to_rally";
					creep.memory.scout_rally_reached = false;
				}
			}

			debugLog(1, `<font color="#4ECDC4">[Scout]</font> ${creep.name} shard switch: ${current} -> ${Game.shard.name}, patrol_state=${creep.memory.scout_patrol_state}, mode=${currentPatrolMode}, dest_reached=${destReached}, rally_reached=${rallyReached}`, 0);

			creep.memory._scout_next_portal_allowed = Game.time + 20;
			creep.memory._scout_last_shard_switch = Game.time;
		};

		let rallyPosData = _.get(creep.memory, "rally_pos");
		let destPosData = _.get(creep.memory, "dest_pos");

		updateShardState();

		// Ensure patrol state is set correctly if not already set
		if (!_.has(creep.memory, "scout_patrol_state") && patrolMode === "loop" && rallyPosData && destPosData) {
			let destShard = _.get(destPosData, "shard", Game.shard.name);
			let rallyShard = _.get(rallyPosData, "shard", colonyShard);
			let destReached = _.get(creep.memory, "scout_dest_reached", false);
			let rallyReached = _.get(creep.memory, "scout_rally_reached", false);
			
			// Determine initial state based on current shard and progress
			if (destShard === Game.shard.name && !destReached) {
				creep.memory.scout_patrol_state = "to_dest";
			} else if (rallyShard === Game.shard.name && !rallyReached) {
				creep.memory.scout_patrol_state = "to_rally";
			} else if (destShard === Game.shard.name && destReached) {
				creep.memory.scout_patrol_state = "to_rally"; // Return journey
			} else if (rallyShard === Game.shard.name && rallyReached) {
				creep.memory.scout_patrol_state = "to_dest"; // Outbound journey
			} else {
				// Default to heading to destination
				creep.memory.scout_patrol_state = "to_dest";
			}
		}

		if (rallyPosData) {
			let rallyPos = new RoomPosition(rallyPosData.x, rallyPosData.y, rallyPosData.roomName);
			if (!creep.memory.scout_rally_reached) {
				if (maybeHandlePortal(rallyPosData) === true)
					return;
				if (creep.room.name != rallyPos.roomName) {
					creep.travelToRoom(rallyPos.roomName, true);
					return;
				}
				if (!creep.pos.inRangeTo(rallyPos, 2)) {
					creep.travel(rallyPos);
					return;
				}
				creep.memory.scout_rally_reached = true;
			}

			if (!creep.memory.rally_release) {
				if (maybeHandlePortal(rallyPosData) === true)
					return;
				if (creep.room.name != rallyPos.roomName) {
					creep.travelToRoom(rallyPos.roomName, true);
					return;
				}
				if (!creep.pos.inRangeTo(rallyPos, 2)) {
					creep.travel(rallyPos);
				}
				creep.memory.scout_patrol_state = "to_dest";
				return;
			}
		}

		if (patrolMode === "loop" && rallyPosData && destPosData && creep.memory.rally_release) {
			let rallyPos = new RoomPosition(rallyPosData.x, rallyPosData.y, rallyPosData.roomName);
			let destPos = new RoomPosition(destPosData.x, destPosData.y, destPosData.roomName);
			let state = creep.memory.scout_patrol_state || "to_dest";
			let destShard = _.get(destPosData, "shard", Game.shard.name);
			let rallyShard = _.get(rallyPosData, "shard", colonyShard);
			let destReached = _.get(creep.memory, "scout_dest_reached", false);
			let rallyReached = _.get(creep.memory, "scout_rally_reached", false);

			// Check if scout is actually at destination/rally position before correcting state
			let atDestPos = false;
			let atRallyPos = false;
			if (destPosData && destShard === Game.shard.name) {
				let destPos = new RoomPosition(destPosData.x, destPosData.y, destPosData.roomName);
				atDestPos = creep.room.name === destPos.roomName && creep.pos.inRangeTo(destPos, 1);
			}
			if (rallyPosData && rallyShard === Game.shard.name) {
				let rallyPos = new RoomPosition(rallyPosData.x, rallyPosData.y, rallyPosData.roomName);
				atRallyPos = creep.room.name === rallyPos.roomName && creep.pos.inRangeTo(rallyPos, 1);
			}

			// Correct state if it's inconsistent with current shard and progress
			// Only correct once per state change to avoid clearing path repeatedly
			let lastStateCorrection = _.get(creep.memory, "_scout_last_state_correction_tick", 0);
			let shouldCorrect = (Game.time - lastStateCorrection) > 5; // Only correct every 5 ticks max
			
			if (destShard === Game.shard.name) {
				// On destination shard
				if (atDestPos && state !== "to_rally" && shouldCorrect) {
					// Actually at destination position, should be heading back to rally
					debugLog(1, `<font color="#FF944E">[Scout]</font> ${creep.name} correcting state: ${state} -> to_rally (at dest pos)`, 0);
					if (typeof creep.travelClear === "function")
						creep.travelClear();
					creep.memory.scout_patrol_state = "to_rally";
					creep.memory.scout_dest_reached = true;
					creep.memory.scout_rally_reached = false;
					creep.memory._scout_last_state_correction_tick = Game.time;
					state = "to_rally";
				} else if (!atDestPos && !destReached && state !== "to_dest" && shouldCorrect) {
					// Haven't reached destination yet, should be heading to destination
					debugLog(1, `<font color="#FF944E">[Scout]</font> ${creep.name} correcting state: ${state} -> to_dest (on dest shard, dest not reached)`, 0);
					if (typeof creep.travelClear === "function")
						creep.travelClear();
					creep.memory.scout_patrol_state = "to_dest";
					creep.memory.scout_dest_reached = false;
					creep.memory._scout_last_state_correction_tick = Game.time;
					state = "to_dest";
				} else if (destReached && state !== "to_rally" && shouldCorrect) {
					// Reached destination (flag set), should be heading back to rally
					debugLog(1, `<font color="#FF944E">[Scout]</font> ${creep.name} correcting state: ${state} -> to_rally (on dest shard, dest reached)`, 0);
					if (typeof creep.travelClear === "function")
						creep.travelClear();
					creep.memory.scout_patrol_state = "to_rally";
					creep.memory.scout_rally_reached = false;
					creep.memory._scout_last_state_correction_tick = Game.time;
					state = "to_rally";
				}
			} else if (rallyShard === Game.shard.name) {
				// On rally shard
				if (atRallyPos && state !== "to_dest" && shouldCorrect) {
					// Actually at rally position, should be heading to destination
					debugLog(1, `<font color="#FF944E">[Scout]</font> ${creep.name} correcting state: ${state} -> to_dest (at rally pos)`, 0);
					if (typeof creep.travelClear === "function")
						creep.travelClear();
					creep.memory.scout_patrol_state = "to_dest";
					creep.memory.scout_rally_reached = true;
					creep.memory.scout_dest_reached = false;
					creep.memory._scout_last_state_correction_tick = Game.time;
					state = "to_dest";
				} else if (!atRallyPos && !rallyReached && state !== "to_rally" && shouldCorrect) {
					// Haven't reached rally yet, should be heading to rally
					debugLog(1, `<font color="#FF944E">[Scout]</font> ${creep.name} correcting state: ${state} -> to_rally (on rally shard, rally not reached)`, 0);
					if (typeof creep.travelClear === "function")
						creep.travelClear();
					creep.memory.scout_patrol_state = "to_rally";
					creep.memory.scout_rally_reached = false;
					creep.memory._scout_last_state_correction_tick = Game.time;
					state = "to_rally";
				} else if (rallyReached && state !== "to_dest" && shouldCorrect) {
					// Reached rally (flag set), should be heading to destination
					debugLog(1, `<font color="#FF944E">[Scout]</font> ${creep.name} correcting state: ${state} -> to_dest (on rally shard, rally reached)`, 0);
					if (typeof creep.travelClear === "function")
						creep.travelClear();
					creep.memory.scout_patrol_state = "to_dest";
					creep.memory.scout_dest_reached = false;
					creep.memory._scout_last_state_correction_tick = Game.time;
					state = "to_dest";
				}
			}

			if (state === "to_dest") {
				let currentPathDest = _.get(creep.memory, ["path", "destination"]);
				if (currentPathDest
					&& (currentPathDest.roomName !== destPos.roomName
						|| currentPathDest.x !== destPos.x
						|| currentPathDest.y !== destPos.y)
					&& typeof creep.travelClear === "function") {
					creep.travelClear();
				}
				
			// CRITICAL: Only check for portals if we're NOT on the destination shard
			// If we're already on the destination shard, go directly to the destination position
			// Also check that we haven't just transferred (cooldown period)
			let portalCooldown = _.get(creep.memory, "_scout_next_portal_allowed", 0);
			if (destShard !== Game.shard.name && portalCooldown <= Game.time) {
				// Need to transfer to destination shard - check for portal
				if (maybeHandlePortal(destPosData, "to_dest") === true)
					return;
			}
				
				// We're on the destination shard (or portal handling failed) - go to destination position
				if (creep.room.name != destPos.roomName) {
					creep.travelToRoom(destPos.roomName, true);
					return;
				}
				if (!creep.pos.inRangeTo(destPos, 1)) {
					creep.travel(destPos);
					return;
				}
				// Reached destination - switch to heading to rally
				debugLog(1, `<font color="#4ECDC4">[Scout]</font> ${creep.name} reached destination, switching to rally`, 0);
				creep.memory.scout_patrol_state = "to_rally";
				creep.memory.scout_dest_reached = true;
				creep.memory.scout_rally_reached = false;
				// Clear path to ensure fresh movement on next leg
				if (typeof creep.travelClear === "function")
					creep.travelClear();
				return;
			}

			if (state === "to_rally") {
				let currentPathDest = _.get(creep.memory, ["path", "destination"]);
				if (currentPathDest
					&& (currentPathDest.roomName !== rallyPos.roomName
						|| currentPathDest.x !== rallyPos.x
						|| currentPathDest.y !== rallyPos.y)
					&& typeof creep.travelClear === "function") {
					creep.travelClear();
				}
				
			// CRITICAL: Only check for portals if we're NOT on the rally shard
			// If we're already on the rally shard, go directly to the rally position
			// Also check that we haven't just transferred (cooldown period)
			let portalCooldown = _.get(creep.memory, "_scout_next_portal_allowed", 0);
			if (rallyShard !== Game.shard.name && portalCooldown <= Game.time) {
				// Need to transfer to rally shard - check for portal
				if (maybeHandlePortal(rallyPosData, "to_rally") === true)
					return;
			}
				
				// We're on the rally shard (or portal handling failed) - go to rally position
				if (creep.room.name != rallyPos.roomName) {
					creep.travelToRoom(rallyPos.roomName, false);
					return;
				}
				if (!creep.pos.inRangeTo(rallyPos, 1)) {
					creep.travel(rallyPos);
					return;
				}
				// Reached rally - switch to heading to destination (start next loop)
				debugLog(1, `<font color="#4ECDC4">[Scout]</font> ${creep.name} reached rally, switching to destination`, 0);
				creep.memory.scout_patrol_state = "to_dest";
				creep.memory.scout_rally_reached = true;
				creep.memory.scout_dest_reached = false;
				// Clear path to ensure fresh movement on next leg
				if (typeof creep.travelClear === "function")
					creep.travelClear();
				return;
			}
		}

		// Continue with normal scouting behavior (stationary or destination hold)
		if (destPosData) {
			let destPos = new RoomPosition(destPosData.x, destPosData.y, destPosData.roomName);
			if (maybeHandlePortal(destPosData) === true)
				return;
			if (creep.room.name != destPos.roomName) {
				creep.travelToRoom(destPos.roomName, true);
				return;
			}
			if (!creep.pos.inRangeTo(destPos, 2)) {
				creep.travel(destPos);
				return;
			}

			// At destination - for station mode, move away from edges periodically
			if (patrolMode === "station" && Game.time % 11 === 0 && creep.pos.isEdge()) {
				creep.travel(new RoomPosition(25, 25, destPos.roomName));
				return;
			}
			// At destination in station mode - no movement needed
			return;
		}

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
		let nonEnergyCarry = _.sum(creep.carry) - _.get(creep.carry, "energy", 0);
		if (nonEnergyCarry > 0) {
			let previousTask = creep.memory.task;
			let isMineralDepositTask = previousTask != null
				&& previousTask["type"] == "deposit"
				&& previousTask["resource"] != "energy";

			if (!isMineralDepositTask) {
				let depositTask = creep.getTask_Deposit_Storage("mineral");
				if (depositTask == null) {
					depositTask = creep.getTask_Deposit_Container("mineral");
				}

				if (depositTask != null) {
					creep.memory.task = depositTask;
					isMineralDepositTask = true;
				} else {
					creep.memory.task = previousTask;
				}
			}

			if (isMineralDepositTask) {
				creep.runTask(creep);
				return;
			}
		}

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
					
					// Priority 3: Other tasks needed for room progression
					creep.memory.task = creep.memory.task || creep.getTask_Sign();
					creep.memory.task = creep.memory.task || creep.getTask_Deposit_Storage("mineral");

					// Final fallback: always contribute to controller upgrades when idle
					creep.memory.task = creep.memory.task || creep.getTask_Upgrade(true);
					creep.memory.task = creep.memory.task || creep.getTask_Upgrade(false);
					creep.memory.task = creep.memory.task || creep.getTask_Wait(10);
				} else {
					// Mid/late game: Standard priority order
					// Priority 1: Build structures (always check first)
					creep.memory.task = creep.memory.task || creep.getTask_Build();
					
					// Priority 2: Sign controller
					creep.memory.task = creep.memory.task || creep.getTask_Sign();
					
					// Priority 3: Repair critical structures
					creep.memory.task = creep.memory.task || creep.getTask_Repair(true);
					
					// Priority 4: Repair general structures
					creep.memory.task = creep.memory.task || creep.getTask_Repair(false);
					
					// Priority 5: Deposit minerals
					creep.memory.task = creep.memory.task || creep.getTask_Deposit_Storage("mineral");

					// Priority 6: Upgrade controller (only if no other tasks and conditions met)
					let shouldUpgrade = roomLevel < 6 || (isCriticalDowngrade && !hasUpgraders);
					if (shouldUpgrade) {
						creep.memory.task = creep.memory.task || creep.getTask_Upgrade(true);
						creep.memory.task = creep.memory.task || creep.getTask_Upgrade(false);
					}

					// Final fallback: upgrade whenever idle (if not already set above)
					creep.memory.task = creep.memory.task || creep.getTask_Upgrade(true);
					creep.memory.task = creep.memory.task || creep.getTask_Upgrade(false);
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
		let globalDefaults = {
			mission: _.get(creep.memory, "shard_mission", "colonization"),
			status: _.get(creep.memory, "global_status", _.get(creep, ["memory", "global", "status"], "active")),
			note: "colonizer"
		};

		if (_.has(creep.memory, "transfer_intent")) {
			globalDefaults.target = {
				shard: _.get(creep.memory, ["transfer_intent", "destination_shard"]),
				room: _.get(creep.memory, ["transfer_intent", "destination_room"])
			};
			globalDefaults.portal = _.get(creep.memory, ["transfer_intent", "portal_pos"]);
		}

		creep.ensureGlobal(globalDefaults);
		if (globalDefaults.status)
			creep.updateGlobalStatus(globalDefaults.status);

		// Master-Slave Architecture: All shards report to shard0 master
		if (creep.name.startsWith('colo:')) {
			// CRITICAL: Check if this is a transferred colonizer that needs memory restoration
			// Must run EVERY TICK, not just every 5 ticks, to catch recent transfers
			if (!creep.memory.role) {
				console.log(`<font color="#FFA500">[Colonizer]</font> ${creep.name} has no role, attempting memory restoration`);
			
			// Check shard0's master ISM for transfer data
			try {
				let transferData = null;
				let masterIsmData = InterShardMemory.getRemote('shard0');
				if (masterIsmData) {
					let parsed = JSON.parse(masterIsmData);
					// Try both old "transfers" and new "creep_transfers" key names
					transferData = _.get(parsed, ["creep_transfers", creep.name], null) 
						|| _.get(parsed, ["transfers", creep.name], null);
					console.log(`<font color="#FFA500">[Colonizer]</font> ${creep.name} looking in ISM, found: ${transferData ? 'yes' : 'no'}`);
				}
				if (transferData) {
						console.log(`<font color="#4ECDC4">[Colonizer]</font> Found transfer data for ${creep.name}: role=${transferData.role}, room=${transferData.room}`);
						
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
						creep.updateGlobalStatus('restored', {
							note: 'memory restored',
							target: {
								shard: _.get(transferData, "destination_shard"),
								room: _.get(transferData, "destination_room")
							}
						});
						
						console.log(`<font color="#4ECDC4">[Colonizer]</font> Memory restored for ${creep.name}: role=${creep.memory.role}, room=${creep.memory.room}`);
				} else {
						console.log(`<font color="#FFA500">[Colonizer]</font> ${creep.name} not found in master ISM creep_transfers`);
				}
			} catch (e) {
				console.log(`<font color="#FFA500">[Colonizer]</font> Error reading master ISM: ${e.message}`);
			}
		}
		
		// Update local status to ISM for master shard0 to read (every 5 ticks)
		if (Game.time % 5 === 0) {
			if (creep.memory.role && !creep.memory.global_status) {
				creep.updateGlobalStatus('restored');
			}
			
			// Report status to master shard0 via local ISM
			let ismData = InterShardMemory.getLocal() ? JSON.parse(InterShardMemory.getLocal()) : {};
			if (!ismData.slave_reports) ismData.slave_reports = {};
			let globalStatus = _.get(creep, ["memory", "global", "status"], creep.memory.global_status || 'active');
			ismData.slave_reports[creep.name] = {
				status: globalStatus,
				shard: Game.shard.name,
				room: creep.room.name,
				last_update: Game.time,
				ticks_to_live: creep.ticksToLive,
				mission: creep.memory.shard_mission
			};
			InterShardMemory.setLocal(JSON.stringify(ismData));
		}
		}
		
		// Clear the transferred flag if it exists (don't clean up waypoints - travelToRoom handles it)
		if (creep.memory.transferred) {
			delete creep.memory.transferred;
		}
		
		// Initialize transfer_intent from list_route if needed for cross-shard travel
		if (!creep.memory.transfer_intent && _.isArray(creep.memory.list_route) && creep.memory.list_route.length > 0) {
			// Only set transfer_intent for the NEXT shard transition after current location
			let currentShard = Game.shard.name;
			let nextTransitionIndex = -1;
			
			// Find the FIRST shard transition ahead of current position
			for (let i = 0; i < creep.memory.list_route.length; i++) {
				let waypoint = creep.memory.list_route[i];
				
				// Check if this waypoint is on a different shard than current
				if (waypoint.indexOf("/") >= 0) {
					let parts = waypoint.split("/");
					let waypointShard = parts[0];
					
					// Only set transfer_intent if destination is a different shard
					if (waypointShard !== currentShard) {
						nextTransitionIndex = i;
						break;  // Stop at FIRST shard transition, don't scan further
					}
				}
			}
			
			// Only create transfer_intent if there's a shard transition in our route
			if (nextTransitionIndex >= 0) {
				let destWaypoint = creep.memory.list_route[nextTransitionIndex];
				let parts = destWaypoint.split("/");
				let destShard = parts[0];
				let destRoom = parts[1];
				
				// Find the portal room (previous waypoint before shard transition)
				let portalRoom = nextTransitionIndex > 0 ? creep.memory.list_route[nextTransitionIndex - 1] : creep.room.name;
				
				// Find the correct portal in the portal room (must match destination shard/room)
				let portal = null;
				if (Game.rooms[portalRoom]) {
					let portals = Game.rooms[portalRoom].find(FIND_STRUCTURES, {
						filter: s => s.structureType === STRUCTURE_PORTAL
					});
					
					// Find portal that goes to our destination shard and room
					for (let p of portals) {
						if (p.destination && p.destination.shard === destShard && p.destination.room === destRoom) {
							portal = p;
							break;  // Found correct portal, stop searching
						}
					}
					
					// Fallback: if no exact match, take first portal (for edge cases)
					if (!portal && portals.length > 0) {
						console.log(`<font color="#FFAA00">[Colonizer]</font> ${creep.name} no exact portal match for ${destShard}/${destRoom} in ${portalRoom}, using first available`);
						portal = portals[0];
					}
				}
				
				if (portal) {
					creep.memory.transfer_intent = {
						destination_shard: destShard,
						destination_room: destRoom,
						portal_pos: { x: portal.pos.x, y: portal.pos.y, roomName: portal.pos.roomName }
					};
					console.log(`<font color="#4ECDC4">[Colonizer]</font> ${creep.name} detected shard transition to ${destShard}/${destRoom}, portal at ${portalRoom}`);
				}
			}
		}
		
		// Check for transfer intent first - if transferring, move to portal and step on it
		if (creep.memory.transfer_intent) {
			let portalPos = creep.memory.transfer_intent.portal_pos;
			
			// Store colonizer data in InterShardMemory BEFORE attempting portal transfer
			// This must happen before creep steps onto portal to ensure data persists
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
			
			// Store in InterShardMemory for destination shard (only once)
			if (!creep.memory.transfer_data_stored) {
				let ismData = InterShardMemory.getLocal() ? JSON.parse(InterShardMemory.getLocal()) : {};
				if (!ismData.creep_transfers) ismData.creep_transfers = {};
				ismData.creep_transfers[creep.name] = transferData;
				
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
				creep.memory.transfer_data_stored = true;
			}
			
			creep.memory.global_status = 'transferring';
			creep.updateGlobalStatus('transferring', {
				target: {
					shard: _.get(creep.memory, ["transfer_intent", "destination_shard"]),
					room: _.get(creep.memory, ["transfer_intent", "destination_room"])
				},
				portal: _.get(creep.memory, ["transfer_intent", "portal_pos"])
			});
			
			// Check if creep is at portal
			if (creep.pos.x === portalPos.x && creep.pos.y === portalPos.y && creep.room.name === portalPos.roomName) {
				// Creep is at portal, transfer will happen automatically
				console.log(`<font color="#4ECDC4">[Colonizer]</font> ${creep.name} at portal, transferring to ${creep.memory.transfer_intent.destination_shard}`);
				
				// Clear transfer intent - the transfer will happen automatically
				delete creep.memory.transfer_intent;
				return;
			} else {
				// Creep is not at portal, move to it
				
				// Check if we're in the correct room first
				if (creep.room.name !== portalPos.roomName) {
					// Need to travel to the portal room first
					creep.travelToRoom(portalPos.roomName);
					return;
				}
				
				// We're in the correct room, check if we're adjacent to portal
				let range = creep.pos.getRangeTo(portalPos.x, portalPos.y);
				if (range === 0) {
					// Already on portal - shouldn't happen but handle it
					return;
				} else if (range === 1) {
					// Adjacent to portal - move onto it
					let moveResult = creep.move(creep.pos.getDirectionTo(portalPos.x, portalPos.y));
					if (moveResult === OK) {
						console.log(`<font color="#4ECDC4">[Colonizer]</font> ${creep.name} crossing portal`);
					}
					return;
				} else {
					// Not adjacent, path to it
					creep.moveTo(portalPos.x, portalPos.y);
					return;
				}
			}
		}

		// Check for movement task first
		if (creep.memory.task && creep.memory.task.type === "move") {
			creep.runTask(creep);
			return;
		}

		if (this.moveToDestination(creep))
			return;

		// Check if room is already claimed - if so, close the colonization mission
		let request = _.get(Memory, ["sites", "colonization", creep.memory.target_key])
			|| _.get(Memory, ["sites", "colonization", creep.memory.room]);
		let reqTarget = _.get(request, ["target"]);
		let reqTargetBase = _.isString(reqTarget) && reqTarget.indexOf("/") >= 0 ? reqTarget.split("/")[1] : reqTarget;
		
		if ((reqTarget == creep.room.name || reqTargetBase == creep.room.name) && creep.room.controller.my) {
			// Room already claimed! Check if first spawn is built before completing mission
			let spawns = creep.room.find(FIND_MY_SPAWNS);
			
			if (spawns.length > 0) {
				// First spawn is complete! Close colonization mission
				let key = creep.memory.target_key || creep.room.name;
				delete Memory["sites"]["colonization"][key];
				_.set(Memory, ["rooms", creep.room.name, "spawn_assist", "rooms"], [_.get(request, ["from"])]);
				_.set(Memory, ["rooms", creep.room.name, "spawn_assist", "list_route"], _.get(request, ["list_route"]));
				_.set(Memory, ["rooms", creep.room.name, "layout"], _.get(request, "layout"));
				_.set(Memory, ["rooms", creep.room.name, "focus_defense"], _.get(request, "focus_defense"));
				_.set(Memory, ["hive", "pulses", "blueprint", "request"], creep.room.name);
				console.log(`<font color="#4ECDC4">[Colonization]</font> ${creep.name} - first spawn complete, colonization mission complete!`);
				creep.memory = {};
				return;
			} else {
				// Room claimed but no spawn yet - ensure spawn assist and layout are set but keep mission active
				if (!_.get(Memory, ["rooms", creep.room.name, "spawn_assist", "rooms"])) {
					_.set(Memory, ["rooms", creep.room.name, "spawn_assist", "rooms"], [_.get(request, ["from"])]);
					_.set(Memory, ["rooms", creep.room.name, "spawn_assist", "list_route"], _.get(request, ["list_route"]));
					_.set(Memory, ["rooms", creep.room.name, "layout"], _.get(request, "layout"));
					_.set(Memory, ["rooms", creep.room.name, "focus_defense"], _.get(request, "focus_defense"));
					_.set(Memory, ["hive", "pulses", "blueprint", "request"], creep.room.name);
					console.log(`<font color="#4ECDC4">[Colonization]</font> ${creep.room.name} - room claimed, waiting for first spawn...`);
				}
				// Colonizer can help build the spawn while waiting
				creep.memory.state = "working";
				delete creep.memory.task;
				return;
			}
		}

		// Attempt to claim the controller
		let result = creep.claimController(creep.room.controller);
		if (result == ERR_NOT_IN_RANGE) {
			creep.moveTo(creep.room.controller)
			return;
		} else if (result == ERR_NO_BODYPART) {
			return;		// Reservers and colonizers with no "claim" parts prevent null body spawn locking
		} else if (result == OK) {
			// Successfully claimed! Set up spawn assist but keep mission active until spawn is built
			if (!_.get(Memory, ["rooms", creep.room.name, "spawn_assist", "rooms"])) {
				_.set(Memory, ["rooms", creep.room.name, "spawn_assist", "rooms"], [_.get(request, ["from"])]);
				_.set(Memory, ["rooms", creep.room.name, "spawn_assist", "list_route"], _.get(request, ["list_route"]));
				_.set(Memory, ["rooms", creep.room.name, "layout"], _.get(request, "layout"));
				_.set(Memory, ["rooms", creep.room.name, "focus_defense"], _.get(request, "focus_defense"));
				_.set(Memory, ["hive", "pulses", "blueprint", "request"], creep.room.name);
			}
			console.log(`<font color="#4ECDC4">[Colonization]</font> ${creep.name} successfully claimed ${creep.room.name}! Waiting for first spawn...`);
			creep.memory.state = "working";
			return;
		} else {
			console.log(`<font color=\"#F0FF00\">[Colonization]</font> ${creep.name} unable to colonize ${_.get(request, ["target"])}; error ${result}`);
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