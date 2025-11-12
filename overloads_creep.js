/* ***********************************************************
 *	[sec01b] OVERLOADS: CREEP
 * *********************************************************** */

 Creep.prototype.isBoosted = function isBoosted() {
	for (let b in this.body) {
		if (this.body[b].boost) {
			return true;
		}
	}
	return false;
};

Creep.prototype.getBoosts = function getBoosts() {
	let minerals = new Array();
	for (let b in this.body) {
		if (this.body[b].boost && !minerals.includes(this.body[b].boost))
			minerals.push(this.body[b].boost);
	}

	return minerals;
};

Creep.prototype.isAlly = function isAlly() {
	let allyList = _.get(Memory, ["hive", "allies"]);
	return this.my || (allyList != null && allyList.indexOf(this.owner.username) >= 0);
};


Creep.prototype.isHostile = function isHostile() {
	let allyList = _.get(Memory, ["hive", "allies"]);
	return !this.my && (allyList == null || allyList.indexOf(this.owner.username) < 0);
};

Creep.prototype.hasPart = function hasPart(part) {
	return this.getActiveBodyparts(part) > 0;
};

Creep.prototype.isGlobal = function isGlobal() {
	if (_.get(this, ["memory", "global", "active"], false) === true)
		return true;

	let globalMemory = _.get(this, ["memory", "global"], null);
	if (_.isObject(globalMemory) && (
		_.has(globalMemory, "mission")
		|| _.has(globalMemory, "state")
		|| _.has(globalMemory, "target")
	))
		return true;

	if (_.has(this.memory, "shard_mission"))
		return true;

	if (_.has(this.memory, "transfer_intent"))
		return true;

	if (this.name && (this.name.startsWith("global:") || this.name.startsWith("colo:")))
		return true;

	return false;
};

Creep.prototype.ensureGlobal = function ensureGlobal(defaults) {
	defaults = defaults || {};

	let global = _.get(this, ["memory", "global"]);
	if (!_.isObject(global)) {
		global = {};
		_.set(this, ["memory", "global"], global);
	}

	if (!_.has(global, "mission") && _.has(this.memory, "shard_mission"))
		global.mission = _.get(this.memory, "shard_mission");

	if (!_.has(global, "target") && _.has(this.memory, "transfer_intent")) {
		let intent = _.get(this.memory, "transfer_intent", {});
		global.target = {
			shard: _.get(intent, "destination_shard"),
			room: _.get(intent, "destination_room")
		};
		if (_.isObject(_.get(intent, "portal_pos"))) {
			global.portal = _.get(intent, "portal_pos");
		}
	}

	if (!_.has(global, "mission") && this.name && this.name.startsWith("colo:"))
		global.mission = "colonization";

	if (!_.has(global, "created"))
		global.created = Game.time;

	if (!_.has(global, "origin") || !_.isObject(global.origin)) {
		global.origin = _.get(defaults, ["origin"], {
			shard: Game.shard.name,
			room: _.get(this.memory, "colony", _.get(this.memory, "room", _.get(this, ["room", "name"], null)))
		});
	} else if (_.isObject(defaults.origin)) {
		global.origin = _.assign({}, global.origin, defaults.origin);
	}

	if (_.isObject(defaults.target)) {
		global.target = _.assign({}, global.target, defaults.target);
	} else if (!_.has(global, "target") && _.has(defaults, "target") && defaults.target == null) {
		global.target = null;
	}

	if (_.isArray(defaults.route))
		global.route = defaults.route;

	if (_.has(defaults, "mission"))
		global.mission = defaults.mission;

	if (_.has(defaults, "stage"))
		global.stage = defaults.stage;

	if (_.has(defaults, "state"))
		global.state = defaults.state;

	if (_.has(defaults, "note"))
		global.note = defaults.note;

	global.active = _.get(defaults, "active", true);
	global.status = _.get(defaults, "status", global.status || "active");
	global.last_update = Game.time;

	return global;
};

Creep.prototype.setGlobalMission = function setGlobalMission(missionId, config) {
	let global = this.ensureGlobal({ mission: missionId });
	if (_.isObject(config))
		_.assign(global, config);
	global.active = true;
	global.last_update = Game.time;
	return global;
};

Creep.prototype.updateGlobalStatus = function updateGlobalStatus(status, info) {
	let global = this.ensureGlobal({});

	if (_.isString(status) && status.length > 0 && global.status != status) {
		global.previous_status = global.status;
		global.status = status;
		global.status_updated = Game.time;
	}

	if (_.isObject(info))
		_.assign(global, info);

	global.last_update = Game.time;
	return global;
};

Creep.prototype.clearGlobal = function clearGlobal(reason) {
	if (!this.isGlobal())
		return;

	let global = this.ensureGlobal({});
	global.active = false;
	if (_.isString(reason) && reason.length > 0) {
		global.status = reason;
		global.reason = reason;
	}
	global.last_update = Game.time;
};

Creep.prototype.getGlobalDescriptor = function getGlobalDescriptor() {
	if (!this.isGlobal())
		return null;

	let global = this.ensureGlobal({});

	let descriptor = {
		status: global.status,
		mission: global.mission,
		role: _.get(this, ["memory", "role"]),
		subrole: _.get(this, ["memory", "subrole"]),
		origin: global.origin,
		target: global.target,
		portal: global.portal,
		stage: global.stage,
		state: global.state,
		note: global.note,
		shard: Game.shard.name,
		room: _.get(this, ["room", "name"], null),
		pos: {
			x: _.get(this, ["pos", "x"], null),
			y: _.get(this, ["pos", "y"], null),
			roomName: _.get(this, ["pos", "roomName"], null)
		},
		ttl: this.ticksToLive,
		resource: global.resource,
		eta: global.eta,
		waypoint: global.waypoint,
		route: global.route,
		last_update: Game.time,
		created: global.created
	};

	let storeTotal = null;
	if (this.store != null) {
		storeTotal = _.sum(this.store);
	} else if (this.carry != null) {
		storeTotal = _.sum(this.carry);
	}
	if (storeTotal != null)
		descriptor.carry = storeTotal;

	for (let key in descriptor) {
		if (descriptor[key] === undefined || descriptor[key] === null) {
			delete descriptor[key];
		}
	}

	return descriptor;
};

