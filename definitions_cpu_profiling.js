/* ***********************************************************
 *	[sec09a] DEFINITIONS: CPU PROFILING
 * *********************************************************** */

 global.Stats_CPU = {

	Init: function () {
		profiler = new Object();
		profiler.run = function (cycles) {
			_.set(Memory, ["hive", "profiler", "cycles"], (cycles == null) ? 1 : cycles);
			_.set(Memory, ["hive", "profiler", "cycles_total"], (cycles == null) ? 1 : cycles);
			_.set(Memory, ["hive", "profiler", "status"], "on");
			_.set(Memory, ["hive", "profiler", "pulses"], new Object());
			return "<font color=\"#D3FFA3\">[CPU]</font> Profiler started"
		};

		profiler.stop = function () {
			_.set(Memory, ["hive", "profiler", "cycles"], 0);
			return "<font color=\"#D3FFA3\">[CPU]</font> Profiler stopped"
		};

		// Enhanced profiling with optimization analysis
		profiler.analyze = function () {
			let current = _.get(Memory, ["hive", "profiler", "current"]);
			if (!current) return "<font color=\"#FF6B6B\">[CPU]</font> No profiling data available. Run profiler.run() first.";
			
			let analysis = {
				hotspots: [],
				recommendations: [],
				totalCPU: 0,
				roomBreakdown: {}
			};
			
			// Analyze each room's CPU usage
			for (let room in current) {
				let roomCPU = 0;
				let roomFunctions = [];
				
				for (let func in current[room]) {
					let funcData = current[room][func];
					let totalUsed = 0;
					let cycles = Object.keys(funcData).length;
					
					_.forEach(funcData, cycle => {
						totalUsed += _.get(cycle, "used", 0);
					});
					
					let avgCPU = totalUsed / cycles;
					roomCPU += totalUsed;
					
					roomFunctions.push({
						name: func,
						total: totalUsed,
						average: avgCPU,
						cycles: cycles
					});
					
					// Identify hotspots (>0.5 CPU average)
					if (avgCPU > 0.5) {
						analysis.hotspots.push({
							room: room,
							function: func,
							avgCPU: avgCPU,
							totalCPU: totalUsed
						});
					}
				}
				
				analysis.roomBreakdown[room] = {
					totalCPU: roomCPU,
					functions: roomFunctions
				};
				analysis.totalCPU += roomCPU;
			}
			
			// Generate optimization recommendations
			analysis.hotspots.sort((a, b) => b.avgCPU - a.avgCPU);
			
			// Console output
			console.log(`<font color=\"#D3FFA3\">[CPU Analysis]</font> <b>Performance Analysis:</b>`);
			console.log(`<font color=\"#D3FFA3\">[CPU Analysis]</font> Total CPU: ${analysis.totalCPU.toFixed(2)}`);
			
			if (analysis.hotspots.length > 0) {
				console.log(`<font color=\"#FF6B6B\">[CPU Analysis]</font> <b>CPU Hotspots Found:</b>`);
				_.each(analysis.hotspots.slice(0, 5), hotspot => {
					console.log(`  ${hotspot.room}.${hotspot.function}: ${hotspot.avgCPU.toFixed(2)} avg CPU`);
				});
				
				console.log(`<font color=\"#FFA500\">[CPU Analysis]</font> <b>Optimization Recommendations:</b>`);
				_.each(analysis.hotspots.slice(0, 3), hotspot => {
					if (hotspot.avgCPU > 1.0) {
						console.log(`  ⚠️  ${hotspot.room}.${hotspot.function}: Consider caching or reducing frequency`);
					} else if (hotspot.avgCPU > 0.5) {
						console.log(`  ⚡ ${hotspot.room}.${hotspot.function}: Monitor for optimization opportunities`);
					}
				});
			} else {
				console.log(`<font color=\"#47FF3E\">[CPU Analysis]</font> <b>✅ No major CPU hotspots detected!</b>`);
			}
			
			// Room breakdown
			console.log(`<font color=\"#D3FFA3\">[CPU Analysis]</font> <b>Room CPU Breakdown:</b>`);
			_.each(analysis.roomBreakdown, (data, room) => {
				console.log(`  ${room}: ${data.totalCPU.toFixed(2)} CPU`);
			});
			
			return `<font color=\"#D3FFA3\">[CPU Analysis]</font> Analysis complete.`;
		};

		if (_.get(Memory, ["hive", "profiler"]) == null)
			_.set(Memory, ["hive", "profiler"], new Object());

		if (_.get(Memory, ["hive", "profiler", "status"]) == null)
			_.set(Memory, ["hive", "profiler", "status"], "off");

		if (_.get(Memory, ["hive", "profiler", "status"]) != "on")
			return;

		if (_.get(Memory, ["hive", "profiler", "cycles"]) == null)
			_.set(Memory, ["hive", "profiler", "cycles"], 0);
		else
			_.set(Memory, ["hive", "profiler", "cycles"], _.get(Memory, ["hive", "profiler", "cycles"]) - 1);

		if (_.get(Memory, ["hive", "profiler", "current"]) == null)
			_.set(Memory, ["hive", "profiler", "current"], new Object());

		if (isPulse_Short())
			_.set(Memory, ["hive", "profiler", "pulses", "short"], _.get(Memory, ["hive", "profiler", "pulses", "short"], 0) + 1);
		if (isPulse_Mid())
			_.set(Memory, ["hive", "profiler", "pulses", "mid"], _.get(Memory, ["hive", "profiler", "pulses", "mid"], 0) + 1);
		if (isPulse_Long())
			_.set(Memory, ["hive", "profiler", "pulses", "long"], _.get(Memory, ["hive", "profiler", "pulses", "long"], 0) + 1);
		if (isPulse_Spawn())
			_.set(Memory, ["hive", "profiler", "pulses", "spawn"], _.get(Memory, ["hive", "profiler", "pulses", "spawn"], 0) + 1);
		if (isPulse_Lab())
			_.set(Memory, ["hive", "profiler", "pulses", "lab"], _.get(Memory, ["hive", "profiler", "pulses", "lab"], 0) + 1);
	},

	Start: function (room, name) {
		if (_.get(Memory, ["hive", "profiler", "status"]) != "on")
			return;

		_.set(Memory, ["hive", "profiler", "current", room, name,
			_.get(Memory, ["hive", "profiler", "cycles"]),
			"start"], Game.cpu.getUsed());
	},

	End: function (room, name) {
		if (_.get(Memory, ["hive", "profiler", "status"]) != "on")
			return;

		let cycle = Memory["hive"]["profiler"]["cycles"];
		_.set(Memory, ["hive", "profiler", "current", room, name, cycle, "used"],
			Game.cpu.getUsed() - _.get(Memory, ["hive", "profiler", "current", room, name, cycle, "start"]));
	},

	Finish: function () {
		if (_.get(Memory, ["hive", "profiler", "status"]) != "on")
			return;

		if (_.get(Memory, ["hive", "profiler", "cycles"]) <= 0) {
			let total_cycles = _.get(Memory, ["hive", "profiler", "cycles_total"]);

			console.log(`<font color=\"#D3FFA3">Pulses during profiling: \n`
				+ `Short:\t ${_.get(Memory, ["hive", "profiler", "pulses", "short"], 0)} \n`
				+ `Mid:\t ${_.get(Memory, ["hive", "profiler", "pulses", "mid"], 0)} \n`
				+ `Long:\t ${_.get(Memory, ["hive", "profiler", "pulses", "long"], 0)} \n`
				+ `Spawn:\t ${_.get(Memory, ["hive", "profiler", "pulses", "spawn"], 0)} \n`
				+ `Lab:\t ${_.get(Memory, ["hive", "profiler", "pulses", "lab"], 0)} \n`);

			for (let r in _.get(Memory, ["hive", "profiler", "current"])) {
				let output = "";
				let room_used = 0, room_cycles = 0;

				for (let n in _.get(Memory, ["hive", "profiler", "current", r])) {
					let used = 0;
					let cycles = Object.keys(_.get(Memory, ["hive", "profiler", "current", r, n])).length;
					_.forEach(_.get(Memory, ["hive", "profiler", "current", r, n]), c => { used += _.get(c, "used", 0); });
					used = ((used > 0 == true) ? used : 0);
					output += `<tr><td>(${parseFloat(used).toFixed(2)} / ${cycles})</td><td>${parseFloat(used / cycles).toFixed(2)}</td><td>${n}</td></tr>`;

					room_used += used;
					if (typeof (room_cycles) != "number")
						room_cycles = 0;
					room_cycles = Math.max(room_cycles, cycles);
				}

				console.log(`<font color=\"#D3FFA3">CPU report for ${r} \n`
					+ `Room Total: ${parseFloat(room_used).toFixed(2)} : `
					+ `Room Mean: ${parseFloat(room_used / total_cycles).toFixed(2)}</font> `
					+ `<table><tr><th>Total / Cycles\t  </th><th>Mean\t  </th><th>Function</th></tr>`
					+ `${output}</table>`);
			}

			_.set(Memory, ["hive", "profiler", "status"], "off");
			_.set(Memory, ["hive", "profiler", "current"], new Object());	// Wipe for the next use
		} else if (_.get(Memory, ["hive", "profiler", "cycles"]) % 5 == 0) {
			console.log(`<font color=\"#D3FFA3\">[CPU]</font> Profiler running, ${_.get(Memory, ["hive", "profiler", "cycles"])} ticks remaining.`);
		}
	}
};
