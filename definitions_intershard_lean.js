/* ***********************************************************
 *	[sec05b] DEFINITIONS: INTER-SHARD MEMORY (LEAN)
 * 
 *  ARCHITECTURE: ISM as Message Bus, Memory as Database
 *  - ISM carries ONLY: requests, acks, responses (real-time coordination)
 *  - Memory.hive.ism carries: persistent global state, creep registry, routes
 *  - Shard0 is single source of truth
 *  - Target ISM size: <20KB (well under 95KB limit)
 * *********************************************************** */

/* global InterShardMemory */

const SHARD_MEMORY_VERSION = 2;
const KNOWN_SHARDS = ["shard0", "shard1", "shard2", "shard3"];
const MAX_SERIALIZED_LENGTH = 95000;
const MAX_REQUEST_QUEUE = 16;  // Limit requests in ISM
const PRIMARY_SHARD = "shard0";

function _clone(object) {
	return JSON.parse(JSON.stringify(object));
}

global.ShardMemory = {

	VERSION: SHARD_MEMORY_VERSION,
	KNOWN_SHARDS,
	MAX_SERIALIZED_LENGTH,
	PRIMARY_SHARD,

	// =========================================================
	// INTER-SHARD REQUESTS (via ISM)
	// =========================================================
	// Shard N sends request to Shard0 asking for coordination
	// Example: "I want to transfer scou:f3d3 to shard1 via this route"
	
	submitRequest: function (requestId, requestData) {
		// Add request to ISM for shard0 to see
		if (!_.isString(requestId) || requestId.length === 0)
			return;

		this.updateLocal(payload => {
			if (!_.isObject(payload.requests))
				payload.requests = {};
			
			payload.requests[requestId] = _.assign({}, requestData || {}, {
				origin_shard: Game.shard.name,
				submitted_tick: Game.time,
				status: "pending"
			});

			// Trim old requests
			let keys = Object.keys(payload.requests);
			if (keys.length > MAX_REQUEST_QUEUE) {
				let sorted = _.sortBy(keys, k => _.get(payload.requests[k], "submitted_tick", 0));
				let toRemove = sorted.slice(0, keys.length - MAX_REQUEST_QUEUE);
				for (let key of toRemove)
					delete payload.requests[key];
			}
		});
	},

	getRequests: function () {
		// Shard0 reads requests from other shards
		let payload = this.getLocalPayload();
		return _.get(payload, "requests", {});
	},

	acknowledgeRequest: function (requestId) {
		// Shard0 acknowledges it processed the request
		this.updateLocal(payload => {
			if (_.has(payload, ["requests", requestId])) {
				let req = payload.requests[requestId];
				if (!_.isObject(payload.acknowledgements))
					payload.acknowledgements = {};
				payload.acknowledgements[requestId] = {
					request_id: requestId,
					origin_shard: _.get(req, "origin_shard"),
					acknowledged_tick: Game.time
				};
				delete payload.requests[requestId];
			}
		});
	},

	respondToRequest: function (requestId, response) {
		// Shard0 sends response back to requesting shard
		if (!_.isString(requestId) || requestId.length === 0)
			return;

		this.updateLocal(payload => {
			if (!_.isObject(payload.responses))
				payload.responses = {};
			
			payload.responses[requestId] = _.assign({}, response || {}, {
				request_id: requestId,
				responded_tick: Game.time,
				status: "resolved"
			});

			// Trim old responses
			let keys = Object.keys(payload.responses);
			if (keys.length > MAX_REQUEST_QUEUE) {
				let sorted = _.sortBy(keys, k => _.get(payload.responses[k], "responded_tick", 0));
				let toRemove = sorted.slice(0, keys.length - MAX_REQUEST_QUEUE);
				for (let key of toRemove)
					delete payload.responses[key];
			}
		});
	},

	getResponse: function (requestId) {
		// Non-primary shard checks for response to its request
		if (!_.isString(requestId) || requestId.length === 0)
			return null;
		
		let primary = this.readPrimary();
		if (!primary)
			return null;
		
		let response = _.get(primary, ["responses", requestId], null);
		return response;
	},

	deleteResponse: function (requestId) {
		// Primary shard cleans up old responses
		this.updateLocal(payload => {
			if (_.has(payload, ["responses", requestId])) {
				delete payload.responses[requestId];
			}
		});
	},

	// =========================================================
	// PERSISTENT GLOBAL REGISTRY (in Memory, not ISM)
	// =========================================================
	// All shards maintain their view of global state by querying shard0's Memory
	// This avoids bloating ISM with creep manifests

	registerGlobalCreep: function (name, descriptor) {
		// Store in Memory (unlimited size, persistent)
		if (!_.isString(name) || name.length === 0)
			return;

		_.set(Memory, ["hive", "ism", "global_creeps", name], _.assign({}, descriptor, {
			last_update: Game.time,
			shard: Game.shard.name
		}));
	},

	getGlobalCreepRegistry: function () {
		// Get all global creeps from Memory
		// Should primarily be queried on shard0
		return _.get(Memory, ["hive", "ism", "global_creeps"], {});
	},

	getCreepDescriptor: function (creepName) {
		// Get single creep from Memory
		return _.get(Memory, ["hive", "ism", "global_creeps", creepName], null);
	},

	removeGlobalCreep: function (creepName) {
		// Remove dead creep from Memory
		let registry = _.get(Memory, ["hive", "ism", "global_creeps"], {});
		if (registry[creepName]) {
			delete registry[creepName];
		}
	},

	// =========================================================
	// SHARD MANAGEMENT
	// =========================================================

	getPrimaryShardName: function () {
		return _.get(Memory, ["hive", "ism", "primary"], PRIMARY_SHARD);
	},

	setPrimaryShardName: function (name) {
		if (_.isString(name) && name.length > 0) {
			_.set(Memory, ["hive", "ism", "primary"], name);
		}
	},

	isPrimaryShard: function () {
		return Game.shard.name === this.getPrimaryShardName();
	},

	// =========================================================
	// CREEP TRANSFER MANAGEMENT (Legacy Compatibility)
	// =========================================================
	// Note: Transfer snapshots are the primary mechanism
	// These methods provide backward compatibility with old code

	getCreepTransfer: function (shardName, name) {
		if (!_.isString(name) || name.length === 0)
			return null;

		let payload = shardName ? this.readRemote(shardName) : this.getLocalPayload();
		if (!payload)
			return null;

		// Check for transfers in payload (legacy support)
		return _.get(payload, ["creep_transfers", name], null);
	},

	recordCreepTransfer: function (name, transferData) {
		if (!_.isString(name) || name.length === 0 || !transferData)
			return;

		this.updateLocal(payload => {
			if (!_.isObject(payload.creep_transfers))
				payload.creep_transfers = {};

			payload.creep_transfers[name] = _.assign({}, transferData, { transfer_time: Game.time });

			// Cap queue to MAX_REQUEST_QUEUE to stay lean
			let keys = Object.keys(payload.creep_transfers);
			if (keys.length > MAX_REQUEST_QUEUE) {
				let sorted = _.sortBy(keys, key => _.get(payload.creep_transfers[key], "transfer_time", 0));
				let toRemove = sorted.slice(0, keys.length - MAX_REQUEST_QUEUE);
				for (let k of toRemove) {
					delete payload.creep_transfers[k];
				}
			}
		});
	},

	deleteCreepTransfer: function (name) {
		if (!_.isString(name) || name.length === 0)
			return;

		this.updateLocal(payload => {
			if (_.has(payload, ["creep_transfers", name]))
				delete payload.creep_transfers[name];
		});
	},

	acknowledgeTransfer: function (name, details) {
		if (!_.isString(name) || name.length === 0)
			return;

		// In lean ISM, transfers are handled via transfer snapshots
		// This method provides legacy compatibility
		this.updateLocal(payload => {
			if (!_.isObject(payload.meta))
				payload.meta = {};
			if (!_.isObject(payload.meta.acks))
				payload.meta.acks = {};
			
			payload.meta.acks[name] = _.assign({}, details || {}, {
				acknowledged: Game.time,
				shard: Game.shard.name
			});
		});
	},

	// =========================================================
	// SHARD DIRECTIVES (Legacy Compatibility)
	// =========================================================

	setShardDirective: function (shardName, directive) {
		if (!_.isString(shardName) || shardName.length === 0)
			return;

		// Store directives in Memory (not ISM)
		_.set(Memory, ["hive", "ism", "directives", "shards", shardName], _.assign({}, directive, {
			updated: Game.time
		}));
	},

	getShardDirective: function (shardName) {
		return _.get(Memory, ["hive", "ism", "directives", "shards", shardName], null);
	},

	setPrimaryDirective: function (directive) {
		_.set(Memory, ["hive", "ism", "directives", "primary"], _.assign({}, directive || {}, {
			updated: Game.time
		}));
	},

	getPrimaryDirective: function () {
		return _.get(Memory, ["hive", "ism", "directives", "primary"], null);
	},

	// =========================================================
	// ISM PAYLOAD MANAGEMENT
	// =========================================================

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
				console.log(`[InterShard] updateLocal error: ${err.message}`);
			}
		}

		this._finalizePayload(payload, options.summaryOverrides);
		this._writeLocal(payload);
		
		// Update cache
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
			console.log(`[InterShard] Failed to parse remote (${shardName}): ${err.message}`);
			return null;
		}
	},

	readPrimary: function () {
		return this.readRemote(PRIMARY_SHARD);
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

	getLocalPayload: function () {
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
			global._localPayloadCache = payload;
			global._localPayloadCacheTick = Game.time;
			return payload;
		} catch (err) {
			console.log(`[InterShard] Parse error: ${err.message}`);
			return this._bootstrapPayload();
		}
	},

	// =========================================================
	// INTERNAL PAYLOAD MANAGEMENT
	// =========================================================

	_bootstrapPayload: function () {
		// Lean payload: only request/response structures
		return {
			version: this.VERSION,
			shard: Game.shard.name,
			heartbeat: Game.time,
			summary: {
				tick: Game.time,
				cpu_bucket: Game.cpu.bucket,
				creeps_total: _.size(Game.creeps),
				rooms_owned: _.size(_.filter(Game.rooms, r => _.get(r, ["controller", "my"], false)))
			},
			directives: { shards: {}, primary: null },  // Legacy compatibility
			creep_transfers: {}, // Small queue of transfer snapshots
			requests: {},       // Shard->Shard0 requests
			acknowledgements: {},  // Shard0 acks
			responses: {},      // Shard0 responses
			meta: {
				created: Game.time,
				version: this.VERSION
			}
		};
	},

	_coercePayload: function (payload) {
		// IMPORTANT: Only preserve lean ISM fields
		// Discard legacy bloat (creep_transfers, missions, handshake, etc.)
		let lean = {};

		lean.version = _.isNumber(payload.version) ? payload.version : this.VERSION;
		lean.shard = _.isString(payload.shard) ? payload.shard : Game.shard.name;
		lean.heartbeat = _.isNumber(payload.heartbeat) ? payload.heartbeat : Game.time;
		lean.summary = _.isObject(payload.summary) ? payload.summary : {};
		
		// Ensure directives has proper structure (legacy compatibility)
		lean.directives = _.isObject(payload.directives) ? payload.directives : {};
		if (!_.isObject(lean.directives.shards)) {
			lean.directives.shards = {};
		}
		if (lean.directives.primary === undefined) {
			lean.directives.primary = null;
		}

		// Keep a small creep transfer queue (lean)
		lean.creep_transfers = _.isObject(payload.creep_transfers) ? payload.creep_transfers : {};
		
		lean.requests = _.isObject(payload.requests) ? payload.requests : {};
		lean.acknowledgements = _.isObject(payload.acknowledgements) ? payload.acknowledgements : {};
		lean.responses = _.isObject(payload.responses) ? payload.responses : {};
		lean.meta = _.isObject(payload.meta) ? payload.meta : {};

		return lean;
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
		payload.heartbeat = Game.time;

		payload.summary = payload.summary || {};
		payload.summary.tick = Game.time;
		payload.summary.cpu_bucket = Game.cpu.bucket;
		payload.summary.creeps_total = _.size(Game.creeps);
		payload.summary.rooms_owned = _.size(_.filter(Game.rooms, room => _.get(room, ["controller", "my"], false)));

		if (summaryOverrides)
			_.assign(payload.summary, summaryOverrides);

		// Limit request queues strictly to stay lean
		let limitMap = function (obj, limit) {
			if (!_.isObject(obj)) return {};
			let keys = Object.keys(obj);
			if (keys.length <= limit) return obj;
			let limited = {};
			for (let key of keys.slice(-limit))
				limited[key] = obj[key];
			return limited;
		};

		payload.requests = limitMap(payload.requests, MAX_REQUEST_QUEUE);
		payload.acknowledgements = limitMap(payload.acknowledgements, MAX_REQUEST_QUEUE);
		payload.responses = limitMap(payload.responses, MAX_REQUEST_QUEUE);

		payload.meta = payload.meta || {};
		payload.meta.version = this.VERSION;
		payload.meta.shard = Game.shard.name;
		payload.meta.updated = Game.time;
	},

	_prepareForSerialization: function (payload) {
		let clone = _clone(payload);

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

	_writeLocal: function (payload) {
		let toSerialize = this._prepareForSerialization(payload);
		let json = JSON.stringify(toSerialize);

		if (json.length > this.MAX_SERIALIZED_LENGTH) {
			toSerialize = this._trimPayload(toSerialize);
			json = JSON.stringify(toSerialize);
		}

		if (json.length > this.MAX_SERIALIZED_LENGTH) {
			console.log(`[InterShard] WARNING: Payload exceeds limit (${json.length}b)`);
		}

		InterShardMemory.setLocal(json);
		payload.meta.serialized_length = json.length;
		payload.meta.last_write = Game.time;
	},

	_trimPayload: function (payload) {
		let trimmed = _clone(payload);

		// Aggressively trim request queues
		trimmed.requests = _.take(trimmed.requests || {}, Math.max(1, MAX_REQUEST_QUEUE / 2));
		trimmed.acknowledgements = _.take(trimmed.acknowledgements || {}, Math.max(1, MAX_REQUEST_QUEUE / 2));
		trimmed.responses = _.take(trimmed.responses || {}, Math.max(1, MAX_REQUEST_QUEUE / 2));

		return trimmed;
	}
};
