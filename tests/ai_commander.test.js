"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const originalConsole = global.console;
let logs = [];

global._ = require("lodash");
global.FIND_STRUCTURES = 1;
global.FIND_MY_CONSTRUCTION_SITES = 2;
global.FIND_DROPPED_RESOURCES = 3;
global.FIND_HOSTILE_CREEPS = 4;
global.FIND_HOSTILE_STRUCTURES = 5;
global.FIND_SOURCES = 6;
global.FIND_MINERALS = 7;
global.TERRAIN_MASK_SWAMP = 2;
global.ERR_NO_PATH = -2;
global.CONTROLLER_STRUCTURES = {};
[
	"spawn", "extension", "tower", "storage", "terminal", "link", "lab",
	"factory", "extractor", "observer", "nuker", "powerSpawn"
].forEach(function (type) { global.CONTROLLER_STRUCTURES[type] = {}; });
Object.assign(global.CONTROLLER_STRUCTURES.spawn, { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 2, 8: 3 });
Object.assign(global.CONTROLLER_STRUCTURES.extension, { 1: 0, 2: 5, 3: 10, 4: 20, 5: 30, 6: 40, 7: 50, 8: 60 });
Object.assign(global.CONTROLLER_STRUCTURES.tower, { 1: 0, 2: 0, 3: 1, 4: 1, 5: 2, 6: 2, 7: 3, 8: 6 });
Object.assign(global.CONTROLLER_STRUCTURES.storage, { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1 });
Object.assign(global.CONTROLLER_STRUCTURES.terminal, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 1, 7: 1, 8: 1 });
Object.assign(global.CONTROLLER_STRUCTURES.link, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 2, 6: 3, 7: 4, 8: 6 });
Object.assign(global.CONTROLLER_STRUCTURES.lab, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 3, 7: 6, 8: 10 });
Object.assign(global.CONTROLLER_STRUCTURES.factory, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 1, 7: 1, 8: 1 });
Object.assign(global.CONTROLLER_STRUCTURES.extractor, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 1, 7: 1, 8: 1 });
Object.assign(global.CONTROLLER_STRUCTURES.observer, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 1 });
Object.assign(global.CONTROLLER_STRUCTURES.nuker, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 1 });
Object.assign(global.CONTROLLER_STRUCTURES.powerSpawn, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 1 });
global.console = {
	log: function () {
		logs.push(Array.prototype.join.call(arguments, " "));
	}
};
global.isPulse_Mid = function () { return true; };
global.isPulse_Spawn = function () {
	return _.get(Memory, ["shard", "pulses", "spawn", "active"], true);
};
global.Creep_Body = {
	getBody: function (name) {
		return name === "reserver_at" ? new Array(12).fill("move")
			: (name === "burrower" ? new Array(10).fill("work") : new Array(8).fill("move"));
	}
};

require("../definitions_blueprint_layouts");
require("../definitions_ai_strategy");
require("../definitions_ai_observer");
require("../definitions_ai_interface");
require("../definitions_hive_control");
require("../definitions_creep_combat_roles");

function reset(options) {
	options = options || {};
	logs = [];
	global.Memory = options.memory || {
		rooms: {},
		sites: { mining: {}, colonization: {}, combat: {} }
	};
	global.Game = {
		time: options.time || 1000,
		shard: { name: "shard1" },
		cpu: { limit: 100, bucket: 9000, getUsed: function () { return 12.5; } },
		gcl: { level: 4, progress: 250000, progressTotal: 500000 },
		rooms: {},
		creeps: {},
		spawns: {},
		structures: {},
		market: { credits: 12345 },
		map: {
			findRoute: function (from, to) { return from === to ? [] : [{ room: to }]; },
			describeExits: function () { return {}; },
			getRoomStatus: function () { return { status: "normal", timestamp: null }; },
			getRoomLinearDistance: function (from, to) { return from === to ? 0 : 1; }
		}
	};
	global.RawMemory = {
		segments: options.segments === undefined ? { 90: "", 91: "", 92: "" } : options.segments,
		setActiveSegments: function (ids) { this.active = ids; }
	};
}

function order(id, action, overrides) {
	return Object.assign({
		schemaVersion: 1,
		id: id,
		createdTick: Game.time,
		expiresTick: Game.time + 100,
		action: action || "NOOP",
		parameters: {},
		reason: "test"
	}, overrides || {});
}

function strategicIntel(room, lastSeenTick) {
	return {
		room: room, lastSeenTick: lastSeenTick, classification: "normal", sourceCount: 2,
		mineralType: "H", terrainSwampPercent: 10,
		layoutAnalysis: { analyzedTick: lastSeenTick, valid: [{ name: "standard", origin: { x: 25, y: 25 } }], best: { name: "standard", origin: { x: 25, y: 25 } } },
		controller: {
			status: "neutral", owner: null, ownerRelation: "NEUTRAL", reservation: null,
			reservationRelation: "NEUTRAL", reservationTicks: null, rcl: 0, safeMode: null
		},
		structures: { spawns: 0, towers: 0, storage: 0, terminal: 0, hostile: 0, fortifications: { count: 0, min: null, median: null, max: null } },
		hostileCreeps: 0, hostilePlayers: [], playerRelations: [],
		lastHostileSightingTick: null, hostileSightingsTotal: 0,
		nearestColony: "W1N1", distanceFromColony: 1, routeLength: 1,
		routeRooms: ["W1N1", room], routeStatus: "available"
	};
}

function configureExecution() {
	AIInterface.initMemory();
	Memory.ai.enabled = true;
	Memory.ai.mode = "execute";
	Memory.ai.paused = false;
}

function putInbox(payload) {
	RawMemory.segments[91] = typeof payload === "string" ? payload : JSON.stringify(payload);
	AIInterface.run();
}

const tests = [];
function test(name, fn) { tests.push({ name: name, fn: fn }); }

test("AI Memory initializes safely", function () {
	reset({ memory: { ai: { policy: "bad", orders: null } } });
	AIInterface.initMemory();
	assert.strictEqual(Memory.ai.enabled, false);
	assert.strictEqual(Memory.ai.mode, "observe");
	assert.deepStrictEqual(Memory.ai.orders.pending, []);
	assert.deepStrictEqual(Memory.ai.orders.totals, { completed: 0, rejected: 0 });
	assert.strictEqual(Memory.ai.policy.allowCombat, false);
	assert.strictEqual(Memory.ai.policy.allowScouting, false);
	assert.strictEqual(Memory.ai.policy.intelligenceRadius, 2);
});

test("remote replacement timing includes route, body spawn time, and role safety", function () {
	reset();
	let timing = AIRemoteStrategy.replacementLeadTicks(
		"reserver", { level: 5, body: "reserver_at" }, { list_route: ["W1N1", "W1N2"] }, "W1N1", "W1N2"
	);
	assert.strictEqual(timing.travelTicks, 100);
	assert.strictEqual(timing.spawnTicks, 36);
	assert.strictEqual(timing.safetyMargin, 150);
	assert.strictEqual(timing.leadTicks, 286);
});

test("remote miner and hauler replacements start before travel-guaranteed downtime", function () {
	reset();
	let site = { survey: { travel_ticks: 80 } };
	let miner = AIRemoteStrategy.rolePlan("burrower", { amount: 1, level: 5, body: "burrower" }, [
		{ memory: { role: "burrower" }, ticksToLive: 190 }
	], site, "W1N1", "W1N2", 0);
	let hauler = AIRemoteStrategy.rolePlan("carrier", { amount: 1, level: 5, body: "carrier" }, [
		{ memory: { role: "carrier" }, ticksToLive: 170 }
	], site, "W1N1", "W1N2", 0);
	assert.strictEqual(miner.replacementNeeded, 1);
	assert.strictEqual(hauler.replacementNeeded, 1);
});

test("queued or spawning remote replacement prevents duplicate demand", function () {
	reset();
	let plan = AIRemoteStrategy.rolePlan("carrier", { amount: 1, level: 5, body: "carrier" }, [
		{ memory: { role: "carrier" }, spawning: true }
	], {}, "W1N1", "W1N2", 0);
	assert.strictEqual(plan.spawning, 1);
	assert.strictEqual(plan.replacementNeeded, 0);
	plan = AIRemoteStrategy.rolePlan("carrier", { amount: 1, level: 5, body: "carrier" }, [], {}, "W1N1", "W1N2", 1);
	assert.strictEqual(plan.replacementNeeded, 0);
});

test("reservation continuity distinguishes healthy, expiring, and expired reserves", function () {
	reset();
	global.getUsername = function () { return "tester"; };
	let settings = { amount: 1, level: 5, body: "reserver_at" };
	let active = [{ memory: { role: "reserver" }, ticksToLive: 1000 }];
	let healthy = AIRemoteStrategy.reservationPlan(settings, active, {}, "W1N1", "W1N2", { username: "tester", ticksToEnd: 4000 }, 0);
	let expiring = AIRemoteStrategy.reservationPlan(settings, active, {}, "W1N1", "W1N2", { username: "tester", ticksToEnd: 100 }, 0);
	let expired = AIRemoteStrategy.reservationPlan(settings, [], {}, "W1N1", "W1N2", null, 0);
	assert.strictEqual(healthy.continuityAtRisk, false);
	assert.strictEqual(expiring.continuityAtRisk, true);
	assert.strictEqual(expired.continuityAtRisk, true);
});

test("reservation continuity dispatches at most one covered reserver slot", function () {
	reset();
	global.getUsername = function () { return "tester"; };
	let settings = { amount: 2, level: 5, body: "reserver_at" };
	let viable = [{ memory: { role: "reserver" }, ticksToLive: 500 }];
	let spawning = [{ memory: { role: "reserver" }, spawning: true }];

	let uncovered = AIRemoteStrategy.reservationPlan(settings, [], {}, "W1N1", "W1N2", null, 0);
	let enRoute = AIRemoteStrategy.reservationPlan(settings, viable, {}, "W1N1", "W1N2", null, 0);
	let pending = AIRemoteStrategy.reservationPlan(settings, spawning, {}, "W1N1", "W1N2", null, 0);
	let expiring = AIRemoteStrategy.reservationPlan(settings, [
		{ memory: { role: "reserver" }, ticksToLive: 100 }
	], {}, "W1N1", "W1N2", { username: "tester", ticksToEnd: 100 }, 0);

	assert.strictEqual(uncovered.target, 1);
	assert.strictEqual(uncovered.dispatchNeeded, true);
	assert.strictEqual(enRoute.dispatchNeeded, false);
	assert.strictEqual(pending.dispatchNeeded, false);
	assert.strictEqual(expiring.dispatchNeeded, true);
});

test("remote replacement priorities remain below home emergencies and are ageable", function () {
	reset();
	let homeEmergency = { room: "W1N1", priority: 5, args: { role: "worker", room: "W1N1", colony: "W1N1" } };
	let remoteReplacement = { room: "W1N1", priority: 13, args: { role: "reserver", room: "W1N2", colony: "W1N1" } };
	assert.ok(Control.effectiveSpawnPriority(homeEmergency, { firstSeenTick: 1 }) < Control.effectiveSpawnPriority(remoteReplacement, { firstSeenTick: 1 }));
	assert.ok(Control.effectiveSpawnPriority(remoteReplacement, { firstSeenTick: 1 }) >= 10);
});

test("remote candidates reject foreign, source-keeper, bad-route, duplicate, and stale targets", function () {
	reset();
	let base = {
		room: "W1N2", stale: false, classification: "normal", sourceCount: 2,
		controller: { ownerRelation: "NEUTRAL", reservationRelation: "NEUTRAL" },
		routeStatus: "available", routeLength: 1, terrainSwampPercent: 10,
		hostileCreeps: 0, structures: { hostile: 0 }, nearestColony: "W1N1"
	};
	assert.strictEqual(AIRemoteStrategy.remoteCandidate(base, {}).eligible, true);
	assert.ok(AIRemoteStrategy.remoteCandidate(Object.assign({}, base, { stale: true }), {}).disqualifiers.includes("stale_intel"));
	assert.ok(AIRemoteStrategy.remoteCandidate(Object.assign({}, base, { classification: "source_keeper" }), {}).disqualifiers.includes("unsupported_room_classification"));
	assert.ok(AIRemoteStrategy.remoteCandidate(Object.assign({}, base, { routeStatus: "no_path" }), {}).disqualifiers.includes("no_route"));
	assert.ok(AIRemoteStrategy.remoteCandidate(Object.assign({}, base, { controller: { ownerRelation: "NEUTRAL", reservationRelation: "HOSTILE" } }), {}).disqualifiers.includes("foreign_reservation"));
	assert.ok(AIRemoteStrategy.remoteCandidate(base, { existingRemotes: ["W1N2"] }).disqualifiers.includes("already_configured"));
	assert.ok(AIRemoteStrategy.remoteCandidate(Object.assign({}, base, { sourceCount: 1, routeLength: 8 }), { minimumScore: 90 }).disqualifiers.includes("score_below_minimum"));
});

test("claim candidates explain missing layouts and score thresholds", function () {
	reset();
	let intel = {
		room: "W1N2", stale: false, classification: "normal", sourceCount: 1,
		controller: { status: "neutral", ownerRelation: "NEUTRAL" }, routeLength: 2,
		terrainSwampPercent: 10, hostileCreeps: 0, structures: { towers: 0 }, layoutAnalysis: null
	};
	let candidate = AIRemoteStrategy.claimCandidate(intel, { minimumScore: 90 });
	assert.strictEqual(candidate.eligible, false);
	assert.ok(candidate.disqualifiers.includes("no_feasible_layout"));
	assert.ok(candidate.disqualifiers.includes("score_below_minimum"));
});

test("layout analysis finds deterministic blueprint origins on open terrain", function () {
	reset();
	let room = {
		controller: { pos: { x: 45, y: 45 } },
		findSources: function () { return [{ pos: { x: 4, y: 4 } }]; },
		getTerrain: function () { return { get: function () { return 0; } }; }
	};
	let analysis = AIRemoteStrategy.analyzeLayouts(room);
	assert.ok(analysis.valid.length > 0);
	assert.ok(["def_hor", "def_vert", "def_comp"].includes(analysis.best.name));
	assert.ok(analysis.best.origin.x >= 8 && analysis.best.origin.x <= 40);
});

test("room classification separates normal, highway, center, and source-keeper territory", function () {
	reset();
	assert.strictEqual(AIObserver._roomClassification("W38N11"), "normal");
	assert.strictEqual(AIObserver._roomClassification("W40N11"), "highway");
	assert.strictEqual(AIObserver._roomClassification("W35N15"), "sector_center");
	assert.strictEqual(AIObserver._roomClassification("W34N14"), "source_keeper");
});

test("territory strategy supports the Screeps Lodash 3 runtime", function () {
	reset();
	AIInterface.initMemory();
	Game.rooms.W1N1 = {
		name: "W1N1", controller: { my: true, owner: { username: "tester" }, level: 5 },
		findSources: function () { return []; }, find: function () { return []; }
	};
	let pickBy = _.pickBy;
	delete _.pickBy;
	try {
		assert.doesNotThrow(function () { AIObserver.buildSnapshot(); });
	} finally {
		_.pickBy = pickBy;
	}
});

test("segment activation uses the reserved IDs", function () {
	reset();
	AIInterface.activateSegments();
	assert.deepStrictEqual(RawMemory.active, [90, 91, 92]);
});

test("missing segments do not throw", function () {
	reset({ segments: {} });
	assert.doesNotThrow(function () { AIInterface.run(); });
});

test("malformed JSON does not throw", function () {
	reset();
	putInbox("{not-json");
	assert.strictEqual(Memory.ai.transport.lastError.message, "Malformed inbox JSON ignored");
});

test("unsupported actions are rejected", function () {
	reset();
	configureExecution();
	putInbox(order("unsupported-1", "ATTACK_ROOM"));
	assert.strictEqual(Memory.ai.orders.rejected[0].reason, "Unsupported action");
	assert.strictEqual(Memory.ai.orders.completed.length, 0);
});

test("inherited object names cannot bypass the action whitelist", function () {
	reset();
	configureExecution();
	putInbox(order("prototype-action-1", "toString"));
	assert.strictEqual(Memory.ai.orders.rejected[0].reason, "Unsupported action");
});

test("expired orders are rejected", function () {
	reset();
	configureExecution();
	putInbox(order("expired-1", "NOOP", { createdTick: 800, expiresTick: 999 }));
	assert.strictEqual(Memory.ai.orders.rejected[0].reason, "Order expired");
});

test("duplicate command IDs are rejected", function () {
	reset();
	configureExecution();
	putInbox(order("duplicate-1"));
	assert.strictEqual(Memory.ai.orders.completed.length, 1);
	putInbox(order("duplicate-1", "NOOP", { reason: "same id, new payload" }));
	assert.strictEqual(Memory.ai.orders.completed.length, 1);
	assert.strictEqual(Memory.ai.orders.rejected[0].reason, "Duplicate command ID");
});

test("NOOP completes in observe mode without changing game state", function () {
	reset();
	AIInterface.initMemory();
	Memory.ai.enabled = true;
	let before = JSON.stringify({ rooms: Memory.rooms, sites: Memory.sites });
	putInbox(order("observe-1"));
	assert.strictEqual(Memory.ai.orders.completed.length, 1);
	assert.strictEqual(Memory.ai.orders.completed[0].message, "No operation performed");
	assert.strictEqual(Memory.ai.orders.rejected.length, 0);
	assert.strictEqual(JSON.stringify({ rooms: Memory.rooms, sites: Memory.sites }), before);
});

test("observe mode permits explanation metadata without strategic execution", function () {
	reset();
	AIInterface.initMemory();
	Memory.ai.enabled = true;
	putInbox(order("observe-explain-1", "SET_EXPLANATION", {
		parameters: { explanation: "Advisor-only summary." }
	}));
	assert.strictEqual(Memory.ai.status.lastExplanation, "Advisor-only summary.");
	assert.strictEqual(Memory.ai.orders.completed.length, 1);
});

test("narrow operational authority changes are validated and work in observe mode", function () {
	reset();
	AIInterface.initMemory();
	Memory.ai.enabled = true;
	putInbox(order("authority-1", "SET_OPERATIONAL_AUTHORITY", {
		parameters: { scouting: "AUTO", remoteMaintenance: "MANUAL", remoteAbandonment: "AUTO" }
	}));
	assert.strictEqual(Memory.ai.policy.allowScouting, true);
	assert.strictEqual(Memory.ai.policy.autoScouting, true);
	assert.strictEqual(Memory.ai.policy.allowRemoteMaintenance, true);
	assert.strictEqual(Memory.ai.policy.autoRemoteMaintenance, false);
	assert.strictEqual(Memory.ai.policy.allowRemoteAbandonment, true);
	assert.strictEqual(Memory.ai.policy.autoRemoteAbandonment, true);
	assert.strictEqual(Memory.ai.orders.completed[0].action, "SET_OPERATIONAL_AUTHORITY");

	RawMemory.segments[91] = "";
	putInbox(order("authority-invalid-1", "SET_OPERATIONAL_AUTHORITY", {
		parameters: { scouting: "EVERYTHING", remoteMaintenance: "OFF" }
	}));
	assert.strictEqual(Memory.ai.orders.rejected[0].reason, "scouting authority must be OFF, MANUAL, or AUTO");
});

test("execution mode changes use a narrow audited enum", function () {
	reset();
	AIInterface.initMemory();
	Memory.ai.enabled = true;
	putInbox(order("mode-1", "SET_EXECUTION_MODE", { parameters: { mode: "execute" } }));
	assert.strictEqual(Memory.ai.mode, "execute");
	assert.strictEqual(Memory.ai.orders.completed[0].action, "SET_EXECUTION_MODE");
	RawMemory.segments[91] = "";
	putInbox(order("mode-bad-1", "SET_EXECUTION_MODE", { parameters: { mode: "danger" } }));
	assert.strictEqual(Memory.ai.orders.rejected[0].reason, "mode must be observe or execute");
});

test("SCOUT_ROOM requires execute mode and explicit scouting policy", function () {
	reset();
	AIInterface.initMemory();
	Memory.ai.enabled = true;
	Memory.ai.policy.allowScouting = true;
	Game.rooms.W1N1 = { name: "W1N1", controller: { my: true } };
	putInbox(order("scout-observe-1", "SCOUT_ROOM", { parameters: { room: "W1N2", origin: "W1N1" } }));
	assert.strictEqual(Memory.ai.orders.rejected[0].reason, "Observe mode prevents execution");

	reset();
	configureExecution();
	Game.rooms.W1N1 = { name: "W1N1", controller: { my: true } };
	putInbox(order("scout-policy-1", "SCOUT_ROOM", { parameters: { room: "W1N2", origin: "W1N1" } }));
	assert.strictEqual(Memory.ai.orders.rejected[0].reason, "Scouting is not authorized by policy");
});

test("SCOUT_ROOM rejects invalid names and non-owned origins", function () {
	reset();
	configureExecution();
	Memory.ai.policy.allowScouting = true;
	putInbox(order("scout-invalid-room", "SCOUT_ROOM", { parameters: { room: "not-a-room", origin: "W1N1" } }));
	assert.strictEqual(Memory.ai.orders.rejected[0].reason, "SCOUT_ROOM room is invalid");

	reset();
	configureExecution();
	Memory.ai.policy.allowScouting = true;
	Game.rooms.W1N1 = { name: "W1N1", controller: { my: false } };
	putInbox(order("scout-invalid-origin", "SCOUT_ROOM", { parameters: { room: "W1N2", origin: "W1N1" } }));
	assert.strictEqual(Memory.ai.orders.rejected[0].reason, "SCOUT_ROOM origin is not an owned visible colony");
});

test("SCOUT_ROOM queues one one-shot mission through the existing scout framework", function () {
	reset();
	configureExecution();
	Memory.ai.policy.allowScouting = true;
	Game.rooms.W1N1 = { name: "W1N1", controller: { my: true } };
	Game.spawns.Spawn1 = { room: { name: "W1N1" }, pos: { x: 20, y: 21 } };
	putInbox(order("scout-queue-1", "SCOUT_ROOM", { parameters: { room: "W1N2", origin: "W1N1" } }));
	let requests = Memory.rooms.W1N1.scout_requests;
	assert.strictEqual(Memory.ai.orders.completed.length, 0);
	assert.strictEqual(Memory.ai.orders.active.length, 1);
	assert.strictEqual(requests.length, 1);
	assert.strictEqual(requests[0].id, "ai-scout:scout-queue-1");
	assert.strictEqual(requests[0].ai_managed, true);
	assert.strictEqual(requests[0].respawn, false);
	assert.strictEqual(requests[0].count, 1);
	assert.strictEqual(requests[0].custom.priority, 14);
	assert.strictEqual(requests[0].dest_pos.roomName, "W1N2");
	assert.strictEqual(requests[0].status, "QUEUED");
	assert.deepStrictEqual(requests[0].list_route, ["W1N1", "W1N2"]);
	assert.deepStrictEqual(Memory.sites, { mining: {}, colonization: {}, combat: {} });
	assert.strictEqual(Memory.hive, undefined);
	assert.doesNotThrow(function () { Control.runScoutRequests("W1N1"); });
	assert.strictEqual(Memory.hive.spawn_requests.length, 1);
	assert.strictEqual(Memory.hive.spawn_requests[0].args.scout_request_id, "ai-scout:scout-queue-1");
	assert.strictEqual(requests[0].status, "SPAWNING");
	assert.strictEqual(requests[0].spawned_total, 0);
	Memory.shard = { spawn_requests: Memory.hive.spawn_requests.slice() };
	Memory.hive.spawn_requests = [];
	Game.time++;
	Control.runScoutRequests("W1N1");
	assert.strictEqual(requests[0]._completed, undefined);
	assert.strictEqual(requests[0].status, "SPAWNING");
	Memory.shard.spawn_requests = [];
	Game.time++;
	Control.runScoutRequests("W1N1");
	assert.strictEqual(Memory.hive.spawn_requests.length, 1);
	assert.strictEqual(requests[0]._completed, undefined);
	Game.creeps.Scout1 = {
		name: "Scout1", spawning: false,
		memory: { scout_request_id: "ai-scout:scout-queue-1" }
	};
	Memory.hive.spawn_requests = [];
	Game.time++;
	Control.runScoutRequests("W1N1");
	assert.strictEqual(requests[0].spawned_total, 1);
	assert.strictEqual(requests[0].status, "EN_ROUTE");

	RawMemory.segments[91] = "";
	putInbox(order("scout-queue-2", "SCOUT_ROOM", { parameters: { room: "W1N2", origin: "W1N1" } }));
	assert.strictEqual(Memory.rooms.W1N1.scout_requests.length, 1);
	assert.strictEqual(Memory.ai.orders.rejected[0].status, "rejected");

	Game.time++;
	Game.rooms.W1N2 = {
		name: "W1N2", controller: null,
		findSources: function () { return []; }, find: function () { return []; }
	};
	AIInterface.run();
	assert.strictEqual(Memory.ai.orders.active.length, 0);
	assert.strictEqual(Memory.ai.orders.completed.length, 1);
	assert.strictEqual(Memory.ai.orders.completed[0].details.targetRoom, "W1N2");
	assert.strictEqual(Memory.ai.orders.completed[0].details.intelLastSeenTick, Game.time);
	assert.strictEqual(Memory.ai.scoutHistory[0].status, "COMPLETED");
});

test("an observed scout request releases the concurrency slot", function () {
	reset();
	configureExecution();
	Memory.ai.policy.allowScouting = true;
	Game.rooms.W1N1 = { name: "W1N1", controller: { my: true } };
	Memory.rooms.W1N1 = { scout_requests: [{
		id: "ai-scout:observed-1", ai_managed: true, status: "OBSERVED",
		dest_pos: { roomName: "W1N2" }, observed_tick: Game.time
	}] };
	putInbox(order("scout-after-observed-1", "SCOUT_ROOM", {
		parameters: { room: "W1N3", origin: "W1N1" }
	}));
	assert.strictEqual(Memory.ai.orders.rejected.length, 0);
	assert.strictEqual(Memory.ai.orders.active.length, 1);
	assert.strictEqual(Memory.rooms.W1N1.scout_requests.length, 2);
	assert.strictEqual(Memory.rooms.W1N1.scout_requests[1].dest_pos.roomName, "W1N3");
});

test("duplicate, expired, and paused SCOUT_ROOM commands fail closed", function () {
	reset();
	configureExecution();
	Memory.ai.policy.allowScouting = true;
	Game.rooms.W1N1 = { name: "W1N1", controller: { my: true } };
	let scout = order("scout-duplicate-1", "SCOUT_ROOM", { parameters: { room: "W1N2", origin: "W1N1" } });
	putInbox(scout);
	RawMemory.segments[91] = "";
	putInbox(Object.assign({}, scout, { reason: "same scout id, changed payload" }));
	assert.strictEqual(Memory.ai.orders.rejected[0].reason, "Duplicate command ID");

	reset();
	configureExecution();
	Memory.ai.policy.allowScouting = true;
	Game.rooms.W1N1 = { name: "W1N1", controller: { my: true } };
	putInbox(order("scout-expired-1", "SCOUT_ROOM", {
		createdTick: 800, expiresTick: 999, parameters: { room: "W1N2", origin: "W1N1" }
	}));
	assert.strictEqual(Memory.ai.orders.rejected[0].reason, "Order expired");

	reset();
	configureExecution();
	Memory.ai.policy.allowScouting = true;
	Memory.ai.paused = true;
	Game.rooms.W1N1 = { name: "W1N1", controller: { my: true } };
	putInbox(order("scout-paused-1", "SCOUT_ROOM", { parameters: { room: "W1N2", origin: "W1N1" } }));
	assert.strictEqual(Memory.ai.orders.rejected[0].reason, "AI commander is paused");
});

test("pause prevents execution", function () {
	reset();
	configureExecution();
	Memory.ai.paused = true;
	putInbox(order("paused-1"));
	assert.strictEqual(Memory.ai.orders.completed.length, 0);
	assert.strictEqual(Memory.ai.orders.rejected[0].reason, "AI commander is paused");
});

test("disabled interface prevents otherwise valid scout execution", function () {
	reset();
	AIInterface.initMemory();
	Memory.ai.mode = "execute";
	Memory.ai.policy.allowScouting = true;
	Game.rooms.W1N1 = { name: "W1N1", controller: { my: true } };
	putInbox(order("scout-disabled-1", "SCOUT_ROOM", { parameters: { room: "W1N2", origin: "W1N1" } }));
	assert.strictEqual(Memory.ai.orders.rejected[0].reason, "AI commander is disabled");
});

test("a stale commander heartbeat prevents execution", function () {
	reset();
	configureExecution();
	putInbox({
		schemaVersion: 1,
		tick: Game.time - AIInterface.COMMANDER_STALE_TICKS - 1,
		orders: [order("stale-1")]
	});
	assert.strictEqual(Memory.ai.orders.completed.length, 0);
	assert.strictEqual(Memory.ai.orders.rejected[0].reason, "External commander heartbeat is stale");
});

test("SET_EXPLANATION stores only the user-visible summary", function () {
	reset();
	configureExecution();
	putInbox(order("explain-1", "SET_EXPLANATION", {
		parameters: { explanation: "Holding expansion while energy reserves recover." }
	}));
	assert.strictEqual(Memory.ai.status.lastExplanation, "Holding expansion while energy reserves recover.");
	assert.strictEqual(Memory.ai.orders.completed.length, 1);
});

test("human console functions remain available", function () {
	reset();
	require("../definitions_console_commands");
	Console.Init();
	let status = ai.status();
	assert.ok(status.indexOf("=== AI COMMANDER ===") >= 0);
	assert.ok(status.indexOf("Permanent Colony Claims") >= 0);
	assert.ok(status.indexOf("Completed Orders (lifetime)") >= 0);
	assert.strictEqual(logs.length, 0, "returned console output must not also be logged");
	assert.ok(ai.enable().indexOf("enabled") >= 0);
	assert.strictEqual(Memory.ai.enabled, true);
	assert.ok(ai.pause().indexOf("paused") >= 0);
	assert.strictEqual(Memory.ai.paused, true);
	assert.ok(ai.mode("execute").indexOf("execute") >= 0);
	assert.ok(ai.scouting(true).indexOf("enabled") >= 0);
	assert.strictEqual(Memory.ai.policy.allowScouting, true);
	assert.ok(ai.explain().indexOf("No explanation") >= 0);
	assert.ok(ai.autoColonization(false).indexOf("disabled") >= 0);
	assert.strictEqual(Memory.ai.policy.autoColonization, false);
	assert.ok(ai.playerRelation("Neighbor", "SUSPICIOUS").indexOf("SUSPICIOUS") >= 0);
	AIObserver._player = "tester";
	assert.strictEqual(AIObserver._relation("Neighbor"), "SUSPICIOUS");
	assert.ok(ai.playerRelation("Neighbor", "AUTO").indexOf("derived") >= 0);
	assert.strictEqual(AIObserver._relation("Neighbor"), "NEUTRAL");
	assert.strictEqual(logs.length, 0, "console helpers should produce one Screeps return rendering");
});

test("combat math uses tower falloff, active boosted parts, safe mode, and stale-intel gates", function () {
	reset();
	AIInterface.initMemory();
	global.BOOSTS = {
		attack: { XUH2O: { attack: 4 } },
		heal: { XLHO2: { heal: 4 } }
	};
	let hostile = AIObserver._hostileCombatSummary([{
		body: [
			{ type: "attack", hits: 100, boost: "XUH2O" },
			{ type: "heal", hits: 100, boost: "XLHO2" },
			{ type: "ranged_attack", hits: 0 }
		]
	}]);
	assert.strictEqual(hostile.meleeDps, 120);
	assert.strictEqual(hostile.healingPerTick, 48);
	assert.strictEqual(hostile.rangedDps, 0, "destroyed body parts must not contribute DPS");
	assert.strictEqual(AIObserver._towerPowerAtRange(600, 5, 2), 1200);
	assert.strictEqual(AIObserver._towerPowerAtRange(600, 20, 2), 300);

	let room = {
		room: "W2N2", lastSeenTick: Game.time, intelAgeTicks: 100, stale: false,
		controller: { owner: "Enemy", ownerRelation: "NEUTRAL", safeMode: 500, safeModeAvailable: 1 },
		structures: {
			towers: 1, towerEnergy: 1000,
			fortifications: { max: 100000 }, ramparts: { max: 100000 }, walls: { max: 50000 }
		},
		hostileCreeps: 1, combatSummary: hostile, routeLength: 2
	};
	let capability = {
		spawnThroughput: { spawns: 1, theoreticalBodyPartsPer1000Ticks: 333 },
		combatBodyTemplates: {
			soldier: { available: true, meleeDps: 300, rangedDps: 20 },
			healer: { available: true, healingPerTick: 120 },
			dismantler: { available: true, dismantlePerTick: 250 }
		}
	};
	let assessment = AIObserver._combatAssessments([room], capability)[0];
	assert.strictEqual(assessment.recommendation, "SAFE_MODE_ACTIVE");
	assert.strictEqual(assessment.estimatedSuccess, 0);
	assert.strictEqual(assessment.constraints.breachTicks, 400);
	assert.strictEqual(assessment.executionAuthorized, false);
	room.controller.safeMode = null;
	room.routeStatus = "protected_boundary";
	assessment = AIObserver._combatAssessments([room], capability)[0];
	assert.strictEqual(assessment.recommendation, "PROTECTED_BOUNDARY");
	assert.strictEqual(assessment.estimatedSuccess, 0);
	room.routeStatus = "available";
	room.stale = true;
	room.intelAgeTicks = 11000;
	assert.strictEqual(AIObserver._combatAssessments([room], capability)[0].recommendation, "STALE_INTEL");
	delete global.BOOSTS;
});

test("telemetry schema v9 reports identity, capabilities, defense, territory, load, forecast, and exact byte size", function () {
	reset();
	let structures = [
		{ structureType: "spawn", my: true, spawning: null },
		{ structureType: "storage", my: true, store: { energy: 240000 } },
		{ structureType: "tower", my: true, store: { energy: 700 } },
		{ structureType: "rampart", my: true, hits: 10000 },
		{ structureType: "constructedWall", my: true, hits: 20000 }
	];
	Game.rooms.W1N1 = {
		name: "W1N1",
		controller: { my: true, owner: { username: "tester" }, level: 5, progress: 1000, progressTotal: 10000, ticksToDowngrade: 50000, safeModeAvailable: 1 },
		energyAvailable: 900,
		energyCapacityAvailable: 1800,
		storage: { store: { energy: 240000 } },
		terminal: null,
		findSources: function () { return [{ energy: 3000, ticksToRegeneration: 200 }, { energy: 3000, ticksToRegeneration: 200 }]; },
		find: function (constant) {
			if (constant === FIND_STRUCTURES) return structures;
			if (constant === FIND_HOSTILE_CREEPS) return [];
			if (constant === FIND_HOSTILE_STRUCTURES) return [];
			if (constant === FIND_MINERALS) return [{ mineralType: "H" }];
			return [];
		}
	};
	Game.creeps.a = { memory: { colony: "W1N1", room: "W1N1", role: "harvester" }, ticksToLive: 1000 };
	Game.spawns.Spawn1 = { room: { name: "W1N1" }, spawning: null };
	Memory.rooms.W1N1 = { defense: { hostiles: [{ id: "enemy" }] } };
	let serialized = AIObserver.serialize();
	let snapshot = JSON.parse(serialized);
	assert.strictEqual(snapshot.schemaVersion, 9);
	assert.strictEqual(snapshot.empire.player, "tester");
	assert.strictEqual(snapshot.colonies.W1N1.controller.rcl, 5);
	assert.strictEqual(snapshot.colonies.W1N1.energy.storageEnergy, 240000);
	assert.strictEqual(snapshot.colonies.W1N1.energy.terminalEnergy, null);
	assert.strictEqual(snapshot.colonies.W1N1.structures.terminal.allowed, 0);
	assert.strictEqual(snapshot.colonies.W1N1.capabilities.canUseTerminal, false);
	assert.strictEqual(snapshot.colonies.W1N1.defense.hostileCreeps, 1);
	assert.strictEqual(snapshot.intelligence.knownRooms[0].structures.hostile, 0);
	assert.strictEqual(snapshot.empire.creeps, 1);
	assert.strictEqual(snapshot.empire.gcl.availableClaimSlots, 3);
	assert.strictEqual(snapshot.observer.payloadBytes, Buffer.byteLength(serialized, "utf8"));
	assert.ok(snapshot.observer.payloadBytes < 100000);
	assert.deepStrictEqual(snapshot.authority.execution, {
		scouting: false, autoScouting: false, expansion: false,
		remoteMaintenance: false, autoRemoteMaintenance: false, remoteMiningChanges: false,
		remotePausing: true, autoRemotePausing: false,
		newRemotes: false, autoNewRemotes: false, colonization: false,
		autoColonization: false, remoteAbandonment: false, autoRemoteAbandonment: false,
		market: false, production: false, offensiveCombat: false
	});
});

test("telemetry publishes immediately when the observer schema marker is missing", function () {
	reset();
	AIInterface.initMemory();
	Memory.ai.status.lastObservationTick = Game.time - 1;
	global.isPulse_Mid = function () { return false; };
	try {
		AIInterface._publishObservation();
		assert.strictEqual(Memory.ai.status.observationSchemaVersion, AIObserver.SCHEMA_VERSION);
		assert.strictEqual(JSON.parse(RawMemory.segments[90]).schemaVersion, AIObserver.SCHEMA_VERSION);
		RawMemory.segments[90] = "unchanged";
		AIInterface._publishObservation();
		assert.strictEqual(RawMemory.segments[90], "unchanged");
	} finally {
		global.isPulse_Mid = function () { return true; };
	}
});

test("observer compacts telemetry before the hard memory segment limit", function () {
	reset();
	AIInterface.initMemory();
	let snapshot = AIObserver.buildSnapshot();
	let candidates = [];
	let rooms = [];
	for (let i = 0; i < 30; i++) {
		let room = `W${i}N${i}`;
		candidates.push({
			room: room, score: 100 - i, factors: { sources: 40 }, rawScore: 100 - i,
			intelAgeTicks: i, disqualified: false, disqualifiers: [], eligible: true,
			origin: "W1N1", sourceCount: 2, mineralType: "H", terrainSwampPercent: 10,
			currentOperationalRole: "NEUTRAL_SCOUTED", claimCandidateStatus: "ELIGIBLE",
			accessibility: "REACHABLE_NOW", availabilitySet: "CURRENTLY_REACHABLE",
			layout: { blob: "x".repeat(3000) }, validLayouts: [], economicConversion: {},
			bootstrap: {}, strategy: {}, route: {}, security: {}
		});
		rooms.push({
			room: room, lastSeenTick: Game.time, classification: "normal", sourceCount: 2,
			sourcePositions: [], mineralType: "H", mineralPosition: null,
			terrainSwampPercent: 10, layoutAnalysis: { blob: "y".repeat(3000) },
			controller: { status: "neutral", owner: null, ownerRelation: "NEUTRAL",
				reservation: null, reservationRelation: "NEUTRAL", reservationTicks: null,
				rcl: 0, safeMode: null },
			structures: { spawns: 0, towers: 0, storage: 0, currentRelationship: "NEUTRAL" },
			hostileCreeps: 0, hostilePlayers: [], playerRelations: [],
			lastHostileSightingTick: null, hostileSightingsTotal: 0, nearestColony: "W1N1",
			distanceFromColony: 1, routeLength: 1, routeStatus: "available",
			intelAgeTicks: 0, stale: false
		});
	}
	snapshot.claimCandidates = candidates;
	snapshot.expansionCandidates = candidates;
	snapshot.intelligence.knownRooms = rooms;
	let serialized = AIObserver.serialize(snapshot);
	let compact = JSON.parse(serialized);
	assert.ok(Buffer.byteLength(serialized, "utf8") <= AIObserver.MAX_PAYLOAD_BYTES);
	assert.ok(compact.claimCandidates.length >= 3);
	assert.ok(compact.intelligence.knownRooms.length >= 3);
	assert.ok(compact.expansionCandidates[0].layout == null);
	assert.strictEqual(compact.expansionCandidates[0].currentOperationalRole, "NEUTRAL_SCOUTED");
	assert.strictEqual(compact.observer.payloadBytes, Buffer.byteLength(serialized, "utf8"));
});

test("interface refuses an oversized segment instead of aborting the game tick", function () {
	reset();
	AIInterface.initMemory();
	RawMemory.segments[90] = "previous";
	assert.strictEqual(AIInterface._writeSegment(90, "x".repeat(99001)), false);
	assert.strictEqual(RawMemory.segments[90], "previous");
	assert.strictEqual(Memory.ai.status.lastInterfaceError.message, "Refusing oversized segment 90");
});

test("interface errors retain one bounded diagnostic in Memory", function () {
	reset();
	AIInterface.initMemory();
	AIInterface._logError("observer failed", new Error("x".repeat(600)));
	assert.strictEqual(Memory.ai.status.lastInterfaceError.message, "observer failed");
	assert.strictEqual(Memory.ai.status.lastInterfaceError.detail.length, 500);
	assert.strictEqual(Memory.ai.status.lastInterfaceError.tick, Game.time);
});

test("observer records exact remote counters and caps persisted intelligence", function () {
	reset();
	AIInterface.initMemory();
	Memory.sites.mining.W1N2 = { colony: "W1N1" };
	let creep = { memory: { colony: "W1N1", room: "W1N2", _ai_last_ttl: 1000 } };
	AIObserver.recordRemoteDelivery(creep, 275);
	AIObserver.recordRemoteDelivery(creep, 25);
	AIObserver.recordRemoteLoss(creep.memory);
	AIObserver.recordRemoteLoss({ colony: "W1N1", room: "W1N2", _ai_last_ttl: 50 });
	AIObserver.recordRemoteLoss({ colony: "W1N1", room: "W1N2" });
	AIObserver.recordRemoteInterruption("W1N2");
	assert.strictEqual(Memory.ai.metrics.remotes.W1N2.energyDeliveredTotal, 300);
	assert.strictEqual(Memory.ai.metrics.remotes.W1N2.unexpectedCreepLossesTotal, 1);
	assert.strictEqual(Memory.ai.metrics.remotes.W1N2.naturalExpirationsTotal, 1);
	assert.strictEqual(Memory.ai.metrics.remotes.W1N2.unknownDisappearancesTotal, 1);
	assert.strictEqual(Memory.ai.metrics.remotes.W1N2.hostileInterruptionsTotal, 1);

	Memory.ai.intelligence.hostileEvents = [];
	for (let i = 0; i < 60; i++)
		Memory.ai.intelligence.hostileEvents.push({ tick: i, room: "W1N2", players: ["enemy"], count: 1 });
	AIObserver.buildSnapshot();
	assert.strictEqual(Memory.ai.intelligence.hostileEvents.length, AIObserver.MAX_HOSTILE_EVENTS);
});

test("remote telemetry reports configuration, staffing, mining, delivery, losses, and security", function () {
	reset();
	AIInterface.initMemory();
	Memory.sites.mining.W1N2 = {
		colony: "W1N1", can_mine: true, has_keepers: false,
		list_route: ["W1N1", "W1N2"], defense: { is_safe: true, hostiles: [] },
		survey: { source_amount: 2 }
	};
	Memory.ai.metrics.population = { remotes: { W1N2: { expected: { remote_miner: 1, remote_hauler: 2 } } } };
	Memory.ai.metrics.remotes = { W1N2: {
		energyDeliveredTotal: 42000, lastDeliveryTick: 995,
		unexpectedCreepLossesTotal: 2, lastUnexpectedCreepLossTick: 900,
		hostileInterruptionsTotal: 1, lastInterruptionTick: 850
	} };
	Game.rooms.W1N2 = {
		name: "W1N2", controller: { reservation: { username: "tester", ticksToEnd: 3000 } },
		findSources: function () { return [{ energy: 3000, ticksToRegeneration: 150 }, { energy: 2000, ticksToRegeneration: 100 }]; },
		find: function (constant) {
			if (constant === FIND_STRUCTURES) return [{ structureType: "container", hits: 200000, store: { energy: 1200, getCapacity: function () { return 2000; } } }];
			if (constant === FIND_DROPPED_RESOURCES) return [{ resourceType: "energy", amount: 300 }];
			return [];
		}
	};
	Game.creeps.miner = { memory: { colony: "W1N1", room: "W1N2", role: "remote_miner" }, ticksToLive: 1000 };
	Game.creeps.hauler = { memory: { colony: "W1N1", room: "W1N2", role: "remote_hauler" }, ticksToLive: 50 };
	let remote = AIObserver.buildSnapshot().operations.remoteMining[0];
	assert.strictEqual(remote.active, true);
	assert.strictEqual(remote.sourceCount, 2);
	assert.strictEqual(remote.route.length, 1);
	assert.strictEqual(remote.route.status, "CONFIGURED");
	assert.strictEqual(remote.reservation.ticksToEnd, 3000);
	assert.strictEqual(remote.population.roles.remote_miner.alive, 1);
	assert.strictEqual(remote.population.roles.remote_hauler.dyingSoon, 1);
	assert.strictEqual(remote.mining.energyWaiting, 1500);
	assert.strictEqual(remote.delivery.energyDeliveredTotal, 42000);
	assert.strictEqual(remote.losses.creepLossesTotal, 2);
	assert.strictEqual(remote.losses.hostileInterruptionsTotal, 1);
	assert.strictEqual(remote.security.isSafe, true);
});

test("territory telemetry distinguishes stale and unknown nearby rooms", function () {
	reset({ time: 20000 });
	AIInterface.initMemory();
	Game.map.describeExits = function (room) {
		if (room === "W1N1") return { 1: "W1N2", 3: "W2N1" };
		return {};
	};
	Game.rooms.W1N1 = {
		name: "W1N1", controller: { my: true, level: 5 },
		findSources: function () { return []; }, find: function () { return []; }
	};
	Memory.ai.intelligence.rooms.W1N2 = {
		room: "W1N2", lastSeenTick: 1, classification: "normal", sourceCount: 2,
		mineralType: "H", terrainSwampPercent: 10, controller: { status: "neutral", owner: null, reservation: null, reservationTicks: null, rcl: 0, safeMode: null },
		structures: { spawns: 0, towers: 0, storage: 0, terminal: 0, hostile: 0, fortifications: { count: 0, min: null, median: null, max: null } },
		hostileCreeps: 0, hostilePlayers: [], lastHostileSightingTick: null, hostileSightingsTotal: 0,
		nearestColony: "W1N1", distanceFromColony: 1, routeLength: 1, routeStatus: "available"
	};
	let snapshot = AIObserver.buildSnapshot();
	assert.deepStrictEqual(snapshot.intelligence.staleRooms, ["W1N2"]);
	assert.deepStrictEqual(snapshot.intelligence.unknownRooms, ["W2N1"]);
	assert.strictEqual(snapshot.expansionCandidates[0].room, "W1N2");
	assert.ok(snapshot.expansionCandidates[0].disqualifiers.indexOf("stale_intel") >= 0);
});

test("observer reuses cached strategic routes on later snapshots", function () {
	reset();
	AIInterface.initMemory();
	let routeCalls = 0;
	Game.map.findRoute = function (from, to) { routeCalls++; return from === to ? [] : [{ room: to }]; };
	Game.rooms.W1N1 = {
		name: "W1N1", controller: { my: true, level: 5 },
		findSources: function () { return []; }, find: function () { return []; }
	};
	AIObserver.buildSnapshot();
	assert.strictEqual(routeCalls, 1);
	Game.time++;
	AIObserver.buildSnapshot();
	assert.strictEqual(routeCalls, 1);
});

test("protected routing distinguishes same-region access from novice boundary blocks", function () {
	reset();
	let expiration = Date.now() + 7 * 24 * 60 * 60 * 1000;
	Game.map.getRoomStatus = function (room) {
		return room === "W2N1" ? { status: "normal", timestamp: null } : { status: "novice", timestamp: expiration };
	};
	let inside = AIRemoteStrategy.accessibility("W1N1", "W1N2", true);
	let outside = AIRemoteStrategy.accessibility("W1N1", "W2N1", true);
	assert.strictEqual(inside.accessibility, "REACHABLE_NOW");
	assert.strictEqual(inside.sharesProtectedRegion, true);
	assert.strictEqual(outside.accessibility, "BLOCKED_BY_PROTECTED_BOUNDARY");
	assert.strictEqual(outside.reachableAfterTimestamp, expiration);
	Game.map.getRoomStatus = function (room) {
		return room === "W2N1" ? { status: "normal", timestamp: null } : { status: "respawn", timestamp: expiration };
	};
	assert.strictEqual(AIRemoteStrategy.accessibility("W1N1", "W2N1", true).accessibility, "BLOCKED_BY_PROTECTED_BOUNDARY");
});

test("observer exposes novice rules, claim limits, candidate sets, and visible boundary evidence", function () {
	reset();
	AIInterface.initMemory();
	let expiration = Date.now() + 7 * 24 * 60 * 60 * 1000;
	Game.gcl.level = 23;
	Game.map.getRoomStatus = function (room) {
		return room === "W2N1" ? { status: "normal", timestamp: null } : { status: "novice", timestamp: expiration };
	};
	Game.map.describeExits = function (room) { return room === "W1N1" ? { 3: "W2N1" } : {}; };
	Game.map.findExit = function () { return ERR_NO_PATH; };
	let wall = { id: "wall", structureType: "constructedWall", pos: { x: 49, y: 25, roomName: "W1N1" } };
	let spawn = { id: "spawn", structureType: "spawn", my: true, spawning: null, store: { energy: 300 }, pos: { x: 25, y: 25, roomName: "W1N1" } };
	Game.rooms.W1N1 = {
		name: "W1N1", controller: { my: true, level: 5 },
		findSources: function () { return []; },
		find: function (kind) { return kind === FIND_STRUCTURES ? [wall, spawn] : []; }
	};
	Memory.ai.intelligence.rooms.W2N1 = strategicIntel("W2N1", Game.time);
	let snapshot = AIObserver.buildSnapshot();
	assert.strictEqual(snapshot.empire.protection.status, "novice");
	assert.strictEqual(snapshot.empire.protection.expirationTimestamp, expiration);
	assert.ok(snapshot.empire.protection.remainingProtectionMs > 0);
	assert.strictEqual(snapshot.empire.protection.currentProtectionClaimSlots, 2);
	assert.strictEqual(snapshot.empire.protection.rules.claimLimitType, "NOVICE_THREE_ROOM");
	assert.strictEqual(snapshot.empire.protection.rules.reservationsUnlimited, true);
	assert.strictEqual(snapshot.empire.protection.rules.nukersAllowed, false);
	assert.strictEqual(snapshot.colonies.W1N1.protection.sharesCurrentProtectedRegion, true);
	assert.strictEqual(snapshot.intelligence.protectionByRoom.W2N1.accessibility, "BLOCKED_BY_PROTECTED_BOUNDARY");
	assert.ok(snapshot.intelligence.candidateSets.POST_PROTECTION.remoteRooms.includes("W2N1"));
	assert.strictEqual(snapshot.remoteCandidates.find(item => item.room === "W2N1").availabilitySet, "POST_PROTECTION");
	assert.strictEqual(snapshot.colonies.W1N1.protection.blockedExits[0].evidence, "VISIBLE_MAP_NO_PATH");
	assert.strictEqual(snapshot.empire.militaryPreparation.spawnThroughput.spawns, 1);
	assert.strictEqual(snapshot.empire.militaryPreparation.availableCombatResources.energy, 300);
	assert.strictEqual(snapshot.empire.militaryPreparation.offensiveCombatAuthorized, false);
});

test("protected claim capacity is capped at three rooms independently of GCL", function () {
	reset();
	AIInterface.initMemory();
	let expiration = Date.now() + 24 * 60 * 60 * 1000;
	Game.gcl.level = 23;
	Game.map.getRoomStatus = function () { return { status: "novice", timestamp: expiration }; };
	["W1N1", "W1N2", "W2N1"].forEach(function (name) {
		Game.rooms[name] = { name: name, controller: { my: true, level: 5 }, findSources: function () { return []; }, find: function () { return []; } };
	});
	let snapshot = AIObserver.buildSnapshot();
	assert.strictEqual(snapshot.empire.gcl.globalGclClaimSlots, 20);
	assert.strictEqual(snapshot.empire.gcl.currentProtectionClaimSlots, 0);
	assert.ok(snapshot.expansionReadiness.reasons.includes("BLOCKED_BY_PROTECTION"));
});

test("respawn protection retains normal GCL claim capacity", function () {
	reset();
	AIInterface.initMemory();
	let expiration = Date.now() + 11 * 24 * 60 * 60 * 1000;
	Game.gcl.level = 23;
	Game.map.getRoomStatus = function () { return { status: "respawn", timestamp: expiration }; };
	Game.rooms.W1N1 = {
		name: "W1N1", controller: { my: true, level: 5, safeMode: 1200, safeModeAvailable: 1 },
		findSources: function () { return []; }, find: function () { return []; }
	};
	let snapshot = AIObserver.buildSnapshot();
	assert.strictEqual(snapshot.empire.protection.status, "respawn");
	assert.strictEqual(snapshot.empire.protection.rules.temporaryBoundary, true);
	assert.strictEqual(snapshot.empire.protection.rules.claimLimitType, "NORMAL_GCL");
	assert.strictEqual(snapshot.empire.protection.rules.nukersAllowed, false);
	assert.strictEqual(snapshot.empire.gcl.globalGclClaimSlots, 22);
	assert.strictEqual(snapshot.empire.gcl.currentProtectionClaimSlots, 22);
	assert.strictEqual(snapshot.expansionReadiness.currentProtectionClaimSlots, 22);
	assert.strictEqual(snapshot.expansionReadiness.recommendedSimultaneousColonizations, 0);
	assert.ok(snapshot.expansionReadiness.operationalLimitReason.includes("BLOCKED_BY_POPULATION"));
	assert.strictEqual(snapshot.colonies.W1N1.controller.safeMode, 1200);
	assert.strictEqual(snapshot.colonies.W1N1.protection.status, "respawn");
});

test("expansion readiness treats demand satisfaction as a percentage", function () {
	reset();
	AIInterface.initMemory();
	Memory.ai.protection.summary = { currentProtectionClaimSlots: 22 };
	let candidate = { room: "W1N2", origin: "W1N1", eligible: true };
	let colonies = {
		W1N1: {
			energy: { storageEnergy: 500000 },
			population: { demandSatisfaction: 13.33 },
			spawning: { spawns: 1 }
		}
	};
	let constrained = AIObserver._expansionReadiness([candidate], colonies);
	assert.ok(constrained.reasons.includes("BLOCKED_BY_POPULATION"));
	assert.strictEqual(constrained.recommendedSimultaneousColonizations, 0);
	assert.ok(constrained.operationalLimitReason.includes("BLOCKED_BY_POPULATION"));
	colonies.W1N1.population.demandSatisfaction = 90;
	colonies.W1N1.energy.capacity = 800;
	let recovered = AIObserver._expansionReadiness([candidate], colonies);
	assert.ok(!recovered.reasons.includes("BLOCKED_BY_HOME_POPULATION"));
	assert.strictEqual(recovered.recommendedSimultaneousColonizations, 1);
});

test("normal and closed statuses use explicit claim and reachability rules", function () {
	reset();
	AIInterface.initMemory();
	Game.gcl.level = 23;
	Game.map.getRoomStatus = function (room) {
		return room === "W2N1" ? { status: "closed", timestamp: null } : { status: "normal", timestamp: null };
	};
	Game.rooms.W1N1 = {
		name: "W1N1", controller: { my: true, level: 5 },
		findSources: function () { return []; }, find: function () { return []; }
	};
	let snapshot = AIObserver.buildSnapshot();
	assert.strictEqual(snapshot.empire.protection.rules.claimLimitType, "NORMAL_GCL");
	assert.strictEqual(snapshot.empire.protection.rules.temporaryBoundary, false);
	assert.strictEqual(snapshot.empire.protection.rules.nukersAllowed, true);
	assert.strictEqual(snapshot.empire.gcl.currentProtectionClaimSlots, 22);
	let closed = AIRemoteStrategy.accessibility("W1N1", "W2N1", true);
	assert.strictEqual(closed.accessibility, "CLOSED");
	assert.strictEqual(AIRemoteStrategy.protectionRules("closed").claimLimitType, "NOT_CLAIMABLE");
	assert.strictEqual(AIRemoteStrategy.protectionRules("closed").reachable, false);
	let closedIntel = strategicIntel("W2N1", Game.time);
	closedIntel.protection = { accessibility: "CLOSED" };
	assert.ok(AIRemoteStrategy.remoteCandidate(closedIntel, {}).disqualifiers.includes("room_closed"));
});

test("inaccessible scout missions defer without spawning and reopen after protection expires", function () {
	reset();
	configureExecution();
	Memory.ai.policy.allowScouting = true;
	let status = "novice";
	let expiration = Date.now() + 6 * 60 * 60 * 1000;
	Game.map.getRoomStatus = function (room) {
		return room === "W1N1" ? { status: status, timestamp: status === "novice" ? expiration : null } : { status: "normal", timestamp: null };
	};
	Game.map.describeExits = function (room) { return room === "W1N1" ? { 3: "W2N1" } : {}; };
	Game.rooms.W1N1 = { name: "W1N1", controller: { my: true, level: 5 }, findSources: function () { return []; }, find: function () { return []; } };
	putInbox(order("deferred-scout", "SCOUT_ROOM", { parameters: { room: "W2N1", origin: "W1N1" } }));
	assert.strictEqual(Memory.ai.orders.completed.slice(-1)[0].status, "completed");
	assert.strictEqual(Memory.ai.protection.deferredScouts.W2N1.status, "DEFERRED");
	assert.strictEqual(_.get(Memory, ["rooms", "W1N1", "scout_requests"], []).length, 0);
	AIObserver.buildSnapshot();
	status = "normal";
	Game.time++;
	let snapshot = AIObserver.buildSnapshot();
	assert.strictEqual(Memory.ai.protection.deferredScouts.W2N1.accessibility, "REACHABLE_NOW");
	assert.ok(snapshot.empire.protection.events.some(event => event.type === "PROTECTION_EXPIRED"));
	assert.ok(snapshot.intelligence.unknownRooms.includes("W2N1"));
});

test("identity detection classifies self, ally, foreign, and neutral reservations", function () {
	reset();
	AIInterface.initMemory();
	Memory.hive = { allies: ["Friendly"], enemies: ["OtherPlayer"] };
	Game.map.describeExits = function (room) {
		if (room === "W1N1") return { 1: "W1N2", 3: "W2N1", 5: "W2N2" };
		return {};
	};
	Game.rooms.W1N1 = {
		name: "W1N1", controller: { my: true, owner: { username: "Stranger" }, level: 5 },
		findSources: function () { return []; }, find: function () { return []; }
	};
	["W1N2", "W2N1", "W2N2"].forEach(function (name, index) {
		let users = ["Stranger", "Friendly", "OtherPlayer"];
		Game.rooms[name] = {
			name: name, controller: { reservation: { username: users[index], ticksToEnd: 500 } },
			findSources: function () { return []; }, find: function () { return []; }
		};
	});
	let snapshot = AIObserver.buildSnapshot();
	assert.strictEqual(snapshot.empire.player, "Stranger");
	let intel = _.keyBy(snapshot.intelligence.knownRooms, "room");
	assert.strictEqual(intel.W1N2.controller.reservationRelation, "SELF");
	assert.strictEqual(intel.W2N1.controller.reservationRelation, "ALLY");
	assert.strictEqual(intel.W2N2.controller.reservationRelation, "HOSTILE");
	assert.strictEqual(intel.W1N1.controller.reservationRelation, "NEUTRAL");
});

test("population reports active demand, replacements, and undemanded roles without false satisfaction", function () {
	reset();
	AIInterface.initMemory();
	Game.rooms.W1N1 = {
		name: "W1N1", controller: { my: true, owner: { username: "tester" }, level: 5 },
		findSources: function () { return []; }, find: function () { return []; }
	};
	Memory.ai.metrics.population = { colonies: { W1N1: {
		expected: { worker: 2, upgrader: 1 }, requested: { worker: 1 },
		source: "AZC_DYNAMIC_COLONY_TARGET", updatedTick: Game.time
	} } };
	Memory.shard = { spawn_wait: { "W1N1|W1N1|worker|": { firstSeenTick: 500, lastResult: -6 } } };
	Game.creeps.worker = { memory: { room: "W1N1", colony: "W1N1", role: "worker" }, ticksToLive: 1000 };
	Game.creeps.carrier = { memory: { room: "W1N1", colony: "W1N1", role: "carrier" }, ticksToLive: 1000 };
	let population = AIObserver.buildSnapshot().colonies.W1N1.population;
	assert.strictEqual(population.state, "UNDERSTAFFED");
	assert.strictEqual(population.roles.worker.state, "REPLACEMENT_PENDING");
	assert.strictEqual(population.roles.worker.waitingTicks, 500);
	assert.strictEqual(population.roles.worker.lastSpawnResult, -6);
	assert.strictEqual(population.roles.upgrader.state, "UNDERSTAFFED");
	assert.strictEqual(population.roles.carrier.state, "NOT_REQUIRED");
	assert.strictEqual(population.aliveTotal, 1);
	assert.strictEqual(population.assignedTotal, 2);
	assert.strictEqual(population.demandSatisfaction, 33.33);
});

test("essential home demand never ages behind remote or discretionary work", function () {
	reset({ time: 2000 });
	let worker = { room: "W1N1", priority: 23, args: { room: "W1N1", role: "worker" } };
	let emergency = { room: "W1N1", priority: 3, args: { room: "W1N1", role: "soldier" } };
	assert.strictEqual(Control.spawnRequestKey(worker), "W1N1|W1N1|worker|");
	assert.strictEqual(Control.effectiveSpawnPriority(worker, { firstSeenTick: 1000 }), 10);
	assert.strictEqual(Control.effectiveSpawnPriority(worker, { firstSeenTick: 0 }), 10);
	assert.strictEqual(Control.effectiveSpawnPriority(emergency, { firstSeenTick: 0 }), 3);
});

test("critical recovery makes real home requests outrank aged remote demand", function () {
	reset({ time: 2000 });
	AIInterface.initMemory();
	_.set(Memory, ["ai", "strategy", "empireLoad"], {
		state: "CRITICAL",
		homePopulation: { satisfaction: 12.5, criticalSatisfaction: 56.25 }
	});
	let worker = { room: "W1N1", priority: 23, args: { room: "W1N1", role: "worker" } };
	let upgrader = { room: "W1N1", priority: 20, args: { room: "W1N1", role: "upgrader" } };
	let remote = {
		room: "W1N1", priority: 13,
		args: { room: "W1N2", colony: "W1N1", role: "reserver" }
	};
	let continuity = _.cloneDeep(remote);
	continuity.args.remote_continuity_critical = true;
	let wait = { firstSeenTick: 1 };
	assert.strictEqual(Control.effectiveSpawnPriority(worker, wait), 10);
	assert.strictEqual(Control.effectiveSpawnPriority(upgrader, wait), 14);
	assert.strictEqual(Control.effectiveSpawnPriority(continuity, wait), 11);
	assert.strictEqual(Control.effectiveSpawnPriority(remote, wait), 12);
	let ordered = [remote, worker, continuity, upgrader].sort((a, b) =>
		Control.effectiveSpawnPriority(a, wait) - Control.effectiveSpawnPriority(b, wait));
	assert.strictEqual(ordered[0].args.role, "worker");
});

test("satisfied roles do not publish stale spawn wait age", function () {
	reset({ time: 2000 });
	AIInterface.initMemory();
	Game.creeps.worker = {
		memory: { colony: "W1N1", room: "W1N1", role: "worker" },
		ticksToLive: 1000, spawning: false
	};
	_.set(Memory, ["ai", "metrics", "population", "colonies", "W1N1"], {
		expected: { worker: 1 }, actual: { worker: 1 }, requested: {}
	});
	_.set(Memory, ["shard", "spawn_wait", "W1N1|W1N1|worker|"], {
		firstSeenTick: 1000, lastSeenTick: 1999
	});
	AIObserver._populationCache = null;
	let population = AIObserver._populationSummary("W1N1", "W1N1", { worker: 1 });
	assert.strictEqual(population.roles.worker.state, "SATISFIED");
	assert.strictEqual(population.roles.worker.waitingTicks, 0);
	assert.strictEqual(population.oldestWaitingTicks, 0);
});

test("home recovery latch requires stable staffing before releasing remote work", function () {
	reset({ time: 2000 });
	AIInterface.initMemory();
	Memory.ai.policy.remoteRecoveryStableTicks = 10;
	_.set(Memory, ["ai", "strategy", "empireLoad"], {
		state: "CRITICAL",
		homePopulation: { satisfaction: 20, criticalSatisfaction: 50 }
	});
	assert.strictEqual(Control.homeRecoveryState("W1N1").active, true);
	Game.time = 2010;
	_.set(Memory, ["ai", "strategy", "empireLoad"], {
		state: "STRAINED",
		homePopulation: { satisfaction: 90, criticalSatisfaction: 100 }
	});
	assert.strictEqual(Control.homeRecoveryState("W1N1").active, true);
	Game.time = 2021;
	assert.strictEqual(Control.homeRecoveryState("W1N1").active, false);
});

test("home recovery stability survives a queued routine replacement", function () {
	reset({ time: 2000 });
	AIInterface.initMemory();
	Memory.ai.policy.remoteRecoveryStableTicks = 10;
	Memory.ai.policy.remoteRecoveryReplacementGraceTicks = 5;
	_.set(Memory, ["ai", "strategy", "empireLoad"], {
		state: "CRITICAL", homePopulation: { satisfaction: 20, criticalSatisfaction: 50 }
	});
	assert.strictEqual(Control.homeRecoveryState("W1N1").active, true);

	Game.time = 2010;
	_.set(Memory, ["ai", "strategy", "empireLoad"], {
		state: "STRAINED", homePopulation: { satisfaction: 100, criticalSatisfaction: 100 }
	});
	_.set(Memory, ["ai", "metrics", "population", "colonies", "W1N1"], {
		expected: { worker: 2, upgrader: 1 }, actual: { worker: 2, upgrader: 1 }, requested: {}
	});
	let recovery = Control.homeRecoveryState("W1N1");
	assert.strictEqual(recovery.stableSinceTick, 2010);

	Game.time = 2015;
	_.set(Memory, ["ai", "metrics", "population", "colonies", "W1N1", "actual", "worker"], 1);
	_.set(Memory, ["ai", "metrics", "population", "colonies", "W1N1", "requested", "worker"], 1);
	recovery = Control.homeRecoveryState("W1N1");
	assert.strictEqual(recovery.active, true);
	assert.strictEqual(recovery.stableSinceTick, 2010);
	assert.strictEqual(recovery.replacementCovered, true);
	assert.strictEqual(recovery.replacementCoverageSatisfaction, 100);

	Game.time = 2021;
	_.set(Memory, ["ai", "metrics", "population", "colonies", "W1N1", "actual", "worker"], 2);
	_.set(Memory, ["ai", "metrics", "population", "colonies", "W1N1", "requested"], {});
	recovery = Control.homeRecoveryState("W1N1");
	assert.strictEqual(recovery.active, false);
});

test("home recovery resets stability after a sustained uncovered shortage", function () {
	reset({ time: 2000 });
	AIInterface.initMemory();
	Memory.ai.policy.remoteRecoveryStableTicks = 10;
	Memory.ai.policy.remoteRecoveryReplacementGraceTicks = 5;
	_.set(Memory, ["ai", "strategy", "empireLoad"], {
		state: "CRITICAL", homePopulation: { satisfaction: 20, criticalSatisfaction: 50 }
	});
	assert.strictEqual(Control.homeRecoveryState("W1N1").active, true);

	Game.time = 2010;
	_.set(Memory, ["ai", "strategy", "empireLoad"], {
		state: "STRAINED", homePopulation: { satisfaction: 100, criticalSatisfaction: 100 }
	});
	_.set(Memory, ["ai", "metrics", "population", "colonies", "W1N1"], {
		expected: { worker: 2, upgrader: 1 }, actual: { worker: 2, upgrader: 1 }, requested: {}
	});
	assert.strictEqual(Control.homeRecoveryState("W1N1").stableSinceTick, 2010);

	Game.time = 2012;
	_.set(Memory, ["ai", "metrics", "population", "colonies", "W1N1", "actual"], { worker: 1, upgrader: 1 });
	let recovery = Control.homeRecoveryState("W1N1");
	assert.strictEqual(recovery.stableSinceTick, 2010);
	assert.strictEqual(recovery.unstableSinceTick, 2012);

	Game.time = 2017;
	recovery = Control.homeRecoveryState("W1N1");
	assert.strictEqual(recovery.active, true);
	assert.strictEqual(recovery.stableSinceTick, null);

	Game.time = 2018;
	_.set(Memory, ["ai", "metrics", "population", "colonies", "W1N1", "actual"], { worker: 2, upgrader: 1 });
	recovery = Control.homeRecoveryState("W1N1");
	assert.strictEqual(recovery.stableSinceTick, 2018);
	Game.time = 2028;
	assert.strictEqual(Control.homeRecoveryState("W1N1").active, false);
});

test("routine upgrader turnover does not activate home recovery", function () {
	reset({ time: 3000 });
	AIInterface.initMemory();
	Memory.ai.policy.remoteRecoveryReplacementGraceTicks = 5;
	_.set(Memory, ["ai", "strategy", "empireLoad"], { state: "CRITICAL" });
	_.set(Memory, ["ai", "metrics", "population", "colonies", "W1N1"], {
		expected: { worker: 2, upgrader: 3 },
		actual: { worker: 2, upgrader: 0 }, requested: {}
	});
	_.set(Memory, ["ai", "metrics", "population", "remotes", "W1N1"], {
		expected: { burrower: 2, carrier: 2 },
		actual: { worker: 2, burrower: 2, carrier: 2 }, requested: {}
	});
	let recovery = Control.homeRecoveryState("W1N1");
	assert.strictEqual(recovery.active, false);
	assert.strictEqual(recovery.satisfaction, 100);
	Game.time = 3100;
	recovery = Control.homeRecoveryState("W1N1");
	assert.strictEqual(recovery.active, false);
});

test("moderate essential shortage must persist before recovery activates", function () {
	reset({ time: 4000 });
	AIInterface.initMemory();
	Memory.ai.policy.remoteRecoveryReplacementGraceTicks = 5;
	_.set(Memory, ["ai", "strategy", "empireLoad"], { state: "OVEREXTENDED" });
	_.set(Memory, ["ai", "metrics", "population", "colonies", "W1N1"], {
		expected: { worker: 4 }, actual: { worker: 3 }, requested: {}
	});
	assert.strictEqual(Control.homeRecoveryState("W1N1").active, false);
	Game.time = 4004;
	assert.strictEqual(Control.homeRecoveryState("W1N1").active, false);
	Game.time = 4005;
	let recovery = Control.homeRecoveryState("W1N1");
	assert.strictEqual(recovery.active, true);
	assert.strictEqual(recovery.satisfaction, 75);
});

test("recovery preserves one bounded productive remote pipeline", function () {
	reset({ time: 5000 });
	AIInterface.initMemory();
	Memory.ai.policy.remoteRecoveryReplacementGraceTicks = 0;
	Memory.sites.mining = {
		W1N2: { colony: "W1N1" },
		W1N3: { colony: "W1N1" }
	};
	Memory.ai.metrics.remotes = {
		W1N2: { energyDeliveredTotal: 12000 },
		W1N3: { energyDeliveredTotal: 2000 }
	};
	_.set(Memory, ["ai", "strategy", "empireLoad"], { state: "OVEREXTENDED" });
	_.set(Memory, ["ai", "metrics", "population", "colonies", "W1N1"], {
		expected: { worker: 4 }, actual: { worker: 3 }, requested: {}
	});
	let recovery = Control.homeRecoveryState("W1N1");
	assert.strictEqual(recovery.active, true);
	assert.strictEqual(recovery.remoteMode, "CONTINUITY");
	assert.strictEqual(recovery.remoteContinuityRoom, "W1N2");
	let target = {
		burrower: { amount: 2 }, carrier: { amount: 4 }, reserver: { amount: 1 },
		multirole: { amount: 1 }, soldier: { amount: 2 }
	};
	let continuity = Control.limitRemotePopulationForRecovery(target, recovery, "W1N2");
	let suppressed = Control.limitRemotePopulationForRecovery(target, recovery, "W1N3");
	assert.strictEqual(continuity.burrower.amount, 1);
	assert.strictEqual(continuity.carrier.amount, 1);
	assert.strictEqual(continuity.reserver.amount, 1);
	assert.strictEqual(continuity.multirole.amount, 0);
	assert.strictEqual(continuity.soldier.amount, 2);
	assert.strictEqual(suppressed.burrower.amount, 0);
	assert.strictEqual(suppressed.carrier.amount, 0);
	assert.strictEqual(suppressed.soldier.amount, 2);
});

test("active home recovery bypasses the randomized spawn pulse", function () {
	reset({ time: 2000 });
	AIInterface.initMemory();
	Memory.shard = { pulses: { spawn: { active: false } } };
	Game.rooms.W1N1 = { name: "W1N1", controller: { my: true } };
	_.set(Memory, ["rooms", "W1N1", "population_recovery", "active"], true);
	assert.strictEqual(Control.shouldRunSpawnScheduler(), true);
	Memory.rooms.W1N1.population_recovery.active = false;
	assert.strictEqual(Control.shouldRunSpawnScheduler(), false);
	Memory.shard.pulses.spawn.active = true;
	assert.strictEqual(Control.shouldRunSpawnScheduler(), true);
});

test("essential home demand wakes the scheduler off pulse", function () {
	reset({ time: 2000 });
	AIInterface.initMemory();
	Memory.shard = {
		pulses: { spawn: { active: false } },
		spawn_requests: [{
			room: "W1N1", priority: 13,
			args: { role: "carrier", room: "W1N1", colony: "W1N1" }
		}]
	};
	assert.strictEqual(Control.shouldRunSpawnScheduler(), true);
	Memory.shard.spawn_requests[0].args.role = "upgrader";
	assert.strictEqual(Control.shouldRunSpawnScheduler(), false);
	Memory.shard.spawn_requests[0].args.room = "W1N2";
	assert.strictEqual(Control.shouldRunSpawnScheduler(), true);
});

test("remote population demand is regenerated beyond the spawn pulse", function () {
	let source = fs.readFileSync(path.join(__dirname, "..", "definitions_sites.js"), "utf8");
	assert.strictEqual(source.indexOf("if (rmColony == rmHarvest || isPulse_Spawn())"), -1);
	assert.ok(source.indexOf("this.runPopulation(rmColony, rmHarvest, listCreeps, listSpawnRooms, hasKeepers)") >= 0);
});

test("remote survey preserves cached source capacity while vision is absent", function () {
	let source = fs.readFileSync(path.join(__dirname, "..", "definitions_sites.js"), "utf8");
	assert.strictEqual(source.indexOf("surveyData.source_amount = 0"), -1);
	assert.strictEqual(source.indexOf("surveyData.has_minerals = false"), -1);
	assert.ok(source.indexOf("surveyData.source_amount = Game.rooms[rmHarvest].findSources().length") >= 0);
});

test("combat creeps never camp before reaching their assigned room", function () {
	reset({ time: 2000 });
	let destinations = [];
	let creep = {
		memory: { room: "W1N2", colony: "W1N1" },
		room: { name: "W1N1" },
		travelToRoom: function (room, forward) { destinations.push([room, forward]); }
	};
	assert.strictEqual(Creep_Roles_Combat.moveToDestination(creep, 10), true);
	assert.deepStrictEqual(destinations, [["W1N2", true]]);
});

test("paused remote sites continue running assigned defenders", function () {
	reset({ time: 2000 });
	Memory.sites.mining.W1N2 = {
		colony: "W1N1", ai_paused: true, list_route: ["W1N1", "W1N2"]
	};
	Game.creeps = {
		soldier: { memory: { role: "soldier", room: "W1N2", colony: "W1N1" } },
		ranger: { memory: { role: "ranger", room: "W1N2", colony: "W1N1" } },
		healer: { memory: { role: "healer", room: "W1N2", colony: "W1N1" } },
		miner: { memory: { role: "miner", room: "W1N2", colony: "W1N1" } }
	};
	let calls = [];
	let priorRoles = global.Creep_Roles;
	global.Creep_Roles = {
		Soldier: function (creep) { calls.push(creep.memory.role); },
		Archer: function (creep) { calls.push(creep.memory.role); },
		Healer: function (creep) { calls.push(creep.memory.role); }
	};
	try {
		assert.strictEqual(Control.runPausedRemoteDefenders("W1N1", "W1N2"), 3);
		assert.deepStrictEqual(calls.sort(), ["healer", "ranger", "soldier"]);
		assert.deepStrictEqual(Game.creeps.soldier.memory.list_route, ["W1N1", "W1N2"]);
	} finally {
		global.Creep_Roles = priorRoles;
	}
});

test("paused remote economy drains cargo and retreats empty creeps", function () {
	reset({ time: 2000 });
	Memory.sites.mining.W1N2 = {
		colony: "W1N1", ai_paused: true, list_route: ["W1N1", "W1N2"]
	};
	Game.creeps = {
		carrier: { carry: { energy: 500 }, memory: { role: "carrier", room: "W1N2", colony: "W1N1" } },
		reserver: { carry: {}, memory: { role: "reserver", room: "W1N2", colony: "W1N1" } }
	};
	let calls = [];
	let priorRoles = global.Creep_Roles;
	global.Creep_Roles = {
		Mining: function (creep) { calls.push(["drain", creep.memory.role, creep.memory.state]); },
		goToRoom: function (creep, room, forward) {
			calls.push(["retreat", creep.memory.role, room, forward]);
			return true;
		}
	};
	try {
		assert.strictEqual(Control.runPausedRemoteEconomy("W1N1", "W1N2"), 2);
		assert.deepStrictEqual(calls, [
			["drain", "carrier", "delivering"],
			["retreat", "reserver", "W1N1", false]
		]);
	} finally {
		global.Creep_Roles = priorRoles;
	}
});

test("assisted spawn request falls back when the new local spawn lacks energy", function () {
	reset({ time: 2000 });
	global.OK = 0;
	global.ERR_NOT_ENOUGH_ENERGY = -6;
	Memory.hive = { spawn_requests: [] };
	Memory.shard = { spawn_requests: [{
		room: "W1N2", listRooms: ["W1N1"], priority: 25,
		level: 3, scale: true, body: "worker_at", name: null,
		args: { role: "worker", room: "W1N2" }
	}], spawn_wait: {} };
	Memory.rooms = {
		W1N1: { population: {} }, W1N2: { population: { actual: 3, target: 4 } }
	};
	let attempts = [];
	let localRoom = { name: "W1N2", storage: null, getLevel: function () { return 1; } };
	let assistRoom = { name: "W1N1", storage: null, getLevel: function () { return 6; } };
	Game.spawns = {
		Spawn2: { room: localRoom, spawning: null, spawnCreep: function () { attempts.push("local"); return -6; } },
		Spawn1: { room: assistRoom, spawning: null, spawnCreep: function () { attempts.push("assist"); return 0; } }
	};
	let priorScheduler = Control.shouldRunSpawnScheduler;
	let priorStats = global.Stats_CPU;
	try {
		global.Stats_CPU = { Start: function () {}, End: function () {} };
		Control.shouldRunSpawnScheduler = function () { return true; };
		Control.processSpawnRequests();
		assert.deepStrictEqual(attempts, ["local", "assist"]);
	} finally {
		Control.shouldRunSpawnScheduler = priorScheduler;
		global.Stats_CPU = priorStats;
	}
});

test("one bootstrap worker preempts construction to guard the controller", function () {
	let context = {
		_: _, Memory: { rooms: { W1N2: { survey: { downgrade_critical: false } } } },
		Game: { time: 2000, creeps: {} },
		FIND_DROPPED_RESOURCES: 3, FIND_HOSTILE_CREEPS: 4
	};
	context.global = context;
	vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "definitions_creep_roles.js"), "utf8"), context);
	let ran = null;
	let creep = {
		name: "work:a", carry: { energy: 50 }, carryCapacity: 50,
		memory: { role: "worker", room: "W1N2", state: "refueling", task: { type: "harvest" } },
		room: { name: "W1N2", controller: { level: 2 }, find: function () { return []; } },
		getTask_Upgrade: function () { return { type: "upgrade" }; },
		runTask: function () { ran = this.memory.task.type; }
	};
	context.Game.creeps = { guard: creep, other: {
		name: "work:b", memory: { role: "worker", room: "W1N2" }
	} };
	context.Creep_Roles.Worker(creep, true);
	assert.strictEqual(ran, "upgrade");
	assert.strictEqual(creep.memory.task.type, "upgrade");
	assert.strictEqual(creep.memory.state, "working");
});

test("travel replaces a cached path when its destination changes", function () {
	function MockRoomPosition(x, y, roomName) {
		this.x = x; this.y = y; this.roomName = roomName;
	}
	function MockCreep() {
		this.fatigue = 0;
		this.memory = { path: {
			destination: { x: 25, y: 25, roomName: "W1N1" },
			path_str: "7", travel_req: 2000, last_room: "W1N1"
		} };
		this.room = { name: "W1N1" };
		this.pos = {
			getRangeTo: function () { return 10; },
			findPathTo: function () { return [{ direction: 3 }]; },
			getTileInDirection: function () {
				return { isWalkable: function () { return true; }, isValid: function () { return true; } };
			}
		};
		this.move = function (direction) { this.lastMove = direction; return 0; };
	}
	let context = {
		Creep: MockCreep, RoomPosition: MockRoomPosition, _: _,
		Memory: { hive: { paths: {} } }, Game: { time: 2000 },
		Control: { moveRequestPath: function () { return 15; }, moveMaxOps: function () { return 2000; }, moveReusePath: function () { return 15; } },
		OK: 0, ERR_TIRED: -11, ERR_NO_PATH: -2, ERR_BUSY: -4, ERR_NO_BODYPART: -12
	};
	vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "overloads_creep_travel.js"), "utf8"), context);
	let creep = new MockCreep();
	assert.strictEqual(creep.travel(new MockRoomPosition(49, 20, "W1N1")), 0);
	assert.strictEqual(creep.memory.path.destination.x, 49);
	assert.strictEqual(creep.memory.path.destination.y, 20);
	assert.strictEqual(creep.lastMove, "3");
});

test("room travel selects an open neighboring exit when the nearest lane is occupied", function () {
	function MockRoomPosition(x, y, roomName) {
		this.x = x; this.y = y; this.roomName = roomName;
	}
	MockRoomPosition.prototype.isWalkable = function () { return this.y !== 34; };
	MockRoomPosition.prototype.findClosestByPath = function (positions) { return positions[0] || null; };
	MockRoomPosition.prototype.findClosestByRange = function (positions) { return positions[0] || null; };
	function MockCreep() {
		this.memory = { path: {} };
		this.room = { name: "W37N11" };
		this.pos = new MockRoomPosition(48, 34, "W37N11");
	}
	let context = {
		Creep: MockCreep, RoomPosition: MockRoomPosition, _: _,
		Memory: { hive: { paths: { exits_auto: { rooms: { W37N11: [
			{ x: 49, y: 34, roomName: "W37N11" },
			{ x: 49, y: 35, roomName: "W37N11" }
		] } } } } },
		Game: { map: { describeExits: function () { return { 3: "W36N11" }; } } },
		Room: { Terrain: function () {} }, TERRAIN_MASK_WALL: 1,
		OK: 0, ERR_TIRED: -11, ERR_NO_PATH: -2, ERR_BUSY: -4, ERR_NO_BODYPART: -12
	};
	vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "overloads_creep_travel.js"), "utf8"), context);
	let creep = new MockCreep();
	let selected = null;
	creep.travel = function (pos) { selected = pos; return 0; };
	assert.strictEqual(creep.travelToExitTile("W36N11"), 0);
	assert.strictEqual(selected.x, 49);
	assert.strictEqual(selected.y, 35);
});

test("defense-focused RCL2 blueprint places the bootstrap spawn before tower gating", function () {
	let placed = [];
	let room = {
		name: "W1N2",
		controller: { my: true, level: 2, pos: { x: 25, y: 35 } },
		findSources: function () { return [{ pos: { x: 39, y: 15 } }, { pos: { x: 19, y: 24 } }]; },
		find: function (type) {
			if (type === 7) return [{ pos: { x: 17, y: 12 } }];
			return [];
		},
		lookForAt: function () { return []; },
		createConstructionSite: function (x, y, structureType) {
			placed.push({ x: x, y: y, structureType: structureType });
			return 0;
		}
	};
	let context = {
		_: _, Memory: { rooms: { W1N2: {
			layout: { origin: { x: 20, y: 20 }, name: "def_hor", blocked_areas: [] },
			focus_defense: true
		} } },
		Game: { rooms: { W1N2: room } },
		FIND_MY_CONSTRUCTION_SITES: 2, FIND_STRUCTURES: 1, FIND_MINERALS: 7,
		STRUCTURE_ROAD: "road", OK: 0, ERR_INVALID_TARGET: -7,
		CONTROLLER_STRUCTURES: CONTROLLER_STRUCTURES,
		Blueprint__Default_Horizontal: Blueprint__Default_Horizontal,
		Blueprint__Default_Horizontal__Walled: Blueprint__Default_Horizontal__Walled,
		Blueprint__Default_Vertical: Blueprint__Default_Vertical,
		Blueprint__Default_Vertical__Walled: Blueprint__Default_Vertical__Walled,
		Blueprint__Default_Compact: Blueprint__Default_Compact,
		Blueprint__Default_Compact__Walled: Blueprint__Default_Compact__Walled,
		Blueprint__Compact_Horizontal: Blueprint__Compact_Horizontal,
		Blueprint__Compact_Horizontal__Walled: Blueprint__Compact_Horizontal__Walled,
		Blueprint__Compact_Vertical: Blueprint__Compact_Vertical,
		Blueprint__Compact_Vertical__Walled: Blueprint__Compact_Vertical__Walled
	};
	context.global = context;
	vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "definitions_blueprint.js"), "utf8"), context);
	context.Blueprint.Run(room);
	assert.deepStrictEqual(placed[0], { x: 20, y: 20, structureType: "spawn" });
});

test("claimed colonization target does not request a replacement colonizer", function () {
	let context = {
		_: _, Memory: {
			rooms: { W1N1: {} }, hive: { spawn_requests: [] },
			sites: { colonization: { W1N2: { from: "W1N1", target: "W1N2", list_route: ["W1N1", "W1N2"] } } }
		},
		Game: {
			rooms: {
				W1N1: { controller: { my: true, level: 6 } },
				W1N2: { controller: { my: true, level: 2 }, find: function () { return []; } }
			},
			creeps: {}
		},
		Stats_CPU: { Start: function () {}, End: function () {} },
		Control: { populationTally: function () {} },
		Population_Colonization: { colonizer: { amount: 1, level: 6, scale: false, body: "reserver_at" } },
		Creep_Roles: { Colonizer: function () {} },
		FIND_MY_SPAWNS: 8
	};
	context.global = context;
	vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "definitions_sites.js"), "utf8"), context);
	context.Sites.Colonization("W1N1", "W1N2");
	assert.strictEqual(context.Memory.hive.spawn_requests.length, 0);
});

test("claimed-room colonizer stops blueprint pulse requests once the spawn site exists", function () {
	let context = {
		_: _, Memory: {
			rooms: { W1N2: { layout: { name: "def_hor_w", origin: { x: 20, y: 20 } } } },
			hive: { pulses: { blueprint: {} } },
			sites: { colonization: { W1N2: {
				from: "W1N1", target: "W1N2", layout: { name: "def_hor_w", origin: { x: 20, y: 20 } }
			} } }
		},
		Game: { time: 2000, shard: { name: "shard0" } },
		FIND_MY_SPAWNS: 8, FIND_MY_CONSTRUCTION_SITES: 2
	};
	context.global = context;
	vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "definitions_creep_roles.js"), "utf8"), context);
	let cleared = 0;
	let creep = {
		name: "colonizer-test",
		memory: { role: "colonizer", room: "W1N2", colony: "W1N1", target_key: "W1N2" },
		room: {
			name: "W1N2", controller: { my: true },
			find: function (type) { return type === 2 ? [{ structureType: "spawn" }] : []; }
		},
		pos: { x: 25, y: 25 },
		ensureGlobal: function () {}, updateGlobalStatus: function () {},
		travelClear: function () { cleared++; }, moveTo: function () {}
	};
	context.Creep_Roles.Colonizer(creep);
	assert.strictEqual(context.Memory.hive.pulses.blueprint.request, undefined);
	assert.strictEqual(cleared, 1);
});

test("quiet scheduler advances and releases a fully staffed recovery latch", function () {
	reset({ time: 5000 });
	AIInterface.initMemory();
	Memory.shard = { pulses: { spawn: { active: false } } };
	Game.rooms.W1N1 = { name: "W1N1", controller: { my: true } };
	_.set(Memory, ["ai", "strategy", "empireLoad"], {
		state: "STRAINED", homePopulation: { satisfaction: 100, criticalSatisfaction: 100 }
	});
	_.set(Memory, ["ai", "metrics", "population", "colonies", "W1N1"], {
		expected: { worker: 1, upgrader: 1 },
		actual: { worker: 1, upgrader: 1 }, requested: {}
	});
	_.set(Memory, ["rooms", "W1N1", "population_recovery"], {
		active: true, enteredTick: 1000, stableSinceTick: 2000,
		unstableSinceTick: null, reason: "EMPIRE_LOAD_CRITICAL"
	});
	assert.strictEqual(Control.shouldRunSpawnScheduler(), false);
	assert.strictEqual(Memory.rooms.W1N1.population_recovery.active, false);
	assert.strictEqual(Memory.rooms.W1N1.population_recovery.reason, "HOME_RECOVERED");
});

test("critical recovery defers unspawned AI scouts", function () {
	reset({ time: 2000 });
	AIInterface.initMemory();
	_.set(Memory, ["ai", "strategy", "empireLoad"], {
		state: "CRITICAL",
		homePopulation: { satisfaction: 12.5, criticalSatisfaction: 50 }
	});
	Memory.hive = { spawn_requests: [] };
	Memory.shard = { spawn_requests: [] };
	Memory.rooms.W1N1 = { scout_requests: [{
		id: "ai-scout:test", ai_managed: true, count: 1, respawn: false,
		wait_for_full_rally: false, status: "QUEUED", creeps: [],
		dest_pos: { x: 25, y: 25, roomName: "W1N2" },
		custom: { priority: 14, level: 1, body: "scout" }
	}] };
	Control.runScoutRequests("W1N1");
	assert.strictEqual(Memory.hive.spawn_requests.length, 0);
	assert.strictEqual(Memory.rooms.W1N1.scout_requests[0].recovery_suppressed, true);
});

test("remote health exposes deterministic backlog, infrastructure, staffing, reservation, and safety diagnostics", function () {
	reset();
	AIInterface.initMemory();
	Game.rooms.W1N1 = {
		name: "W1N1", controller: { my: true, owner: { username: "tester" }, level: 5 },
		findSources: function () { return []; }, find: function () { return []; }
	};
	Memory.sites.mining.W1N2 = {
		colony: "W1N1", can_mine: true, list_route: ["W1N1", "W1N2"],
		defense: { is_safe: true, hostiles: [] }, survey: { source_amount: 2 }
	};
	Memory.ai.metrics.population = { remotes: { W1N2: {
		expected: { burrower: 2, carrier: 2, reserver: 1 }, requested: {}, updatedTick: Game.time
	} } };
	Game.rooms.W1N2 = {
		name: "W1N2", controller: { reservation: { username: "tester", ticksToEnd: 500 } },
		findSources: function () { return [{}, {}]; },
		find: function (constant) {
			if (constant === FIND_DROPPED_RESOURCES) return [{ resourceType: "energy", amount: 5000 }];
			return [];
		}
	};
	let remote = AIObserver.buildSnapshot().operations.remoteMining[0];
	assert.strictEqual(remote.health, "FAILING");
	assert.ok(remote.reasons.indexOf("NO_CONTAINER") >= 0);
	assert.ok(remote.reasons.indexOf("ENERGY_BACKLOG") >= 0);
	assert.ok(remote.reasons.indexOf("MINER_SHORTAGE") >= 0);
	assert.ok(remote.reasons.indexOf("HAULER_SHORTAGE") >= 0);
	assert.ok(remote.reasons.indexOf("RESERVATION_EXPIRING") >= 0);

	Memory.sites.mining.W1N2.defense.is_safe = false;
	remote = AIObserver.buildSnapshot().operations.remoteMining[0];
	assert.strictEqual(remote.health, "UNSAFE");
});

test("remote health distinguishes healthy and stale-intelligence operations", function () {
	reset({ time: 20000 });
	AIInterface.initMemory();
	Game.rooms.W1N1 = {
		name: "W1N1", controller: { my: true, owner: { username: "tester" }, level: 5 },
		findSources: function () { return []; }, find: function () { return []; }
	};
	Memory.sites.mining.W1N2 = {
		colony: "W1N1", can_mine: true, list_route: ["W1N1", "W1N2"],
		defense: { is_safe: true, hostiles: [] }, survey: { source_amount: 1 }
	};
	Memory.ai.metrics.population = { remotes: { W1N2: {
		expected: { burrower: 1, carrier: 1 }, requested: {}, updatedTick: Game.time
	} } };
	Game.creeps.b = { memory: { colony: "W1N1", room: "W1N2", role: "burrower" }, ticksToLive: 1000 };
	Game.creeps.c = { memory: { colony: "W1N1", room: "W1N2", role: "carrier" }, ticksToLive: 1000 };
	Game.rooms.W1N2 = {
		name: "W1N2", controller: null,
		findSources: function () { return [{ energy: 3000, ticksToRegeneration: 100 }]; },
		find: function (constant) {
			if (constant === FIND_STRUCTURES) return [{ structureType: "container", hits: 200000, store: { energy: 100, getCapacity: function () { return 2000; } } }];
			return [];
		}
	};
	let remote = AIObserver.buildSnapshot().operations.remoteMining[0];
	assert.strictEqual(remote.health, "HEALTHY");

	delete Game.rooms.W1N2;
	Memory.ai.intelligence.rooms.W1N2.lastSeenTick = 1;
	remote = AIObserver.buildSnapshot().operations.remoteMining[0];
	assert.strictEqual(remote.health, "STALE_INTEL");
	assert.ok(remote.reasons.indexOf("STALE_INTEL") >= 0);
});

test("sustained safe delivery retires stale remote loss evidence", function () {
	reset({ time: 10000 });
	AIInterface.initMemory();
	Memory.ai.policy.remoteLossRecoveryTicks = 1500;
	let remote = {
		room: "W1N2", colony: "W1N1", configured: true, active: true, paused: false,
		visible: true, intelAgeTicks: 0,
		route: { status: "CONFIGURED", rooms: ["W1N1", "W1N2"] },
		reservation: { relation: "SELF", ticksToEnd: 3000, warningTicks: 2000,
			reserverPresent: 1, reserverSpawning: 0, reserverQueued: 0 },
		population: { roles: {
			burrower: { desired: 1, alive: 1, spawning: 0 },
			carrier: { desired: 1, alive: 1, spawning: 0 },
			reserver: { desired: 1, alive: 1, spawning: 0 }
		} },
		mining: { expectedSourceContainers: 1, containers: 1, containerSites: 0,
			containerHits: { min: 200000 }, energyWaiting: 0 },
		delivery: { energyDeliveredTotal: 10000, lastDeliveryTick: 9999 },
		losses: { creepLossesTotal: 12, lastCreepLossTick: 8000 },
		security: { isSafe: true, hostileCreeps: 0 }
	};
	let assessment = AIObserver._remoteHealth(remote);
	assert.strictEqual(assessment.reasons.indexOf("HIGH_CREEP_LOSSES"), -1);
	remote.health = assessment.health;
	remote.reasons = assessment.reasons;
	_.set(Memory, ["ai", "metrics", "remotes", "W1N2"], { stopLoss: {
		badWindows: 2, state: "PAUSE_RECOMMENDED", evaluatedTick: 9999,
		evidence: ["high_creep_losses"]
	} });
	let stopLoss = AIObserver._stopLoss(remote);
	assert.strictEqual(stopLoss.badWindows, 1);
	assert.strictEqual(stopLoss.state, "PROBATION");
});

test("remote reactivation completes only after mining and delivery resume", function () {
	reset({ time: 22000 });
	AIInterface.initMemory();
	let site = { ai_pause: { state: "REACTIVATING" } };
	let remote = {
		room: "W1N2", health: "HEALTHY", stopLoss: { state: "NORMAL" },
		population: { roles: {
			burrower: { alive: 1 }, carrier: { alive: 1 }
		} },
		delivery: { lastDeliveryTick: Game.time - 100 }
	};
	assert.strictEqual(AIObserver._remoteLifecycle(remote, site), "ACTIVE");
	assert.strictEqual(site.ai_pause.state, "ACTIVE");
	assert.strictEqual(site.ai_pause.reactivatedTick, Game.time);

	let incomplete = { ai_pause: { state: "REACTIVATING" } };
	remote.population.roles.carrier.alive = 0;
	assert.strictEqual(AIObserver._remoteLifecycle(remote, incomplete), "REACTIVATING");
	assert.strictEqual(incomplete.ai_pause.state, "REACTIVATING");
});

test("remote maintenance actions require authority and delegate only existing-remote objectives", function () {
	reset();
	configureExecution();
	Game.rooms.W1N1 = { name: "W1N1", controller: { my: true } };
	Memory.sites.mining.W1N2 = { colony: "W1N1" };
	putInbox(order("remote-denied-1", "REBALANCE_REMOTE_LOGISTICS", { parameters: { room: "W1N2" } }));
	assert.strictEqual(Memory.ai.orders.rejected[0].reason, "Existing remote maintenance is not authorized by policy");

	reset();
	configureExecution();
	Memory.ai.policy.allowRemoteMaintenance = true;
	Game.rooms.W1N1 = { name: "W1N1", controller: { my: true } };
	Memory.sites.mining.W1N2 = { colony: "W1N1" };
	putInbox(order("remote-ok-1", "ENSURE_REMOTE_INFRASTRUCTURE", { parameters: { room: "W1N2" } }));
	assert.strictEqual(Memory.ai.orders.completed[0].action, "ENSURE_REMOTE_INFRASTRUCTURE");
	assert.strictEqual(Memory.ai.remoteObjectives.W1N2.infrastructure.orderId, "remote-ok-1");
	assert.deepStrictEqual(Memory.sites.mining.W1N2, { colony: "W1N1" });

	RawMemory.segments[91] = "";
	putInbox(order("remote-bad-1", "REASSESS_REMOTE", { parameters: { room: "W9N9" } }));
	assert.ok(Memory.ai.orders.rejected[0].reason.indexOf("not an existing remote") >= 0);
});

test("STOP_REMOTE_MINING is authority-gated and archives configuration before removal", function () {
	reset();
	configureExecution();
	Game.rooms.W1N1 = { name: "W1N1", controller: { my: true } };
	Memory.sites.mining.W1N2 = { colony: "W1N1", can_mine: true, custom: { keep: "recoverable" } };
	Memory.ai.remoteObjectives.W1N2 = { logistics: { orderId: "old" } };
	Memory.ai.establishments.W1N2 = { target: "W1N2", state: "FAILED" };
	Memory.ai.metrics.remotes = { W1N2: { energyDeliveredTotal: 1234 } };
	Memory.ai.intelligence.rooms.W1N2 = { room: "W1N2", lastSeenTick: Game.time };
	Memory.hive = { spawn_requests: [
		{ args: { room: "W1N2", role: "carrier" } },
		{ args: { room: "W2N2", role: "carrier" } }
	] };
	Memory.shard = {
		spawn_requests: [
			{ args: { room: "W1N2", role: "burrower" } },
			{ args: { room: "W2N2", role: "burrower" } }
		],
		spawn_wait: {
			"W1N1|W1N2|carrier|": { firstSeenTick: 1 },
			"W1N1|W2N2|carrier|": { firstSeenTick: 1 }
		}
	};
	putInbox(order("abandon-denied", "STOP_REMOTE_MINING", { parameters: { room: "W1N2" } }));
	assert.strictEqual(Memory.ai.orders.rejected[0].reason, "Remote abandonment is not authorized by policy");
	assert.ok(Memory.sites.mining.W1N2);

	Game.time++;
	Memory.ai.policy.allowRemoteAbandonment = true;
	RawMemory.segments[91] = "";
	putInbox(order("abandon-ok", "STOP_REMOTE_MINING", { parameters: { room: "W1N2" } }));
	assert.strictEqual(Memory.sites.mining.W1N2, undefined);
	assert.strictEqual(Memory.ai.abandonedRemotes.W1N2.site.custom.keep, "recoverable");
	assert.strictEqual(Memory.ai.abandonedRemotes.W1N2.metrics.energyDeliveredTotal, 1234);
	assert.strictEqual(Memory.ai.remoteObjectives.W1N2, undefined);
	assert.strictEqual(Memory.ai.establishments.W1N2, undefined);
	assert.strictEqual(Memory.hive.spawn_requests.length, 1);
	assert.strictEqual(Memory.shard.spawn_requests.length, 1);
	assert.strictEqual(Memory.shard.spawn_wait["W1N1|W1N2|carrier|"], undefined);
	assert.ok(Memory.shard.spawn_wait["W1N1|W2N2|carrier|"]);
	assert.ok(Memory.ai.intelligence.rooms.W1N2);
	assert.ok(_.last(Memory.ai.orders.completed).message.includes("archived for recovery"));
});

test("automatic abandonment evidence resets during recovery and manual pause", function () {
	reset({ time: 10000 });
	AIInterface.initMemory();
	Memory.ai.policy.autoAbandonEvidenceTicks = 3000;
	Memory.ai.metrics.remotes = { W1N2: { stopLoss: {
		badWindows: 3, state: "ABANDON_RECOMMENDED", evaluatedTick: 9000,
		autoEligibilitySinceTick: 7000
	} } };
	let remote = {
		room: "W1N2", colony: "W1N1", active: true, paused: false, health: "FAILING",
		reasons: ["LOW_DELIVERY"]
	};
	Memory.rooms.W1N1 = { population_recovery: { active: true } };
	let result = AIObserver._stopLoss(remote);
	assert.strictEqual(result.suppressed, true);
	assert.strictEqual(result.autoEligibilitySinceTick, null);
	assert.strictEqual(result.autoEligible, false);

	Memory.rooms.W1N1.population_recovery.active = false;
	Game.time = 11000;
	result = AIObserver._stopLoss(remote);
	assert.strictEqual(result.autoEligibilitySinceTick, 11000);
	assert.strictEqual(result.autoEligible, false);
	Game.time = 14000;
	result = AIObserver._stopLoss(remote);
	assert.strictEqual(result.autoEligible, true);
	assert.deepStrictEqual(result.autoEligibilityEvidence, ["delivery_near_zero"]);

	remote.paused = true;
	Game.time++;
	result = AIObserver._stopLoss(remote);
	assert.strictEqual(result.suppressed, true);
	assert.strictEqual(result.autoEligibilitySinceTick, null);
	assert.strictEqual(result.autoEligible, false);
});

function configureStrategicCandidate(target) {
	Game.rooms.W1N1 = {
		name: "W1N1", controller: { my: true, level: 5 }, energyCapacityAvailable: 800,
		storage: { store: { energy: 500000 } },
		findSources: function () { return []; }, find: function () { return []; }
	};
	Memory.ai.metrics.population = { colonies: { W1N1: { expected: { worker: 2 }, actual: { worker: 2 } } } };
	Memory.ai.intelligence.rooms[target] = {
		room: target, lastSeenTick: Game.time, classification: "normal", sourceCount: 2,
		controller: { status: "neutral", ownerRelation: "NEUTRAL", reservationRelation: "NEUTRAL" },
		routeStatus: "available", routeLength: 1, nearestColony: "W1N1",
		layoutAnalysis: { valid: [{ name: "def_hor", origin: { x: 20, y: 20 }, score: 90 }] }
	};
	Memory.ai.strategy = { remoteCandidates: [{
		room: target, origin: "W1N1", score: 90, eligible: true,
		predictedEconomics: AIRemoteStrategy.predictEconomics(2, 1)
	}], claimCandidates: [{
		room: target, origin: "W1N1", score: 85, eligible: true,
		layout: { name: "def_hor", origin: { x: 20, y: 20 } }
	}] };
}

test("START_REMOTE_MINING is authority-gated, validated, idempotent, and delegates to AZC", function () {
	reset();
	configureExecution();
	configureStrategicCandidate("W1N2");
	putInbox(order("new-remote-denied", "START_REMOTE_MINING", { parameters: { origin: "W1N1", target: "W1N2" } }));
	assert.strictEqual(Memory.ai.orders.rejected[0].reason, "New remote establishment is not authorized by policy");

	Game.time++;
	Memory.ai.policy.allowNewRemotes = true;
	configureStrategicCandidate("W1N2");
	putInbox(order("new-remote-ok", "START_REMOTE_MINING", { parameters: { origin: "W1N1", target: "W1N2" } }));
	assert.strictEqual(Memory.sites.mining.W1N2.colony, "W1N1");
	assert.strictEqual(Memory.sites.mining.W1N2.ai_managed, true);
	assert.ok(["CONFIGURING", "RESERVING"].includes(Memory.ai.establishments.W1N2.state));

	Game.time++;
	putInbox(order("new-remote-duplicate", "START_REMOTE_MINING", { parameters: { origin: "W1N1", target: "W1N2" } }));
	assert.strictEqual(Object.keys(Memory.sites.mining).length, 1);
	assert.ok(_.last(Memory.ai.orders.completed).message.includes("already configured"));
});

test("START_REMOTE_MINING rejects stale, foreign, low-score, and invalid-origin targets", function () {
	reset();
	configureExecution();
	configureStrategicCandidate("W1N2");
	Memory.ai.policy.allowNewRemotes = true;
	Memory.ai.intelligence.rooms.W1N2.lastSeenTick = Game.time - 20000;
	putInbox(order("new-remote-stale", "START_REMOTE_MINING", { parameters: { origin: "W1N1", target: "W1N2" } }));
	assert.ok(Memory.ai.orders.rejected[0].reason.includes("stale"));

	reset(); configureExecution(); configureStrategicCandidate("W1N2"); Memory.ai.policy.allowNewRemotes = true;
	Memory.ai.intelligence.rooms.W1N2.controller.ownerRelation = "HOSTILE";
	putInbox(order("new-remote-foreign", "START_REMOTE_MINING", { parameters: { origin: "W1N1", target: "W1N2" } }));
	assert.ok(Memory.ai.orders.rejected[0].reason.includes("not neutral"));

	reset(); configureExecution(); configureStrategicCandidate("W1N2"); Memory.ai.policy.allowNewRemotes = true;
	Memory.ai.strategy.remoteCandidates[0].eligible = false;
	putInbox(order("new-remote-score", "START_REMOTE_MINING", { parameters: { origin: "W1N1", target: "W1N2" } }));
	assert.ok(Memory.ai.orders.rejected[0].reason.includes("candidate validation"));

	reset(); configureExecution(); configureStrategicCandidate("W1N2"); Memory.ai.policy.allowNewRemotes = true;
	putInbox(order("new-remote-origin", "START_REMOTE_MINING", { parameters: { origin: "W9N9", target: "W1N2" } }));
	assert.ok(Memory.ai.orders.rejected[0].reason.includes("origin"));

	reset(); configureExecution(); configureStrategicCandidate("W1N2"); Memory.ai.policy.allowNewRemotes = true;
	Game.rooms.W2N2 = { name: "W2N2", controller: { my: true }, energyCapacityAvailable: 800 };
	putInbox(order("new-remote-wrong-origin", "START_REMOTE_MINING", { parameters: { origin: "W2N2", target: "W1N2" } }));
	assert.ok(Memory.ai.orders.rejected[0].reason.includes("deterministic candidate origin"));

	reset(); configureExecution(); configureStrategicCandidate("W1N2"); Memory.ai.policy.allowNewRemotes = true;
	Game.map.findRoute = function () { return ERR_NO_PATH; };
	putInbox(order("new-remote-no-live-route", "START_REMOTE_MINING", { parameters: { origin: "W1N1", target: "W1N2" } }));
	assert.ok(Memory.ai.orders.rejected[0].reason.includes("route validation"));
});

test("COLONIZE_ROOM is implemented through existing AZC memory but remains disabled by default", function () {
	reset();
	configureExecution();
	configureStrategicCandidate("W1N2");
	let parameters = { origin: "W1N1", target: "W1N2", layout: { name: "def_hor", origin: { x: 20, y: 20 } } };
	putInbox(order("colonize-denied", "COLONIZE_ROOM", { parameters: parameters }));
	assert.strictEqual(Memory.ai.orders.rejected[0].reason, "Permanent colonization is not authorized by policy");
	Game.time++;
	Memory.ai.policy.allowColonization = true;
	configureStrategicCandidate("W1N2");
	putInbox(order("colonize-ok", "COLONIZE_ROOM", { parameters: parameters }));
	assert.strictEqual(Memory.sites.colonization.W1N2.from, "W1N1");
	assert.deepStrictEqual(Memory.sites.colonization.W1N2.layout, parameters.layout);
});

test("COLONIZE_ROOM rejects unavailable GCL and layouts outside deterministic feasibility", function () {
	reset(); configureExecution(); configureStrategicCandidate("W1N2"); Memory.ai.policy.allowColonization = true;
	Game.gcl.level = 1;
	let parameters = { origin: "W1N1", target: "W1N2", layout: { name: "def_hor", origin: { x: 20, y: 20 } } };
	putInbox(order("colonize-no-gcl", "COLONIZE_ROOM", { parameters: parameters }));
	assert.ok(Memory.ai.orders.rejected[0].reason.includes("GCL slot"));

	reset(); configureExecution(); configureStrategicCandidate("W1N2"); Memory.ai.policy.allowColonization = true;
	parameters = { origin: "W1N1", target: "W1N2", layout: { name: "def_hor", origin: { x: 21, y: 20 } } };
	putInbox(order("colonize-invalid-layout", "COLONIZE_ROOM", { parameters: parameters }));
	assert.ok(Memory.ai.orders.rejected[0].reason.includes("feasible option"));
});

test("claim candidates distinguish existing remotes, foreign ownership, and foreign reservations", function () {
	reset();
	let intel = strategicIntel("W1N2", Game.time);
	intel.layoutAnalysis = { valid: [{ name: "def_hor", origin: { x: 20, y: 20 }, score: 90 }], best: { name: "def_hor", origin: { x: 20, y: 20 }, score: 90 } };
	let remote = AIRemoteStrategy.claimCandidate(intel, {
		currentOperationalRole: "OUR_REMOTE", adjacentRemotePotential: 3,
		remoteEconomics: { measuredDeliveryPer1000: 3200, cumulativeDelivered: 90000, health: "HEALTHY" }
	});
	assert.strictEqual(remote.currentOperationalRole, "OUR_REMOTE");
	assert.strictEqual(remote.economicConversion.isExistingRemote, true);
	assert.strictEqual(remote.economicConversion.temporaryIncomeLossPer1000, 3200);
	assert.ok(remote.bootstrap.estimatedEnergy > 15000);
	assert.strictEqual(remote.strategy.adjacentRemotePotential, 3);

	intel.controller.status = "owned_other";
	intel.controller.owner = "NeutralNeighbor";
	intel.controller.ownerRelation = "NEUTRAL";
	assert.ok(AIRemoteStrategy.claimCandidate(intel, {}).disqualifiers.includes("foreign_owned"));
	intel.controller.status = "reserved";
	intel.controller.owner = null;
	intel.controller.reservation = "NeutralNeighbor";
	intel.controller.reservationRelation = "NEUTRAL";
	assert.ok(AIRemoteStrategy.claimCandidate(intel, {}).disqualifiers.includes("foreign_reserved"));
});

test("colonization readiness reports authoritative legal, population, spawn, economy, layout, route, threat, and ready states", function () {
	function base() {
		reset();
		AIInterface.initMemory();
		Memory.ai.protection.summary = { currentProtectionClaimSlots: 3 };
		let colonies = { W1N1: {
			energy: { storageEnergy: 500000, capacity: 800 },
			population: { demandSatisfaction: 95 },
			spawning: { spawns: 1 }, defense: { hostileCreeps: 0 }
		} };
		let candidate = { room: "W1N2", origin: "W1N1", eligible: true, layout: { name: "def_hor", origin: { x: 20, y: 20 } }, disqualifiers: [] };
		return { colonies: colonies, candidate: candidate };
	}
	let state = base();
	assert.strictEqual(AIObserver._expansionReadiness([state.candidate], state.colonies).status, "READY");
	Game.gcl.level = 1;
	assert.strictEqual(AIObserver._expansionReadiness([state.candidate], state.colonies).status, "NO_GCL_CAPACITY");

	state = base(); state.colonies.W1N1.population.demandSatisfaction = 50;
	assert.strictEqual(AIObserver._expansionReadiness([state.candidate], state.colonies).status, "BLOCKED_BY_POPULATION");
	state = base(); state.colonies.W1N1.spawning.spawns = 0;
	assert.strictEqual(AIObserver._expansionReadiness([state.candidate], state.colonies).status, "BLOCKED_BY_SPAWN_CAPACITY");
	state = base(); state.colonies.W1N1.energy.storageEnergy = 1000;
	assert.strictEqual(AIObserver._expansionReadiness([state.candidate], state.colonies).status, "BLOCKED_BY_ECONOMY");
	state = base(); state.colonies.W1N1.defense.hostileCreeps = 1;
	assert.strictEqual(AIObserver._expansionReadiness([state.candidate], state.colonies).status, "BLOCKED_BY_THREAT");
	state = base(); state.candidate.eligible = false; state.candidate.disqualifiers = ["no_feasible_layout"];
	assert.strictEqual(AIObserver._expansionReadiness([state.candidate], state.colonies).status, "BLOCKED_BY_LAYOUT");
	state = base(); state.candidate.eligible = false; state.candidate.disqualifiers = ["no_route"];
	assert.strictEqual(AIObserver._expansionReadiness([state.candidate], state.colonies).status, "BLOCKED_BY_ROUTE");
	state = base(); state.candidate.eligible = false; state.candidate.disqualifiers = ["post_protection_only"];
	assert.strictEqual(AIObserver._expansionReadiness([state.candidate], state.colonies).status, "BLOCKED_BY_PROTECTION");
});

test("expansion forecast funds an adjacent second spawn from risk-adjusted reserve instead of a fixed 250k gate", function () {
	reset({ time: 10000 });
	AIInterface.initMemory();
	Memory.ai.policy.allowColonization = true;
	Memory.ai.protection.summary = { currentProtectionClaimSlots: 3 };
	_.set(Memory, ["ai", "strategy", "empireLoad"], { homePopulation: { criticalSatisfaction: 100 } });
	let colonies = { W1N1: {
		energy: { storageEnergy: 104012, capacity: 2300 },
		population: { demandSatisfaction: 100, roles: {} },
		spawning: { spawns: 1 }, defense: { hostileCreeps: 0 },
		controller: { rcl: 6, progress: 200000 }
	} };
	let candidate = {
		room: "W1N2", origin: "W1N1", eligible: true, disqualifiers: [],
		layout: { name: "def_hor", origin: { x: 20, y: 20 } },
		bootstrap: { estimatedEnergy: 46300, routeLength: 1 },
		route: { length: 1 }, security: { hostileCreeps: 0 },
		economicConversion: { isExistingRemote: false, temporaryIncomeLossPer1000: 0 },
		strategy: { neighboringPlayers: [], spawnCapacityExpansionValue: 20 }
	};
	let readiness = AIObserver._expansionReadiness([candidate], colonies);
	assert.strictEqual(readiness.status, "READY");
	assert.strictEqual(readiness.forecast.status, "FAVORABLE");
	assert.ok(readiness.forecast.requiredStorage < 104012);
	assert.strictEqual(readiness.forecast.spawnCapacityExpansionValue, 20);
});

test("expansion forecast vetoes sustained negative storage across immediate and regime horizons", function () {
	reset({ time: 10000 });
	AIInterface.initMemory();
	Memory.ai.policy.allowColonization = true;
	Memory.ai.protection.summary = { currentProtectionClaimSlots: 3 };
	_.set(Memory, ["ai", "strategy", "empireLoad"], { homePopulation: { criticalSatisfaction: 100 } });
	Memory.ai.economicHistory = { W1N1: [
		{ tick: 4000, storageEnergy: 150000, controllerProgress: 180000, rcl: 6, remoteDelivered: 10000 },
		{ tick: 9000, storageEnergy: 115000, controllerProgress: 195000, rcl: 6, remoteDelivered: 40000 }
	] };
	let colonies = { W1N1: {
		energy: { storageEnergy: 104012, capacity: 2300 },
		population: { demandSatisfaction: 100, roles: {} }, spawning: { spawns: 1 },
		defense: { hostileCreeps: 0 }, controller: { rcl: 6, progress: 200000 }
	} };
	let candidate = {
		room: "W1N2", origin: "W1N1", eligible: true, disqualifiers: [],
		layout: { name: "def_hor", origin: { x: 20, y: 20 } },
		bootstrap: { estimatedEnergy: 46300 }, route: { length: 1 },
		security: { hostileCreeps: 0 }, strategy: { neighboringPlayers: [] },
		economicConversion: { isExistingRemote: false, temporaryIncomeLossPer1000: 0 }
	};
	let readiness = AIObserver._expansionReadiness([candidate], colonies);
	assert.strictEqual(readiness.status, "BLOCKED_BY_ECONOMY");
	assert.strictEqual(readiness.forecast.sustainedNegativeEconomy, true);
	assert.ok(readiness.forecast.reasons.includes("SUSTAINED_NEGATIVE_ECONOMY"));
});

test("spawn forecast separates productive saturation from essential backlog in spawn ticks", function () {
	reset();
	AIInterface.initMemory();
	_.set(Memory, ["shard", "spawn_requests"], [
		{ room: "W1N1", body: "burrower", level: 5, args: { role: "burrower", room: "W1N2", colony: "W1N1" } },
		{ room: "W1N1", body: "scout", level: 1, args: { role: "scout", room: "W1N3", colony: "W1N1" } }
	]);
	let forecast = AIObserver._spawnForecast("W1N1", { population: { roles: {} } });
	assert.strictEqual(forecast.classes.PRODUCTIVE_GROWTH_BACKLOG.requests, 1);
	assert.strictEqual(forecast.classes.OPTIONAL_BACKLOG.requests, 1);
	assert.ok(forecast.totalSpawnTicks > 0);
});

test("economic forecast history retains bounded interval samples for all three horizons", function () {
	reset({ time: 1000 });
	AIInterface.initMemory();
	let colony = { W1N1: {
		energy: { storageEnergy: 100000 }, controller: { progress: 1000, rcl: 6 }
	} };
	AIObserver._recordEconomicSamples(colony, []);
	Game.time = 1050;
	colony.W1N1.energy.storageEnergy = 101000;
	AIObserver._recordEconomicSamples(colony, []);
	Game.time = 1100;
	colony.W1N1.energy.storageEnergy = 102000;
	AIObserver._recordEconomicSamples(colony, []);
	assert.strictEqual(Memory.ai.economicHistory.W1N1.length, 2);
	assert.strictEqual(Memory.ai.economicHistory.W1N1[0].tick, 1000);
	assert.strictEqual(Memory.ai.economicHistory.W1N1[1].tick, 1100);
});

test("multi-colony origin selection prefers bootstrap health over hardcoded room names", function () {
	reset();
	let colonies = {
		W1N1: { energy: { storageEnergy: 50000, capacity: 800 }, population: { demandSatisfaction: 50 }, spawning: { spawns: 1 }, defense: { hostileCreeps: 0 } },
		W3N1: { energy: { storageEnergy: 600000, capacity: 1300 }, population: { demandSatisfaction: 100 }, spawning: { spawns: 2 }, defense: { hostileCreeps: 0 } }
	};
	let origin = AIObserver._bestExpansionOrigin("W2N1", colonies);
	assert.strictEqual(origin.room, "W3N1");
	assert.ok(origin.score > 0);
});

test("existing remote conversion tracks claim through self-sustaining success", function () {
	reset(); configureExecution(); configureStrategicCandidate("W1N2");
	Memory.ai.policy.allowColonization = true;
	Memory.sites.mining.W1N2 = { colony: "W1N1", can_mine: true };
	Memory.ai.strategy.claimCandidates[0].currentOperationalRole = "OUR_REMOTE";
	Memory.ai.strategy.claimCandidates[0].bootstrap = { estimatedEnergy: 46300, burden: "MODERATE" };
	Memory.ai.strategy.claimCandidates[0].economicConversion = { isExistingRemote: true, temporaryIncomeLossPer1000: 3000 };
	Memory.ai.strategy.claimCandidates[0].strategy = { adjacentRemotePotential: 2 };
	let parameters = { origin: "W1N1", target: "W1N2", layout: { name: "def_hor", origin: { x: 20, y: 20 } } };
	putInbox(order("colonize-remote", "COLONIZE_ROOM", { parameters: parameters }));
	assert.strictEqual(Memory.sites.mining.W1N2.ai_converting_to_colony, true);
	assert.strictEqual(Memory.ai.colonizations.W1N2.currentOperationalRole, "OUR_REMOTE");

	let spawnSites = [];
	Game.rooms.W1N2 = {
		name: "W1N2", controller: { my: true, level: 1 },
		find: function (type) { return type === FIND_MY_CONSTRUCTION_SITES ? spawnSites : []; }
	};
	AIObserver._updateColonizations();
	assert.strictEqual(Memory.ai.colonizations.W1N2.state, "CLAIMED");
	assert.strictEqual(Memory.sites.mining.W1N2.colony, "W1N2");
	assert.strictEqual(Memory.hive.pulses.blueprint.request, "W1N2");
	spawnSites = [{ structureType: "spawn" }];
	Game.time++;
	AIObserver._updateColonizations();
	assert.strictEqual(Memory.ai.colonizations.W1N2.state, "SPAWN_BUILDING");

	Game.rooms.W1N2.controller.level = 3;
	Game.creeps.localWorker = { name: "localWorker", memory: { room: "W1N2", colony: "W1N2", role: "worker" } };
	Game.spawns.newSpawn = { room: { name: "W1N2" }, spawning: { name: "localWorker" } };
	Memory.ai.metrics.population.colonies.W1N2 = { expected: { worker: 1 }, actual: { worker: 1 } };
	_.set(Memory, ["ai", "metrics", "population", "remotes", "W1N2"], {
		expected: { burrower: 1, carrier: 1 }, actual: { burrower: 1, carrier: 1 }
	});
	Game.rooms.W1N2.controller.level = 2;
	Game.time++;
	AIObserver._updateColonizations();
	let operation = Memory.ai.colonizations.W1N2;
	assert.strictEqual(operation.state, "ECONOMY_BOOTSTRAPPING");
	assert.strictEqual(Memory.rooms.W1N2.spawn_assist, undefined);
	assert.strictEqual(Memory.rooms.W1N2.spawn_assist_retired_tick, Game.time);
	assert.strictEqual(operation.bootstrapSupport.required, false);
	Game.rooms.W1N2.controller.level = 3;
	Game.time++;
	AIObserver._updateColonizations();
	operation = Memory.ai.colonizations.W1N2;
	assert.strictEqual(operation.state, "SUCCESS");
	assert.strictEqual(operation.outcome, "SUCCESS");
	assert.ok(operation.claimTick != null);
	assert.ok(operation.spawnOperationalTick != null);
	assert.ok(operation.firstHarvestTick != null);
	assert.ok(operation.firstIndependentSpawnTick != null);
});

test("colonization failure stops reinvestment and prevents immediate retry", function () {
	reset(); configureExecution(); configureStrategicCandidate("W1N2");
	Memory.ai.policy.allowColonization = true;
	let parameters = { origin: "W1N1", target: "W1N2", layout: { name: "def_hor", origin: { x: 20, y: 20 } } };
	putInbox(order("colonize-timeout", "COLONIZE_ROOM", { parameters: parameters }));
	Game.time += 15001;
	AIObserver._updateColonizations();
	assert.strictEqual(Memory.ai.colonizations.W1N2.state, "FAILED");
	assert.strictEqual(Memory.ai.colonizations.W1N2.outcome, "FAILED");
	assert.strictEqual(Memory.sites.colonization.W1N2, undefined);
	configureStrategicCandidate("W1N2");
	putInbox(order("colonize-retry-too-soon", "COLONIZE_ROOM", { parameters: parameters }));
	assert.ok(_.last(Memory.ai.orders.rejected).reason.includes("retry cooldown"));
	delete Memory.ai.majorOperations.lastColonizationTick;
	let readiness = AIObserver._expansionReadiness([{
		room: "W1N2", origin: "W1N1", eligible: false,
		disqualifiers: ["retry_cooldown_after_failure"]
	}], {
		W1N1: {
			population: { demandSatisfaction: 100 }, energy: { storageEnergy: 1000000, capacity: 2300 },
			spawning: { spawns: 1 }, defense: { hostileCreeps: 0 }
		}
	});
	assert.strictEqual(readiness.status, "COLONIZATION_COOLDOWN");
});

test("scout terminal failure and expiry do not report successful observation", function () {
	reset();
	configureExecution();
	Memory.ai.policy.allowScouting = true;
	Game.rooms.W1N1 = { name: "W1N1", controller: { my: true } };
	putInbox(order("scout-fail-1", "SCOUT_ROOM", { parameters: { room: "W1N2", origin: "W1N1" } }));
	Memory.rooms.W1N1.scout_requests[0].status = "FAILED";
	Memory.rooms.W1N1.scout_requests[0].failure_reason = "no spawn path";
	AIInterface.run();
	assert.strictEqual(Memory.ai.orders.rejected[0].status, "failed");
	assert.strictEqual(Memory.ai.scoutHistory[0].status, "FAILED");

	reset();
	configureExecution();
	Memory.ai.policy.allowScouting = true;
	Game.rooms.W1N1 = { name: "W1N1", controller: { my: true } };
	putInbox(order("scout-expire-live-1", "SCOUT_ROOM", {
		expiresTick: Game.time + 1, parameters: { room: "W1N2", origin: "W1N1" }
	}));
	Game.time += 2;
	AIInterface.run();
	assert.strictEqual(Memory.ai.orders.rejected[0].status, "expired");
});

test("fresh vision cannot rewrite a terminal scout state", function () {
	reset();
	AIInterface.initMemory();
	Memory.rooms.W1N1 = { scout_requests: [{
		id: "done-scout", ai_managed: true, status: "COMPLETED",
		dest_pos: { roomName: "W1N2" }, observed_tick: 900
	}] };
	AIObserver._markScoutObserved("W1N2");
	assert.strictEqual(Memory.rooms.W1N1.scout_requests[0].status, "COMPLETED");
	assert.strictEqual(Memory.rooms.W1N1.scout_requests[0].observed_tick, 900);
});

test("status acknowledgements serialize to segment 92", function () {
	reset();
	configureExecution();
	putInbox(order("status-1", "REQUEST_STATUS"));
	let status = JSON.parse(RawMemory.segments[92]);
	assert.strictEqual(status.schemaVersion, 1);
	assert.strictEqual(status.orders.completed, 1);
	assert.strictEqual(Memory.ai.orders.totals.completed, 1);
	assert.deepStrictEqual(status.orders.activeOrders, []);
	assert.strictEqual(status.orders.recentResults[0].id, "status-1");
});

test("human authority changes are attributed and colonization autonomy stays off", function () {
	reset();
	require("../definitions_console_commands");
	Console.Init();
	ai.colonization(true);
	ai.autoColonization(false);
	let changes = Memory.ai.authorityAudit.filter(function (entry) {
		return entry.authority === "allowColonization" || entry.authority === "autoColonization";
	});
	assert.ok(changes.some(function (entry) { return entry.source === "HUMAN_CONSOLE" && entry.actor === "HUMAN"; }));
	assert.strictEqual(Memory.ai.policy.autoColonization, false);
});

test("temporary remote pause and resume preserve configuration", function () {
	reset();
	configureExecution();
	Memory.sites.mining.W1N2 = {
		colony: "W1N1", can_mine: true, list_route: ["W1N1", "W1N2"],
		survey: { source_amount: 2 }, custom_marker: "preserve"
	};
	Memory.ai.remoteObjectives.W1N2 = { reservation: { expiresTick: 3000 } };
	putInbox(order("pause-remote-1", "PAUSE_REMOTE_MINING", { parameters: { room: "W1N2" } }));
	assert.strictEqual(Memory.sites.mining.W1N2.ai_paused, true);
	assert.strictEqual(Memory.sites.mining.W1N2.custom_marker, "preserve");
	assert.strictEqual(Memory.ai.remoteObjectives.W1N2, undefined);
	Game.time++;
	putInbox(order("resume-remote-1", "RESUME_REMOTE_MINING", { parameters: { room: "W1N2" } }));
	assert.strictEqual(Memory.sites.mining.W1N2.ai_paused, false);
	assert.strictEqual(Memory.sites.mining.W1N2.custom_marker, "preserve");
	assert.strictEqual(Memory.sites.mining.W1N2.ai_pause.state, "REACTIVATING");
});

test("empire load marks severe home shortage critical and ranks failed remote first", function () {
	reset();
	AIInterface.initMemory();
	_.set(Memory, ["rooms", "W1N1", "population_recovery"], {
		active: true, enteredTick: 900, stableSinceTick: null,
		reason: "EMPIRE_LOAD_CRITICAL", satisfaction: 18.75,
		criticalSatisfaction: 37.5, updatedTick: Game.time
	});
	Memory.ai.establishments.failed = { target: "W1N3", state: "FAILED" };
	let role = function (desired, alive) { return { desired: desired, alive: alive, spawning: 0 }; };
	let colonies = { W1N1: {
		population: { desiredTotal: 16, aliveTotal: 3, oldestWaitingTicks: 500, roles: { worker: role(4, 1), carrier: role(2, 1), burrower: role(2, 1) } },
		spawning: { spawns: 1, busy: 1, queueDepth: 5 }
	} };
	let remote = function (room, health, losses) { return {
		room: room, paused: false, health: health, lifecycleState: health,
		population: { desiredTotal: 8, assignedTotal: 2, roles: { reserver: role(1, 0) } },
		reservation: { reserverPresent: 0, reserverSpawning: 0, reserverQueued: 0 },
		losses: { creepLossesTotal: losses }, mining: { energyWaiting: 2500 }, route: { length: 2 },
		delivery: { energyDeliveredTotal: 1000 }
	};
	};
	let load = AIObserver._empireLoad(colonies, [remote("W1N2", "DEGRADED", 2), remote("W1N3", "FAILING", 10)]);
	assert.strictEqual(load.state, "CRITICAL");
	assert.strictEqual(load.growthVeto, true);
	assert.strictEqual(load.schedulerRecovery.active, true);
	assert.strictEqual(load.schedulerRecovery.rooms.W1N1.reason, "EMPIRE_LOAD_CRITICAL");
	assert.strictEqual(load.remoteRanking[0].room, "W1N3");
	assert.strictEqual(load.remoteRanking[0].recommendation, "PAUSE");
});

test("remote staffing deficit does not veto growth when home critical roles are healthy", function () {
	reset();
	AIInterface.initMemory();
	let role = function (desired, alive) {
		return { desired: desired, alive: alive, spawning: 0 };
	};
	let colonies = { W1N1: {
		population: {
			desiredTotal: 10, aliveTotal: 10, oldestWaitingTicks: 0,
			roles: { worker: role(8, 8), upgrader: role(2, 2) }
		},
		spawning: { spawns: 1, busy: 0, queueDepth: 0 }
	} };
	let remotes = [{
		room: "W1N2", paused: false, health: "FAILING", lifecycleState: "FAILING",
		population: { desiredTotal: 18, assignedTotal: 0, roles: {} },
		reservation: { reserverPresent: 0, reserverSpawning: 0, reserverQueued: 0 },
		losses: { creepLossesTotal: 0 }, mining: { energyWaiting: 0 },
		route: { length: 1 }, delivery: { energyDeliveredTotal: 0 }
	}];
	let load = AIObserver._empireLoad(colonies, remotes);
	assert.strictEqual(load.state, "STRAINED");
	assert.strictEqual(load.growthVeto, false);
	assert.ok(_.includes(load.reasons, "REMOTE_STAFFING_DEFICIT"));
	assert.strictEqual(load.schedulerRecovery.active, false);
});

test("covered home replacement does not trigger critical load or remote drawdown", function () {
	reset();
	AIInterface.initMemory();
	let role = function (desired, alive, spawning, queued) {
		return { desired: desired, alive: alive, spawning: spawning || 0, queued: queued || 0 };
	};
	let colonies = { W1N1: {
		population: {
			desiredTotal: 4, aliveTotal: 3, oldestWaitingTicks: 1,
			roles: { worker: role(3, 2, 1, 0), upgrader: role(1, 1, 0, 0) }
		},
		spawning: {
			spawns: 1, busy: 1, queueDepth: 1,
			homeQueueDepth: 1, remoteQueueDepth: 0
		}
	} };
	let remotes = [{
		room: "W1N2", paused: false, health: "DEGRADED", lifecycleState: "DEGRADED",
		population: { desiredTotal: 6, assignedTotal: 2, roles: {} },
		reservation: { reserverPresent: 0, reserverSpawning: 0, reserverQueued: 0 },
		losses: { creepLossesTotal: 0 }, mining: { energyWaiting: 0 },
		route: { length: 1 }, delivery: { energyDeliveredTotal: 1000 }
	}];
	let load = AIObserver._empireLoad(colonies, remotes);
	assert.strictEqual(load.state, "STRAINED");
	assert.strictEqual(load.homePopulation.satisfaction, 75);
	assert.strictEqual(load.homePopulation.coverageSatisfaction, 100);
	assert.strictEqual(load.homePopulation.criticalSatisfaction, 100);
	assert.strictEqual(_.includes(load.reasons, "HOME_POPULATION_CRITICAL"), false);
	assert.strictEqual(_.includes(load.reasons, "SPAWN_CAPACITY_OVEREXTENDED"), false);
});

test("satisfied role wait age cannot manufacture sustained overextension", function () {
	reset();
	AIInterface.initMemory();
	let role = function (desired, alive, waitingTicks, state) {
		return {
			desired: desired, alive: alive, spawning: 0, queued: 0,
			waitingTicks: waitingTicks, state: state
		};
	};
	let colonies = { W1N1: {
		population: {
			desiredTotal: 4, aliveTotal: 3, oldestWaitingTicks: 251,
			roles: {
				worker: role(2, 2, 251, "SATISFIED"),
				carrier: role(2, 1, 135, "UNDERSTAFFED")
			}
		},
		spawning: {
			spawns: 1, busy: 1, queueDepth: 4,
			homeQueueDepth: 4, remoteQueueDepth: 0
		}
	} };
	let load = AIObserver._empireLoad(colonies, []);
	assert.strictEqual(load.spawnPressure.oldestHomeDemandTicks, 135);
	assert.strictEqual(load.state, "STRAINED");
	assert.strictEqual(_.includes(load.reasons, "SPAWN_CAPACITY_OVEREXTENDED"), false);
});

test("remote bootstrap queue is not counted as home spawn pressure", function () {
	reset();
	AIInterface.initMemory();
	let role = function (desired, alive) {
		return { desired: desired, alive: alive, spawning: 0, queued: 0 };
	};
	let colonies = { W1N1: {
		population: {
			desiredTotal: 4, aliveTotal: 4, oldestWaitingTicks: 0,
			roles: { worker: role(3, 3), upgrader: role(1, 1) }
		},
		spawning: {
			spawns: 1, busy: 1, queueDepth: 6,
			homeQueueDepth: 0, remoteQueueDepth: 6
		}
	} };
	let remotes = [{
		room: "W1N2", paused: false, health: "FAILING", lifecycleState: "FAILING",
		population: { desiredTotal: 6, assignedTotal: 0, roles: {} },
		reservation: { reserverPresent: 0, reserverSpawning: 0, reserverQueued: 0 },
		losses: { creepLossesTotal: 0 }, mining: { energyWaiting: 0 },
		route: { length: 1 }, delivery: { energyDeliveredTotal: 0 }
	}];
	let load = AIObserver._empireLoad(colonies, remotes);
	assert.strictEqual(load.state, "STRAINED");
	assert.strictEqual(load.spawnPressure.queueDepth, 6);
	assert.strictEqual(load.spawnPressure.homeQueueDepth, 0);
	assert.strictEqual(load.spawnPressure.remoteQueueDepth, 6);
	assert.strictEqual(_.includes(load.reasons, "SPAWN_CAPACITY_OVEREXTENDED"), false);
});

test("small satisfied RCL colony does not relatch recovery at the bootstrap floor", function () {
	reset({ time: 5000 });
	AIInterface.initMemory();
	let role = function (desired, alive) {
		return { desired: desired, alive: alive, spawning: 0 };
	};
	let colonies = { W1N1: {
		population: {
			desiredTotal: 2, aliveTotal: 3, oldestWaitingTicks: 0,
			roles: { worker: role(1, 2), upgrader: role(1, 1) }
		},
		spawning: { spawns: 1, busy: 1, queueDepth: 0 }
	} };
	let remotes = [{
		room: "W1N2", paused: false, health: "FAILING", lifecycleState: "FAILING",
		population: { desiredTotal: 6, assignedTotal: 0, roles: {} },
		reservation: { reserverPresent: 0, reserverSpawning: 0, reserverQueued: 0 },
		losses: { creepLossesTotal: 0 }, mining: { energyWaiting: 0 },
		route: { length: 1 }, delivery: { energyDeliveredTotal: 0 }
	}];
	let load = AIObserver._empireLoad(colonies, remotes);
	assert.strictEqual(load.state, "STRAINED");
	assert.strictEqual(_.includes(load.reasons, "HOME_POPULATION_CRITICAL"), false);
	assert.ok(_.includes(load.reasons, "REMOTE_STAFFING_DEFICIT"));

	_.set(Memory, ["ai", "strategy", "empireLoad"], load);
	Memory.ai.metrics.population = { colonies: { W1N1: {
		expected: { worker: 1, upgrader: 1 },
		actual: { worker: 2, upgrader: 1 }, requested: {}
	} } };
	Memory.rooms.W1N1 = { population_recovery: {
		active: true, enteredTick: 1000, stableSinceTick: 2000,
		unstableSinceTick: null, reason: "EMPIRE_LOAD_CRITICAL"
	} };
	let recovery = Control.homeRecoveryState("W1N1");
	assert.strictEqual(recovery.active, false);
	assert.strictEqual(recovery.reason, "HOME_RECOVERED");
});

test("failed establishment preserves its original remote pause identity", function () {
	reset({ time: 9000 });
	AIInterface.initMemory();
	Memory.sites.mining.W1N2 = {
		colony: "W1N1", can_mine: true, ai_paused: true,
		ai_pause: {
			state: "PAUSED", pausedTick: 8000, reason: "startup failed",
			source: "ESTABLISHMENT_STOP_LOSS", recoverySinceTick: null
		}
	};
	Memory.ai.establishments = {
		"establish-1": { target: "W1N2", createdTick: 1000, firstDeliveryTotal: 0 }
	};
	Memory.ai.intelligence.rooms.W1N2 = { controller: { ownerRelation: "NEUTRAL" } };
	AIObserver._updateEstablishments();
	assert.strictEqual(Memory.sites.mining.W1N2.ai_pause.pausedTick, 8000);
	Game.time = 9100;
	AIObserver._updateEstablishments();
	assert.strictEqual(Memory.sites.mining.W1N2.ai_pause.pausedTick, 8000);
});

test("invisible legacy establishment recovers active state from durable delivery", function () {
	reset({ time: 9000 });
	AIInterface.initMemory();
	Memory.sites.mining.W1N2 = { colony: "W1N1", can_mine: true };
	Memory.ai.establishments = {
		"establish-1": {
			target: "W1N2", state: "RESERVING", createdTick: 1000,
			firstDeliveryTotal: 1000
		}
	};
	_.set(Memory, ["ai", "metrics", "remotes", "W1N2"], { energyDeliveredTotal: 6000 });
	Memory.ai.intelligence.rooms.W1N2 = { controller: { ownerRelation: "NEUTRAL" } };
	AIObserver._updateEstablishments();
	assert.strictEqual(Memory.ai.establishments["establish-1"].state, "ACTIVE");
	assert.strictEqual(Memory.ai.establishments["establish-1"].actualDelivered, 5000);
});

test("productive establishment survives temporary total miner loss", function () {
	reset({ time: 9000 });
	AIInterface.initMemory();
	Game.rooms.W1N2 = {};
	Memory.sites.mining.W1N2 = { colony: "W1N1", can_mine: true, ai_paused: false };
	Memory.ai.establishments = {
		W1N2: {
			target: "W1N2", state: "HEALTHY", createdTick: 1000,
			firstDeliveryTotal: 1000, failureReason: null
		}
	};
	_.set(Memory, ["ai", "metrics", "remotes", "W1N2"], { energyDeliveredTotal: 6000 });
	Memory.ai.intelligence.rooms.W1N2 = { controller: { ownerRelation: "NEUTRAL" } };
	AIObserver._updateEstablishments();
	assert.strictEqual(Memory.ai.establishments.W1N2.state, "DEGRADED");
	assert.strictEqual(Memory.ai.establishments.W1N2.failureReason, null);
	assert.strictEqual(Memory.sites.mining.W1N2.ai_paused, false);
});

test("legacy false establishment stop-loss is repaired by durable delivery", function () {
	reset({ time: 9000 });
	AIInterface.initMemory();
	Memory.sites.mining.W1N2 = {
		colony: "W1N1", can_mine: true, ai_paused: true,
		ai_pause: {
			state: "PAUSED", pausedTick: 8000,
			reason: "delivery never began within the startup stop-loss window",
			source: "ESTABLISHMENT_STOP_LOSS"
		}
	};
	Memory.ai.establishments = {
		W1N2: {
			target: "W1N2", state: "FAILED", createdTick: 1000,
			firstDeliveryTotal: 1000,
			failureReason: "delivery never began within the startup stop-loss window"
		}
	};
	_.set(Memory, ["ai", "metrics", "remotes", "W1N2"], { energyDeliveredTotal: 6000 });
	Memory.ai.intelligence.rooms.W1N2 = { controller: { ownerRelation: "NEUTRAL" } };
	AIObserver._updateEstablishments();
	assert.strictEqual(Memory.ai.establishments.W1N2.state, "DEGRADED");
	assert.strictEqual(Memory.ai.establishments.W1N2.failureReason, null);
	assert.strictEqual(Memory.ai.establishments.W1N2.actualDelivered, 5000);
});

test("paused remote recovery tolerates normal home replacement but not sustained shortage", function () {
	reset({ time: 9000 });
	AIInterface.initMemory();
	Memory.ai.policy.remoteRecoveryStableTicks = 10;
	Memory.ai.policy.remoteRecoveryReplacementGraceTicks = 5;
	let site = {
		colony: "W1N1", ai_paused: true,
		ai_pause: { state: "PAUSED", pausedTick: 3000, recoverySinceTick: null }
	};
	_.set(Memory, ["ai", "strategy", "empireLoad"], {
		state: "STRAINED", homePopulation: { satisfaction: 100 }
	});
	assert.strictEqual(AIObserver._remoteLifecycle({ room: "W1N2", health: "FAILING" }, site), "PAUSED");
	assert.strictEqual(site.ai_pause.recoverySinceTick, 9000);

	Game.time = 9006;
	_.set(Memory, ["ai", "strategy", "empireLoad", "homePopulation", "satisfaction"], 80);
	_.set(Memory, ["rooms", "W1N1", "population_recovery", "replacementCovered"], true);
	assert.strictEqual(AIObserver._remoteLifecycle({ room: "W1N2", health: "FAILING" }, site), "PAUSED");
	assert.strictEqual(site.ai_pause.recoverySinceTick, 9000);

	Game.time = 9011;
	_.set(Memory, ["ai", "strategy", "empireLoad", "homePopulation", "satisfaction"], 100);
	_.set(Memory, ["rooms", "W1N1", "population_recovery", "replacementCovered"], false);
	assert.strictEqual(AIObserver._remoteLifecycle({ room: "W1N2", health: "FAILING" }, site), "RECOVERY_CANDIDATE");

	Game.time = 9012;
	_.set(Memory, ["ai", "strategy", "empireLoad", "homePopulation", "satisfaction"], 80);
	assert.strictEqual(AIObserver._remoteLifecycle({ room: "W1N2", health: "FAILING" }, site), "PAUSED");
	Game.time = 9017;
	assert.strictEqual(AIObserver._remoteLifecycle({ room: "W1N2", health: "FAILING" }, site), "PAUSED");
	assert.strictEqual(site.ai_pause.recoverySinceTick, null);
});

test("paused remote recovery uses essential coverage instead of discretionary satisfaction", function () {
	reset({ time: 9000 });
	AIInterface.initMemory();
	Memory.ai.policy.remoteRecoveryStableTicks = 10;
	let site = {
		colony: "W1N1", ai_paused: true,
		ai_pause: { state: "PAUSED", pausedTick: 3000, recoverySinceTick: null }
	};
	_.set(Memory, ["ai", "strategy", "empireLoad"], {
		state: "STRAINED",
		homePopulation: { satisfaction: 70, coverageSatisfaction: 70, criticalSatisfaction: 100 }
	});
	assert.strictEqual(AIObserver._remoteLifecycle({ room: "W1N2", health: "FAILING" }, site), "PAUSED");
	assert.strictEqual(site.ai_pause.recoverySinceTick, 9000);
	Game.time = 9010;
	assert.strictEqual(AIObserver._remoteLifecycle({ room: "W1N2", health: "FAILING" }, site), "RECOVERY_CANDIDATE");
});

test("frontier exploration extends one bounded layer beyond known territory", function () {
	reset();
	AIInterface.initMemory();
	Game.map.getRoomLinearDistance = function (from, to) { return from === to ? 0 : ({ W1N2: 1, W1N3: 2 }[to] || 3); };
	Game.map.describeExits = function (room) {
		if (room === "W1N1") return { 3: "W1N2" };
		if (room === "W1N2") return { 3: "W1N3" };
		return {};
	};
	let frontier = AIObserver._frontierRooms(["W1N1"], ["W1N1", "W1N2"], { W1N1: {}, W1N2: {} });
	assert.ok(frontier.all.includes("W1N3"));
});

test("existing main loop runs with AI disabled", function () {
	reset({ segments: {} });
	let calls = [];
	let noop = function (name) { return function () { calls.push(name); }; };
	let control = {
		refillBucket: function () { return false; },
		clearDeadMemory: noop("clearDeadMemory"),
		initMemory: noop("initMemory"),
		initLabs: noop("initLabs"),
		initVisuals: noop("initVisuals"),
		runColonies: noop("runColonies"),
		runColonizations: noop("runColonizations"),
		runCombat: noop("runCombat"),
		runHighwayMining: noop("runHighwayMining"),
		processSpawnRequests: noop("processSpawnRequests"),
		processSpawnRenewing: noop("processSpawnRenewing"),
		sellExcessResources: noop("sellExcessResources"),
		moveExcessEnergy: noop("moveExcessEnergy"),
		endMemory: noop("endMemory"),
		generatePixels: noop("generatePixels")
	};
	let context = {
		module: { exports: {} },
		require: function () {},
		Stats_CPU: { Init: noop("cpuInit"), Finish: noop("cpuFinish") },
		Stats_Grafana: { Run: noop("grafana") },
		Control: control,
		AIInterface: AIInterface,
		ShardControl: { run: noop("shard") },
		FlagController: { run: noop("flags") },
		Blueprint: { Init: noop("blueprint") },
		factories: { maintenance: noop("factories") },
		Portals: { scanPortals: noop("portals") },
		ShardCoordinator: { monitorOperations: noop("coordinator") },
		hasCPU: function () { return true; },
		isPulse_Long: function () { return false; },
		isPulse_Mid: function () { return false; }
	};
	vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8"), context);
	assert.doesNotThrow(function () { context.module.exports.loop(); });
	assert.strictEqual(Memory.ai.enabled, false);
	assert.ok(calls.indexOf("runColonies") >= 0);
	assert.ok(calls.indexOf("runCombat") >= 0);
	assert.ok(calls.indexOf("factories") >= 0);
});

let failures = 0;
tests.forEach(function (entry) {
	try {
		entry.fn();
		originalConsole.log("PASS", entry.name);
	} catch (err) {
		failures++;
		originalConsole.error("FAIL", entry.name);
		originalConsole.error(err.stack || err);
	}
});

global.console = originalConsole;
if (failures > 0)
	process.exitCode = 1;
else
	originalConsole.log(`\n${tests.length} AI commander tests passed.`);
