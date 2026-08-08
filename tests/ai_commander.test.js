"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const originalConsole = global.console;
let logs = [];

global._ = require("lodash");
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
		gcl: { level: 4 },
		rooms: {},
		creeps: {},
		spawns: {},
		structures: {},
		market: { credits: 12345 }
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

test("observe mode prevents execution", function () {
	reset();
	AIInterface.initMemory();
	Memory.ai.enabled = true;
	putInbox(order("observe-1"));
	assert.strictEqual(Memory.ai.orders.completed.length, 0);
	assert.strictEqual(Memory.ai.orders.rejected[0].reason, "Observe mode prevents execution");
});

test("pause prevents execution", function () {
	reset();
	configureExecution();
	Memory.ai.paused = true;
	putInbox(order("paused-1"));
	assert.strictEqual(Memory.ai.orders.completed.length, 0);
	assert.strictEqual(Memory.ai.orders.rejected[0].reason, "AI commander is paused");
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
	assert.ok(ai.explain().indexOf("No explanation") >= 0);
});

test("telemetry serializes as compact strategic JSON", function () {
	reset();
	Game.rooms.W1N1 = {
		name: "W1N1",
		controller: { my: true, level: 6 },
		energyAvailable: 1800,
		energyCapacityAvailable: 2300,
		storage: { store: { energy: 240000 } },
		terminal: { store: { energy: 40000 } }
	};
	Game.creeps.a = {};
	Game.spawns.Spawn1 = { room: { name: "W1N1" } };
	Memory.rooms.W1N1 = { defense: { hostiles: [{ id: "enemy" }] } };
	let serialized = AIObserver.serialize();
	let snapshot = JSON.parse(serialized);
	assert.strictEqual(snapshot.schemaVersion, 1);
	assert.strictEqual(snapshot.colonies.W1N1.storageEnergy, 240000);
	assert.strictEqual(snapshot.colonies.W1N1.hostiles, 1);
	assert.strictEqual(snapshot.empire.creeps, 1);
	assert.ok(serialized.indexOf("controller") < 0);
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
