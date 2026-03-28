/* ***********************************************************
 *	[sec05b] DEFINITIONS: INTER-SHARD MEMORY
 * *********************************************************** */

/* global InterShardMemory */

const SHARD_MEMORY_VERSION = 1;
const KNOWN_SHARDS = ["shard0", "shard1", "shard2", "shard3"];
const MAX_SERIALIZED_LENGTH = 95000;
const MAX_QUEUE_LENGTH = 32;
const MAX_HISTORY_LENGTH = 64;
const DEFAULT_PRIMARY_SHARD = "shard0";

function _clone(object) {
	// Safe structured clone via JSON (InterShard payload must be JSON serializable anyway)
	return JSON.parse(JSON.stringify(object));
}

function _limitArray(array, maxLength) {
	if (!Array.isArray(array))
		return [];
	if (array.length <= maxLength)
		return array;
	return array.slice(array.length - maxLength);
}

global.ShardMemory = {

	VERSION: SHARD_MEMORY_VERSION,
	KNOWN_SHARDS,
	MAX_SERIALIZED_LENGTH,
	MAX_QUEUE_LENGTH,
	MAX_HISTORY_LENGTH,

	// -----------------------------
	// Primary-Shard Mission Authority (Option A)
	// Missions are authoritative on the primary shard and keyed by creep name.
	// All shards read missions from the primary for restoration after portal transfer.

	registerMission: function (name, mission) {
		if (!_.isString(name) || name.length === 0)
			return;

		this.updateLocal(payload => {
			if (!_.isObject(payload.missions))
				payload.missions = {};
			payload.missions[name] = _.assign({}, mission || {}, { updated: Game.time });
		});
	},

	getMission: function (name) {
		if (!_.isString(name) || name.length === 0)
			return null;
		let primary = this.readPrimary();
		return _.get(primary, ["missions", name], null);
	},

	removeMission: function (name) {
		if (!_.isString(name) || name.length === 0)
			return;
		this.updateLocal(payload => {
			if (_.has(payload, ["missions", name]))
				delete payload.missions[name];
		});
	},

	markTransferStart: function (name, details) {
		if (!_.isString(name) || name.length === 0)
			return;
		this.updateLocal(payload => {
			if (!_.isObject(payload.missions))
				payload.missions = {};
			let mission = _.get(payload, ["missions", name], {});
			mission.transfer = _.assign({}, details || {}, {
				origin_shard: Game.shard.name,
				started: Game.time
			});
			mission.updated = Game.time;
			payload.missions[name] = mission;
		});
	},

	markTransferComplete: function (name, details) {
		if (!_.isString(name) || name.length === 0)
			return;
		this.updateLocal(payload => {
			if (!_.isObject(payload.missions))
				payload.missions = {};
			let mission = _.get(payload, ["missions", name], {});
			mission.transfer = _.assign({}, mission.transfer, details || {}, {
				completed: Game.time,
				destination_shard: Game.shard.name
			});
			mission.current_shard = Game.shard.name;
			mission.updated = Game.time;
			payload.missions[name] = mission;
		});
	},

	restoreCreepFromMission: function (creep) {
		if (!creep || !creep.name)
			return false;
		if (_.get(creep.memory, "_mission_restored") === true)
			return true;
		let mission = this.getMission(creep.name);
		if (!mission)
			return false;

		// Minimal restoration: set role and attach mission_data; avoid overriding existing role-specific memory.
		if (!_.has(creep.memory, "role") && _.isString(_.get(mission, "role")))
			creep.memory.role = mission.role;
		let missionData = _.cloneDeep(mission);
		// Do not blindly overwrite creep.memory; attach under global.mission_data
		_.set(creep.memory, ["global", "mission_data"], missionData);
		creep.memory._mission_restored = true;
		creep.memory._last_mission_restore = Game.time;

		// If a transfer was in progress and destination is this shard, mark it complete
		if (_.isObject(mission.transfer) && _.get(mission, ["transfer", "destination_shard"]) === Game.shard.name && !_.get(mission, ["transfer", "completed"])) {
			this.markTransferComplete(creep.name, {
				restored: Game.time
			});
		}

		return true;
	},

	restoreAllCreeps: function () {
		// Universal restoration pass for newly arrived creeps on any shard
		for (let name in Game.creeps) {
			let creep = Game.creeps[name];
			this.restoreCreepFromMission(creep);
		}
	},

	getPrimaryShardName: function () {
		return _.get(Memory, ["hive", "ism", "primary"], DEFAULT_PRIMARY_SHARD);
	},

	setPrimaryShardName: function (name) {
		if (_.isString(name) && name.length > 0) {
			_.set(Memory, ["hive", "ism", "primary"], name);
		}
	},

	isPrimaryShard: function () {
		return Game.shard.name == this.getPrimaryShardName();
	},

	getLocalPayload: function () {
		// Use in-memory cache if available (same tick)
		if (global._localPayloadCache && global._localPayloadCacheTick === Game.time) {
			return global._localPayloadCache;
		}
		
		let raw = InterShardMemory.getLocal();
		if (!raw) {
			return this._bootstrapPayload();
		}

		try {
			let parsed = JSON.parse(raw);
			let payload = this._coercePayload(parsed);
			// Cache for this tick
			global._localPayloadCache = payload;
			global._localPayloadCacheTick = Game.time;
			return payload;
		} catch (err) {
			console.log(`[InterShard] Failed to parse local payload: ${err.message}`);
			return this._bootstrapPayload();
		}
	},

	updateLocal: function (mutator, options) {
		options = options || {};

		let payload = this.getLocalPayload();

		if (!_.isNumber(payload.version) || payload.version != this.VERSION) {
			payload = this._upgradePayload(payload);
		}

		if (_.isFunction(mutator)) {
			try {
				mutator(payload);
			} catch (err) {
				console.log(`[InterShard] updateLocal mutator error: ${err.message}`);
			}
		}

	this._finalizePayload(payload, options.summaryOverrides);
	this._writeLocal(payload);
	
	// Update cache with the modified payload
	global._localPayloadCache = payload;
	global._localPayloadCacheTick = Game.time;

	return payload;
	},

	replaceLocal: function (payload) {
		payload = this._coercePayload(payload || {});
		this._finalizePayload(payload);
		this._writeLocal(payload);
	},

	readRemote: function (shardName) {
		if (!_.isString(shardName) || shardName.length == 0) {
			return null;
		}

		if (shardName == Game.shard.name) {
			return this.getLocalPayload();
		}

		try {
			let raw = InterShardMemory.getRemote(shardName);
			if (!raw) {
				return null;
			}
			let parsed = JSON.parse(raw);
			return this._coercePayload(parsed);
		} catch (err) {
			console.log(`[InterShard] Failed to parse remote payload (${shardName}): ${err.message}`);
			return null;
		}
	},

	readPrimary: function () {
		return this.readRemote(this.getPrimaryShardName());
	},

	readAllRemotes: function () {
		let result = new Object();
		_.each(this.KNOWN_SHARDS, shard => {
			if (shard == Game.shard.name)
				return;
			let payload = this.readRemote(shard);
			if (payload != null) {
				result[shard] = payload;
			}
		});
		return result;
	},

	registerGlobalCreep: function (name, descriptor) {
		if (!_.isString(name) || name.length == 0)
			return null;

		return this.updateLocal(payload => {
			if (!_.has(payload, ["global", "creeps"])) {
				_.set(payload, ["global", "creeps"], {});
			}

			let manifest = payload.global.creeps;
			let existing = _.get(manifest, name, {});
			let merged = _.assign({}, existing, descriptor, {
				last_update: Game.time,
				shard: Game.shard.name
			});

			manifest[name] = merged;

			payload.global.history = _limitArray(payload.global.history, MAX_HISTORY_LENGTH);
			payload.global.history.push({
				type: "update",
				creep: name,
				tick: Game.time,
				status: _.get(merged, "status", "unknown")
			});
		});
	},

	removeGlobalCreep: function (name, reason) {
		if (!_.isString(name) || name.length == 0)
			return;

		this.updateLocal(payload => {
			let manifest = _.get(payload, ["global", "creeps"], {});
			if (_.has(manifest, name)) {
				delete manifest[name];

				payload.global.history = _limitArray(payload.global.history, MAX_HISTORY_LENGTH);
				payload.global.history.push({
					type: "remove",
					creep: name,
					tick: Game.time,
					reason: reason || "removed"
				});
			}
		});
	},

	recordCreepTransfer: function (name, transferData, options) {
		if (!_.isString(name) || name.length == 0 || transferData == null)
			return;

		options = options || {};

		let debugTransfers = Memory && _.get(Memory, ["hive", "ism", "debug_transfers"]);
		let includeHandshake = _.get(options, "handshake", true);
		let handshakeOverrides = _.isObject(includeHandshake) ? includeHandshake : null;
		let includeDescriptor = _.isObject(_.get(options, "descriptor"));
		let attachTransferData = debugTransfers || _.get(options, "includeTransferData", false);
		let descriptorInput = _.get(options, "descriptor", null);

		this.updateLocal(payload => {
			if (!_.isObject(payload.creep_transfers))
				payload.creep_transfers = {};

			// Drop stale transfer records to keep the queue fresh
			let maxAge = 500;
			_.forEach(payload.creep_transfers, (entry, key) => {
				let transferTime = _.get(entry, "transfer_time", 0);
				if (transferTime > 0 && transferTime + maxAge < Game.time)
					delete payload.creep_transfers[key];
			});

			// Overwrite existing entry to keep insertion order recent
			if (_.has(payload.creep_transfers, name))
				delete payload.creep_transfers[name];

			payload.creep_transfers[name] = transferData;

			let keys = Object.keys(payload.creep_transfers);
			if (keys.length > this.MAX_QUEUE_LENGTH) {
				let sorted = _.sortBy(keys, key => _.get(payload.creep_transfers[key], "transfer_time", 0));
				let toRemove = sorted.slice(0, keys.length - this.MAX_QUEUE_LENGTH);
				for (let removeKey of toRemove)
					delete payload.creep_transfers[removeKey];
			}


			if (includeHandshake !== false) {
				if (!_.isObject(payload.handshake))
					payload.handshake = { pending: {}, acknowledgements: {}, completions: {} };
				if (!_.isObject(payload.handshake.pending))
					payload.handshake.pending = {};
				if (!_.isObject(payload.handshake.acknowledgements))
					payload.handshake.acknowledgements = {};
				if (!_.isObject(payload.handshake.completions))
					payload.handshake.completions = {};

				let existing = _.get(payload.handshake.pending, name, {});

				let handshakeEntry = _.assign({
					origin_shard: _.get(handshakeOverrides, "origin_shard", Game.shard.name),
					destination_shard: _.get(handshakeOverrides, "destination_shard", _.get(transferData, "destination_shard")),
					destination_room: _.get(handshakeOverrides, "destination_room", _.get(transferData, "destination_room", null)),
					transfer_time: _.get(handshakeOverrides, "transfer_time", _.get(transferData, "transfer_time", Game.time)),
					portal: _.get(handshakeOverrides, "portal", _.get(transferData, "portal")),
					transfer_intent: _.get(handshakeOverrides, "transfer_intent", _.get(transferData, "transfer_intent")),
					scout_request_id: _.get(handshakeOverrides, "scout_request_id", _.get(transferData, "scout_request_id")),
					status: _.get(handshakeOverrides, "status", "offered"),
					created: _.get(existing, "created", Game.time),
					updated: Game.time
				}, handshakeOverrides || {});

				if (attachTransferData)
					handshakeEntry.transfer_data = transferData;
				else if (_.has(handshakeEntry, "transfer_data"))
					delete handshakeEntry.transfer_data;

				payload.handshake.pending[name] = handshakeEntry;

				if (_.has(payload.handshake.acknowledgements, name))
					delete payload.handshake.acknowledgements[name];
				if (_.has(payload.handshake.completions, name))
					delete payload.handshake.completions[name];
			}

			if (includeDescriptor && descriptorInput != null) {
				if (!_.isObject(payload.global))
					payload.global = { creeps: {}, history: [] };
				if (!_.isObject(payload.global.creeps))
					payload.global.creeps = {};
				if (!Array.isArray(payload.global.history))
					payload.global.history = [];

				let manifest = payload.global.creeps;
				let merged = _.assign({}, _.get(manifest, name, {}), descriptorInput, {
					last_update: Game.time,
					shard: Game.shard.name
				});

				manifest[name] = merged;
				payload.global.history = _limitArray(payload.global.history, MAX_HISTORY_LENGTH);
				payload.global.history.push({
					type: "update",
					creep: name,
					tick: Game.time,
					status: _.get(merged, "status", "unknown")
				});
			}
		});
	},

	registerTransferOffer: function (name, offer) {
		if (!_.isString(name) || name.length == 0)
			return;

		let payloadOffer = _.assign({
			origin_shard: Game.shard.name,
			created: Game.time,
			status: "offered"
		}, offer || {});

		this.updateLocal(payload => {
			if (!_.isObject(payload.handshake))
				payload.handshake = { pending: {}, acknowledgements: {}, completions: {} };
			if (!_.isObject(payload.handshake.pending))
				payload.handshake.pending = {};

			let existing = _.get(payload.handshake.pending, name, {});
			payload.handshake.pending[name] = _.assign({}, existing, payloadOffer, {
				updated: Game.time
			});

			if (_.isObject(payload.creep_transfers) && _.has(payload.creep_transfers, name)) {
				if (Memory && _.get(Memory, ["hive", "ism", "debug_transfers"])) {
					payload.handshake.pending[name].transfer_data = payload.creep_transfers[name];
				} else {
					delete payload.handshake.pending[name].transfer_data;
				}
			}

		});
	},

	acknowledgeTransfer: function (name, details) {
		if (!_.isString(name) || name.length == 0)
			return;

		this.updateLocal(payload => {
			if (!_.isObject(payload.handshake))
				payload.handshake = { pending: {}, acknowledgements: {}, completions: {} };

			let pending = _.get(payload.handshake, ["pending", name], null);
			if (pending && _.get(pending, "status") !== "acknowledged") {
				pending.status = "acknowledged";
				pending.acknowledged = Game.time;
			}

			if (!_.isObject(payload.handshake.acknowledgements))
				payload.handshake.acknowledgements = {};

			let existing = _.get(payload.handshake.acknowledgements, name, null);
			if (!existing || _.get(existing, "status") !== "ready") {
				payload.handshake.acknowledgements[name] = _.assign({}, details || {}, {
					shard: Game.shard.name,
					status: _.get(details, "status", "ready"),
					updated: Game.time
				});
			}

		});
	},

	completeTransfer: function (name, details) {
		if (!_.isString(name) || name.length == 0)
			return;

		this.updateLocal(payload => {
			if (!_.isObject(payload.handshake))
				payload.handshake = { pending: {}, acknowledgements: {}, completions: {} };

			if (_.has(payload.handshake, ["pending", name]))
				delete payload.handshake.pending[name];

			if (!_.isObject(payload.handshake.completions))
				payload.handshake.completions = {};

			payload.handshake.completions[name] = _.assign({}, details || {}, {
				shard: Game.shard.name,
				status: _.get(details, "status", "restored"),
				updated: Game.time
			});
		});
	},

	clearTransferHandshake: function (name) {
		if (!_.isString(name) || name.length == 0)
			return;

		this.updateLocal(payload => {
			if (!_.isObject(payload.handshake))
				return;
			if (_.has(payload.handshake, ["pending", name]))
				delete payload.handshake.pending[name];
			if (_.has(payload.handshake, ["acknowledgements", name]))
				delete payload.handshake.acknowledgements[name];
			if (_.has(payload.handshake, ["completions", name]))
				delete payload.handshake.completions[name];
		});
	},

	getCreepTransfer: function (shardName, name) {
		if (!_.isString(name) || name.length == 0)
			return null;

		let payload = shardName ? this.readRemote(shardName) : this.getLocalPayload();
		if (!payload)
			return null;

		let transfer = _.get(payload, ["creep_transfers", name]);
		if (transfer)
			return transfer;

		// Backwards compatibility with legacy payloads
		return _.get(payload, ["transfers", name], null);
	},

	deleteCreepTransfer: function (name) {
		if (!_.isString(name) || name.length == 0)
			return;

		this.updateLocal(payload => {
			if (_.has(payload, ["creep_transfers", name]))
				delete payload.creep_transfers[name];
			if (_.has(payload, ["transfers", name]))
				delete payload.transfers[name];
		});
	},

	_getAggregatedHandshake: function () {
		if (this.isPrimaryShard()) {
			return _.get(Memory, ["hive", "ism", "primary_snapshot", "handshake"], {
				pending: {},
				acknowledgements: {},
				completions: {}
			});
		}

		let primaryPayload = this.readPrimary();
		return _.get(primaryPayload, "handshake", {
			pending: {},
			acknowledgements: {},
			completions: {}
		});
	},

	getHandshakeOffer: function (name, includeTransferData) {
		let entry = _.get(this._getAggregatedHandshake(), ["pending", name], null);
		if (entry && includeTransferData && !_.has(entry, "transfer_data")) {
			let enriched = _.assign({}, entry);
			let transfer = this.getCreepTransfer(null, name);
			if (!transfer) {
				let originShard = _.get(entry, "origin_shard");
				if (originShard && originShard !== Game.shard.name) {
					transfer = this.getCreepTransfer(originShard, name);
				}
			}
			if (transfer)
				enriched.transfer_data = transfer;
			entry = enriched;
		}

		if (entry || !includeTransferData) {
			return entry;
		}

		if (_.isFunction(_.get(ShardMemory, "getCreepTransfer"))) {
			let offers = this.readAllRemotes();
			for (let shard in offers) {
				let fromRemote = _.get(offers[shard], ["handshake", "pending", name], null);
				if (fromRemote) {
					entry = _.assign({}, fromRemote);
					if (includeTransferData && !_.has(entry, "transfer_data")) {
						let transfer = this.getCreepTransfer(shard, name);
						if (transfer)
							entry.transfer_data = transfer;
					}
					break;
				}
			}
		}
		return entry;
	},

	getHandshakeAck: function (name) {
		return _.get(this._getAggregatedHandshake(), ["acknowledgements", name], null);
	},

	getHandshakeCompletion: function (name) {
		return _.get(this._getAggregatedHandshake(), ["completions", name], null);
	},

	pushRequest: function (queue, request) {
		if (!_.isString(queue) || queue.length == 0)
			return;

		this.updateLocal(payload => {
			if (!_.has(payload, ["queues", queue])) {
				_.set(payload, ["queues", queue], []);
			}

			let entry = _.assign({
				id: `${queue}:${Game.time}:${Math.random().toString(36).substring(2, 7)}`,
				origin: Game.shard.name,
				tick: Game.time
			}, request);

			payload.queues[queue].push(entry);
			payload.queues[queue] = _limitArray(payload.queues[queue], MAX_QUEUE_LENGTH);
		});
	},

	recordReceipt: function (note) {
		this.updateLocal(payload => {
			payload.receipts.push({
				tick: Game.time,
				shard: Game.shard.name,
				message: note
			});
			payload.receipts = _limitArray(payload.receipts, MAX_QUEUE_LENGTH);
		});
	},

	setShardDirective: function (shardName, directive) {
		if (!_.isString(shardName) || shardName.length == 0)
			return;

		this.updateLocal(payload => {
			if (!_.has(payload, ["directives", "shards"])) {
				_.set(payload, ["directives", "shards"], {});
			}

			payload.directives.shards[shardName] = _.assign({}, directive, {
				updated: Game.time
			});
		});
	},

	setPrimaryDirective: function (directive) {
		this.updateLocal(payload => {
			payload.directives.primary = _.isObject(directive)
				? _.assign({}, directive, { updated: Game.time })
				: null;
		});
	},

	_bootstrapPayload: function () {
		return {
			version: this.VERSION,
			shard: Game.shard.name,
			primary: this.getPrimaryShardName(),
			heartbeat: Game.time,
			summary: {},
			queues: {
				resource: [],
				creep: [],
				mission: []
			},
			global: {
				creeps: {},
				history: []
			},
			missions: {},
			directives: {
				shards: {},
				primary: null
			},
			receipts: [],
			meta: {
				created: Game.time,
				version: this.VERSION
			}
		};
	},

	_coercePayload: function (payload) {
		let coerced = _.isObject(payload) ? payload : {};

		if (!_.isNumber(coerced.version)) {
			coerced.version = this.VERSION;
		}

		if (!_.isString(coerced.shard)) {
			coerced.shard = _.get(payload, "shard", Game.shard.name);
		}

		if (!_.isString(coerced.primary)) {
			coerced.primary = this.getPrimaryShardName();
		}

		if (!_.isNumber(coerced.heartbeat)) {
			coerced.heartbeat = Game.time;
		}

		if (!_.isObject(coerced.summary)) {
			coerced.summary = {};
		}

		if (!_.isObject(coerced.queues)) {
			coerced.queues = {
				resource: [],
				creep: [],
				mission: []
			};
		} else {
			_.each(["resource", "creep", "mission"], queue => {
				if (!Array.isArray(coerced.queues[queue]))
					coerced.queues[queue] = [];
			});
		}

		if (!_.isObject(coerced.global)) {
			coerced.global = {
				creeps: {},
				history: []
			};
		} else {
			if (!_.isObject(coerced.global.creeps))
				coerced.global.creeps = {};
			if (!Array.isArray(coerced.global.history))
				coerced.global.history = [];
		}

		if (!_.isObject(coerced.missions)) {
			coerced.missions = {};
		}

		if (!_.isObject(coerced.directives)) {
			coerced.directives = {
				shards: {},
				primary: null
			};
		} else {
			if (!_.isObject(coerced.directives.shards))
				coerced.directives.shards = {};
			if (_.has(coerced.directives, "primary") && !_.isObject(coerced.directives.primary))
				coerced.directives.primary = _.isNull(coerced.directives.primary) ? null : {};
		}

		if (!_.isObject(coerced.creep_transfers))
			coerced.creep_transfers = {};

		if (!_.isObject(coerced.handshake)) {
			coerced.handshake = {
				pending: {},
				acknowledgements: {},
				completions: {}
			};
		} else {
			if (!_.isObject(coerced.handshake.pending))
				coerced.handshake.pending = {};
			if (!_.isObject(coerced.handshake.acknowledgements))
				coerced.handshake.acknowledgements = {};
			if (!_.isObject(coerced.handshake.completions))
				coerced.handshake.completions = {};
		}

		if (!Array.isArray(coerced.receipts)) {
			coerced.receipts = [];
		}

		if (!_.isObject(coerced.meta)) {
			coerced.meta = {};
		}

		return coerced;
	},

	_upgradePayload: function (payload) {
		let upgraded = this._coercePayload(payload);
		upgraded.version = this.VERSION;
		upgraded.meta = upgraded.meta || {};
		upgraded.meta.upgraded = Game.time;
		return upgraded;
	},

	_finalizePayload: function (payload, summaryOverrides) {
		payload.version = this.VERSION;
		payload.shard = Game.shard.name;
		payload.primary = this.getPrimaryShardName();
		payload.heartbeat = Game.time;

		payload.summary = payload.summary || {};
		payload.summary.tick = Game.time;
		payload.summary.cpu_bucket = Game.cpu.bucket;
		payload.summary.cpu_used = Game.cpu.getUsed();
		payload.summary.gcl = _.get(Game, ["gcl", "level"]);
		payload.summary.gcl_progress = _.get(Game, ["gcl", "progress"]);
		payload.summary.gpl = _.get(Game, ["gpl", "level"]);
		payload.summary.rooms_owned = _.size(_.filter(Game.rooms, room => _.get(room, ["controller", "my"], false)));
		payload.summary.creeps_total = _.size(Game.creeps);

		if (summaryOverrides) {
			_.assign(payload.summary, summaryOverrides);
		}

		payload.queues.resource = _limitArray(payload.queues.resource, MAX_QUEUE_LENGTH);
		payload.queues.creep = _limitArray(payload.queues.creep, MAX_QUEUE_LENGTH);
		payload.queues.mission = _limitArray(payload.queues.mission, MAX_QUEUE_LENGTH);

		payload.global.history = _limitArray(payload.global.history, MAX_HISTORY_LENGTH);
		payload.receipts = _limitArray(payload.receipts, MAX_QUEUE_LENGTH);
		if (_.isObject(payload.creep_transfers)) {
			let keys = Object.keys(payload.creep_transfers);
			if (keys.length > MAX_QUEUE_LENGTH) {
				let limited = {};
				for (let key of keys.slice(-MAX_QUEUE_LENGTH))
					limited[key] = payload.creep_transfers[key];
				payload.creep_transfers = limited;
			}
		}

		payload.handshake = payload.handshake || {
			pending: {},
			acknowledgements: {},
			completions: {}
		};
		if (!_.isObject(payload.handshake.pending))
			payload.handshake.pending = {};
		if (!_.isObject(payload.handshake.acknowledgements))
			payload.handshake.acknowledgements = {};
		if (!_.isObject(payload.handshake.completions))
			payload.handshake.completions = {};

		let limitHandshake = function (obj, limit) {
			if (!_.isObject(obj))
				return {};
			let keys = Object.keys(obj);
			if (keys.length <= limit)
				return obj;
			let limited = {};
			for (let key of keys.slice(-limit))
				limited[key] = obj[key];
			return limited;
		};
		let handshakeLimit = Math.max(1, Math.floor(MAX_QUEUE_LENGTH / 2));
		payload.handshake.pending = limitHandshake(payload.handshake.pending, MAX_QUEUE_LENGTH);
		payload.handshake.acknowledgements = limitHandshake(payload.handshake.acknowledgements, handshakeLimit);
		payload.handshake.completions = limitHandshake(payload.handshake.completions, handshakeLimit);

		payload.directives = payload.directives || {
			shards: {},
			primary: null
		};
		if (!_.isObject(payload.directives.shards))
			payload.directives.shards = {};
		if (_.has(payload.directives, "primary") && !_.isObject(payload.directives.primary))
			payload.directives.primary = _.isNull(payload.directives.primary) ? null : {};

		payload.meta = payload.meta || {};
		payload.meta.version = this.VERSION;
		payload.meta.shard = Game.shard.name;
		payload.meta.updated = Game.time;
	},

	_writeLocal: function (payload) {
		let toSerialize = this._prepareForSerialization(payload);
		
		let json = JSON.stringify(toSerialize);

		if (json.length > this.MAX_SERIALIZED_LENGTH) {
			toSerialize = this._trimPayload(toSerialize);
			json = JSON.stringify(toSerialize);
		}

		if (json.length > this.MAX_SERIALIZED_LENGTH) {
			console.log(`[InterShard] Payload still exceeds size limit (${json.length}) after trimming; dropping history.`);
			if (_.has(toSerialize, ["global", "history"])) {
				toSerialize.global.history = [];
				json = JSON.stringify(toSerialize);
			}
		}

		InterShardMemory.setLocal(json);

		payload.meta.serialized_length = json.length;
		payload.meta.last_write = Game.time;
	},

	_prepareForSerialization: function (payload) {
		let clone = _clone(payload);

		// Purge undefined to save space
		function scrub(obj) {
			if (_.isArray(obj)) {
				for (let i = obj.length - 1; i >= 0; i--) {
					if (obj[i] === undefined || obj[i] === null) {
						obj.splice(i, 1);
					} else if (_.isObject(obj[i])) {
						scrub(obj[i]);
					}
				}
			} else if (_.isObject(obj)) {
				for (let key in obj) {
					if (obj[key] === undefined) {
						delete obj[key];
					} else if (_.isObject(obj[key])) {
						scrub(obj[key]);
					}
				}
			}
		}

		scrub(clone);
		return clone;
	},

	_trimPayload: function (payload) {
		let trimmed = _clone(payload);

		if (_.has(trimmed, ["global", "history"])) {
			trimmed.global.history = _limitArray(trimmed.global.history, Math.floor(MAX_HISTORY_LENGTH / 2));
		}

		if (_.has(trimmed, ["receipts"])) {
			trimmed.receipts = _limitArray(trimmed.receipts, Math.floor(MAX_QUEUE_LENGTH / 2));
		}

		if (_.has(trimmed, ["directives"])) {
			if (_.has(trimmed.directives, "shards")) {
				let limited = {};
				let entries = Object.keys(trimmed.directives.shards).slice(-4);
				for (let key of entries) limited[key] = trimmed.directives.shards[key];
				trimmed.directives.shards = limited;
			}
		}

		_.each(["resource", "creep", "mission"], queue => {
			if (_.has(trimmed, ["queues", queue])) {
				trimmed.queues[queue] = _limitArray(trimmed.queues[queue], Math.floor(MAX_QUEUE_LENGTH / 2));
			}
		});

		// Preserve creep_transfers but trim to keep most recent
		if (_.has(trimmed, ["creep_transfers"])) {
			let keys = Object.keys(trimmed.creep_transfers);
			if (keys.length > Math.floor(MAX_QUEUE_LENGTH / 2)) {
				let limited = {};
				let entries = keys.slice(-Math.floor(MAX_QUEUE_LENGTH / 2));
				for (let key of entries)
					limited[key] = trimmed.creep_transfers[key];
				trimmed.creep_transfers = limited;
			}
		}

		if (_.has(trimmed, ["handshake"])) {
			let trimMap = function (obj, limit) {
				if (!_.isObject(obj))
					return {};
				let keys = Object.keys(obj);
				if (keys.length <= limit)
					return obj;
				let limited = {};
				let entries = keys.slice(-limit);
				for (let key of entries)
					limited[key] = obj[key];
				return limited;
			};
			let limit = Math.max(1, Math.floor(MAX_QUEUE_LENGTH / 2));
			trimmed.handshake.pending = trimMap(trimmed.handshake.pending, Math.floor(MAX_QUEUE_LENGTH / 2));
			trimmed.handshake.acknowledgements = trimMap(trimmed.handshake.acknowledgements, limit);
			trimmed.handshake.completions = trimMap(trimmed.handshake.completions, limit);
		}

		// As a last resort, drop non-critical metadata
		if (_.has(trimmed, ["meta"])) {
			delete trimmed.meta;
		}

		return trimmed;
	},

	cleanupDeadCreeps: function () {
		// Aggressively clean up old creeps to keep payload under control
		// Since the ISM limit is tight (95KB), we need to be ruthless
		this.updateLocal(payload => {
			let manifest = _.get(payload, ["global", "creeps"], {});
			let removeThreshold = Game.time - 1000;  // Remove anything not updated in 1000 ticks
			let removed = [];
			
			for (let name in manifest) {
				let lastUpdate = _.get(manifest[name], "last_update", 0);
				// Only keep entries updated within last 1000 ticks
				if (lastUpdate < removeThreshold) {
					delete manifest[name];
					removed.push(name);
				}
			}
			
			// If still too many entries, trim down to only 20 most recent
			let keys = Object.keys(manifest);
			if (keys.length > 20) {
				let sorted = _.sortBy(keys, k => _.get(manifest[k], "last_update", 0));
				let toDelete = sorted.slice(0, keys.length - 20);
				for (let key of toDelete) {
					delete manifest[key];
					removed.push(key);
				}
			}
			
			if (removed.length > 0) {
				console.log(`[InterShard] Cleanup: Removed ${removed.length} old creeps from manifest`);
			}
		});
	}
};


