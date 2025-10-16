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
 * : [sec11a] InterShardMemory Manager
 * : [sec12a] Portals
 * : [sec13a] Shard Coordinator
 * : [sec14a] Global Creeps (Cross-Shard)
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
require("definitions_flag_controller");
require("definitions_visual_elements");
require("definitions_cpu_profiling");
require("definitions_grafana_statistics");
require("definitions_intershard_memory");
require("definitions_portals");
require("definitions_shard_coordinator");
require("definitions_global_creeps");

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

	// Multi-shard coordination (publish status on mid pulse)
	if (hasCPU() && isPulse_Mid()) {
		ShardCoordinator.publishShardStatus();
	}

	// Process portal arrivals (check for incoming creeps)
	if (hasCPU() && isPulse_Short()) {
		Portals.processArrivals();
	}

	// Run all global creeps (independent of colonies)
	// This allows creeps to function on shards without colonies
	// Supports scouts, workers, miners, soldiers, etc.
	if (hasCPU()) {
		GlobalCreeps.run();
	}

        FlagController.run();
        
        Control.runColonies();
        Control.runColonizations();
	Control.runCombat();
	Control.runHighwayMining();

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

	// Scan for portals (long pulse)
	if (hasCPU() && isPulse_Long()) {
		Portals.scanPortals();
	}

	// Monitor cross-shard operations (mid pulse)
	if (hasCPU() && isPulse_Mid()) {
		ShardCoordinator.monitorOperations();
	}

	Control.endMemory();
	Stats_Grafana.Run();

	// Pixel generation logic
	Control.generatePixels();

	Stats_CPU.Finish();
};


