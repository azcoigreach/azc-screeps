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

		// Draw population and defense info (defense is now only in the pop panel)
		if (_.get(Memory, ["hive", "visuals", "show_room_population"], false) == true) {
			this.Show_Room_Population();
		}

		// Removed call to Show_Room_Defense to prevent duplicate defense text
		// if (_.get(Memory, ["hive", "visuals", "show_room_defense"], false) == true) {
		// 	this.Show_Room_Defense();
		// }

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
		// Display defense state above population, then pop count, then list of creeps by role, all on the left side under the tick
		_.each(_.filter(Game.rooms, r => r.controller && r.controller.my), room => {
			const visual = new RoomVisual(room.name);
			const population = this.Get_Room_Population(room);
			const defense = this.Get_Room_Defense(room);
			let y = 2.0; // Start just below the tick
			const x = 1.0; // Left side
			// Defense state
			visual.text(`Defense: ${defense.status}`, x, y, {
				font: 0.6,
				color: defense.status === 'Safe' ? '#00ff00' : defense.status === 'Warning' ? '#ffff00' : '#ff0000',
				align: 'left',
				stroke: '#000',
				strokeWidth: 0.10
			});
			y += 0.8;
			// Population count
			visual.text(`Pop: ${population.current}/${population.target}`, x, y, {
				font: 0.6,
				color: population.current >= population.target ? '#00ff00' : '#ffff00',
				align: 'left',
				stroke: '#000',
				strokeWidth: 0.10
			});
			y += 0.7;
			// List creeps by role
			_.each(population.roles, (count, role) => {
				if (count > 0) {
					visual.text(`${role}: ${count}`, x, y, {
						font: 0.5,
						color: '#ffffff',
						align: 'left',
						stroke: '#000',
						strokeWidth: 0.08
					});
					y += 0.55;
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
		const barY = 0.3;
		// Define custom cell widths for each stat to reclaim space and add space between labs and factory
		const cellWidths = [3.2, 3.2, 3.2, 4.2, 3.2, 2.2, 2.2, 2.2, 3.2, 3.2, 2.2, 2.2, 5.5, 4.2];
		const cellH = 0.9;
		let x = 0.5;
		const font = 0.55;
		const stats = this.Get_Status_Bar_Stats(room);
		visual.rect(0.3, barY - 0.2, cellWidths.reduce((a, b) => a + b, 0) + 0.4, cellH + 0.4, {fill: '#222', opacity: 0.45, stroke: undefined});
		for (let i = 0; i < stats.length; i++) {
			const stat = stats[i];
			visual.text(stat.icon + ' ' + stat.value, x + cellWidths[i]/2, barY + 0.65, {
				font: font,
				color: stat.color,
				align: 'center',
				stroke: '#000',
				strokeWidth: 0.10
			});
			x += cellWidths[i];
		}
	},

	Get_Status_Bar_Stats: function(room) {
		// Gather stats for the status bar, using icons and color coding
		const cpu = _.get(Memory, ['stats', 'cpu', 'used'], Game.cpu.getUsed()).toFixed(1);
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
		// Calculate rampart/wall avg and setpoint
		const wallsAndRamparts = room.find(FIND_STRUCTURES, {filter: s => s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL});
		let avgHits = 0, setpoint = 0;
		if (wallsAndRamparts.length > 0) {
			avgHits = Math.round(_.sum(wallsAndRamparts, s => s.hits) / wallsAndRamparts.length);
			setpoint = Math.round(_.sum(wallsAndRamparts, s => {
				return _.get(Memory, ['rooms', room.name, 'structures', `${s.structureType}-${s.id}`, 'targetHits'], 0);
			}) / wallsAndRamparts.length);
			// If setpoint is 0, use avgHits or a default (e.g., 1_000_000)
			if (setpoint === 0) setpoint = avgHits > 0 ? avgHits : 1000000;
		}
		const hitsFormat = v => v >= 1000000 ? (v/1000000).toFixed(1) + 'M' : v >= 1000 ? (v/1000).toFixed(0) + 'k' : v;
		const rampartStat = wallsAndRamparts.length > 0 ? `${hitsFormat(avgHits)}/${hitsFormat(setpoint)}` : '0/0';
		// Factory assignment name or --- (use Memory.resources.factories.assignments)
		let factoryAssignment = '---';
		const factories = room.find(FIND_MY_STRUCTURES, {filter: s => s.structureType === STRUCTURE_FACTORY});
		if (factories.length > 0) {
			const assignments = _.get(Memory, ['resources', 'factories', 'assignments'], {});
			const assignment = assignments[factories[0].id];
			if (assignment && assignment.commodity) {
				factoryAssignment = assignment.commodity;
			}
		}
		// Remove truncation for factory assignment name
		const factoryAssignmentDisplay = factoryAssignment;
		return [
			{icon: '⏱️', value: tick, color: '#fff', bg: '#222'},
			{icon: '🧠', value: cpu, color: '#fff', bg: '#444'},
			{icon: '🪣', value: bucket, color: bucket > 5000 ? '#0f0' : '#ff0', bg: '#333'},
			{icon: '🏠', value: room.name, color: '#fff', bg: '#222'},
			{icon: '🏅', value: `RCL${rcl}`, color: '#fff', bg: '#222'},
			{icon: '⚡', value: `${rclProg}%`, color: '#0ff', bg: '#111'},
			{icon: '🥚', value: spawns, color: '#fff', bg: '#333'}, // egg for spawns
			{icon: '🤖', value: creeps, color: '#fff', bg: '#333'},
			{icon: '🔋', value: storage, color: '#ff0', bg: '#222'},
			{icon: '📦', value: terminal, color: '#0ff', bg: '#222'},
			{icon: '💡', value: sources, color: '#0f0', bg: '#222'}, // light bulb for sources
			{icon: '🧪', value: labs, color: '#fff', bg: '#222'},
			{icon: '🏭', value: factoryAssignmentDisplay, color: '#fff', bg: '#222'},
			{icon: '🛡️', value: rampartStat, color: '#fff', bg: '#222'},
		];
	},

	Show_Controller_Overlay: function(room) {
		if (!room.controller) return;
		const visual = new RoomVisual(room.name);
		const ctrl = room.controller;
		const upgraders = _.filter(Game.creeps, c => c.memory.role === 'upgrader' && c.memory.room === room.name).length;
		const prog = ((ctrl.progress / ctrl.progressTotal) * 100).toFixed(0);
		const ticks = ctrl.ticksToDowngrade;
		// Determine alignment and position
		let x, align;
		if (ctrl.pos.x > 45) {
			x = ctrl.pos.x - 1.2;
			align = 'right';
		} else {
			x = ctrl.pos.x + 1.2;
			align = 'left';
		}
		let y = ctrl.pos.y - 0.7;
		const lineH = 0.55;
		// Draw background rectangle BEFORE any text
		const gutterY = 0.18;
		const bgW = 3.2 * 0.90; // Tighter width for 3 lines
		const bgH = lineH * 3 + gutterY * 2;
		const bgX = align === 'left' ? x - 0.1 : x - bgW + 0.1;
		const bgY = ctrl.pos.y - 1.1 - gutterY;
		visual.rect(bgX, bgY, bgW, bgH, {fill: '#222', opacity: 0.45, stroke: undefined});
		// Now draw the text
		visual.text(`🤖 ${upgraders}`, x, y, {
			font: 0.5,
			color: '#bfff00',
			align: align,
			stroke: '#000',
			strokeWidth: 0.08
		});
		y += lineH;
		visual.text(`⚡ ${prog}%`, x, y, {
			font: 0.5,
			color: '#00bfff',
			align: align,
			stroke: '#000',
			strokeWidth: 0.08
		});
		y += lineH;
		visual.text(`⏳ ${ticks}`, x, y, {
			font: 0.5,
			color: '#ffb300',
			align: align,
			stroke: '#000',
			strokeWidth: 0.08
		});
	},

	Show_Source_Overlays: function(room) {
		const visual = new RoomVisual(room.name);
		const sources = room.find(FIND_SOURCES);
		_.each(sources, source => {
			// Robust miner count: miner, burrower, worker (if mining), assigned via memory.source, memory.target, or room memory
			const miners = _.filter(Game.creeps, c => (
				(
					(c.memory.role === 'miner' || c.memory.role === 'burrower' || c.memory.role === 'worker') &&
					(
						c.memory.source === source.id ||
						c.memory.target === source.id ||
						// For burrowers, check room memory assignment
						(c.memory.role === 'burrower' && _.get(Memory, ["rooms", room.name, "sources", source.id, "burrower"]) === c.id)
					)
				)
			)).length;

			// Comprehensive hauler count: include all creeps that could service this source
			// This includes explicit assignments, room-based assignments, and creeps currently working near the source
			const haulers = _.filter(Game.creeps, c => {
				// Check if creep has explicit assignment to this source
				if (c.memory.source === source.id || c.memory.target === source.id) {
					return true;
				}
				
				// Check if creep is assigned to work in this room and could service this source
				if (c.memory.room === room.name || c.memory.colony === room.name) {
					// Include hauling roles that work in this room
					if (['hauler', 'carrier', 'courier', 'worker'].includes(c.memory.role)) {
						return true;
					}
				}
				
				// Check if creep is currently near this source (within 3 tiles)
				if (c.room.name === room.name && c.pos.getRangeTo(source.pos) <= 3) {
					// Include any creep that could haul (has carry capacity and is near source)
					if (c.carryCapacity > 0 && ['hauler', 'carrier', 'courier', 'worker', 'miner'].includes(c.memory.role)) {
						return true;
					}
				}
				
				return false;
			}).length;

			const regen = source.ticksToRegeneration;
			const energy = source.energy;
			// Determine alignment and position
			let x, align;
			if (source.pos.x > 45) {
				x = source.pos.x - 1.2;
				align = 'right';
			} else {
				x = source.pos.x + 1.2;
				align = 'left';
			}
			let y = source.pos.y - 0.7;
			const lineH = 0.55;
			// Draw background rectangle BEFORE any text
			const gutterY = 0.18;
			const bgW = 3.2 * 0.75; // 70% of 3.2
			const bgH = lineH * 4 + gutterY * 2;
			const bgX = align === 'left' ? x - 0.2 : x - bgW + 0.2;
			const bgY = source.pos.y - 1.2 - gutterY;
			visual.rect(bgX, bgY, bgW, bgH, {fill: '#222', opacity: 0.45, stroke: undefined});
			// Now draw the text
			let displayRegen = (typeof regen === 'number' && regen !== undefined) ? regen : '---';
			let yText = source.pos.y - 0.7;
			visual.text(`🔋 ${energy}`, x, yText, {
				font: 0.5,
				color: '#bfff00',
				align: align,
				stroke: '#000',
				strokeWidth: 0.08
			});
			yText += lineH;
			visual.text(`⛏️ ${miners}`, x, yText, {
				font: 0.5,
				color: '#ffbfbf',
				align: align,
				stroke: '#000',
				strokeWidth: 0.08
			});
			yText += lineH;
			visual.text(`🚚 ${haulers}`, x, yText, {
				font: 0.5,
				color: '#ffb300',
				align: align,
				stroke: '#000',
				strokeWidth: 0.08
			});
			yText += lineH;
			visual.text(`♻️ ${displayRegen}`, x, yText, {
				font: 0.5,
				color: '#00ff99',
				align: align,
				stroke: '#000',
				strokeWidth: 0.08
			});
		});
	},
};
