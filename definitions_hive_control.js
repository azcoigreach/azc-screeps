/* ***********************************************************
 *	[sec05a] DEFINITIONS: HIVE CONTROL
 * *********************************************************** */

 global.Control = {

	refillBucket: function () {
		if (Game.cpu.bucket >= 10000 && _.get(Memory, ["hive", "pause", "bucket"], false)) {
			_.set(Memory, ["hive", "pause", "bucket"], false);
			console.log(`<font color=\"#D3FFA3\">[Console]</font> Bucket full, resuming main.js.`);
		}

		return _.get(Memory, ["hive", "pause", "bucket"], false);
	},

	setPulse: function (key, minTicks, maxTicks) {
		let range = maxTicks - minTicks;
		let lastTick = _.get(Memory, ["hive", "pulses", key, "last_tick"]);
		let manuallyActive = _.get(Memory, ["hive", "pulses", key, "active"], false);

		if (manuallyActive) {
			// If manually set to active, leave it active for this tick, then clear it
			_.set(Memory, ["hive", "pulses", key, "active"], false);
			return;
		}

		if (lastTick == null
			|| Game.time == lastTick
			|| (Game.time - lastTick) >= (minTicks + Math.floor((1 - (Game.cpu.bucket / 10000)) * range))) {
			_.set(Memory, ["hive", "pulses", key, "last_tick"], Game.time);
			_.set(Memory, ["hive", "pulses", key, "active"], true);
		} else {
			_.set(Memory, ["hive", "pulses", key, "active"], false);
		}
	},

	moveReusePath: function () {
		let minTicks = 15, maxTicks = 60;
		let range = maxTicks - minTicks;
		return minTicks + Math.floor((1 - (Game.cpu.bucket / 10000)) * range);
	},

	moveRequestPath: function (creep) {
		// Note: needs to return odd number to traverse edge tiles
		// Also: Fluctuating tick amounts gets creeps stuck on edge tiles
		let minTicks = 3, maxTicks = 15;
		let role = _.get(creep, ["memory", "role"]);

		if (creep.pos.isEdge()) {
			minTicks = 3;
			maxTicks = 3;
		} else if ((role == "carrier" || role == "miner" || role == "burrower")
			&& (creep.room.name != _.get(creep, ["memory", "colony"], creep.room.name))) {
			// Remote mining operations outside of colony have increased wait time (CPU optimization)
			minTicks = 9;
			maxTicks = 25;
		}

		let range = maxTicks - minTicks;
		let value = minTicks + Math.floor((1 - (Game.cpu.bucket / 10000)) * range);
		return (value % 2 != 0 ? value : value + 1);
	},

	moveMaxOps: function () {
		let minOps = 2000, maxOps = 3000;
		let range = maxOps - minOps;
		return minOps + Math.floor((1 - (Game.cpu.bucket / 10000)) * range);
	},

	_globalCreepStateCacheTick: 0,
	_globalCreepStateCache: null,

	getGlobalCreepState: function () {
		if (typeof ShardMemory === "undefined")
			return null;

		if (this._globalCreepStateCache && this._globalCreepStateCacheTick === Game.time)
			return this._globalCreepStateCache;

		let state = {
			payloads: {},
			shards: _.get(ShardMemory, "KNOWN_SHARDS", [])
		};

		try {
			state.payloads[Game.shard.name] = ShardMemory.getLocalPayload();
		} catch (err) {
			console.log(`<font color="#FF6B6B">[InterShard]</font> Failed to read local payload: ${err.message}`);
		}

		_.each(state.shards, shard => {
			if (shard === Game.shard.name)
				return;
			try {
				let payload = ShardMemory.readRemote(shard);
				if (payload)
					state.payloads[shard] = payload;
			} catch (err) {
				console.log(`<font color="#FF6B6B">[InterShard]</font> Failed to read remote payload ${shard}: ${err.message}`);
			}
		});

		this._globalCreepStateCache = state;
		this._globalCreepStateCacheTick = Game.time;
		return state;
	},

	isCreepTrackedGlobally: function (name, state) {
		if (!name || !state || !state.payloads)
			return false;

		const TTL_GRACE_TICKS = 5;
		const DESCRIPTOR_STALE_TICKS = 50; // Reduced from 150 for faster dead detection
		const COMPLETION_GRACE_TICKS = 200;
		const TRANSFER_GRACE_TICKS = 100; // Reduced from 200 for faster dead detection
		const HANDSHAKE_PENDING_TICKS = 75;
		const HANDSHAKE_ACK_TICKS = 150;

		for (let shardName in state.payloads) {
			let payload = state.payloads[shardName];
			if (!payload)
				continue;

			let descriptor = _.get(payload, ["global", "creeps", name]);
			if (descriptor) {
				let status = _.get(descriptor, "status", "active");
				if (status === "dead") {
					// Explicitly marked as dead
					return false;
				}
				
				let ttl = _.get(descriptor, "ttl", 0);
				let lastUpdate = _.get(descriptor, "last_update", Game.time);
				let age = Game.time - lastUpdate;
				
				// If TTL is very low and update is stale, likely dead
				if (ttl <= TTL_GRACE_TICKS && age > DESCRIPTOR_STALE_TICKS) {
					return false;
				}
				
				// If status is active but update is very stale, likely dead
				if (status === "active" && age > DESCRIPTOR_STALE_TICKS) {
					return false;
				}
				
				// If transferring but update is stale, likely dead
				if (status === "transferring" && age > TRANSFER_GRACE_TICKS) {
					return false;
				}
				
				// Check if descriptor is actually valid (not stale)
				// Only return true if we have a valid descriptor
				if (ttl > TTL_GRACE_TICKS && age <= DESCRIPTOR_STALE_TICKS) {
					return true; // Valid descriptor with good TTL and recent update
				}
				if (age <= DESCRIPTOR_STALE_TICKS && status !== "transferring") {
					return true; // Recent update, not transferring
				}
				if (status === "transferring" && age <= TRANSFER_GRACE_TICKS) {
					return true; // Valid transferring descriptor
				}
				// If we get here, descriptor exists but is stale - continue checking other shards
			}

			let handshake = _.get(payload, "handshake");
			if (handshake) {
				let pending = _.get(handshake, ["pending", name]);
				if (pending) {
					let ts = _.get(pending, "transfer_time", _.get(pending, "updated", Game.time));
					if ((Game.time - ts) <= HANDSHAKE_PENDING_TICKS)
						return true;
				}

				let acknowledgement = _.get(handshake, ["acknowledgements", name]);
				if (acknowledgement) {
					let ts = _.get(acknowledgement, "updated", Game.time);
					if ((Game.time - ts) <= HANDSHAKE_ACK_TICKS)
						return true;
				}

				let completion = _.get(handshake, ["completions", name]);
				if (completion && (Game.time - _.get(completion, "updated", Game.time)) <= COMPLETION_GRACE_TICKS)
					return true;
			}

			let transfer = _.get(payload, ["creep_transfers", name]) || _.get(payload, ["transfers", name]);
			if (transfer) {
				let transferTime = _.get(transfer, "transfer_time", Game.time);
				if ((Game.time - transferTime) <= TRANSFER_GRACE_TICKS)
					return true;
			}
		}

		return false;
	},

	_extractColonyFromRequestId: function (requestId) {
		if (!requestId || !_.isString(requestId))
			return null;
		let parts = requestId.split(":");
		if (parts.length < 2)
			return null;
		let colonyPart = parts[1];
		let colonyParts = colonyPart.split("/");
		return colonyParts.length === 2 ? colonyParts[1] : colonyPart;
	},

	registerRemoteMissionCreep: function (creepName, lastSeen) {
		let creepMem = _.get(Memory, ["creeps", creepName]);
		if (!creepMem)
			return;

		let requestId = _.get(creepMem, "scout_request_id");
		if (!requestId)
			return;

		let colony = _.get(creepMem, "colony") || this._extractColonyFromRequestId(requestId);
		if (!colony)
			return;

		let colonyRoom = colony;
		if (_.isString(colonyRoom) && colonyRoom.indexOf("/") >= 0)
			colonyRoom = colonyRoom.split("/").pop();

		let requests = _.get(Memory, ["rooms", colonyRoom, "scout_requests"]);
		if (!_.isArray(requests))
			return;

		for (let i = 0; i < requests.length; i++) {
			let req = requests[i];
			if (!req || req.id !== requestId)
				continue;

			if (!_.isObject(req.remote_creeps))
				req.remote_creeps = {};
			req.remote_creeps[creepName] = lastSeen || Game.time;
			break;
		}
	},

	unregisterRemoteMissionCreep: function (creepName) {
		let creepMem = _.get(Memory, ["creeps", creepName]);
		let requestId = creepMem ? _.get(creepMem, "scout_request_id") : null;
		let colony = creepMem ? _.get(creepMem, "colony") : null;
		if (!requestId)
			return;
		if (!colony)
			colony = this._extractColonyFromRequestId(requestId);
		if (!colony)
			return;

		let colonyRoom = colony;
		if (_.isString(colonyRoom) && colonyRoom.indexOf("/") >= 0)
			colonyRoom = colonyRoom.split("/").pop();

		let requests = _.get(Memory, ["rooms", colonyRoom, "scout_requests"]);
		if (!_.isArray(requests))
			return;

		for (let i = 0; i < requests.length; i++) {
			let req = requests[i];
			if (!req || req.id !== requestId)
				continue;
			if (_.isObject(req.remote_creeps) && _.has(req.remote_creeps, creepName))
				delete req.remote_creeps[creepName];
			break;
		}
	},

	clearDeadMemory: function () {
		if (!isPulse_Short())
			return;

		let deadCreeps = [];
		let globalState = this.getGlobalCreepState();

		if (_.has(Memory, "creeps"))
			_.each(Object.keys(Memory.creeps), c => {
				if (_.has(Game, ["creeps", c]))
					return;

				if (this.isCreepTrackedGlobally(c, globalState)) {
					this.registerRemoteMissionCreep(c, Game.time);
					_.set(Memory, ["creeps", c, "_global_remote"], true);
					_.set(Memory, ["creeps", c, "_global_lastSeen"], Game.time);
					return;
				}

				this.unregisterRemoteMissionCreep(c);
				delete Memory.creeps[c];
				deadCreeps.push(c);
			});

		if (_.has(Memory, "rooms"))
			_.each(Object.keys(Memory.rooms), r => {
				if (!_.has(Game, ["rooms", r]))
					delete Memory.rooms[r];
			});

		if (deadCreeps.length > 0) {
			if (typeof ShardMemory !== "undefined" && _.isFunction(_.get(ShardMemory, "removeGlobalCreep"))) {
				_.each(deadCreeps, name => {
					try {
						ShardMemory.removeGlobalCreep(name, "dead");
					} catch (err) {
						console.log(`<font color="#FF944E">[Shard]</font> Failed to unregister ${name}: ${err.message}`);
					}
				});
			}

			try {
				let raw = InterShardMemory.getLocal();
				if (raw) {
					let payload = JSON.parse(raw);
					let changed = false;

					_.each(deadCreeps, name => {
						if (_.has(payload, ["global_creeps", name])) {
							delete payload.global_creeps[name];
							changed = true;
						}
						if (_.has(payload, ["creep_transfers", name])) {
							let transferEntry = _.get(payload, ["creep_transfers", name]);
							let destinationShard = _.get(transferEntry, "destination_shard");
							let transferTime = _.get(transferEntry, "transfer_time", 0);
							let recentTransfer = (Game.time - transferTime) <= 200;
							let crossShard = destinationShard && destinationShard !== Game.shard.name;
							if (!(crossShard && recentTransfer)) {
								if (Memory && _.get(Memory, ["hive", "ism", "debug_transfers"])) {
									console.log(`<font color="#9B5DE5">[InterShard]</font> clearDeadMemory removing transfer ${name}; crossShard=${crossShard} destination=${destinationShard} transferTime=${transferTime} recent=${recentTransfer}`);
								}
								delete payload.creep_transfers[name];
								changed = true;
							}
						}
						if (_.has(payload, ["transfers", name])) {
							let transferEntry = _.get(payload, ["transfers", name]);
							let destinationShard = _.get(transferEntry, "destination_shard");
							let transferTime = _.get(transferEntry, "transfer_time", 0);
							let recentTransfer = (Game.time - transferTime) <= 200;
							let crossShard = destinationShard && destinationShard !== Game.shard.name;
							if (!(crossShard && recentTransfer)) {
								delete payload.transfers[name];
								changed = true;
							}
						}
					});

					if (changed)
						InterShardMemory.setLocal(JSON.stringify(payload));
				}
			} catch (err) {
				console.log(`<font color="#FF944E">[Shard]</font> Failed to prune ISM for dead creeps: ${err.message}`);
			}

			let manifest = _.get(Memory, ["hive", "ism", "global", "local_manifest"]);
			if (_.isObject(manifest)) {
				_.each(deadCreeps, name => {
					if (_.has(manifest, name))
						delete manifest[name];
				});
				_.set(Memory, ["hive", "ism", "global", "local_manifest"], manifest);
			}

			_.each(_.keys(_.get(Memory, "rooms", {})), roomName => {
				let requests = _.get(Memory, ["rooms", roomName, "scout_requests"]);
				if (!_.isArray(requests) || requests.length === 0)
					return;

				let updated = [];
				for (let i = 0; i < requests.length; i++) {
					let req = requests[i];
					if (!req)
						continue;

					if (_.isArray(req.creeps))
						req.creeps = _.filter(req.creeps, name => _.has(Game.creeps, name));

					if (!req.respawn && req.spawned_total >= _.get(req, "count", 1) && (_.isArray(req.creeps) && req.creeps.length === 0)) {
						req._completed = true;
					}

					if (req._completed !== true)
						updated.push(req);
				}

				_.set(Memory, ["rooms", roomName, "scout_requests"], updated);
			});
		}
	},

	initMemory: function () {
		Stats_CPU.Start("Hive", "initMemory");

		// Use odd intervals or odd numbers to prevent stacking multiple pulses on one tick
		// Optimized intervals for reduced CPU usage
		this.setPulse("defense", 8, 16);
		this.setPulse("short", 19, 120);
		this.setPulse("mid", 39, 180);
	this.setPulse("long", 99, 400);
	this.setPulse("spawn", 29, 60);
	this.setPulse("lab", 1999, 2000);
	this.setPulse("factory", 199, 400); // Factory assignments every 199-400 ticks
	this.setPulse("blueprint", 19, 100); // Much faster blueprint for early game building
	this.setPulse("intershard", 3, 10); // Fast intershard communication for handshakes and transfers

		if (_.get(Memory, ["rooms"]) == null) _.set(Memory, ["rooms"], new Object());
		if (_.get(Memory, ["hive", "allies"]) == null) _.set(Memory, ["hive", "allies"], new Array());
		if (_.get(Memory, ["hive", "pulses"]) == null) _.set(Memory, ["hive", "pulses"], new Object());
		if (_.get(Memory, ["sites", "mining"]) == null) _.set(Memory, ["sites", "mining"], new Object());
		if (_.get(Memory, ["sites", "colonization"]) == null) _.set(Memory, ["sites", "colonization"], new Object());
		if (_.get(Memory, ["sites", "combat"]) == null) _.set(Memory, ["sites", "combat"], new Object());
		if (_.get(Memory, ["hive", "ism"]) == null) _.set(Memory, ["hive", "ism"], new Object());

		for (let r in Game["rooms"])
			_.set(Memory, ["rooms", r, "population"], null);
		_.set(Memory, ["hive", "spawn_requests"], new Array());

		Console.Init();

		Stats_CPU.End("Hive", "initMemory");
	},

	initVisuals: function () {
		Stats_Visual.Init();
	},

	endMemory: function () {
		if (_.has(Memory, ["hive", "pulses", "reset_links"]))
			delete Memory["hive"]["pulses"]["reset_links"];
	},


	runColonies: function () {
		_.each(Game.rooms, room => {
			if (room.controller != null && room.controller.my) {
				Sites.Colony(room.name);
				if (_.get(Memory, ["sites", "mining", room.name]) == null)
					_.set(Memory, ["sites", "mining", room.name], { colony: room.name, has_keepers: false });

				if (room.controller.level >= 6)
					Sites.Industry(room.name);

				this.runScoutRequests(room.name);
			}
		});

		let mining = _.get(Memory, ["sites", "mining"]);
		_.each(Object.keys(mining), req => {
			if (_.get(mining, [req, "colony"]) != null)
				Sites.Mining(_.get(mining, [req, "colony"]), req);
		});

		this.runGlobalScouts();
	},

	runColonizations: function () {
		_.each(_.get(Memory, ["sites", "colonization"]), req => {
			Sites.Colonization(_.get(req, "from"), _.get(req, "target"));
		});
	},

	runCombat: function () {
		for (let memory_id in _.get(Memory, ["sites", "combat"]))
			Sites.Combat(memory_id);
	},

	runHighwayMining: function () {
		for (let highway_id in _.get(Memory, ["sites", "highway_mining"]))
			Sites.HighwayMining(highway_id);
	},

	runGlobalScouts: function () {
		let creeps = _.get(Game, "creeps");
		if (!creeps)
			return;

		_.each(creeps, creep => {
			if (!creep)
				return;

			let role = _.get(creep, ["memory", "role"]);
			let looksLikeScout = role === "scout"
				|| (typeof creep.name === "string" && creep.name.indexOf("scou:") === 0)
				|| _.has(creep.memory, "scout_request_id");

			if (!looksLikeScout)
				return;

			if (role !== "scout")
				_.set(creep, ["memory", "role"], "scout");

			if (_.get(creep.memory, "_last_scout_run") === Game.time)
				return;

			Creep_Roles.Scout(creep);
		});
	},

	runScoutRequests: function (rmColony) {
		let requests = _.get(Memory, ["rooms", rmColony, "scout_requests"]);
		if (!_.isArray(requests) || requests.length == 0)
			return;

		let globalState = this.getGlobalCreepState();

		let listSpawnRooms = _.get(Memory, ["rooms", rmColony, "spawn_assist", "rooms"]);
		let globalSpawnQueue = _.get(Memory, ["hive", "spawn_requests"], []);

		// Compact and sanitize requests
		requests = _.filter(requests, req => req != null);

		_.each(requests, request => {
			request.count = Math.max(1, _.get(request, "count", 1));
			request.respawn = _.get(request, "respawn", true) !== false;
			request.wait_for_full_rally = _.get(request, "wait_for_full_rally", true) !== false;
			request.spawned_total = _.get(request, "spawned_total", 0);
			request.patrol_mode = _.includes(["station", "loop"], request.patrol_mode) ? request.patrol_mode : "station";
			request.colony_shard = _.get(request, "colony_shard", Game.shard.name);
			request.spawn_rooms = request.spawn_rooms || listSpawnRooms;
			if (_.isArray(request.portals) && request.portals.length == 0)
				delete request.portals;
			let existingNames = _.get(request, "creeps", []);
			if (!_.isArray(existingNames))
				existingNames = [];
			request.creeps = _.filter(existingNames, name => _.has(Game.creeps, name));
			request._remote_pruned = request._remote_pruned || 0;

			if (!_.isObject(request.remote_creeps))
				request.remote_creeps = {};

			// Discover creeps attached via memory but not yet tracked
			_.each(Game.creeps, creep => {
				if (_.get(creep, ["memory", "scout_request_id"]) === request.id) {
					if (!_.includes(request.creeps, creep.name))
						request.creeps.push(creep.name);
					if (_.has(request.remote_creeps, creep.name))
						delete request.remote_creeps[creep.name];
				}
			});

			let creeps = _.map(request.creeps, name => Game.creeps[name]).filter(Boolean);
			request.creeps = _.map(creeps, c => c.name);

			let remoteNames = [];
			if (_.isObject(request.remote_creeps)) {
				_.each(Object.keys(request.remote_creeps), name => {
					// Check if creep exists locally first
					if (Game.creeps[name]) {
						// Creep is now local, remove from remote tracking
						delete request.remote_creeps[name];
						return;
					}

					// Since creep doesn't exist locally, check if it's actually tracked globally
					// If not found in global state OR descriptor is stale, mark as dead
					let stillPresent = false;
					// Preserve existing timestamp - don't default to Game.time which causes "last seen 0 ticks ago"
					let lastSeen = request.remote_creeps[name];
					if (!lastSeen || lastSeen === Game.time) {
						// If no timestamp or timestamp is current tick, use a reasonable default
						// This handles edge cases where timestamp wasn't set properly
						lastSeen = Game.time - 1;
					}
					
					// Grace period for recently registered remote scouts (just transferred)
					// Give them time for global state to update before marking as dead
					let ageSinceRegistration = Game.time - lastSeen;
					let TRANSFER_GRACE_PERIOD = 10; // Allow 10 ticks for global state to update
					if (ageSinceRegistration <= TRANSFER_GRACE_PERIOD) {
						// Recently registered - assume alive and give it time
						stillPresent = true;
					} else if (globalState && globalState.payloads) {
						let foundValidDescriptor = false;
						for (let shardName in globalState.payloads) {
							let payload = globalState.payloads[shardName];
							if (payload) {
								let descriptor = _.get(payload, ["global", "creeps", name]);
								if (descriptor) {
									let status = _.get(descriptor, "status", "active");
									let lastUpdate = _.get(descriptor, "last_update", 0);
									let age = Game.time - lastUpdate;
									
									// If descriptor is stale (> 100 ticks for transferring, > 50 for others), it's dead
									let maxAge = (status === "transferring") ? 100 : 50;
									if (age <= maxAge) {
										foundValidDescriptor = true;
										break;
									}
								}
								
								// Check handshakes/transfers - but only if they're very recent (< 50 ticks)
								let handshake = _.get(payload, "handshake");
								if (handshake) {
									let pending = _.get(handshake, ["pending", name]);
									if (pending) {
										let ts = _.get(pending, "transfer_time", _.get(pending, "updated", 0));
										if ((Game.time - ts) <= 50) {
											foundValidDescriptor = true;
											break;
										}
									}
									let acknowledgement = _.get(handshake, ["acknowledgements", name]);
									if (acknowledgement) {
										let ts = _.get(acknowledgement, "updated", 0);
										if ((Game.time - ts) <= 50) {
											foundValidDescriptor = true;
											break;
										}
									}
								}
								
								let transfer = _.get(payload, ["creep_transfers", name]) || _.get(payload, ["transfers", name]);
								if (transfer) {
									let transferTime = _.get(transfer, "transfer_time", 0);
									if ((Game.time - transferTime) <= 50) {
										foundValidDescriptor = true;
										break;
									}
								}
							}
						}
						
						stillPresent = foundValidDescriptor;
					}
					
					if (stillPresent) {
						// Scout is alive - preserve existing timestamp, don't reset it
						// Only update timestamp if it's missing or extremely old (to track when we first saw it)
						if (!request.remote_creeps[name]) {
							request.remote_creeps[name] = Game.time;
						}
						remoteNames.push(name);
					} else {
						// Creep is dead or no longer tracked
						let debugScouts = _.get(Memory, ["hive", "debug", "scout"], 0);
						if (debugScouts >= 1) {
							console.log(`<font color="#FF944E">[Scout]</font> Detected dead remote scout ${name} (last seen ${Game.time - lastSeen} ticks ago)`);
						}
						delete request.remote_creeps[name];
						request._remote_pruned++;
					}
				});
			}

			let rallyReached = 0;
			_.each(creeps, creep => {
				if (creep.memory.scout_rally_reached)
					rallyReached++;
			});

			let requiredCount = request.count;
			let remoteCount = remoteNames.length;
			let activeCount = creeps.length + remoteCount;
			let effectiveRally = rallyReached + remoteCount;
			let rallyReady = request.wait_for_full_rally ? (activeCount >= requiredCount && effectiveRally >= requiredCount) : true;
			let release = request.wait_for_full_rally ? (rallyReady || request.rally_release === true) : true;
			request.rally_ready = rallyReady;
			request.rally_reached = rallyReached;
			request.remote_count = remoteCount;
			request.active = activeCount;
			request.rally_release = release;
			request.waiting = request.wait_for_full_rally ? !release : false;
			request.last_update = Game.time;

			// Update live creep memory with current mission directives
			_.each(creeps, creep => {
				creep.memory.rally_release = release;
				creep.memory.patrol_mode = request.patrol_mode;
				creep.memory.respawn_mission = request.respawn;
				creep.memory.wait_for_full_rally = request.wait_for_full_rally;
				creep.memory.rally_pos = request.rally_pos;
				creep.memory.dest_pos = request.dest_pos;
				creep.memory.colony_shard = request.colony_shard;
				if (request.list_route)
					creep.memory.list_route = _.clone(request.list_route);
				if (request.transfer_intent)
					creep.memory.transfer_intent = _.cloneDeep(request.transfer_intent);
				if (request.portals)
					creep.memory.portals = _.cloneDeep(request.portals);
				if (request.global)
					creep.memory.global = _.cloneDeep(request.global);
			});

			let pendingSpawn = _.some(globalSpawnQueue, req => _.get(req, ["args", "scout_request_id"]) == request.id);
			let desiredActive = request.count;
			let canSpawnMore = request.respawn || request.spawned_total < request.count;

			let prunedRemoteOvershoot = request._remote_pruned > 0 && creeps.length === 0 && remoteCount === 0;

			if (canSpawnMore && request.active < desiredActive && !pendingSpawn) {
				let priority = _.get(request, ["custom", "priority"], 22);
				let level = _.get(request, ["custom", "level"], 1);
				let bodyName = _.get(request, ["custom", "body"], "scout");
				let spawnRooms = request.spawn_rooms;

				let args = {
					role: "scout",
					colony: rmColony,
					room: _.get(request, ["dest_pos", "roomName"], rmColony),
					scout_request_id: request.id,
					dest_pos: request.dest_pos,
					rally_pos: request.rally_pos,
					patrol_mode: request.patrol_mode,
					list_route: request.list_route,
					transfer_intent: request.transfer_intent,
					global: request.global,
					scout_rally_reached: false,
					wait_for_full_rally: request.wait_for_full_rally,
					respawn_mission: request.respawn,
					colony_shard: Game.shard.name
				};

				Memory.hive.spawn_requests.push({
					room: rmColony,
					listRooms: spawnRooms,
					priority: priority,
					level: level,
					scale: false,
					body: bodyName,
					name: _.get(request, ["custom", "name"], null),
					args: args
				});

				request.spawned_total = (request.spawned_total || 0) + 1;
			}

			// Flag completion for one-shot missions with no surviving creeps or pending spawns
			if (prunedRemoteOvershoot) {
				request.spawned_total = Math.max(0, (request.spawned_total || 0) - request._remote_pruned);
				request._remote_pruned = 0;
			}

			if (!request.respawn && request.spawned_total >= request.count && creeps.length == 0 && remoteCount == 0 && !pendingSpawn)
				request._completed = true;
		});

		requests = _.filter(requests, req => req != null && req._completed !== true);
		_.set(Memory, ["rooms", rmColony, "scout_requests"], requests);
	},

	// Reusable inter-shard mission framework helpers
	getPortalForDirection: function (creep, direction, missionData) {
		// Helper to determine which portal to use based on mission direction
		// direction: "to_dest" or "to_rally"
		// missionData: object with dest_pos, rally_pos, transfer_intent, portals
		if (!creep || !missionData)
			return null;

		let targetShard = null;
		let targetRoom = null;

		if (direction === "to_dest") {
			targetShard = _.get(missionData, ["dest_pos", "shard"]);
			targetRoom = _.get(missionData, ["dest_pos", "roomName"]);
		} else if (direction === "to_rally") {
			targetShard = _.get(missionData, ["rally_pos", "shard"]);
			targetRoom = _.get(missionData, ["rally_pos", "roomName"]);
		}

		if (!targetShard || targetShard === Game.shard.name)
			return null;

		// Check portals array first
		let portals = _.get(missionData, "portals", []);
		if (_.isArray(portals)) {
			for (let i = 0; i < portals.length; i++) {
				let entry = portals[i];
				if (!entry || !entry.from || !entry.to)
					continue;
				if (entry.from.shard === Game.shard.name && entry.to.shard === targetShard) {
					if (!targetRoom || entry.to.roomName === targetRoom || !entry.to.roomName)
						return entry;
				}
			}
		}

		// Check transfer_intent
		let transferIntent = _.get(missionData, "transfer_intent");
		if (_.isObject(transferIntent)) {
			if (direction === "to_dest") {
				let portalPos = _.get(transferIntent, "portal_pos");
				if (portalPos && _.get(transferIntent, "destination_shard") === targetShard) {
					return {
						from: { shard: Game.shard.name, roomName: portalPos.roomName, pos: portalPos },
						to: { shard: targetShard, roomName: targetRoom }
					};
				}
			} else if (direction === "to_rally") {
				let returnPortal = _.get(transferIntent, "return_portal");
				if (returnPortal) {
					let portalPos = _.get(returnPortal, "portal_pos");
					if (portalPos && _.get(returnPortal, "destination_shard") === targetShard) {
						return {
							from: { shard: Game.shard.name, roomName: portalPos.roomName, pos: portalPos },
							to: { shard: targetShard, roomName: targetRoom }
						};
					}
				}
			}
		}

		return null;
	},

	updateMissionState: function (creep, missionData) {
		// Helper to update mission state for inter-shard operations
		// Ensures mission data is persisted in global memory
		if (!creep || !missionData)
			return;

		let missionCache = _.get(creep.memory, ["global", "mission_data"]);
		if (!_.isObject(missionCache))
			missionCache = {};

		_.assign(missionCache, missionData);
		_.set(creep.memory, ["global", "mission_data"], missionCache);

		// Register authoritative mission on primary shard (Option A)
		if (typeof ShardMemory !== "undefined" && _.isFunction(_.get(ShardMemory, "registerMission"))) {
			ShardMemory.registerMission(creep.name, missionCache);
		}

		// Update global descriptor
		if (typeof creep.ensureGlobal === "function") {
			creep.ensureGlobal({
				mission: _.get(missionCache, "mission", "scout"),
				status: _.get(creep.memory, "global_status", "active"),
				origin: _.get(missionCache, "origin"),
				target: _.get(missionCache, "target")
			});
		}
	},

	trackRemoteMissionCreep: function (creepName, missionId, missionType) {
		// Helper to track remote mission creeps (reusable for scouts, colonizers, etc.)
		// missionType: "scout", "colonize", "resource", etc.
		let creepMem = _.get(Memory, ["creeps", creepName]);
		if (!creepMem)
			return false;

		let requestId = _.get(creepMem, missionType === "scout" ? "scout_request_id" : "mission_id");
		if (!requestId || requestId !== missionId)
			return false;

		// Check if creep is tracked globally
		let globalState = this.getGlobalCreepState();
		return this.isCreepTrackedGlobally(creepName, globalState);
	},

	deriveScoutRoute: function (origin, destination) {
		if (origin == null || destination == null)
			return origin ? [origin] : [];

		if (origin === destination)
			return [origin];

		let route = [origin];
		try {
			let result = Game.map.findRoute(origin, destination);
			if (_.isArray(result)) {
				_.each(result, step => {
					if (_.last(route) !== step.room)
						route.push(step.room);
				});
			} else if (result === ERR_NO_PATH) {
				route.push(destination);
			}
		} catch (error) {
			console.log(`<font color=\"#FF944E\">[Scout]</font> Unable to derive route ${origin} -> ${destination}: ${error}`);
			if (_.last(route) !== destination)
				route.push(destination);
		}

		if (_.last(route) !== destination)
			route.push(destination);

		return _.uniq(route);
	},

	populationTally: function (rmName, popTarget, popActual) {
		// Tallies the target population for a colony, to be used for spawn load balancing
		_.set(Memory, ["rooms", rmName, "population", "target"], _.get(Memory, ["rooms", rmName, "population", "target"], 0) + popTarget);
		_.set(Memory, ["rooms", rmName, "population", "actual"], _.get(Memory, ["rooms", rmName, "population", "actual"], 0) + popActual);
	},

	processSpawnRequests: function () {
		/*  lvlPriority is an integer rating priority, e.g.:
				01 - 10: Defense
				11 - 20: Mining, Industry
				21 - 30: Colony

				00: Active Defense

				11: Mining (critical; miner, burrower)
				14: Mining (carriers)
				14-16: Industry (can bring in critical energy!)

				20: Passive Defense
				21: Colonization
				22: Colony (critical)
				25: Colony (regular)


			tgtLevel is the target level of the creep's body (per body.js)
			listRooms is an array of room names that would be acceptable to spawn the request (user defined)
		*/

		if (!isPulse_Spawn())
			return;

		Stats_CPU.Start("Hive", "processSpawnRequests");

		// Cache spawn requests to avoid repeated memory lookups
		let spawnRequests = _.get(Memory, ["hive", "spawn_requests"]);
		if (!spawnRequests || spawnRequests.length == 0) {
			Stats_CPU.End("Hive", "processSpawnRequests");
			return;
		}

		// Cache available spawns once
		let availableSpawns = [];
		let spawnsByRoom = {};
		for (let spawnName in Game["spawns"]) {
			let spawn = Game["spawns"][spawnName];
			if (spawn.spawning == null) {
				availableSpawns.push(spawnName);
				if (!spawnsByRoom[spawn.room.name]) {
					spawnsByRoom[spawn.room.name] = [];
				}
				spawnsByRoom[spawn.room.name].push(spawnName);
			}
		}

		if (availableSpawns.length == 0) {
			Stats_CPU.End("Hive", "processSpawnRequests");
			return;
		}

		// Group requests by room and get highest priority per room
		let requestsByRoom = {};
		for (let request of spawnRequests) {
			let room = _.get(request, "room");
			if (!requestsByRoom[room]) {
				requestsByRoom[room] = [];
			}
			requestsByRoom[room].push(request);
		}

		// Process each room's highest priority request
		for (let room in requestsByRoom) {
			if (availableSpawns.length == 0) break;

			// Sort by priority and get highest priority request
			let roomRequests = requestsByRoom[room].sort((a, b) => _.get(a, "priority", 999) - _.get(b, "priority", 999));
			let request = roomRequests[0];
			if (!request) continue;

			// Find best spawn for this request
			let bestSpawn = null;
			let bestSpawnName = null;

			// Prefer spawns in the same room
			if (spawnsByRoom[room] && spawnsByRoom[room].length > 0) {
				bestSpawnName = spawnsByRoom[room][0];
				bestSpawn = Game["spawns"][bestSpawnName];
			} else {
				// Check listRooms for alternative spawns
				let listRooms = _.get(request, "listRooms");
				if (listRooms) {
					for (let altRoom of listRooms) {
						if (spawnsByRoom[altRoom] && spawnsByRoom[altRoom].length > 0) {
							bestSpawnName = spawnsByRoom[altRoom][0];
							bestSpawn = Game["spawns"][bestSpawnName];
							break;
						}
					}
				}
			}

			if (!bestSpawn) continue;

			// Calculate population ratio once
			let populationActual = _.get(Memory, ["rooms", room, "population", "actual"], 0);
			let populationTarget = _.get(Memory, ["rooms", room, "population", "target"], 1);
			let populationRatio = populationActual / populationTarget;
			_.set(Memory, ["rooms", room, "population", "total"], populationRatio);

			// Calculate level once - improved scaling for early game
			let scale = _.get(request, "scale", true);
			let baseLevel = _.get(request, "level", 1);
			let roomLevel = bestSpawn.room.getLevel();
			
			let level;
			if (scale == false) {
				level = Math.min(baseLevel, roomLevel);
			} else {
				// Improved scaling: ensure minimum level based on RCL, then scale by population
				let minLevel = Math.max(1, Math.min(baseLevel, roomLevel));
				let scaledLevel = Math.max(1, Math.min(Math.round(populationRatio * baseLevel), roomLevel));
				
				// For early game (RCL 1-4), ensure we don't go too low on level
				if (roomLevel <= 4) {
					level = Math.max(minLevel, Math.max(1, Math.floor(scaledLevel * 0.8)));
				} else {
					level = Math.max(minLevel, scaledLevel);
				}
			}
			request.args["level"] = level;

			let body = Creep_Body.getBody(request.body, level);
			let name = request.name != null ? request.name
				: request.args["role"].substring(0, 4)
				+ (request.args["subrole"] == null ? "" : `-${request.args["subrole"].substring(0, 2)}`)
				+ ":xxxx".replace(/[xy]/g, (c) => {
					let r = Math.random() * 16 | 0, v = c == "x" ? r : (r & 0x3 | 0x8);
					return v.toString(16);
				});

			// Optimize energy structures lookup - only if storage exists
			let energies = null;
			if (bestSpawn.room.storage) {
				energies = bestSpawn.room.find(FIND_MY_STRUCTURES).filter(s => { 
					return s.isActive() && (s.structureType == "extension" || s.structureType == "spawn"); 
				}).sort(s => { return s.pos.getRangeTo(bestSpawn.room.storage); });
			}

			let result = energies == null
				? bestSpawn.spawnCreep(body, name, { memory: request.args })
				: bestSpawn.spawnCreep(body, name, { memory: request.args, energyStructures: energies });

			if (result == OK) {
				console.log(`<font color=\"#19C800\">[Spawns]</font> Spawning `
					+ (bestSpawn.room.name == room ? `${room}  ` : `${bestSpawn.room.name} -> ${room}  `)
					+ `${level} / ${request.level}  ${name} : ${request.args["role"]}`
					+ `${request.args["subrole"] == null ? "" : ", " + request.args["subrole"]} `
					+ `(${request.body})`);

				// Remove the used spawn from all tracking arrays
				let spawnIndex = availableSpawns.indexOf(bestSpawnName);
				if (spawnIndex > -1) {
					availableSpawns.splice(spawnIndex, 1);
				}
				
				// Remove from spawnsByRoom
				for (let roomName in spawnsByRoom) {
					let roomSpawns = spawnsByRoom[roomName];
					let roomIndex = roomSpawns.indexOf(bestSpawnName);
					if (roomIndex > -1) {
						roomSpawns.splice(roomIndex, 1);
					}
				}
			}
		}

		Stats_CPU.End("Hive", "processSpawnRequests");
	},

	processSpawnRenewing: function () {
		Stats_CPU.Start("Hive", "processSpawnRenewing");

		// Cache spawns that are available and have energy
		let availableSpawns = [];
		for (let spawnName in Game["spawns"]) {
			let spawn = Game["spawns"][spawnName];
			if (spawn.spawning == null && spawn.room.energyAvailable > 300) {
				availableSpawns.push(spawn);
			}
		}

		// Process each available spawn
		for (let spawn of availableSpawns) {
			// Find creeps in range that need renewal (optimized filter)
			let nearbyCreeps = spawn.pos.findInRange(FIND_MY_CREEPS, 1);
			for (let creep of nearbyCreeps) {
				if (!creep.isBoosted() && creep.memory.spawn_renew !== false) {
					if (spawn.renewCreep(creep) == OK) {
						break; // Only renew one creep per spawn per tick
					}
				}
			}
		}

		Stats_CPU.End("Hive", "processSpawnRenewing");
	},


	sellExcessResources: function () {
		if (!isPulse_Mid())
			return;

		Stats_CPU.Start("Hive", "sellExcessResources");

		overflow = _.get(Memory, ["resources", "to_market"]);
		if (overflow == null)
			return;

		let resources = new Object();

		_.each(Object.keys(overflow), res => {
			_.each(_.filter(Game.rooms, r => { return _.get(r, ["terminal", "my"], false); }), r => {
				let amount = _.get(r, ["storage", "store", res], 0) + _.get(r, ["terminal", "store", res], 0);
				if (amount > 0)
					_.set(resources, [res, r.name], amount);
			});
		});

		for (let res in resources) {
			let excess = _.sum(resources[res]) - overflow[res];
			if (excess > 100 && _.get(Memory, ["resources", "terminal_orders", `overflow_${res}`]) == null) {
				let room = _.head(_.sortBy(Object.keys(resources[res]), r => { return -resources[res][r]; }));
				let order = _.head(_.sortBy(_.sortBy(Game.market.getAllOrders(
					o => { return o.type == "buy" && o.resourceType == res; }),
					o => { return Game.map.getRoomLinearDistance(o.roomName, room); }),
					o => { return -o.price; }));

				if (order != null) {
					if (_.get(Memory, ["resources", "terminal_orders", `overflow_${res}`]) != null)
						console.log(`<font color=\"#F7FF00\">[Hive]</font> Selling overflow resource to market: ${excess} of ${res} from ${room}`);
					_.set(Memory, ["resources", "terminal_orders", `overflow_${res}`], { market_id: order.id, amount: excess, from: room, priority: 4 });

				}
			}
		}

		Stats_CPU.End("Hive", "sellExcessResources");
	},

	moveExcessEnergy: function () {
		if (!isPulse_Mid())
			return;

		Stats_CPU.Start("Hive", "moveExcessEnergy");

		limit = _.get(Memory, ["resources", "to_overflow"]);
		if (limit == null)
			return;

		let energy = new Object();

		_.forEach(_.filter(Game.rooms,
			r => { return r.terminal != null && r.terminal.my; }),
			r => { energy[r.name] = _.get(r, ["storage", "store", "energy"], 0) + _.get(r, ["terminal", "store", "energy"], 0); });

		let tgtRoom = _.head(_.sortBy(_.filter(Object.keys(energy),
			n => { return energy[n] < (limit * 0.95); }),
			n => { return energy[n]; }));

		if (tgtRoom != null) {
			_.forEach(_.filter(Object.keys(energy),
				r => { return !_.has(Memory, ["resources", "terminal_orders", `overflow_energy_${r}`]) && energy[r] - limit > 100; }),
				r => {	// Terminal transfers: minimum quantity of 100.
					_.set(Memory, ["resources", "terminal_orders", `overflow_energy_${r}`], { room: tgtRoom, resource: "energy", amount: energy[r] - limit, from: r, priority: 2 });
					console.log(`<font color=\"#F7FF00\">[Hive]</font> Creating overflow energy transfer: ${energy[r] - limit}, ${r} -> ${tgtRoom}`);
				});
		}

		Stats_CPU.End("Hive", "moveExcessEnergy");
	},


	initLabs: function () {
		if (!isPulse_Lab())
			return;

		// Reset stockpiles...
		_.each(Memory["rooms"], r => { _.set(r, ["stockpile"], new Object()); });

		// Reset automated terminal orders
		_.each(_.keys(_.get(Memory, ["resources", "terminal_orders"])), o => {
			if (_.get(Memory, ["resources", "terminal_orders", o, "automated"]))
				delete Memory["resources"]["terminal_orders"][o];
		});

		// Reset reagent targets, prevents accidental reagent pileup
		_.each(_.keys(_.get(Memory, ["resources", "labs", "targets"])), t => {
			if (_.get(Memory, ["resources", "labs", "targets", t, "is_reagent"]))
				delete Memory["resources"]["labs"]["targets"][t];
		});

		// Create new reagent targets
		_.each(_.get(Memory, ["resources", "labs", "targets"]), t => {
			if (_.get(t, "amount") < 0) {
				this.createReagentTargets(t);
				return;
			}

			let amount = 0;
			_.each(Game.rooms, r => {
				if (r.controller != null && r.controller.my && (r.storage || r.terminal))
					amount += r.store(_.get(t, "mineral"));
			});

			if (amount < _.get(t, "amount")) {
				this.createReagentTargets(t);
				return;
			}
		});
	},

	createReagentTargets: function (target) {
		_.each(getReagents(target.mineral),
			reagent => {
				let amount = 0;
				_.each(_.filter(Game.rooms,
					r => { return r.controller != null && r.controller.my && r.terminal; }),
					r => { amount += r.store(reagent); });
				if (amount <= 1000 && !_.has(Memory, ["resources", "labs", "targets", reagent]) && getReagents(reagent) != null) {
					console.log(`<font color=\"#A17BFF\">[Labs]</font> reagent ${reagent} missing for ${target.mineral}, creating target goal.`);
					Memory["resources"]["labs"]["targets"][reagent] = { amount: target.amount, priority: target.priority, mineral: reagent, is_reagent: true };
					this.createReagentTargets(Memory["resources"]["labs"]["targets"][reagent]);
				}
			});
	},

	generatePixels: function () {
		if (!_.isObject(Memory.hive))
			Memory.hive = {};
		if (!_.isObject(Memory.hive.pixels))
			Memory.hive.pixels = {};

		// Get pixel generation settings from memory (defaults: enabled, 80% CPU threshold)
		let pixelEnabled = _.get(Memory, ["hive", "pixels", "enabled"], true);
		let cpuThreshold = _.get(Memory, ["hive", "pixels", "cpu_threshold"], 0.8);

		// Exit early if pixel generation is disabled
		if (!pixelEnabled) {
			return;
		}

		// Check if bucket is full (required for pixel generation)
		if (Game.cpu.bucket < 10000) {
			return;
		}

		// Calculate average CPU usage (use getUsed at end of tick)
		let cpuUsed = Game.cpu.getUsed();
		let cpuLimit = Game.cpu.limit;
		let cpuUsagePercent = cpuUsed / cpuLimit;

		// Only generate pixels if CPU usage is below threshold
		if (cpuUsagePercent < cpuThreshold) {
			let result = Game.cpu.generatePixel();
			
			if (result === OK) {
				// Track pixel generation statistics
				if (!Memory.hive.pixels.stats) {
					Memory.hive.pixels.stats = {
						total_generated: 0,
						last_generated: 0,
						generation_history: []
					};
				}
				
				Memory.hive.pixels.stats.total_generated++;
				Memory.hive.pixels.stats.last_generated = Game.time;
				
				// Keep last 10 generation times for rate calculation
				Memory.hive.pixels.stats.generation_history.push(Game.time);
				if (Memory.hive.pixels.stats.generation_history.length > 10) {
					Memory.hive.pixels.stats.generation_history.shift();
				}
				
				console.log(`<font color=\"#FFD700\">[Pixels]</font> Generated pixel! Total: ${Memory.hive.pixels.stats.total_generated}, CPU: ${(cpuUsagePercent * 100).toFixed(1)}%, Bucket: ${Game.cpu.bucket}`);
			} else {
				console.log(`<font color=\"#FF6B6B\">[Pixels]</font> Failed to generate pixel. Error code: ${result}`);
			}
		}
	},
};
