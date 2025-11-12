/* ***********************************************************
 *	[sec05c] DEFINITIONS: SHARD CONTROL
 * *********************************************************** */

global.ShardControl = {

	_bootstrapped: false,

	run: function () {
		if (typeof ShardMemory === "undefined") {
			return;
		}

		this._ensureBootstrapped();

		let manifest = this._collectGlobalCreeps();
		let pulseActive = isPulse_InterShard();
		let role = ShardMemory.isPrimaryShard() ? "primary" : "follower";

			if (pulseActive) {
			ShardMemory.updateLocal(payload => {
				payload.summary.role = role;
				payload.summary.intershard_pulse = true;
				this._writeManifestToPayload(payload, manifest);
			});

			if (ShardMemory.isPrimaryShard()) {
				this._runPrimaryCycle();
			} else {
				this._runFollowerCycle();
			}
		}

		this._recordMetrics(manifest, role);
	},

	_ensureBootstrapped: function () {
		if (this._bootstrapped)
			return;

		_.set(Memory, ["hive", "ism", "last_run"], Game.time);
		if (!_.has(Memory, ["hive", "ism", "primary"])) {
			ShardMemory.setPrimaryShardName(ShardMemory.getPrimaryShardName());
		}

		this._bootstrapped = true;
	},

	_runPrimaryCycle: function () {
		let remotes = ShardMemory.readAllRemotes();
		let localPayload = ShardMemory.getLocalPayload();

		let aggregated = this._aggregateRemoteData(remotes, localPayload);

		_.set(Memory, ["hive", "ism", "primary_snapshot"], aggregated);
		_.set(Memory, ["hive", "ism", "last_primary_cycle"], Game.time);

		let handshakeCount = 0;
		ShardMemory.updateLocal(payload => {
			// Distribute handshake offers FIRST, before overwriting directives.shards
			let handshakePending = _.get(payload, ["handshake", "pending"], {});
			let handshakesByDestination = {};
			
			_.each(handshakePending, (offer, creepName) => {
				let destinationShard = _.get(offer, "destination_shard");
				if (destinationShard && destinationShard !== Game.shard.name) {
					if (!handshakesByDestination[destinationShard]) {
						handshakesByDestination[destinationShard] = { pending: {}, acknowledgements: {}, completions: {} };
					}
					handshakesByDestination[destinationShard].pending[creepName] = offer;
					handshakeCount++;
				}
			});
			
			// Now set directives.shards with aggregated data
			payload.directives.shards = aggregated.remoteSummaries;
			payload.directives.global_manifest = aggregated.globalCount;
			payload.directives.last_remote_scan = Game.time;
			payload.summary.remote_shards = Object.keys(aggregated.remoteSummaries).length;
			payload.summary.remote_requests_total = aggregated.requestsTotal;
			
		// Merge handshake data into each shard's directive
		_.each(handshakesByDestination, (handshakeData, shardName) => {
			if (!_.has(payload.directives.shards, shardName)) {
				payload.directives.shards[shardName] = {};
			}
			payload.directives.shards[shardName].handshake = handshakeData;
		});
		});
		
		if (handshakeCount > 0) {
			console.log(`<font color="#4ECDC4">[InterShard]</font> PRIMARY: Distributed ${handshakeCount} handshake offers`);
		}

		// Process acknowledgments from follower shards and complete handshakes
		let acksProcessed = 0;
		let acksFromFollowers = _.get(aggregated, ["handshake", "acknowledgements"], {});
		if (_.size(acksFromFollowers) > 0) {
			ShardMemory.updateLocal(payload => {
				_.each(acksFromFollowers, (ack, creepName) => {
					// If we have a pending offer for this creep and received an ack, complete it
					if (_.has(payload.handshake.pending, creepName)) {
						let offer = payload.handshake.pending[creepName];
						
						// Move to completions
						if (!_.isObject(payload.handshake.completions))
							payload.handshake.completions = {};
						
						payload.handshake.completions[creepName] = {
							origin_shard: _.get(offer, "origin_shard", Game.shard.name),
							destination_shard: _.get(offer, "destination_shard"),
							completed_at: Game.time,
							ack_received_from: _.get(ack, "shard", "unknown")
						};
						
					// Remove from pending
					delete payload.handshake.pending[creepName];
					acksProcessed++;
					
					console.log(`<font color="#4ECDC4">[InterShard]</font> PRIMARY: Completed handshake for ${creepName}`);
				}
			});
		});
		
		if (acksProcessed > 0) {
			console.log(`<font color="#4ECDC4">[InterShard]</font> PRIMARY: Processed ${acksProcessed} acknowledgments`);
		}
	}

		if (aggregated.primaryDirectiveUpdates.length > 0) {
			_.each(aggregated.primaryDirectiveUpdates, update => {
				ShardMemory.setShardDirective(update.shard, update.directive);
			});
		}
	},

	_runFollowerCycle: function () {
		let primaryPayload = ShardMemory.readPrimary();

		if (!primaryPayload) {
			console.log(`<font color="#FF6B6B">[InterShard]</font> FOLLOWER: No primary payload found!`);
			_.set(Memory, ["hive", "ism", "last_primary_seen"], null);
			return;
		}

		let directiveForFollower = _.get(primaryPayload, ["directives", "shards", Game.shard.name], null);
		let ackCount = 0;

	if (directiveForFollower) {
		let pending = _.get(directiveForFollower, ["handshake", "pending"], {});
		
		_.each(pending, (entry, creepName) => {
				if (!entry)
					return;
				let destination = _.get(entry, "destination_shard")
					|| _.get(entry, ["transfer_intent", "destination_shard"]);
				if (destination !== Game.shard.name)
					return;

				let transferData = _.get(entry, "transfer_data", null);
				if (!transferData && _.isFunction(_.get(ShardMemory, "getCreepTransfer"))) {
					let originShard = _.get(entry, "origin_shard");
					if (originShard && originShard !== Game.shard.name)
						transferData = ShardMemory.getCreepTransfer(originShard, creepName);
					if (!transferData)
						transferData = ShardMemory.getCreepTransfer(null, creepName);
				}

				if (_.isFunction(_.get(ShardMemory, "acknowledgeTransfer"))) {
				ShardMemory.acknowledgeTransfer(creepName, {
					origin_shard: _.get(entry, "origin_shard"),
					destination_shard: Game.shard.name,
					portal: _.get(entry, "portal"),
					transfer_time: _.get(entry, "transfer_time"),
					status: "ready",
					transfer_data: transferData
				});
				ackCount++;
				console.log(`<font color="#4ECDC4">[InterShard]</font> FOLLOWER: Acknowledged transfer for ${creepName}`);
			}
		});
	}
	
	if (ackCount > 0) {
		console.log(`<font color="#4ECDC4">[InterShard]</font> FOLLOWER: Sent ${ackCount} acknowledgements`);
	}

		_.set(Memory, ["hive", "ism", "follower_snapshot"], {
			tick: Game.time,
			primaryShard: ShardMemory.getPrimaryShardName(),
			heartbeat: primaryPayload.heartbeat,
			summary: primaryPayload.summary,
			directive: directiveForFollower
		});

		ShardMemory.updateLocal(payload => {
			payload.directives.primary = directiveForFollower;
			payload.summary.primary_heartbeat = primaryPayload.heartbeat;
			payload.summary.primary_tick = _.get(primaryPayload, ["summary", "tick"], null);
			payload.summary.primary_seen = Game.time;
		});
	},

	_aggregateRemoteData: function (remotes, localPayload) {
		let aggregated = {
			tick: Game.time,
			remoteSummaries: {},
			requests: {
				resource: [],
				creep: [],
				mission: []
			},
			globalManifest: {},
			globalCount: 0,
			requestsTotal: 0,
			primaryDirectiveUpdates: [],
			handshake: {
				pending: {},
				acknowledgements: {},
				completions: {}
			}
		};

		const queueTypes = ["resource", "creep", "mission"];

		_.each(remotes, (payload, shardName) => {
			aggregated.remoteSummaries[shardName] = {
				heartbeat: payload.heartbeat,
				summary: payload.summary,
				queues: {
					resource: _.size(_.get(payload, ["queues", "resource"], [])),
					creep: _.size(_.get(payload, ["queues", "creep"], [])),
					mission: _.size(_.get(payload, ["queues", "mission"], []))
				},
				updated: Game.time
			};

			_.each(queueTypes, queue => {
				let entries = _.get(payload, ["queues", queue], []);
				for (let entry of entries) {
					let withShard = _.assign({ shard: shardName }, entry);
					aggregated.requests[queue].push(withShard);
				}
			});

			let manifest = _.get(payload, ["global", "creeps"], {});
			_.each(manifest, (descriptor, creepName) => {
				aggregated.globalManifest[creepName] = _.assign({}, descriptor, {
					shard: shardName,
					last_remote: payload.heartbeat
				});
			});

		// Only aggregate acknowledgements and completions from remote shards
		// Pending offers should only come from the primary shard's local payload
		let handshake = _.get(payload, "handshake", {});
		if (_.isObject(handshake.acknowledgements))
			_.assign(aggregated.handshake.acknowledgements, handshake.acknowledgements);
		if (_.isObject(handshake.completions))
			_.assign(aggregated.handshake.completions, handshake.completions);
		});

		let localManifest = _.get(localPayload, ["global", "creeps"], {});
		_.each(localManifest, (descriptor, creepName) => {
			aggregated.globalManifest[creepName] = _.assign({}, descriptor, {
				shard: Game.shard.name,
				last_remote: Game.time
			});
		});

		let localHandshake = _.get(localPayload, "handshake", {});
		if (_.isObject(localHandshake.pending))
			_.assign(aggregated.handshake.pending, localHandshake.pending);
		if (_.isObject(localHandshake.acknowledgements))
			_.assign(aggregated.handshake.acknowledgements, localHandshake.acknowledgements);
		if (_.isObject(localHandshake.completions))
			_.assign(aggregated.handshake.completions, localHandshake.completions);

		aggregated.globalCount = _.size(aggregated.globalManifest);
		aggregated.requestsTotal = _.size(aggregated.requests.resource)
			+ _.size(aggregated.requests.creep)
			+ _.size(aggregated.requests.mission);

		let handshakeByDestination = {};
		_.each(aggregated.handshake.pending, (entry, creepName) => {
			let destination = _.get(entry, "destination_shard")
				|| _.get(entry, ["transfer_intent", "destination_shard"]);
			if (!destination)
				return;
			if (!handshakeByDestination[destination])
				handshakeByDestination[destination] = {};
			handshakeByDestination[destination][creepName] = _.assign({}, entry);
		});

		_.each(handshakeByDestination, (pending, shardName) => {
			aggregated.primaryDirectiveUpdates.push({
				shard: shardName,
				directive: {
					handshake: {
						pending: pending
					}
				}
			});
		});

		// Cap manifest size to prevent runaway growth
		if (aggregated.globalCount > 200) {
			let keys = Object.keys(aggregated.globalManifest);
			keys = _.takeRight(_.sortBy(keys), 200);
			let limited = {};
			for (let key of keys) {
				limited[key] = aggregated.globalManifest[key];
			}
			aggregated.globalManifest = limited;
			aggregated.globalCount = _.size(aggregated.globalManifest);
		}

		return aggregated;
	},

	_collectGlobalCreeps: function () {
		let manifest = {};

		_.each(Game.creeps, creep => {
			if (typeof creep.getGlobalDescriptor === "function") {
				let descriptor = creep.getGlobalDescriptor();
				if (descriptor != null) {
					manifest[creep.name] = descriptor;
				}
			} else if (_.get(creep, ["memory", "global", "active"], false)) {
				manifest[creep.name] = {
					status: _.get(creep, ["memory", "global", "status"], "active"),
					mission: _.get(creep, ["memory", "global", "mission"]),
					role: _.get(creep, ["memory", "role"]),
					shard: Game.shard.name,
					room: _.get(creep, ["room", "name"], null),
					ttl: creep.ticksToLive,
					last_update: Game.time
				};
			}
		});

		let previous = _.get(Memory, ["hive", "ism", "global", "local_manifest"], {});
		let previousKeys = Object.keys(previous);
		let currentKeys = Object.keys(manifest);
		let missing = _.difference(previousKeys, currentKeys);

		_.set(Memory, ["hive", "ism", "global", "local_manifest"], manifest);
		_.set(Memory, ["hive", "ism", "global", "last_sync"], Game.time);

		if (missing.length > 0) {
			_.set(Memory, ["hive", "ism", "global", "last_missing"], {
				tick: Game.time,
				creeps: missing
			});
		}

		return manifest;
	},

	_writeManifestToPayload: function (payload, manifest) {
		payload.global = payload.global || {
			creeps: {},
			history: []
		};

		let existing = payload.global.creeps || {};
		let history = payload.global.history || [];
		let now = Game.time;

		for (let name in existing) {
			if (!_.has(manifest, name)) {
				history.push({
					type: "remove",
					creep: name,
					tick: now,
					reason: "missing"
				});
				delete existing[name];
			}
		}

		_.each(manifest, (descriptor, name) => {
			let current = existing[name];
			let status = _.get(descriptor, "status", "active");

			if (!current) {
				history.push({
					type: "add",
					creep: name,
					tick: now,
					status: status
				});
			} else if (current.status != status) {
				history.push({
					type: "status",
					creep: name,
					from: current.status,
					to: status,
					tick: now
				});
			}

			existing[name] = _.assign({}, descriptor, {
				last_update: now,
				shard: Game.shard.name
			});
		});

		payload.global.creeps = existing;
		payload.global.history = history;
		payload.summary = payload.summary || {};
		payload.summary.global_local = _.size(manifest);
	},

	_recordMetrics: function (manifest, role) {
		_.set(Memory, ["hive", "ism", "role"], role);
		_.set(Memory, ["hive", "ism", "global", "count"], _.size(manifest));
		_.set(Memory, ["hive", "ism", "last_run"], Game.time);
	}
};


