/* ***********************************************************
 *	[sec05a] DEFINITIONS: HIVE CONTROL
 * *********************************************************** */

 global.Control = {

	refillBucket: function () {
		if (Game.cpu.bucket >= 10000 && _.get(Memory, ["hive", "pause", "bucket"], false)) {
			_.set(Memory, ["hive", "pause", "bucket"], false);
			console.log(`<font color=\"#D3FFA3\">[Console]</font> Bucket full, resuming main.js.`);
		}

		return _.get(Memory, ["hive", "pause", "bucket"], false);
	},

	setPulse: function (key, minTicks, maxTicks) {
		let range = maxTicks - minTicks;
		let lastTick = _.get(Memory, ["hive", "pulses", key, "last_tick"]);
		let manuallyActive = _.get(Memory, ["hive", "pulses", key, "active"], false);

		if (manuallyActive) {
			// If manually set to active, leave it active for this tick, then clear it
			_.set(Memory, ["hive", "pulses", key, "active"], false);
			return;
		}

		if (lastTick == null
			|| Game.time == lastTick
			|| (Game.time - lastTick) >= (minTicks + Math.floor((1 - (Game.cpu.bucket / 10000)) * range))) {
			_.set(Memory, ["hive", "pulses", key, "last_tick"], Game.time);
			_.set(Memory, ["hive", "pulses", key, "active"], true);
		} else {
			_.set(Memory, ["hive", "pulses", key, "active"], false);
		}
	},

	moveReusePath: function () {
		let minTicks = 15, maxTicks = 60;
		let range = maxTicks - minTicks;
		return minTicks + Math.floor((1 - (Game.cpu.bucket / 10000)) * range);
	},

	moveRequestPath: function (creep) {
		// Note: needs to return odd number to traverse edge tiles
		// Also: Fluctuating tick amounts gets creeps stuck on edge tiles
		let minTicks = 3, maxTicks = 15;
		let role = _.get(creep, ["memory", "role"]);

		if (creep.pos.isEdge()) {
			minTicks = 3;
			maxTicks = 3;
		} else if ((role == "carrier" || role == "miner" || role == "burrower")
			&& (creep.room.name != _.get(creep, ["memory", "colony"], creep.room.name))) {
			// Remote mining operations outside of colony have increased wait time (CPU optimization)
			minTicks = 9;
			maxTicks = 25;
		}

		let range = maxTicks - minTicks;
		let value = minTicks + Math.floor((1 - (Game.cpu.bucket / 10000)) * range);
		return (value % 2 != 0 ? value : value + 1);
	},

	moveMaxOps: function () {
		let minOps = 2000, maxOps = 3000;
		let range = maxOps - minOps;
		return minOps + Math.floor((1 - (Game.cpu.bucket / 10000)) * range);
	},

	clearDeadMemory: function () {
		if (!isPulse_Short())
			return;

		if (_.has(Memory, "creeps"))
			_.each(Object.keys(Memory.creeps), c => {
				if (!_.has(Game, ["creeps", c])) {
					delete Memory.creeps[c];
				}
			});

		if (_.has(Memory, "rooms"))
			_.each(Object.keys(Memory.rooms), r => {
				if (!_.has(Game, ["rooms", r]))
					delete Memory.rooms[r];
			});
	},

	initMemory: function () {
		Stats_CPU.Start("Hive", "initMemory");

		// Use odd intervals or odd numbers to prevent stacking multiple pulses on one tick
		// Optimized intervals for reduced CPU usage
		this.setPulse("defense", 8, 16);
		this.setPulse("short", 19, 120);
		this.setPulse("mid", 39, 180);
		this.setPulse("long", 99, 400);
		this.setPulse("spawn", 29, 60);
		this.setPulse("lab", 1999, 2000);
		this.setPulse("factory", 199, 400); // Factory assignments every 199-400 ticks
		this.setPulse("blueprint", 199, 1000);

		if (_.get(Memory, ["rooms"]) == null) _.set(Memory, ["rooms"], new Object());
		if (_.get(Memory, ["hive", "allies"]) == null) _.set(Memory, ["hive", "allies"], new Array());
		if (_.get(Memory, ["hive", "pulses"]) == null) _.set(Memory, ["hive", "pulses"], new Object());
		if (_.get(Memory, ["sites", "mining"]) == null) _.set(Memory, ["sites", "mining"], new Object());
		if (_.get(Memory, ["sites", "colonization"]) == null) _.set(Memory, ["sites", "colonization"], new Object());
		if (_.get(Memory, ["sites", "combat"]) == null) _.set(Memory, ["sites", "combat"], new Object());

		for (let r in Game["rooms"])
			_.set(Memory, ["rooms", r, "population"], null);
		_.set(Memory, ["hive", "spawn_requests"], new Array());

		Console.Init();

		Stats_CPU.End("Hive", "initMemory");
	},

	initVisuals: function () {
		Stats_Visual.Init();
	},

	endMemory: function () {
		if (_.has(Memory, ["hive", "pulses", "reset_links"]))
			delete Memory["hive"]["pulses"]["reset_links"];
	},


	runColonies: function () {
		_.each(Game.rooms, room => {
			if (room.controller != null && room.controller.my) {
				Sites.Colony(room.name);
				if (_.get(Memory, ["sites", "mining", room.name]) == null)
					_.set(Memory, ["sites", "mining", room.name], { colony: room.name, has_keepers: false });

				if (room.controller.level >= 6)
					Sites.Industry(room.name);
			}
		});

		let mining = _.get(Memory, ["sites", "mining"]);
		_.each(Object.keys(mining), req => {
			if (_.get(mining, [req, "colony"]) != null)
				Sites.Mining(_.get(mining, [req, "colony"]), req);
		});
	},

	runColonizations: function () {
		_.each(_.get(Memory, ["sites", "colonization"]), req => {
			Sites.Colonization(_.get(req, "from"), _.get(req, "target"));
		});
	},

	runCombat: function () {
		for (let memory_id in _.get(Memory, ["sites", "combat"]))
			Sites.Combat(memory_id);
	},

	runHighwayMining: function () {
		for (let highway_id in _.get(Memory, ["sites", "highway_mining"]))
			Sites.HighwayMining(highway_id);
	},

	populationTally: function (rmName, popTarget, popActual) {
		// Tallies the target population for a colony, to be used for spawn load balancing
		_.set(Memory, ["rooms", rmName, "population", "target"], _.get(Memory, ["rooms", rmName, "population", "target"], 0) + popTarget);
		_.set(Memory, ["rooms", rmName, "population", "actual"], _.get(Memory, ["rooms", rmName, "population", "actual"], 0) + popActual);
	},

	processSpawnRequests: function () {
		/*  lvlPriority is an integer rating priority, e.g.:
				01 - 10: Defense
				11 - 20: Mining, Industry
				21 - 30: Colony

				00: Active Defense

				11: Mining (critical; miner, burrower)
				14: Mining (carriers)
				14-16: Industry (can bring in critical energy!)

				20: Passive Defense
				21: Colonization
				22: Colony (critical)
				25: Colony (regular)


			tgtLevel is the target level of the creep's body (per body.js)
			listRooms is an array of room names that would be acceptable to spawn the request (user defined)
		*/

		if (!isPulse_Spawn())
			return;

		Stats_CPU.Start("Hive", "processSpawnRequests");

		// Cache spawn requests to avoid repeated memory lookups
		let spawnRequests = _.get(Memory, ["hive", "spawn_requests"]);
		if (!spawnRequests || spawnRequests.length == 0) {
			Stats_CPU.End("Hive", "processSpawnRequests");
			return;
		}

		// Cache available spawns once
		let availableSpawns = [];
		let spawnsByRoom = {};
		for (let spawnName in Game["spawns"]) {
			let spawn = Game["spawns"][spawnName];
			if (spawn.spawning == null) {
				availableSpawns.push(spawnName);
				if (!spawnsByRoom[spawn.room.name]) {
					spawnsByRoom[spawn.room.name] = [];
				}
				spawnsByRoom[spawn.room.name].push(spawnName);
			}
		}

		if (availableSpawns.length == 0) {
			Stats_CPU.End("Hive", "processSpawnRequests");
			return;
		}

		// Group requests by room and get highest priority per room
		let requestsByRoom = {};
		for (let request of spawnRequests) {
			let room = _.get(request, "room");
			if (!requestsByRoom[room]) {
				requestsByRoom[room] = [];
			}
			requestsByRoom[room].push(request);
		}

		// Process each room's highest priority request
		for (let room in requestsByRoom) {
			if (availableSpawns.length == 0) break;

			// Sort by priority and get highest priority request
			let roomRequests = requestsByRoom[room].sort((a, b) => _.get(a, "priority", 999) - _.get(b, "priority", 999));
			let request = roomRequests[0];
			if (!request) continue;

			// Find best spawn for this request
			let bestSpawn = null;
			let bestSpawnName = null;

			// Prefer spawns in the same room
			if (spawnsByRoom[room] && spawnsByRoom[room].length > 0) {
				bestSpawnName = spawnsByRoom[room][0];
				bestSpawn = Game["spawns"][bestSpawnName];
			} else {
				// Check listRooms for alternative spawns
				let listRooms = _.get(request, "listRooms");
				if (listRooms) {
					for (let altRoom of listRooms) {
						if (spawnsByRoom[altRoom] && spawnsByRoom[altRoom].length > 0) {
							bestSpawnName = spawnsByRoom[altRoom][0];
							bestSpawn = Game["spawns"][bestSpawnName];
							break;
						}
					}
				}
			}

			if (!bestSpawn) continue;

			// Calculate population ratio once
			let populationActual = _.get(Memory, ["rooms", room, "population", "actual"], 0);
			let populationTarget = _.get(Memory, ["rooms", room, "population", "target"], 1);
			let populationRatio = populationActual / populationTarget;
			_.set(Memory, ["rooms", room, "population", "total"], populationRatio);

			// Calculate level once
			let scale = _.get(request, "scale", true);
			let level = scale == false
				? Math.min(request.level, bestSpawn.room.getLevel())
				: Math.max(1, Math.min(Math.round(populationRatio * request.level), bestSpawn.room.getLevel()));
			request.args["level"] = level;

			let body = Creep_Body.getBody(request.body, level);
			let name = request.name != null ? request.name
				: request.args["role"].substring(0, 4)
				+ (request.args["subrole"] == null ? "" : `-${request.args["subrole"].substring(0, 2)}`)
				+ ":xxxx".replace(/[xy]/g, (c) => {
					let r = Math.random() * 16 | 0, v = c == "x" ? r : (r & 0x3 | 0x8);
					return v.toString(16);
				});

			// Optimize energy structures lookup - only if storage exists
			let energies = null;
			if (bestSpawn.room.storage) {
				energies = bestSpawn.room.find(FIND_MY_STRUCTURES).filter(s => { 
					return s.isActive() && (s.structureType == "extension" || s.structureType == "spawn"); 
				}).sort(s => { return s.pos.getRangeTo(bestSpawn.room.storage); });
			}

			let result = energies == null
				? bestSpawn.spawnCreep(body, name, { memory: request.args })
				: bestSpawn.spawnCreep(body, name, { memory: request.args, energyStructures: energies });

			if (result == OK) {
				console.log(`<font color=\"#19C800\">[Spawns]</font> Spawning `
					+ (bestSpawn.room.name == room ? `${room}  ` : `${bestSpawn.room.name} -> ${room}  `)
					+ `${level} / ${request.level}  ${name} : ${request.args["role"]}`
					+ `${request.args["subrole"] == null ? "" : ", " + request.args["subrole"]} `
					+ `(${request.body})`);

				// Remove the used spawn from all tracking arrays
				let spawnIndex = availableSpawns.indexOf(bestSpawnName);
				if (spawnIndex > -1) {
					availableSpawns.splice(spawnIndex, 1);
				}
				
				// Remove from spawnsByRoom
				for (let roomName in spawnsByRoom) {
					let roomSpawns = spawnsByRoom[roomName];
					let roomIndex = roomSpawns.indexOf(bestSpawnName);
					if (roomIndex > -1) {
						roomSpawns.splice(roomIndex, 1);
					}
				}
			}
		}

		Stats_CPU.End("Hive", "processSpawnRequests");
	},

	processSpawnRenewing: function () {
		Stats_CPU.Start("Hive", "processSpawnRenewing");

		// Cache spawns that are available and have energy
		let availableSpawns = [];
		for (let spawnName in Game["spawns"]) {
			let spawn = Game["spawns"][spawnName];
			if (spawn.spawning == null && spawn.room.energyAvailable > 300) {
				availableSpawns.push(spawn);
			}
		}

		// Process each available spawn
		for (let spawn of availableSpawns) {
			// Find creeps in range that need renewal (optimized filter)
			let nearbyCreeps = spawn.pos.findInRange(FIND_MY_CREEPS, 1);
			for (let creep of nearbyCreeps) {
				if (!creep.isBoosted() && creep.memory.spawn_renew !== false) {
					if (spawn.renewCreep(creep) == OK) {
						break; // Only renew one creep per spawn per tick
					}
				}
			}
		}

		Stats_CPU.End("Hive", "processSpawnRenewing");
	},


	sellExcessResources: function () {
		if (!isPulse_Mid())
			return;

		Stats_CPU.Start("Hive", "sellExcessResources");

		overflow = _.get(Memory, ["resources", "to_market"]);
		if (overflow == null)
			return;

		let resources = new Object();

		_.each(Object.keys(overflow), res => {
			_.each(_.filter(Game.rooms, r => { return _.get(r, ["terminal", "my"], false); }), r => {
				let amount = _.get(r, ["storage", "store", res], 0) + _.get(r, ["terminal", "store", res], 0);
				if (amount > 0)
					_.set(resources, [res, r.name], amount);
			});
		});

		for (let res in resources) {
			let excess = _.sum(resources[res]) - overflow[res];
			if (excess > 100 && _.get(Memory, ["resources", "terminal_orders", `overflow_${res}`]) == null) {
				let room = _.head(_.sortBy(Object.keys(resources[res]), r => { return -resources[res][r]; }));
				let order = _.head(_.sortBy(_.sortBy(Game.market.getAllOrders(
					o => { return o.type == "buy" && o.resourceType == res; }),
					o => { return Game.map.getRoomLinearDistance(o.roomName, room); }),
					o => { return -o.price; }));

				if (order != null) {
					if (_.get(Memory, ["resources", "terminal_orders", `overflow_${res}`]) != null)
						console.log(`<font color=\"#F7FF00\">[Hive]</font> Selling overflow resource to market: ${excess} of ${res} from ${room}`);
					_.set(Memory, ["resources", "terminal_orders", `overflow_${res}`], { market_id: order.id, amount: excess, from: room, priority: 4 });

				}
			}
		}

		Stats_CPU.End("Hive", "sellExcessResources");
	},

	moveExcessEnergy: function () {
		if (!isPulse_Mid())
			return;

		Stats_CPU.Start("Hive", "moveExcessEnergy");

		limit = _.get(Memory, ["resources", "to_overflow"]);
		if (limit == null)
			return;

		let energy = new Object();

		_.forEach(_.filter(Game.rooms,
			r => { return r.terminal != null && r.terminal.my; }),
			r => { energy[r.name] = _.get(r, ["storage", "store", "energy"], 0) + _.get(r, ["terminal", "store", "energy"], 0); });

		let tgtRoom = _.head(_.sortBy(_.filter(Object.keys(energy),
			n => { return energy[n] < (limit * 0.95); }),
			n => { return energy[n]; }));

		if (tgtRoom != null) {
			_.forEach(_.filter(Object.keys(energy),
				r => { return !_.has(Memory, ["resources", "terminal_orders", `overflow_energy_${r}`]) && energy[r] - limit > 100; }),
				r => {	// Terminal transfers: minimum quantity of 100.
					_.set(Memory, ["resources", "terminal_orders", `overflow_energy_${r}`], { room: tgtRoom, resource: "energy", amount: energy[r] - limit, from: r, priority: 2 });
					console.log(`<font color=\"#F7FF00\">[Hive]</font> Creating overflow energy transfer: ${energy[r] - limit}, ${r} -> ${tgtRoom}`);
				});
		}

		Stats_CPU.End("Hive", "moveExcessEnergy");
	},


	initLabs: function () {
		if (!isPulse_Lab())
			return;

		// Reset stockpiles...
		_.each(Memory["rooms"], r => { _.set(r, ["stockpile"], new Object()); });

		// Reset automated terminal orders
		_.each(_.keys(_.get(Memory, ["resources", "terminal_orders"])), o => {
			if (_.get(Memory, ["resources", "terminal_orders", o, "automated"]))
				delete Memory["resources"]["terminal_orders"][o];
		});

		// Reset reagent targets, prevents accidental reagent pileup
		_.each(_.keys(_.get(Memory, ["resources", "labs", "targets"])), t => {
			if (_.get(Memory, ["resources", "labs", "targets", t, "is_reagent"]))
				delete Memory["resources"]["labs"]["targets"][t];
		});

		// Create new reagent targets
		_.each(_.get(Memory, ["resources", "labs", "targets"]), t => {
			if (_.get(t, "amount") < 0) {
				this.createReagentTargets(t);
				return;
			}

			let amount = 0;
			_.each(Game.rooms, r => {
				if (r.controller != null && r.controller.my && (r.storage || r.terminal))
					amount += r.store(_.get(t, "mineral"));
			});

			if (amount < _.get(t, "amount")) {
				this.createReagentTargets(t);
				return;
			}
		});
	},

	createReagentTargets: function (target) {
		_.each(getReagents(target.mineral),
			reagent => {
				let amount = 0;
				_.each(_.filter(Game.rooms,
					r => { return r.controller != null && r.controller.my && r.terminal; }),
					r => { amount += r.store(reagent); });
				if (amount <= 1000 && !_.has(Memory, ["resources", "labs", "targets", reagent]) && getReagents(reagent) != null) {
					console.log(`<font color=\"#A17BFF\">[Labs]</font> reagent ${reagent} missing for ${target.mineral}, creating target goal.`);
					Memory["resources"]["labs"]["targets"][reagent] = { amount: target.amount, priority: target.priority, mineral: reagent, is_reagent: true };
					this.createReagentTargets(Memory["resources"]["labs"]["targets"][reagent]);
				}
			});
	},
};
