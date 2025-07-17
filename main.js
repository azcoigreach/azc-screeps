/* ***********************************************************
 *
 * Table of Contents:
 *
 * : [sec01a] General Overloads
 * : [sec01b] Overloads: Creep
 * : [sec01c] Overloads: Creep Tasks
 * : [sec01d] Overloads: Creep Travel
 * : [sec01e] Overloads: Lab
 * : [sec01f] Overloads: Room
 * : [sec01g] Overloads: RoomPosition
 *
 * : [sec02a] Definitions: Populations
 * : [sec02b] Definitions: Combat Populations
 *
 * : [sec03a] Creep Body
 * : [sec03b] Creep Roles
 * : [sec03c] Creep Combat Roles
 *
 * : [sec04a] Sites
 * : [sec05a] Hive Control
 *
 * : [sec06a] Blueprint
 * : [sec06b] Blueprint Layouts
 *
 * : [sec07a] Console Commands
 * : [sec08a] Visual Elements
 * : [sec09a] CPU Profiling
 * : [sec10a] Grafana Statistics
 *
 *
 * *********************************************************** */

require("overloads_general");
require("overloads_creep");
require("overloads_creep_tasks");
require("overloads_creep_travel");
require("overloads_lab");
require("overloads_room");
require("overloads_room_position");
require("definitions_populations");
require("definitions_combat_populations");
require("definitions_creep_body");
require("definitions_creep_roles");
require("definitions_creep_combat_roles");
require("definitions_sites");
require("definitions_hive_control");
require("definitions_blueprint");
require("definitions_blueprint_layouts");
require("definitions_console_commands");
require("definitions_visual_elements");
require("definitions_cpu_profiling");
require("definitions_grafana_statistics");
require("mining_efficiency");

/* ***********************************************************
 *	MAIN LOOP
 * *********************************************************** */


module.exports.loop = function () {

	Stats_CPU.Init();

	if (Control.refillBucket()) {
		return;
	}

	Control.clearDeadMemory();
	Control.initMemory();
	Control.initLabs();
	Control.initVisuals();

	Control.runColonies();
	Control.runColonizations();
	Control.runCombat();
	Control.runHighwayMining();

	// Initialize mining efficiency tracking for all owned rooms
	if (Game.time % 10 == 0) {
		_.each(_.filter(Game.rooms, r => r.controller && r.controller.my), room => {
			MiningEfficiency.initRoom(room.name);
		});
	}
	
	// Log mining efficiency performance every 50 ticks (for monitoring)
	if (Game.time % 50 == 0) {
		_.each(_.filter(Game.rooms, r => r.controller && r.controller.my), room => {
			let metrics = MiningEfficiency.calculateEfficiency(room.name);
			if (metrics.efficiency_ratio < 0.7) {
				console.log(`<font color=\"#FF6B6B\">[Mining Alert]</font> ${room.name} efficiency low: ${(metrics.efficiency_ratio * 100).toFixed(1)}% (${metrics.current_rate.toFixed(1)}/10 energy/tick)`);
			}
		});
	}

	Control.processSpawnRequests();
	Control.processSpawnRenewing();

	if (hasCPU()) {
		Control.sellExcessResources();
		Control.moveExcessEnergy();
	}

	if (hasCPU()) {
		Blueprint.Init();
	}

	// Run factory maintenance
	if (hasCPU()) {
		factories.maintenance();
	}

	Control.endMemory();
	Stats_Grafana.Run();

	Stats_CPU.Finish();
};


