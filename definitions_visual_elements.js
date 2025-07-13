/* ***********************************************************
 *	[sec08a] DEFINITIONS: VISUAL ELEMENTS
 * *********************************************************** */

 global.Stats_Visual = {

	Init: function () {
		if (_.get(Memory, ["hive", "visuals", "show_path"], false) == true)
			this.Show_Path();

		if (_.get(Memory, ["hive", "visuals", "show_repair"], false) == true) {
			this.Show_Repair();
			if (isPulse_Long() || _.keys(Memory.hive.visuals.repair_levels).length == 0)
				this.Compile_Repair();
		} else {
			_.set(Memory, ["hive", "visuals", "repair_levels"], null);
		}

		// Draw status bar for every owned room
		_.each(_.filter(Game.rooms, r => r.controller && r.controller.my), room => {
			this.Show_Status_Bar(room);
			this.Show_Controller_Overlay(room);
		});

		// Draw source overlays for all visible rooms (owned and remote)
		_.each(Game.rooms, room => {
			this.Show_Source_Overlays(room);
		});

		// New room visualization features
		if (_.get(Memory, ["hive", "visuals", "show_room_status"], false) == true) {
			this.Show_Room_Status();
		}

		if (_.get(Memory, ["hive", "visuals", "show_room_energy"], false) == true) {
			this.Show_Room_Energy();
		}

		if (_.get(Memory, ["hive", "visuals", "show_room_population"], false) == true) {
			this.Show_Room_Population();
		}

		if (_.get(Memory, ["hive", "visuals", "show_room_defense"], false) == true) {
			this.Show_Room_Defense();
		}

		if (_.get(Memory, ["hive", "visuals", "show_room_construction"], false) == true) {
			this.Show_Room_Construction();
		}
	},

	Show_Path: function () {
		// Display pathfinding visuals
		_.each(_.keys(_.get(Memory, ["hive", "paths", "prefer", "rooms"])), r => {
			_.each(_.get(Memory, ["hive", "paths", "prefer", "rooms", r]), p => {
				new RoomVisual(r).circle(p, { fill: "green", stroke: "green", radius: 0.15, opacity: 0.25 });
			});
		});
		_.each(_.keys(_.get(Memory, ["hive", "paths", "avoid", "rooms"])), r => {
			_.each(_.get(Memory, ["hive", "paths", "avoid", "rooms", r]), p => {
				new RoomVisual(r).circle(p, { fill: "red", stroke: "red", radius: 0.15, opacity: 0.25 });
			});
		});
		_.each(_.keys(_.get(Memory, ["hive", "paths", "exits", "rooms"])), r => {
			_.each(_.get(Memory, ["hive", "paths", "exits", "rooms", r]), p => {
				new RoomVisual(r).circle(p, { fill: "green", radius: 0.4, opacity: 0.25 });
			});
		});
		_.each(_.keys(Memory.rooms), r => {
			if (_.get(Memory, ["rooms", r, "camp"]) != null)
				new RoomVisual(r).circle(_.get(Memory, ["rooms", r, "camp"]),
					{ fill: "orange", stroke: "pink", radius: 0.3, opacity: 0.25 });
		});
	},

	Show_Repair: function () {
		// Display repair levels for ramparts and walls
		_.each(_.get(Memory, ["hive", "visuals", "repair_levels"]), l => {
			if (_.get(l, ["pos", "roomName"]) != null && _.get(l, "percent") != null) {
				let percent = new String(l["percent"]);
				new RoomVisual(l["pos"]["roomName"]).text(
					`${percent.substr(0, percent.indexOf('.'))}%`,
					l["pos"], { font: (percent < 80 ? 0.45 : 0.35), color: "white" });
			}
		});
	},

	Compile_Repair: function () {
		// Compile repair levels for ramparts and walls
		_.set(Memory, ["hive", "visuals", "repair_levels"], new Array());
		_.each(_.filter(Game.rooms, r => { return r.controller != null && r.controller.my }), r => {
			_.each(_.filter(r.find(FIND_STRUCTURES),
				s => { return s.structureType == "constructedWall" || s.structureType == "rampart"; }), w => {
					let p = w.hits / _.get(Memory, ["rooms", r.name, "structures", `${w.structureType}-${w.id}`, "targetHits"], r.getWallTarget()) * 100;
					Memory["hive"]["visuals"]["repair_levels"].push({ pos: w.pos, percent: p });
				})
		});
	},

	Show_Room_Status: function () {
		// (DISABLED) Remove any full-room border or overlay
		// Previously: visual.rect(0, 0, 50, 50, ...)
		// This function is now a no-op to prevent any room-covering visuals.
	},

	Show_Room_Energy: function () {
		// Display energy levels in storage, terminal, and containers
		_.each(_.filter(Game.rooms, r => r.controller && r.controller.my), room => {
			const visual = new RoomVisual(room.name);
			
			// Storage energy
			const storage = room.storage;
			if (storage && storage.store[RESOURCE_ENERGY] > 0) {
				const energyPercent = (storage.store[RESOURCE_ENERGY] / storage.store.getCapacity(RESOURCE_ENERGY)) * 100;
				visual.text(`Storage: ${Math.floor(energyPercent)}%`, storage.pos.x, storage.pos.y - 1, {
					font: 0.4,
					color: this.Get_Energy_Color(energyPercent),
					stroke: '#000000',
					strokeWidth: 0.05
				});
			}
			
			// Terminal energy
			const terminal = room.terminal;
			if (terminal && terminal.store[RESOURCE_ENERGY] > 0) {
				const energyPercent = (terminal.store[RESOURCE_ENERGY] / terminal.store.getCapacity(RESOURCE_ENERGY)) * 100;
				visual.text(`Terminal: ${Math.floor(energyPercent)}%`, terminal.pos.x, terminal.pos.y - 1, {
					font: 0.4,
					color: this.Get_Energy_Color(energyPercent),
					stroke: '#000000',
					strokeWidth: 0.05
				});
			}
			
			// Container energy
			const containers = room.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_CONTAINER });
			_.each(containers, container => {
				if (container.store && container.store[RESOURCE_ENERGY] > 0) {
					const energyPercent = (container.store[RESOURCE_ENERGY] / container.store.getCapacity(RESOURCE_ENERGY)) * 100;
					visual.text(`${Math.floor(energyPercent)}%`, container.pos.x, container.pos.y, {
						font: 0.3,
						color: this.Get_Energy_Color(energyPercent),
						stroke: '#000000',
						strokeWidth: 0.03
					});
				}
			});
		});
	},

	Show_Room_Population: function () {
		// Display current vs target population counts
		_.each(_.filter(Game.rooms, r => r.controller && r.controller.my), room => {
			const visual = new RoomVisual(room.name);
			const population = this.Get_Room_Population(room);
			
			// Display population info at top of room
			visual.text(`Pop: ${population.current}/${population.target}`, 25, 4, {
				font: 0.6,
				color: population.current >= population.target ? '#00ff00' : '#ffff00',
				stroke: '#000000',
				strokeWidth: 0.1
			});
			
			// Show population by role
			let yOffset = 6;
			_.each(population.roles, (count, role) => {
				if (count > 0) {
					visual.text(`${role}: ${count}`, 25, yOffset, {
						font: 0.4,
						color: '#ffffff',
						stroke: '#000000',
						strokeWidth: 0.05
					});
					yOffset += 0.6;
				}
			});
		});
	},

	Show_Room_Defense: function () {
		// Display defense status and tower energy
		_.each(_.filter(Game.rooms, r => r.controller && r.controller.my), room => {
			const visual = new RoomVisual(room.name);
			const defense = this.Get_Room_Defense(room);
			
			// Display defense status
			visual.text(`Defense: ${defense.status}`, 25, 8, {
				font: 0.5,
				color: defense.status === 'Safe' ? '#00ff00' : defense.status === 'Warning' ? '#ffff00' : '#ff0000',
				stroke: '#000000',
				strokeWidth: 0.1
			});
			
			// Show tower energy levels
			_.each(defense.towers, tower => {
				const energyPercent = (tower.store[RESOURCE_ENERGY] / tower.store.getCapacity(RESOURCE_ENERGY)) * 100;
				visual.text(`${Math.floor(energyPercent)}%`, tower.pos.x, tower.pos.y, {
					font: 0.3,
					color: this.Get_Energy_Color(energyPercent),
					stroke: '#000000',
					strokeWidth: 0.03
				});
			});
		});
	},

	Show_Room_Construction: function () {
		// Display construction sites and their progress
		_.each(_.filter(Game.rooms, r => r.controller && r.controller.my), room => {
			const visual = new RoomVisual(room.name);
			const constructionSites = room.find(FIND_CONSTRUCTION_SITES);
			
			_.each(constructionSites, site => {
				const progress = (site.progress / site.progressTotal) * 100;
				visual.text(`${Math.floor(progress)}%`, site.pos.x, site.pos.y, {
					font: 0.4,
					color: progress > 50 ? '#00ff00' : progress > 25 ? '#ffff00' : '#ff0000',
					stroke: '#000000',
					strokeWidth: 0.05
				});
			});
		});
	},

	// Helper functions
	Get_Room_Status: function (room) {
		if (!room.controller || !room.controller.my) return 'Enemy';
		
		const spawns = room.find(FIND_MY_SPAWNS);
		const extensions = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_EXTENSION });
		const storage = room.storage;
		const terminal = room.terminal;
		
		if (spawns.length === 0) return 'No Spawns';
		if (extensions.length < 5) return 'Developing';
		if (storage && terminal) return 'Advanced';
		if (storage || terminal) return 'Established';
		return 'Basic';
	},

	Get_Status_Color: function (status) {
		const colors = {
			'Enemy': '#ff0000',
			'No Spawns': '#ff6600',
			'Developing': '#ffff00',
			'Basic': '#00ff00',
			'Established': '#00ffff',
			'Advanced': '#ff00ff'
		};
		return colors[status] || '#ffffff';
	},

	Get_Energy_Color: function (percent) {
		if (percent > 80) return '#00ff00';
		if (percent > 50) return '#ffff00';
		if (percent > 20) return '#ff6600';
		return '#ff0000';
	},

	Get_Room_Population: function (room) {
		const creeps = room.find(FIND_MY_CREEPS);
		const roles = {};
		let total = 0;
		
		_.each(creeps, creep => {
			const role = creep.memory.role || 'unknown';
			roles[role] = (roles[role] || 0) + 1;
			total++;
		});
		
		// Get target population from memory or default
		const target = _.get(Memory, ['rooms', room.name, 'population', 'target'], 10);
		
		return {
			current: total,
			target: target,
			roles: roles
		};
	},

	Get_Room_Defense: function (room) {
		const towers = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TOWER });
		const hostiles = room.find(FIND_HOSTILE_CREEPS);
		
		let status = 'Safe';
		if (hostiles.length > 0) {
			status = hostiles.length > 3 ? 'Under Attack' : 'Warning';
		}
		
		return {
			status: status,
			towers: towers,
			hostiles: hostiles.length
		};
	},

	CreepSay: function(creep, task) {
		if (!_.get(Memory, ["hive", "visuals", "show_speech"], false)) {
			return;
		}
		const taskEmojis = {
			harvest: '🌾',
			build: '🏗️',
			upgrade: '⚡',
			repair: '🔧',
			attack: '⚔️',
			defend: '🛡️',
			heal: '❤️',
			transfer: '📦',
			withdraw: '📥'
		};
		if (taskEmojis[task]) {
			creep.say(taskEmojis[task]);
		}
	},

	Show_Status_Bar: function(room) {
		const visual = new RoomVisual(room.name);
		const barY = 0.3; // Move bar closer to top
		const cellW = 3.2; // Make cells narrower
		const cellH = 0.9; // Make cells shorter
		let x = 0.5;
		const font = 0.55; // Smaller font
		const stats = this.Get_Status_Bar_Stats(room);
		// Draw a semi-transparent background just behind the bar
		visual.rect(0.3, barY - 0.2, cellW * stats.length + 0.4, cellH + 0.4, {fill: '#222', opacity: 0.45, stroke: undefined});
		_.each(stats, stat => {
			// Remove per-cell backgrounds for a cleaner look
			visual.text(stat.icon + ' ' + stat.value, x + cellW/2, barY + 0.65, {
				font: font,
				color: stat.color,
				align: 'center',
				stroke: '#000',
				strokeWidth: 0.10
			});
			x += cellW;
		});
	},

	Get_Status_Bar_Stats: function(room) {
		// Gather stats for the status bar, using icons and color coding
		const cpu = Game.cpu.getUsed().toFixed(1);
		const bucket = Game.cpu.bucket;
		const avg = (Game.cpu.getUsed() / Game.cpu.limit * 100).toFixed(1);
		const tick = Game.time;
		const rcl = room.controller.level;
		const rclProg = ((room.controller.progress / room.controller.progressTotal) * 100).toFixed(0);
		const spawns = room.find(FIND_MY_SPAWNS).length;
		const creeps = _.filter(Game.creeps, c => c.memory.room === room.name).length;
		const storage = room.storage ? room.storage.store[RESOURCE_ENERGY] : 0;
		const terminal = room.terminal ? room.terminal.store[RESOURCE_ENERGY] : 0;
		const sources = room.find(FIND_SOURCES).length;
		const labs = room.find(FIND_MY_STRUCTURES, {filter: s => s.structureType === STRUCTURE_LAB}).length;
		const factory = room.find(FIND_MY_STRUCTURES, {filter: s => s.structureType === STRUCTURE_FACTORY}).length;
		const ramparts = room.find(FIND_MY_STRUCTURES, {filter: s => s.structureType === STRUCTURE_RAMPART}).length;
		return [
			{icon: '⏱️', value: tick, color: '#fff', bg: '#222'},
			{icon: '🧠', value: cpu, color: '#fff', bg: '#444'},
			{icon: '🪣', value: bucket, color: bucket > 5000 ? '#0f0' : '#ff0', bg: '#333'},
			{icon: '🏠', value: room.name, color: '#fff', bg: '#222'},
			{icon: '🏅', value: `RCL${rcl}`, color: '#fff', bg: '#222'},
			{icon: '⚡', value: `${rclProg}%`, color: '#0ff', bg: '#111'},
			{icon: '🛠️', value: spawns, color: '#fff', bg: '#333'},
			{icon: '👥', value: creeps, color: '#fff', bg: '#333'},
			{icon: '🔋', value: storage, color: '#ff0', bg: '#222'},
			{icon: '📦', value: terminal, color: '#0ff', bg: '#222'},
			{icon: '🌾', value: sources, color: '#0f0', bg: '#222'},
			{icon: '🧪', value: labs, color: '#fff', bg: '#222'},
			{icon: '🏭', value: factory, color: '#fff', bg: '#222'},
			{icon: '🛡️', value: ramparts, color: '#fff', bg: '#222'},
		];
	},

	Show_Controller_Overlay: function(room) {
		if (!room.controller) return;
		const visual = new RoomVisual(room.name);
		const ctrl = room.controller;
		const upgraders = _.filter(Game.creeps, c => c.memory.role === 'upgrader' && c.memory.room === room.name).length;
		const prog = ((ctrl.progress / ctrl.progressTotal) * 100).toFixed(0);
		visual.text(`⚡${upgraders} ${prog}%`, ctrl.pos.x + 2, ctrl.pos.y, {
			font: 0.6,
			color: '#fff',
			align: 'left',
			stroke: '#000',
			strokeWidth: 0.12
		});
	},

	Show_Source_Overlays: function(room) {
		const visual = new RoomVisual(room.name);
		const sources = room.find(FIND_SOURCES);
		_.each(sources, source => {
			const miners = _.filter(Game.creeps, c => c.memory.role === 'miner' && c.memory.source === source.id).length;
			const haulers = _.filter(Game.creeps, c => c.memory.role === 'hauler' && c.memory.source === source.id).length;
			const regen = source.ticksToRegeneration;
			const energy = source.energy;
			visual.text(`🔋${energy} ⛏️${miners} 🚚${haulers} ♻️${regen}`, source.pos.x + 2, source.pos.y, {
				font: 0.5,
				color: '#fff',
				align: 'left',
				stroke: '#000',
				strokeWidth: 0.10
			});
		});
	},
};
