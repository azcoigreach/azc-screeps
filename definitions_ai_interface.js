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
	MAX_AI_SCOUTS: 2,
	SCOUT_HISTORY_TICKS: 20000,
	REMOTE_OBJECTIVE_TICKS: 3000,
	ACTIONS: {
		NOOP: true,
		REQUEST_STATUS: true,
		SET_EXPLANATION: true,
		SET_OPERATIONAL_AUTHORITY: true,
		SET_EXECUTION_MODE: true,
		SCOUT_ROOM: true,
		REASSESS_REMOTE: true,
		ENSURE_REMOTE_RESERVATION: true,
		ENSURE_REMOTE_INFRASTRUCTURE: true,
		REBALANCE_REMOTE_LOGISTICS: true,
		START_REMOTE_MINING: true,
		COLONIZE_ROOM: true
	},
	OBSERVE_ACTIONS: {
		NOOP: true,
		REQUEST_STATUS: true,
		SET_EXPLANATION: true,
		SET_OPERATIONAL_AUTHORITY: true,
		SET_EXECUTION_MODE: true
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
		this._default(["ai", "policy", "autoScouting"], false, _.isBoolean);
		this._default(["ai", "policy", "allowRemoteMaintenance"], false, _.isBoolean);
		this._default(["ai", "policy", "autoRemoteMaintenance"], false, _.isBoolean);
		this._default(["ai", "policy", "allowNewRemotes"], false, _.isBoolean);
		this._default(["ai", "policy", "autoNewRemotes"], false, _.isBoolean);
		this._default(["ai", "policy", "allowColonization"], false, _.isBoolean);
		this._default(["ai", "policy", "autoColonization"], false, _.isBoolean);
		this._default(["ai", "policy", "intelligenceRadius"], 2, value => this._isInteger(value) && value >= 1 && value <= 5);
		this._default(["ai", "policy", "intelStaleTicks"], 10000, value => this._isInteger(value) && value >= 100);
		this._default(["ai", "policy", "reservationWarningTicks"], 2000, value => this._isInteger(value) && value >= 100 && value <= 5000);
		this._default(["ai", "policy", "maxConcurrentScouts"], 1, value => this._isInteger(value) && value >= 1 && value <= this.MAX_AI_SCOUTS);
		this._default(["ai", "policy", "minimumRemoteScore"], 65, value => this._isInteger(value) && value >= 0 && value <= 100);
		this._default(["ai", "policy", "minimumClaimScore"], 70, value => this._isInteger(value) && value >= 0 && value <= 100);
		this._default(["ai", "policy", "remoteExpansionCooldownTicks"], 10000, value => this._isInteger(value) && value >= 1000);
		this._default(["ai", "policy", "colonizationCooldownTicks"], 50000, value => this._isInteger(value) && value >= 5000);
		if (!_.isObject(_.get(Memory, ["ai", "policy", "roomOverrides"]))) _.set(Memory, ["ai", "policy", "roomOverrides"], {});

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
		if (!_.isObject(_.get(Memory, ["ai", "remoteObjectives"])) || _.isArray(_.get(Memory, ["ai", "remoteObjectives"])))
			_.set(Memory, ["ai", "remoteObjectives"], {});
		if (!_.isArray(_.get(Memory, ["ai", "scoutHistory"])))
			_.set(Memory, ["ai", "scoutHistory"], []);
		if (!_.isObject(_.get(Memory, ["ai", "establishments"]))) _.set(Memory, ["ai", "establishments"], {});
		if (!_.isObject(_.get(Memory, ["ai", "majorOperations"]))) _.set(Memory, ["ai", "majorOperations"], {});
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
			this._processActive();
			this._pruneOperations();
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
		if (order.action === "SET_OPERATIONAL_AUTHORITY") {
			let allowedKeys = ["scouting", "remoteMaintenance", "newRemotes", "colonization"];
			if (!_.has(order.parameters, "scouting") || !_.has(order.parameters, "remoteMaintenance") || _.some(keys, key => !_.includes(allowedKeys, key)))
				return "SET_OPERATIONAL_AUTHORITY requires scouting and remoteMaintenance, with optional newRemotes and colonization";
			if (!_.includes(["OFF", "MANUAL", "AUTO"], order.parameters.scouting))
				return "scouting authority must be OFF, MANUAL, or AUTO";
			if (!_.includes(["OFF", "MANUAL", "AUTO"], order.parameters.remoteMaintenance))
				return "remoteMaintenance authority must be OFF, MANUAL, or AUTO";
			if (_.has(order.parameters, "newRemotes") && !_.includes(["OFF", "MANUAL", "AUTO"], order.parameters.newRemotes))
				return "newRemotes authority must be OFF, MANUAL, or AUTO";
			if (_.has(order.parameters, "colonization") && !_.includes(["OFF", "MANUAL", "AUTO"], order.parameters.colonization))
				return "colonization authority must be OFF, MANUAL, or AUTO";
		}
		if (order.action === "SET_EXECUTION_MODE") {
			if (keys.length !== 1 || !_.has(order.parameters, "mode"))
				return "SET_EXECUTION_MODE requires only parameters.mode";
			if (!_.includes(["observe", "execute"], order.parameters.mode))
				return "mode must be observe or execute";
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
		if (_.includes([
			"REASSESS_REMOTE", "ENSURE_REMOTE_RESERVATION",
			"ENSURE_REMOTE_INFRASTRUCTURE", "REBALANCE_REMOTE_LOGISTICS"
		], order.action)) {
			if (keys.length !== 1 || !_.has(order.parameters, "room"))
				return `${order.action} requires only parameters.room`;
			if (!this._isRoomName(order.parameters.room))
				return `${order.action} room is invalid`;
			let site = _.get(Memory, ["sites", "mining", order.parameters.room]);
			if (!site || _.get(site, "colony") === order.parameters.room)
				return `${order.action} target is not an existing remote mining room`;
			let colony = _.get(Game, ["rooms", _.get(site, "colony")]);
			if (!colony || _.get(colony, ["controller", "my"], false) !== true)
				return `${order.action} remote colony is not owned and visible`;
		}
		if (_.includes(["START_REMOTE_MINING", "COLONIZE_ROOM"], order.action)) {
			let expectedKeys = order.action === "START_REMOTE_MINING" ? ["origin", "target"] : ["origin", "target", "layout"];
			if (keys.length !== expectedKeys.length || _.some(expectedKeys, key => !_.has(order.parameters, key)))
				return `${order.action} requires only ${expectedKeys.join(", ")}`;
			if (!this._isRoomName(order.parameters.origin) || !this._isRoomName(order.parameters.target))
				return `${order.action} origin and target must be valid room names`;
			let origin = _.get(Game, ["rooms", order.parameters.origin]);
			if (!origin || _.get(origin, ["controller", "my"], false) !== true)
				return `${order.action} origin is not an owned visible colony`;
			let eligibility = this._strategicEligibility(order.action, order.parameters);
			if (!eligibility.valid) return eligibility.reason;
		}
		return null;
	},

	_strategicEligibility: function (action, parameters) {
		let target = parameters.target;
		if (_.has(Memory, ["sites", "mining", target]))
			return action === "START_REMOTE_MINING" ? { valid: true, duplicate: true } : { valid: false, reason: "COLONIZE_ROOM target is already an operational mining room" };
		if (_.has(Memory, ["sites", "colonization", target]))
			return { valid: false, reason: `${action} target already has a colonization operation` };
		let intel = _.get(Memory, ["ai", "intelligence", "rooms", target]);
		if (!intel) return { valid: false, reason: `${action} requires known target intelligence` };
		let visibleTarget = _.get(Game, ["rooms", target]);
		if (_.get(visibleTarget, ["controller", "my"], false) === true)
			return { valid: false, reason: `${action} target is already owned` };
		if (_.get(visibleTarget, ["controller", "owner", "username"]) != null)
			return { valid: false, reason: `${action} target is visibly foreign-owned` };
		let age = Game.time - _.get(intel, "lastSeenTick", 0);
		if (age > _.get(Memory, ["ai", "policy", "intelStaleTicks"], 10000))
			return { valid: false, reason: `${action} target intelligence is stale` };
		if (_.get(intel, ["controller", "ownerRelation"]) !== "NEUTRAL")
			return { valid: false, reason: `${action} target is not neutral and unowned` };
		if (!_.includes(["NEUTRAL", "SELF"], _.get(intel, ["controller", "reservationRelation"])))
			return { valid: false, reason: `${action} target has an incompatible reservation` };
		if (_.get(intel, "routeStatus") !== "available")
			return { valid: false, reason: `${action} target route is not acceptable` };
		let override = _.get(Memory, ["ai", "policy", "roomOverrides", target]);
		if (_.includes(["EXCLUDE", action === "START_REMOTE_MINING" ? "NO_REMOTE" : "NO_COLONY"], override))
			return { valid: false, reason: `${action} is blocked by human room policy` };
		let candidates = action === "START_REMOTE_MINING" ? _.get(Memory, ["ai", "strategy", "remoteCandidates"], []) : _.get(Memory, ["ai", "strategy", "claimCandidates"], []);
		let candidate = _.find(candidates, item => item.room === target);
		if (!candidate || candidate.eligible !== true)
			return { valid: false, reason: `${action} target does not pass deterministic candidate validation` };
		if (_.get(candidate, "origin") !== parameters.origin)
			return { valid: false, reason: `${action} origin does not match the deterministic candidate origin` };
		let minimumScore = action === "START_REMOTE_MINING"
			? _.get(Memory, ["ai", "policy", "minimumRemoteScore"], 65)
			: _.get(Memory, ["ai", "policy", "minimumClaimScore"], 70);
		if (!_.isNumber(_.get(candidate, "score")) || candidate.score < minimumScore)
			return { valid: false, reason: `${action} candidate score is below policy minimum` };
		let routeResult = Game.map.findRoute(parameters.origin, target);
		if (!_.isArray(routeResult) || (parameters.origin !== target && _.get(_.last(routeResult), "room") !== target))
			return { valid: false, reason: `${action} authoritative route validation failed` };
		if (action === "COLONIZE_ROOM") {
			if (_.get(Game, ["gcl", "level"], 0) <= _.filter(_.get(Game, "rooms", {}), room => _.get(room, ["controller", "my"], false)).length)
				return { valid: false, reason: "COLONIZE_ROOM has no available GCL slot" };
			let validLayouts = _.get(intel, ["layoutAnalysis", "valid"], []);
			if (!_.isObject(parameters.layout) || validLayouts.length === 0)
				return { valid: false, reason: "COLONIZE_ROOM requires a deterministically valid layout" };
			let selectedLayout = _.find(validLayouts, option =>
				_.get(parameters.layout, "name") === _.get(option, "name")
				&& _.get(parameters.layout, ["origin", "x"]) === _.get(option, ["origin", "x"])
				&& _.get(parameters.layout, ["origin", "y"]) === _.get(option, ["origin", "y"]));
			if (!selectedLayout)
				return { valid: false, reason: "COLONIZE_ROOM layout does not match a deterministic feasible option" };
		}
		let colony = _.get(Game, ["rooms", parameters.origin]);
		let pop = _.get(Memory, ["ai", "metrics", "population", "colonies", parameters.origin]);
		let actual = _.sum(_.values(_.get(pop, "actual", {})));
		let expected = _.sum(_.values(_.get(pop, "expected", {})));
		if (_.get(colony, "energyCapacityAvailable", 0) < 550 || (expected > 0 && actual / expected < 0.6))
			return { valid: false, reason: `${action} origin spawn capacity or population is insufficient` };
		return { valid: true, candidate: candidate };
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
				let result = this._execute(order);
				if (!_.get(result, "asynchronous", false)) {
					this._removeActive(order.id);
					this._complete(order, _.isString(result) ? result : _.get(result, "message", "Action completed"));
				}
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
		if (_.includes([
			"REASSESS_REMOTE", "ENSURE_REMOTE_RESERVATION",
			"ENSURE_REMOTE_INFRASTRUCTURE", "REBALANCE_REMOTE_LOGISTICS"
		], order.action) && !_.get(Memory, ["ai", "policy", "allowRemoteMaintenance"], false))
			return "Existing remote maintenance is not authorized by policy";
		if (order.action === "START_REMOTE_MINING" && !_.get(Memory, ["ai", "policy", "allowNewRemotes"], false))
			return "New remote establishment is not authorized by policy";
		if (order.action === "COLONIZE_ROOM" && !_.get(Memory, ["ai", "policy", "allowColonization"], false))
			return "Permanent colonization is not authorized by policy";
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
		if (order.action === "SET_OPERATIONAL_AUTHORITY") {
			let scouting = order.parameters.scouting;
			let remotes = order.parameters.remoteMaintenance;
			let newRemotes = _.get(order.parameters, "newRemotes", "OFF");
			let colonization = _.get(order.parameters, "colonization", "OFF");
			_.set(Memory, ["ai", "policy", "allowScouting"], scouting !== "OFF");
			_.set(Memory, ["ai", "policy", "autoScouting"], scouting === "AUTO");
			_.set(Memory, ["ai", "policy", "allowRemoteMaintenance"], remotes !== "OFF");
			_.set(Memory, ["ai", "policy", "autoRemoteMaintenance"], remotes === "AUTO");
			_.set(Memory, ["ai", "policy", "allowNewRemotes"], newRemotes !== "OFF");
			_.set(Memory, ["ai", "policy", "autoNewRemotes"], newRemotes === "AUTO");
			_.set(Memory, ["ai", "policy", "allowColonization"], colonization !== "OFF");
			_.set(Memory, ["ai", "policy", "autoColonization"], colonization === "AUTO");
			return `Operational authority set: scouting=${scouting}, remoteMaintenance=${remotes}, newRemotes=${newRemotes}, colonization=${colonization}`;
		}
		if (order.action === "SET_EXECUTION_MODE") {
			_.set(Memory, ["ai", "mode"], order.parameters.mode);
			return `Commander mode set to ${order.parameters.mode}`;
		}
		if (order.action === "SCOUT_ROOM")
			return this._queueScoutMission(order);
		if (_.includes([
			"REASSESS_REMOTE", "ENSURE_REMOTE_RESERVATION",
			"ENSURE_REMOTE_INFRASTRUCTURE", "REBALANCE_REMOTE_LOGISTICS"
		], order.action))
			return this._delegateRemoteObjective(order);
		if (order.action === "START_REMOTE_MINING")
			return this._startRemoteMining(order);
		if (order.action === "COLONIZE_ROOM")
			return this._colonizeRoom(order);
		throw new Error("Unsupported action reached executor");
	},

	_startRemoteMining: function (order) {
		let origin = order.parameters.origin, target = order.parameters.target;
		if (_.has(Memory, ["sites", "mining", target]))
			return `Remote ${target} is already configured; no duplicate was created`;
		let eligibility = this._strategicEligibility(order.action, order.parameters);
		if (!eligibility.valid) throw new Error(eligibility.reason);
		let active = _.filter(_.values(_.get(Memory, ["ai", "establishments"], {})), operation =>
			!_.includes(["HEALTHY", "DEGRADED", "FAILED"], _.get(operation, "state")));
		if (active.length >= 1) throw new Error("Maximum concurrent new remote establishments reached");
		let last = _.get(Memory, ["ai", "majorOperations", "lastRemoteStartTick"]);
		if (_.isNumber(last) && Game.time - last < _.get(Memory, ["ai", "policy", "remoteExpansionCooldownTicks"], 10000))
			throw new Error("Remote expansion cooldown is active");
		let intel = _.get(Memory, ["ai", "intelligence", "rooms", target]);
		let routeResult = Game.map.findRoute(origin, target);
		let route = [origin].concat(_.map(_.isArray(routeResult) ? routeResult : [], step => step.room));
		if (_.last(route) !== target) route.push(target);
		_.set(Memory, ["sites", "mining", target], {
			colony: origin, has_keepers: false, list_route: _.uniq(route),
			spawn_assist: null, population: null, ai_managed: true, ai_order_id: order.id
		});
		_.set(Memory, ["ai", "establishments", target], {
			orderId: order.id, origin: origin, target: target, state: "CONFIGURING",
			createdTick: Game.time, updatedTick: Game.time, prediction: eligibility.candidate.predictedEconomics,
			candidateScore: eligibility.candidate.score, firstDeliveryTotal: _.get(Memory, ["ai", "metrics", "remotes", target, "energyDeliveredTotal"], 0),
			failureReason: null
		});
		_.set(Memory, ["ai", "majorOperations", "lastRemoteStartTick"], Game.time);
		return `START_REMOTE_MINING configured ${target} from ${origin} through AZC's existing mining system`;
	},

	_colonizeRoom: function (order) {
		let eligibility = this._strategicEligibility(order.action, order.parameters);
		if (!eligibility.valid) throw new Error(eligibility.reason);
		if (_.size(_.get(Memory, ["sites", "colonization"], {})) >= 1)
			throw new Error("Maximum concurrent colonizations reached");
		let last = _.get(Memory, ["ai", "majorOperations", "lastColonizationTick"]);
		if (_.isNumber(last) && Game.time - last < _.get(Memory, ["ai", "policy", "colonizationCooldownTicks"], 50000))
			throw new Error("Colonization cooldown is active");
		let origin = order.parameters.origin, target = order.parameters.target;
		let routeResult = Game.map.findRoute(origin, target);
		let route = [origin].concat(_.map(_.isArray(routeResult) ? routeResult : [], step => step.room));
		_.set(Memory, ["sites", "colonization", target], {
			from: origin, target: target, layout: order.parameters.layout, focus_defense: true,
			list_route: _.uniq(route), ai_managed: true, ai_order_id: order.id
		});
		_.set(Memory, ["ai", "majorOperations", "lastColonizationTick"], Game.time);
		return `COLONIZE_ROOM delegated ${target} to AZC's existing colonization system`;
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
		let concurrent = 0;
		_.each(_.get(Memory, "rooms", {}), roomMemory => {
			concurrent += _.filter(_.get(roomMemory, "scout_requests", []), request => {
				return request && request.ai_managed === true
					&& !_.includes(["COMPLETED", "FAILED", "EXPIRED"], _.get(request, "status"));
			}).length;
		});
		if (concurrent >= _.get(Memory, ["ai", "policy", "maxConcurrentScouts"], 1))
			throw new Error("Maximum concurrent AI scout missions reached");
		let existing = _.find(requests, request => request && request.ai_managed === true
			&& _.get(request, ["dest_pos", "roomName"]) === roomName
			&& request._completed !== true);
		if (existing)
			throw new Error(`Scout mission ${existing.id} already covers ${roomName}`);

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
			requested_tick: Game.time,
			rally_pos: rallyPos,
			dest_pos: { x: 25, y: 25, roomName: roomName, shard: _.get(Game, ["shard", "name"], "sim") },
			custom: { priority: 14, level: 1, body: "scout", name: null },
			list_route: _.uniq(route),
			spawn_rooms: null,
			creeps: [],
			spawned_total: 0,
			count: 1,
			respawn: false,
			wait_for_full_rally: false,
			patrol_mode: "station",
			rally_ready: false,
			status: "QUEUED",
			failure_reason: null
		};
		requests.push(mission);
		_.set(Memory, ["rooms", originName, "scout_requests"], requests);
		order.missionId = mission.id;
		order.targetRoom = roomName;
		order.origin = originName;
		order.state = "QUEUED";
		order.startedTick = Game.time;
		return { asynchronous: true, message: `Scout mission ${mission.id} queued for ${originName} -> ${roomName}` };
	},

	_delegateRemoteObjective: function (order) {
		let roomName = order.parameters.room;
		let objectives = _.get(Memory, ["ai", "remoteObjectives", roomName], {});
		let key = {
			REASSESS_REMOTE: "reassess",
			ENSURE_REMOTE_RESERVATION: "reservation",
			ENSURE_REMOTE_INFRASTRUCTURE: "infrastructure",
			REBALANCE_REMOTE_LOGISTICS: "logistics"
		}[order.action];
		let current = _.get(objectives, key);
		if (current && _.get(current, "expiresTick", 0) >= Game.time)
			throw new Error(`${order.action} already active for ${roomName}`);
		objectives[key] = {
			orderId: order.id,
			createdTick: Game.time,
			expiresTick: Game.time + this.REMOTE_OBJECTIVE_TICKS,
			reason: _.get(order, "reason", null)
		};
		_.set(Memory, ["ai", "remoteObjectives", roomName], objectives);
		return `${order.action} delegated to deterministic AZC remote controller for ${roomName}`;
	},

	_processActive: function () {
		let active = _.get(Memory, ["ai", "orders", "active"], []).slice();
		_.each(active, order => {
			if (order.action !== "SCOUT_ROOM")
				return;
			let mission = this._findScoutMission(order.missionId);
			let intel = _.get(Memory, ["ai", "intelligence", "rooms", order.targetRoom]);
			if (mission) {
				order.state = _.get(mission, "status", "QUEUED");
				order.scoutCreep = _.head(_.get(mission, "creeps", [])) || null;
			}
			if (intel && _.get(intel, "lastSeenTick", -1) >= _.get(order, "startedTick", Game.time)) {
				let completedTick = Game.time;
				if (mission) {
					mission.status = "COMPLETED";
					mission.completed_tick = completedTick;
					mission.intel_last_seen_tick = intel.lastSeenTick;
				}
				this._archiveScout(order, mission, "COMPLETED", null, intel.lastSeenTick);
				this._removeActive(order.id);
				this._complete(order, `Target ${order.targetRoom} observed; intelligence updated at tick ${intel.lastSeenTick}`, {
					targetRoom: order.targetRoom,
					origin: order.origin,
					scoutCreep: order.scoutCreep,
					requestedTick: order.startedTick,
					observedTick: _.get(mission, "observed_tick", intel.lastSeenTick),
					completedTick: completedTick,
					intelLastSeenTick: intel.lastSeenTick
				});
				return;
			}
			if (mission && _.includes(["FAILED", "EXPIRED"], mission.status)) {
				let terminal = mission.status;
				let reason = _.get(mission, "failure_reason", `Scout mission ${terminal.toLowerCase()}`);
				this._archiveScout(order, mission, terminal, reason, null);
				this._removeActive(order.id);
				this._reject(order.id, order.action, reason, terminal.toLowerCase());
				return;
			}
			if (order.expiresTick < Game.time) {
				if (mission) {
					mission.status = "EXPIRED";
					mission.failure_reason = "Scout order expired before observation";
					mission._completed = true;
				}
				this._archiveScout(order, mission, "EXPIRED", "Scout order expired before observation", null);
				this._removeActive(order.id);
				this._reject(order.id, order.action, "Scout order expired before target observation", "expired");
				return;
			}
			if (!mission) {
				this._archiveScout(order, null, "FAILED", "Scout mission disappeared before observation", null);
				this._removeActive(order.id);
				this._reject(order.id, order.action, "Scout mission failed before target observation", "failed");
			}
		});
	},

	_findScoutMission: function (missionId) {
		let found = null;
		_.each(_.get(Memory, "rooms", {}), roomMemory => {
			let mission = _.find(_.get(roomMemory, "scout_requests", []), request => request && request.id === missionId);
			if (mission)
				found = mission;
		});
		return found;
	},

	_archiveScout: function (order, mission, status, failureReason, intelTick) {
		let history = _.get(Memory, ["ai", "scoutHistory"], []);
		history.push({
			orderId: order.id,
			missionId: order.missionId,
			targetRoom: order.targetRoom,
			origin: order.origin,
			scoutCreep: _.get(order, "scoutCreep", _.head(_.get(mission, "creeps", [])) || null),
			status: status,
			requestedTick: _.get(order, "startedTick", null),
			observedTick: _.get(mission, "observed_tick", null),
			completedTick: status === "COMPLETED" ? Game.time : null,
			intelLastSeenTick: intelTick,
			failureReason: failureReason
		});
		this._trim(history, this.MAX_HISTORY);
	},

	_pruneOperations: function () {
		_.each(_.get(Memory, ["ai", "remoteObjectives"], {}), (objectives, room) => {
			_.each(_.keys(objectives), key => {
				if (_.get(objectives, [key, "expiresTick"], 0) < Game.time)
					delete objectives[key];
			});
			if (_.keys(objectives).length === 0)
				delete Memory.ai.remoteObjectives[room];
		});
		let history = _.get(Memory, ["ai", "scoutHistory"], []);
		_.set(Memory, ["ai", "scoutHistory"], _.filter(history, item => {
			let tick = _.get(item, "completedTick", _.get(item, "requestedTick", Game.time));
			return Game.time - tick <= this.SCOUT_HISTORY_TICKS;
		}));
	},

	_complete: function (order, message, details) {
		let completed = _.get(Memory, ["ai", "orders", "completed"]);
		let result = {
			id: order.id,
			action: order.action,
			status: "completed",
			message: message,
			tick: Game.time
		};
		if (details)
			result.details = details;
		completed.push(result);
		this._trim(completed, this.MAX_HISTORY);
		console.log(`[AI] Command completed: ${order.id} (${order.action})`);
	},

	_reject: function (id, action, reason, status) {
		let rejected = _.get(Memory, ["ai", "orders", "rejected"]);
		rejected.push({
			id: id,
			action: action,
			status: status || "rejected",
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
		let lastSchema = _.get(Memory, ["ai", "status", "observationSchemaVersion"]);
		let pulse = typeof isPulse_Mid === "function" ? isPulse_Mid() : (Game.time % 50 === 0);
		if (lastTick != null && lastSchema === AIObserver.SCHEMA_VERSION && !pulse)
			return;

		let serialized = AIObserver.serialize();
		if (this._writeSegment(AI_COMMANDER_SEGMENTS.TELEMETRY, serialized)) {
			_.set(Memory, ["ai", "status", "lastObservationTick"], Game.time);
			_.set(Memory, ["ai", "status", "observationSchemaVersion"], AIObserver.SCHEMA_VERSION);
		}
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
		_.set(Memory, ["ai", "status", "lastInterfaceError"], {
			message: message,
			detail: detail.slice(0, 500),
			tick: _.get(Game, "time", 0)
		});
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
			`Scouting: ${policy.allowScouting ? (policy.autoScouting ? "AUTO" : "allowed") : "disabled"}`,
			`Existing Remote Maintenance: ${policy.allowRemoteMaintenance ? (policy.autoRemoteMaintenance ? "AUTO" : "allowed") : "disabled"}`,
			`New Remote Establishment: ${policy.allowNewRemotes ? (policy.autoNewRemotes ? "AUTO" : "allowed") : "disabled"}`,
			`Colonization: ${policy.allowColonization ? (policy.autoColonization ? "AUTO" : "allowed") : "disabled"}`,
			`Offensive Combat: disabled`
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
	},

	consoleAuthority: function () {
		this.initMemory();
		let policy = _.get(Memory, ["ai", "policy"]);
		let output = [
			"=== AI AUTHORITY ===", "",
			`Mode: ${_.get(Memory, ["ai", "mode"], "observe").toUpperCase()}`,
			`SCOUT_ROOM: ${policy.allowScouting ? (policy.autoScouting ? "AUTO" : "MANUAL") : "DISABLED"}`,
			`REASSESS_REMOTE: ${policy.allowRemoteMaintenance ? (policy.autoRemoteMaintenance ? "AUTO" : "MANUAL") : "DISABLED"}`,
			`ENSURE_REMOTE_RESERVATION: ${policy.allowRemoteMaintenance ? (policy.autoRemoteMaintenance ? "AUTO" : "MANUAL") : "DISABLED"}`,
			`ENSURE_REMOTE_INFRASTRUCTURE: ${policy.allowRemoteMaintenance ? (policy.autoRemoteMaintenance ? "AUTO" : "MANUAL") : "DISABLED"}`,
			`REBALANCE_REMOTE_LOGISTICS: ${policy.allowRemoteMaintenance ? (policy.autoRemoteMaintenance ? "AUTO" : "MANUAL") : "DISABLED"}`,
			`START_REMOTE_MINING: ${policy.allowNewRemotes ? (policy.autoNewRemotes ? "AUTO" : "MANUAL") : "DISABLED"}`,
			"STOP_REMOTE_MINING: HUMAN GATED",
			`COLONIZE_ROOM: ${policy.allowColonization ? (policy.autoColonization ? "AUTO" : "MANUAL") : "DISABLED"}`,
			"ATTACK_ROOM: DISABLED", "MARKET: DISABLED", "PRODUCTION: DISABLED"
		].join("\n");
		console.log(output);
		return output;
	},

	consoleOperations: function () {
		this.initMemory();
		let output = JSON.stringify({
			activeOrders: _.get(Memory, ["ai", "orders", "active"], []),
			remoteObjectives: _.get(Memory, ["ai", "remoteObjectives"], {}),
			scoutHistory: _.get(Memory, ["ai", "scoutHistory"], []).slice(-10)
		}, null, 2);
		console.log(output);
		return output;
	},

	consoleRemoteOps: function () {
		this.initMemory();
		let output = JSON.stringify({
			authorized: _.get(Memory, ["ai", "policy", "allowRemoteMaintenance"], false),
			automatic: _.get(Memory, ["ai", "policy", "autoRemoteMaintenance"], false),
			objectives: _.get(Memory, ["ai", "remoteObjectives"], {})
		}, null, 2);
		console.log(output);
		return output;
	},

	consoleRoomPolicy: function (room, policy) {
		this.initMemory();
		if (!this._isRoomName(room)) return "[AI] Error: invalid room name.";
		if (!_.includes(["NONE", "PRIORITIZE", "EXCLUDE", "NO_REMOTE", "NO_COLONY"], policy))
			return "[AI] Error: policy must be NONE, PRIORITIZE, EXCLUDE, NO_REMOTE, or NO_COLONY.";
		if (policy === "NONE") delete Memory.ai.policy.roomOverrides[room];
		else _.set(Memory, ["ai", "policy", "roomOverrides", room], policy);
		return `[AI] Room policy for ${room}: ${policy}. Human policy overrides AI planning.`;
	}
};
