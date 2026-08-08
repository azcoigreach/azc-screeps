/* ***********************************************************
 *  DEFINITIONS: AI COMMANDER INTERFACE
 * *********************************************************** */

// Dedicated, shard-local Memory Segments. setActiveSegments takes effect on
// the following tick, so activation is requested independently of processing.
global.AI_COMMANDER_SEGMENTS = {
	TELEMETRY: 90,
	INBOX: 91,
	STATUS: 92
};

global.AIInterface = {

	SCHEMA_VERSION: 1,
	COMMANDER_STALE_TICKS: 500,
	MAX_INBOX_ORDERS: 25,
	MAX_PENDING: 25,
	MAX_ACTIVE: 10,
	MAX_HISTORY: 50,
	MAX_SEEN_IDS: 200,
	ACTIONS: {
		NOOP: true,
		REQUEST_STATUS: true,
		SET_EXPLANATION: true,
		SCOUT_ROOM: true
	},
	OBSERVE_ACTIONS: {
		NOOP: true,
		REQUEST_STATUS: true,
		SET_EXPLANATION: true
	},

	initMemory: function () {
		if (!_.isObject(_.get(Memory, "ai")) || _.isArray(_.get(Memory, "ai")))
			Memory.ai = {};

		this._default(["ai", "version"], this.SCHEMA_VERSION);
		this._default(["ai", "enabled"], false, _.isBoolean);
		this._default(["ai", "paused"], false, _.isBoolean);
		let mode = _.get(Memory, ["ai", "mode"]);
		if (mode !== "observe" && mode !== "execute")
			_.set(Memory, ["ai", "mode"], "observe");

		if (!_.isObject(_.get(Memory, ["ai", "policy"])) || _.isArray(_.get(Memory, ["ai", "policy"])))
			_.set(Memory, ["ai", "policy"], {});
		this._default(["ai", "policy", "posture"], "expansionist", _.isString);
		this._default(["ai", "policy", "allowExpansion"], false, _.isBoolean);
		this._default(["ai", "policy", "allowCombat"], false, _.isBoolean);
		this._default(["ai", "policy", "allowMarket"], false, _.isBoolean);
		this._default(["ai", "policy", "allowProduction"], false, _.isBoolean);
		this._default(["ai", "policy", "allowScouting"], false, _.isBoolean);
		this._default(["ai", "policy", "intelligenceRadius"], 2, value => this._isInteger(value) && value >= 1 && value <= 5);
		this._default(["ai", "policy", "intelStaleTicks"], 10000, value => this._isInteger(value) && value >= 100);

		if (!_.isObject(_.get(Memory, ["ai", "commander"])) || _.isArray(_.get(Memory, ["ai", "commander"])))
			_.set(Memory, ["ai", "commander"], {});
		this._default(["ai", "commander", "online"], false, _.isBoolean);
		this._default(["ai", "commander", "lastSeenTick"], null, value => value === null || this._isInteger(value));
		this._default(["ai", "commander", "lastOrderTick"], null, value => value === null || this._isInteger(value));

		if (!_.isObject(_.get(Memory, ["ai", "orders"])) || _.isArray(_.get(Memory, ["ai", "orders"])))
			_.set(Memory, ["ai", "orders"], {});
		_.each(["pending", "active", "completed", "rejected"], key => {
			if (!_.isArray(_.get(Memory, ["ai", "orders", key])))
				_.set(Memory, ["ai", "orders", key], []);
		});
		if (!_.isObject(_.get(Memory, ["ai", "orders", "seen"])) || _.isArray(_.get(Memory, ["ai", "orders", "seen"])))
			_.set(Memory, ["ai", "orders", "seen"], {});

		if (!_.isObject(_.get(Memory, ["ai", "status"])) || _.isArray(_.get(Memory, ["ai", "status"])))
			_.set(Memory, ["ai", "status"], {});
		this._default(["ai", "status", "lastObservationTick"], null, value => value === null || this._isInteger(value));
		this._default(["ai", "status", "lastDecision"], null);
		this._default(["ai", "status", "lastExplanation"], null);

		if (!_.isObject(_.get(Memory, ["ai", "transport"])) || _.isArray(_.get(Memory, ["ai", "transport"])))
			_.set(Memory, ["ai", "transport"], {});
		this._default(["ai", "transport", "lastInboxHash"], null);
		this._default(["ai", "transport", "lastError"], null);

		if (!_.isObject(_.get(Memory, ["ai", "metrics"])) || _.isArray(_.get(Memory, ["ai", "metrics"])))
			_.set(Memory, ["ai", "metrics"], {});
		if (!_.isObject(_.get(Memory, ["ai", "intelligence"])) || _.isArray(_.get(Memory, ["ai", "intelligence"])))
			_.set(Memory, ["ai", "intelligence"], { rooms: {}, hostileEvents: [] });
		if (!_.isObject(_.get(Memory, ["ai", "intelligence", "rooms"])))
			_.set(Memory, ["ai", "intelligence", "rooms"], {});
		if (!_.isArray(_.get(Memory, ["ai", "intelligence", "hostileEvents"])))
			_.set(Memory, ["ai", "intelligence", "hostileEvents"], []);
	},

	_default: function (path, value, validator) {
		let current = _.get(Memory, path);
		if (current === undefined || (validator && !validator(current)))
			_.set(Memory, path, value);
	},

	activateSegments: function () {
		try {
			if (typeof RawMemory !== "undefined" && _.isFunction(_.get(RawMemory, "setActiveSegments")))
				RawMemory.setActiveSegments([
					AI_COMMANDER_SEGMENTS.TELEMETRY,
					AI_COMMANDER_SEGMENTS.INBOX,
					AI_COMMANDER_SEGMENTS.STATUS
				]);
		} catch (err) {
			this._logError("Unable to activate Memory Segments", err);
		}
	},

	run: function () {
		try {
			this.initMemory();
			this._updateCommanderOnline();
			this._processInbox();
			this._processPending();
			this._updateCommanderOnline();
			this._publishObservation();
			this._publishStatus();
		} catch (err) {
			this._logError("AI interface tick failed safely", err);
		}
	},

	validateOrder: function (order) {
		if (!_.isObject(order) || _.isArray(order))
			return { valid: false, reason: "Order must be an object" };
		if (_.get(order, "schemaVersion") !== this.SCHEMA_VERSION)
			return { valid: false, reason: "Unsupported schema version" };
		if (!_.isString(_.get(order, "id")) || order.id.length < 1 || order.id.length > 128 || !/^[A-Za-z0-9_.:-]+$/.test(order.id))
			return { valid: false, reason: "Invalid command ID" };
		if (!_.isString(_.get(order, "action")) || !Object.prototype.hasOwnProperty.call(this.ACTIONS, order.action))
			return { valid: false, reason: "Unsupported action" };
		if (!_.isObject(_.get(order, "parameters")) || _.isArray(order.parameters))
			return { valid: false, reason: "Parameters must be an object" };
		if (!this._isInteger(order.createdTick))
			return { valid: false, reason: "createdTick must be an integer" };
		if (!this._isInteger(order.expiresTick))
			return { valid: false, reason: "expiresTick must be an integer" };
		if (order.expiresTick < order.createdTick)
			return { valid: false, reason: "expiresTick precedes createdTick" };
		if (order.createdTick > Game.time + 5)
			return { valid: false, reason: "createdTick is in the future" };
		if (order.expiresTick < Game.time)
			return { valid: false, reason: "Order expired" };
		if (_.has(Memory, ["ai", "orders", "seen", this._seenKey(order.id)]))
			return { valid: false, reason: "Duplicate command ID" };
		if (_.get(order, "reason") != null && (!_.isString(order.reason) || order.reason.length > 1000))
			return { valid: false, reason: "reason must be a string of at most 1000 characters" };

		let parameterError = this._validateParameters(order);
		if (parameterError)
			return { valid: false, reason: parameterError };
		if (!_.get(Memory, ["ai", "enabled"], false))
			return { valid: false, reason: "AI commander is disabled" };
		if (_.get(Memory, ["ai", "paused"], false))
			return { valid: false, reason: "AI commander is paused" };
		if (!_.get(Memory, ["ai", "commander", "online"], false))
			return { valid: false, reason: "External commander heartbeat is stale" };
		if (_.get(Memory, ["ai", "mode"], "observe") !== "execute"
			&& !Object.prototype.hasOwnProperty.call(this.OBSERVE_ACTIONS, order.action))
			return { valid: false, reason: "Observe mode prevents execution" };

		return { valid: true };
	},

	_validateParameters: function (order) {
		let keys = Object.keys(order.parameters);
		if ((order.action === "NOOP" || order.action === "REQUEST_STATUS") && keys.length > 0)
			return `${order.action} does not accept parameters`;
		if (order.action === "SET_EXPLANATION") {
			if (keys.length !== 1 || keys[0] !== "explanation")
				return "SET_EXPLANATION requires only parameters.explanation";
			if (!_.isString(order.parameters.explanation) || order.parameters.explanation.length < 1 || order.parameters.explanation.length > 2000)
				return "explanation must be a non-empty string of at most 2000 characters";
		}
		if (order.action === "SCOUT_ROOM") {
			if (keys.length !== 2 || !_.has(order.parameters, "room") || !_.has(order.parameters, "origin"))
				return "SCOUT_ROOM requires only parameters.room and parameters.origin";
			if (!this._isRoomName(order.parameters.room))
				return "SCOUT_ROOM room is invalid";
			if (!this._isRoomName(order.parameters.origin))
				return "SCOUT_ROOM origin is invalid";
			let origin = _.get(Game, ["rooms", order.parameters.origin]);
			if (!origin || _.get(origin, ["controller", "my"], false) !== true)
				return "SCOUT_ROOM origin is not an owned visible colony";
		}
		return null;
	},

	_isRoomName: function (value) {
		return _.isString(value) && /^[WE]\d+[NS]\d+$/.test(value);
	},

	_isInteger: function (value) {
		return _.isNumber(value) && isFinite(value) && Math.floor(value) === value;
	},

	_processInbox: function () {
		let raw = this._readSegment(AI_COMMANDER_SEGMENTS.INBOX);
		if (raw == null || raw.trim().length === 0)
			return;

		let hash = this._hash(raw);
		if (_.get(Memory, ["ai", "transport", "lastInboxHash"]) === hash)
			return;
		_.set(Memory, ["ai", "transport", "lastInboxHash"], hash);

		let payload;
		try {
			payload = JSON.parse(raw);
		} catch (err) {
			this._transportError("Malformed inbox JSON ignored");
			return;
		}

		let orders;
		let heartbeatTick;
		if (_.isObject(payload) && !_.isArray(payload) && _.isArray(payload.orders)) {
			if (payload.schemaVersion !== this.SCHEMA_VERSION || !this._isInteger(payload.tick)) {
				this._transportError("Malformed inbox envelope ignored");
				return;
			}
			orders = payload.orders;
			heartbeatTick = payload.tick;
		} else if (_.isObject(payload) && !_.isArray(payload) && _.get(payload, "action") != null) {
			orders = [payload];
			heartbeatTick = _.get(payload, "createdTick");
		} else {
			this._transportError("Inbox must contain an order or order envelope");
			return;
		}

		if (this._isInteger(heartbeatTick) && heartbeatTick <= Game.time + 5)
			_.set(Memory, ["ai", "commander", "lastSeenTick"], heartbeatTick);
		_.set(Memory, ["ai", "transport", "lastError"], null);

		if (orders.length > this.MAX_INBOX_ORDERS)
			this._transportError(`Inbox limited to ${this.MAX_INBOX_ORDERS} orders`);
		this._updateCommanderOnline();
		_.each(orders.slice(0, this.MAX_INBOX_ORDERS), order => this._receiveOrder(order));
	},

	_receiveOrder: function (order) {
		let id = _.isString(_.get(order, "id")) ? order.id : "<unknown>";
		let action = _.isString(_.get(order, "action")) ? order.action : "<unknown>";
		console.log(`[AI] Command received: ${id} (${action})`);

		let validation = this.validateOrder(order);
		if (!validation.valid) {
			if (id !== "<unknown>" && /^[A-Za-z0-9_.:-]+$/.test(id) && !_.has(Memory, ["ai", "orders", "seen", this._seenKey(id)]))
				this._rememberId(id);
			this._reject(id, action, validation.reason);
			return;
		}

		this._rememberId(order.id);
		_.set(Memory, ["ai", "commander", "lastOrderTick"], Game.time);
		let pending = _.get(Memory, ["ai", "orders", "pending"]);
		pending.push({
			id: order.id,
			action: order.action,
			parameters: order.parameters,
			createdTick: order.createdTick,
			expiresTick: order.expiresTick,
			receivedTick: Game.time,
			reason: _.get(order, "reason", null)
		});
		this._trim(pending, this.MAX_PENDING);
		console.log(`[AI] Command accepted: ${order.id} (${order.action})`);
	},

	_processPending: function () {
		let pending = _.get(Memory, ["ai", "orders", "pending"]);
		while (pending.length > 0) {
			let order = pending.shift();
			let gateReason = this._executionGateReason(order);
			if (gateReason) {
				this._reject(order.id, order.action, gateReason);
				continue;
			}

			let active = _.get(Memory, ["ai", "orders", "active"]);
			active.push(order);
			this._trim(active, this.MAX_ACTIVE);
			try {
				let message = this._execute(order);
				this._removeActive(order.id);
				this._complete(order, message);
			} catch (err) {
				this._removeActive(order.id);
				this._reject(order.id, order.action, `Execution failed: ${err.message}`);
			}
		}
	},

	_executionGateReason: function (order) {
		if (!_.get(Memory, ["ai", "enabled"], false))
			return "AI commander is disabled";
		if (_.get(Memory, ["ai", "paused"], false))
			return "AI commander is paused";
		if (_.get(Memory, ["ai", "mode"], "observe") !== "execute"
			&& !Object.prototype.hasOwnProperty.call(this.OBSERVE_ACTIONS, order.action))
			return "Observe mode prevents execution";
		if (order.action === "SCOUT_ROOM" && !_.get(Memory, ["ai", "policy", "allowScouting"], false))
			return "Scouting is not authorized by policy";
		if (order.expiresTick < Game.time)
			return "Order expired before execution";
		return null;
	},

	_execute: function (order) {
		if (order.action === "SET_EXPLANATION")
			_.set(Memory, ["ai", "status", "lastExplanation"], order.parameters.explanation);

		_.set(Memory, ["ai", "status", "lastDecision"], {
			id: order.id,
			action: order.action,
			tick: Game.time
		});

		if (order.action === "NOOP")
			return "No operation performed";
		if (order.action === "REQUEST_STATUS")
			return "Status published to segment 92";
		if (order.action === "SET_EXPLANATION")
			return "Explanation updated";
		if (order.action === "SCOUT_ROOM")
			return this._queueScoutMission(order);
		throw new Error("Unsupported action reached executor");
	},

	_queueScoutMission: function (order) {
		let roomName = order.parameters.room;
		let originName = order.parameters.origin;
		let origin = _.get(Game, ["rooms", originName]);
		if (!origin || _.get(origin, ["controller", "my"], false) !== true)
			throw new Error("Scout origin is no longer an owned visible colony");

		let requests = _.get(Memory, ["rooms", originName, "scout_requests"], []);
		if (!_.isArray(requests))
			requests = [];
		let existing = _.find(requests, request => request && request.ai_managed === true
			&& _.get(request, ["dest_pos", "roomName"]) === roomName
			&& request._completed !== true);
		if (existing)
			return `Scout mission ${existing.id} already covers ${roomName}`;

		let rally = _.head(_.filter(_.get(Game, "spawns", {}), spawn => _.get(spawn, ["room", "name"]) === originName));
		let rallyPos = rally && rally.pos
			? { x: rally.pos.x, y: rally.pos.y, roomName: originName, shard: _.get(Game, ["shard", "name"], "sim") }
			: { x: 25, y: 25, roomName: originName, shard: _.get(Game, ["shard", "name"], "sim") };
		let route = [originName];
		if (_.isFunction(_.get(Game, ["map", "findRoute"]))) {
			let result = Game.map.findRoute(originName, roomName);
			if (typeof ERR_NO_PATH !== "undefined" && result === ERR_NO_PATH)
				throw new Error(`No route from ${originName} to ${roomName}`);
			if (_.isArray(result))
				_.each(result, step => {
					if (step && _.isString(step.room) && _.last(route) !== step.room)
						route.push(step.room);
				});
		}
		if (_.last(route) !== roomName)
			route.push(roomName);

		let mission = {
			id: `ai-scout:${order.id}`,
			ai_managed: true,
			ai_order_id: order.id,
			colony: originName,
			colony_shard: _.get(Game, ["shard", "name"], "sim"),
			created: Game.time,
			rally_pos: rallyPos,
			dest_pos: { x: 25, y: 25, roomName: roomName, shard: _.get(Game, ["shard", "name"], "sim") },
			custom: { priority: 22, level: 1, body: "scout", name: null },
			list_route: _.uniq(route),
			spawn_rooms: null,
			creeps: [],
			spawned_total: 0,
			count: 1,
			respawn: false,
			wait_for_full_rally: false,
			patrol_mode: "station",
			rally_ready: false,
			status: "queued"
		};
		requests.push(mission);
		_.set(Memory, ["rooms", originName, "scout_requests"], requests);
		return `Scout mission ${mission.id} queued for ${originName} -> ${roomName}`;
	},

	_complete: function (order, message) {
		let completed = _.get(Memory, ["ai", "orders", "completed"]);
		completed.push({
			id: order.id,
			action: order.action,
			status: "completed",
			message: message,
			tick: Game.time
		});
		this._trim(completed, this.MAX_HISTORY);
		console.log(`[AI] Command completed: ${order.id} (${order.action})`);
	},

	_reject: function (id, action, reason) {
		let rejected = _.get(Memory, ["ai", "orders", "rejected"]);
		rejected.push({
			id: id,
			action: action,
			status: "rejected",
			reason: reason,
			tick: Game.time
		});
		this._trim(rejected, this.MAX_HISTORY);
		console.log(`[AI] Command rejected: ${id} (${reason})`);
	},

	_rememberId: function (id) {
		_.set(Memory, ["ai", "orders", "seen", this._seenKey(id)], Game.time);
		let seen = _.get(Memory, ["ai", "orders", "seen"]);
		let ids = Object.keys(seen);
		if (ids.length <= this.MAX_SEEN_IDS)
			return;
		ids.sort((left, right) => seen[left] - seen[right]);
		_.each(ids.slice(0, ids.length - this.MAX_SEEN_IDS), oldId => delete seen[oldId]);
	},

	_seenKey: function (id) {
		return `id:${id}`;
	},

	_removeActive: function (id) {
		let active = _.get(Memory, ["ai", "orders", "active"]);
		_.set(Memory, ["ai", "orders", "active"], _.filter(active, order => order.id !== id));
	},

	_trim: function (list, maximum) {
		if (list.length > maximum)
			list.splice(0, list.length - maximum);
	},

	_publishObservation: function () {
		if (typeof AIObserver === "undefined" || !this._segmentAvailable(AI_COMMANDER_SEGMENTS.TELEMETRY))
			return;
		let lastTick = _.get(Memory, ["ai", "status", "lastObservationTick"]);
		let pulse = typeof isPulse_Mid === "function" ? isPulse_Mid() : (Game.time % 50 === 0);
		if (lastTick != null && !pulse)
			return;

		let serialized = AIObserver.serialize();
		if (this._writeSegment(AI_COMMANDER_SEGMENTS.TELEMETRY, serialized))
			_.set(Memory, ["ai", "status", "lastObservationTick"], Game.time);
	},

	_publishStatus: function () {
		if (!this._segmentAvailable(AI_COMMANDER_SEGMENTS.STATUS))
			return;
		let completed = _.get(Memory, ["ai", "orders", "completed"], []);
		let rejected = _.get(Memory, ["ai", "orders", "rejected"], []);
		let status = {
			schemaVersion: this.SCHEMA_VERSION,
			tick: Game.time,
			shard: _.get(Game, ["shard", "name"], "sim"),
			interface: {
				enabled: _.get(Memory, ["ai", "enabled"], false),
				paused: _.get(Memory, ["ai", "paused"], false),
				mode: _.get(Memory, ["ai", "mode"], "observe")
			},
			commander: _.get(Memory, ["ai", "commander"]),
			orders: {
				pending: _.get(Memory, ["ai", "orders", "pending"], []).length,
				active: _.get(Memory, ["ai", "orders", "active"], []).length,
				completed: completed.length,
				rejected: rejected.length,
				recentResults: completed.slice(-10).concat(rejected.slice(-10)).sort((left, right) => left.tick - right.tick).slice(-10)
			},
			lastDecision: _.get(Memory, ["ai", "status", "lastDecision"]),
			lastExplanation: _.get(Memory, ["ai", "status", "lastExplanation"]),
			lastError: _.get(Memory, ["ai", "transport", "lastError"])
		};
		this._writeSegment(AI_COMMANDER_SEGMENTS.STATUS, JSON.stringify(status));
	},

	_readSegment: function (id) {
		try {
			if (!this._segmentAvailable(id))
				return null;
			return RawMemory.segments[id];
		} catch (err) {
			this._logError(`Unable to read segment ${id}`, err);
			return null;
		}
	},

	_writeSegment: function (id, value) {
		try {
			if (!this._segmentAvailable(id))
				return false;
			RawMemory.segments[id] = value;
			return true;
		} catch (err) {
			this._logError(`Unable to write segment ${id}`, err);
			return false;
		}
	},

	_segmentAvailable: function (id) {
		return typeof RawMemory !== "undefined"
			&& _.isObject(_.get(RawMemory, "segments"))
			&& typeof RawMemory.segments[id] !== "undefined";
	},

	_hash: function (value) {
		let hash = 2166136261;
		for (let i = 0; i < value.length; i++) {
			hash ^= value.charCodeAt(i);
			hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
		}
		return `${(hash >>> 0).toString(16)}:${value.length}`;
	},

	_updateCommanderOnline: function () {
		let lastSeen = _.get(Memory, ["ai", "commander", "lastSeenTick"]);
		let online = this._isInteger(lastSeen) && lastSeen <= Game.time + 5 && (Game.time - lastSeen) <= this.COMMANDER_STALE_TICKS;
		let wasOnline = _.get(Memory, ["ai", "commander", "online"], false);
		if (online !== wasOnline) {
			_.set(Memory, ["ai", "commander", "online"], online);
			console.log(online ? "[AI] External commander online." : "[AI] External commander stale/offline.");
		}
	},

	_transportError: function (message) {
		_.set(Memory, ["ai", "transport", "lastError"], { message: message, tick: Game.time });
		console.log(`[AI] ${message}`);
	},

	_logError: function (message, err) {
		let detail = err && err.message ? err.message : String(err);
		console.log(`[AI] ${message}: ${detail}`);
	},

	consoleStatus: function () {
		this.initMemory();
		let commander = _.get(Memory, ["ai", "commander"]);
		let lastSeen = _.get(commander, "lastSeenTick");
		let lastSeenText = lastSeen == null ? "Never" : `${Math.max(0, Game.time - lastSeen)} ticks ago`;
		let orders = _.get(Memory, ["ai", "orders"]);
		let decision = _.get(Memory, ["ai", "status", "lastDecision"]);
		let policy = _.get(Memory, ["ai", "policy"]);
		let lines = [
			"=== AI COMMANDER ===",
			"",
			`Enabled: ${_.get(Memory, ["ai", "enabled"]) ? "YES" : "NO"}`,
			`Paused: ${_.get(Memory, ["ai", "paused"]) ? "YES" : "NO"}`,
			`Mode: ${_.get(Memory, ["ai", "mode"]).toUpperCase()}`,
			`Commander: ${_.get(commander, "online", false) ? "ONLINE" : "OFFLINE"}`,
			`Last Seen: ${lastSeenText}`,
			"",
			`Pending Orders: ${orders.pending.length}`,
			`Active Orders: ${orders.active.length}`,
			`Completed Orders: ${orders.completed.length}`,
			`Rejected Orders: ${orders.rejected.length}`,
			"",
			"Last Decision:",
			decision == null ? "No decision received." : `${decision.action} (${decision.id}) at tick ${decision.tick}`,
			"",
			"Policy:",
			`Expansion: ${policy.allowExpansion ? "enabled" : "disabled"}`,
			`Combat: ${policy.allowCombat ? "enabled" : "disabled"}`,
			`Market: ${policy.allowMarket ? "enabled" : "disabled"}`,
			`Production: ${policy.allowProduction ? "enabled" : "disabled"}`,
			`Scouting: ${policy.allowScouting ? "enabled" : "disabled"}`
		];
		let output = lines.join("\n");
		console.log(output);
		return output;
	},

	consoleOrders: function () {
		this.initMemory();
		let orders = _.get(Memory, ["ai", "orders"]);
		let output = JSON.stringify({
			pending: orders.pending,
			active: orders.active,
			completed: orders.completed,
			rejected: orders.rejected
		}, null, 2);
		console.log(output);
		return output;
	},

	consoleExplain: function () {
		this.initMemory();
		let explanation = _.get(Memory, ["ai", "status", "lastExplanation"]);
		let output = explanation || "No explanation received.";
		console.log(output);
		return output;
	}
};
