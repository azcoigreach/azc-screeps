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

require("../definitions_ai_observer");
require("../definitions_ai_interface");

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
	putInbox(order("unsupported-1", "COLONIZE_ROOM"));
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
	assert.strictEqual(Memory.ai.orders.completed.length, 1);
	assert.strictEqual(requests.length, 1);
	assert.strictEqual(requests[0].id, "ai-scout:scout-queue-1");
	assert.strictEqual(requests[0].ai_managed, true);
	assert.strictEqual(requests[0].respawn, false);
	assert.strictEqual(requests[0].count, 1);
	assert.strictEqual(requests[0].dest_pos.roomName, "W1N2");
	assert.deepStrictEqual(requests[0].list_route, ["W1N1", "W1N2"]);
	assert.deepStrictEqual(Memory.sites, { mining: {}, colonization: {}, combat: {} });

	RawMemory.segments[91] = "";
	putInbox(order("scout-queue-2", "SCOUT_ROOM", { parameters: { room: "W1N2", origin: "W1N1" } }));
	assert.strictEqual(Memory.rooms.W1N1.scout_requests.length, 1);
	assert.ok(Memory.ai.orders.completed[1].message.indexOf("already covers") >= 0);
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

test("telemetry schema v2 reports RCL capabilities, defense, territory, and exact byte size", function () {
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
		controller: { my: true, level: 5, progress: 1000, progressTotal: 10000, ticksToDowngrade: 50000, safeModeAvailable: 1 },
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
	assert.strictEqual(snapshot.schemaVersion, 2);
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
		scouting: false, expansion: false, remoteMiningChanges: false,
		market: false, production: false, offensiveCombat: false
	});
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
	assert.ok(snapshot.expansionCandidates[0].disqualifiers.indexOf("intelligence_stale") >= 0);
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
