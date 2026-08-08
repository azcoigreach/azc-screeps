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
	putInbox(order("unsupported-1", "STOP_REMOTE_MINING"));
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
		parameters: { scouting: "AUTO", remoteMaintenance: "MANUAL" }
	}));
	assert.strictEqual(Memory.ai.policy.allowScouting, true);
	assert.strictEqual(Memory.ai.policy.autoScouting, true);
	assert.strictEqual(Memory.ai.policy.allowRemoteMaintenance, true);
	assert.strictEqual(Memory.ai.policy.autoRemoteMaintenance, false);
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
	assert.ok(ai.status().indexOf("=== AI COMMANDER ===") >= 0);
	assert.ok(ai.enable().indexOf("enabled") >= 0);
	assert.strictEqual(Memory.ai.enabled, true);
	assert.ok(ai.pause().indexOf("paused") >= 0);
	assert.strictEqual(Memory.ai.paused, true);
	assert.ok(ai.mode("execute").indexOf("execute") >= 0);
	assert.ok(ai.scouting(true).indexOf("enabled") >= 0);
	assert.strictEqual(Memory.ai.policy.allowScouting, true);
	assert.ok(ai.explain().indexOf("No explanation") >= 0);
});

test("telemetry schema v3 reports identity, capabilities, defense, territory, and exact byte size", function () {
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
	assert.strictEqual(snapshot.schemaVersion, 3);
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
		newRemotes: false, autoNewRemotes: false, colonization: false,
		autoColonization: false, remoteAbandonment: false,
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
	let creep = { memory: { colony: "W1N1", room: "W1N2" } };
	AIObserver.recordRemoteDelivery(creep, 275);
	AIObserver.recordRemoteDelivery(creep, 25);
	AIObserver.recordRemoteLoss(creep.memory);
	AIObserver.recordRemoteInterruption("W1N2");
	assert.strictEqual(Memory.ai.metrics.remotes.W1N2.energyDeliveredTotal, 300);
	assert.strictEqual(Memory.ai.metrics.remotes.W1N2.creepLossesTotal, 1);
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
		creepLossesTotal: 2, lastCreepLossTick: 900,
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

test("spawn demand aging bounds starvation without outranking emergency requests", function () {
	reset({ time: 2000 });
	let worker = { room: "W1N1", priority: 23, args: { room: "W1N1", role: "worker" } };
	let emergency = { room: "W1N1", priority: 3, args: { room: "W1N1", role: "soldier" } };
	assert.strictEqual(Control.spawnRequestKey(worker), "W1N1|W1N1|worker|");
	assert.strictEqual(Control.effectiveSpawnPriority(worker, { firstSeenTick: 1000 }), 13);
	assert.strictEqual(Control.effectiveSpawnPriority(worker, { firstSeenTick: 0 }), 10);
	assert.strictEqual(Control.effectiveSpawnPriority(emergency, { firstSeenTick: 0 }), 3);
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

function configureStrategicCandidate(target) {
	Game.rooms.W1N1 = {
		name: "W1N1", controller: { my: true, level: 5 }, energyCapacityAvailable: 800,
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

test("status acknowledgements serialize to segment 92", function () {
	reset();
	configureExecution();
	putInbox(order("status-1", "REQUEST_STATUS"));
	let status = JSON.parse(RawMemory.segments[92]);
	assert.strictEqual(status.schemaVersion, 1);
	assert.strictEqual(status.orders.completed, 1);
	assert.strictEqual(status.orders.recentResults[0].id, "status-1");
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
