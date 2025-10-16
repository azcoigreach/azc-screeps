/* ***********************************************************
 *	[sec04a] DEFINITIONS: SITES
 * *********************************************************** */

 global.Sites = {
	Colony: function (rmColony) {
		global.Colony = {

			Run: function (rmColony) {

				Stats_CPU.Start(rmColony, "Colony-init");
				listSpawnRooms = _.get(Memory, ["rooms", rmColony, "spawn_assist", "rooms"]);
				listSpawnRoute = _.get(Memory, ["rooms", rmColony, "spawn_assist", "list_route"]);

				if (_.get(Memory, ["rooms", rmColony, "defense", "threat_level"]) == null)
					_.set(Memory, ["rooms", rmColony, "defense", "threat_level"], LOW);

				let listCreeps = _.filter(Game.creeps, c => c.memory.room == rmColony);
				Stats_CPU.End(rmColony, "Colony-init");


				Stats_CPU.Start(rmColony, "Colony-surveyRoom");
				if (isPulse_Defense()) {
					this.surveyRoom(rmColony);
					this.surveySafeMode(rmColony, listCreeps);
				}
				Stats_CPU.End(rmColony, "Colony-surveyRoom");

				if (isPulse_Spawn()) {
					Stats_CPU.Start(rmColony, "Colony-runPopulation");
					this.runPopulation(rmColony, listCreeps, listSpawnRooms);
					Stats_CPU.End(rmColony, "Colony-runPopulation");
				}

				Stats_CPU.Start(rmColony, "Colony-runCreeps");
				this.runCreeps(rmColony, listCreeps, listSpawnRoute);
				Stats_CPU.End(rmColony, "Colony-runCreeps");

				Stats_CPU.Start(rmColony, "Colony-runTowers");
				this.runTowers(rmColony);
				Stats_CPU.End(rmColony, "Colony-runTowers");

				Stats_CPU.Start(rmColony, "Colony-defineLinks");
				if (isPulse_Long() || _.has(Memory, ["hive", "pulses", "reset_links"])) {
					this.defineLinks(rmColony);
				}
				Stats_CPU.End(rmColony, "Colony-defineLinks");

				Stats_CPU.Start(rmColony, "Colony-runLinks");
				this.runLinks(rmColony);
				Stats_CPU.End(rmColony, "Colony-runLinks");
			},

			surveyRoom: function (rmColony) {
				let visible = _.keys(Game.rooms).includes(rmColony);
				_.set(Memory, ["rooms", rmColony, "survey", "has_minerals"],
					!visible ? false
						: _.filter(Game.rooms[rmColony].find(FIND_MINERALS),
							m => { return m.mineralAmount > 0; }).length > 0 );

				if (_.get(Memory, ["rooms", rmColony, "survey", "source_amount"], 0) == 0)
					_.set(Memory, ["rooms", rmColony, "survey", "source_amount"],
						(visible ? Game.rooms[rmColony].findSources().length : 0));

				let hostiles = !visible ? new Array()
					: _.filter(Game.rooms[rmColony].find(FIND_HOSTILE_CREEPS), c => { return c.isHostile(); });
				_.set(Memory, ["rooms", rmColony, "defense", "hostiles"], hostiles);

				// Only consider hostiles with attack capabilities as threats for safety assessment
				let dangerous_hostiles = !visible ? new Array()
					: _.filter(Game.rooms[rmColony].find(FIND_HOSTILE_CREEPS), c => { 
						return c.isHostile() && (c.hasPart("attack") || c.hasPart("ranged_attack")); 
					});
				let is_safe = visible && dangerous_hostiles.length == 0;
				_.set(Memory, ["rooms", rmColony, "defense", "is_safe"], is_safe);

				let storage = _.get(Game, ["rooms", rmColony, "storage"]);

				if (visible && storage != null && storage.store["energy"] < Game["rooms"][rmColony].getCriticalEnergy()) {
					_.set(Memory, ["rooms", rmColony, "survey", "energy_level"], CRITICAL);
				} else if (visible && storage != null && storage.store["energy"] < Game["rooms"][rmColony].getLowEnergy()) {
					_.set(Memory, ["rooms", rmColony, "survey", "energy_level"], LOW);
				} else if (visible && storage != null && storage.store["energy"] > Game["rooms"][rmColony].getExcessEnergy()) {
					_.set(Memory, ["rooms", rmColony, "survey", "energy_level"], EXCESS);
				} else {
					_.set(Memory, ["rooms", rmColony, "survey", "energy_level"], NORMAL);
				}

				let ticks_downgrade = _.get(Game, ["rooms", rmColony, "controller", "ticksToDowngrade"]);
				_.set(Memory, ["rooms", rmColony, "survey", "downgrade_critical"], (ticks_downgrade > 0 && ticks_downgrade < 3500))
			},

			surveySafeMode: function (rmColony, listCreeps) {
				let room = _.get(Game, ["rooms", rmColony]);
				let controller = _.get(room, "controller");
				let is_safe = _.get(Memory, ["rooms", rmColony, "defense", "is_safe"]);

				if (is_safe || room == null || controller == null || controller.safeMode > 0
					|| controller.safeModeCooldown > 0 || controller.safeModeAvailable == 0)
					return;

				let hostiles = _.get(Memory, ["rooms", rmColony, "defense", "hostiles"]);
				let threats = _.filter(hostiles, c => {
					return c.isHostile() && c.owner.username != "Invader"
						&& (c.hasPart("attack") || c.hasPart("ranged_attack") || c.hasPart("work"));
				});
				let structures = _.filter(room.find(FIND_MY_STRUCTURES), s => {
					return s.structureType == "spawn" || s.structureType == "extension"
						|| s.structureType == "tower" || s.structureType == "nuker"
						|| s.structureType == "storage" || s.structureType == "terminal";
				});

				for (let i = 0; i < structures.length; i++) {
					if (structures[i].pos.findInRange(threats, 3).length > 0) {
						if (room.controller.activateSafeMode() == OK)
							console.log(`<font color=\"#FF0000\">[Invasion]</font> Safe mode activated in ${rmColony}; enemy detected at key base structure!`);
						return;
					}
				}

				if (structures.length == 0) {
					for (let i = 0; i < listCreeps.length; i++) {
						if (listCreeps[i].pos.findInRange(threats, 3).length > 0) {
							if (room.controller.activateSafeMode() == OK)
								console.log(`<font color=\"#FF0000\">[Invasion]</font> Safe mode activated in ${rmColony}; no structures; enemy detected at creeps!`);
							return;
						}
					}
				}
			},

			runPopulation: function (rmColony, listCreeps, listSpawnRooms) {
				let room_level = Game["rooms"][rmColony].getLevel();
				let is_safe = _.get(Memory, ["rooms", rmColony, "defense", "is_safe"]);
				let hostiles = _.get(Memory, ["rooms", rmColony, "defense", "hostiles"], new Array());
				let threat_level = _.get(Memory, ["rooms", rmColony, "defense", "threat_level"]);
				let energy_level = _.get(Memory, ["rooms", rmColony, "survey", "energy_level"]);
				let downgrade_critical = _.get(Memory, ["rooms", rmColony, "survey", "downgrade_critical"]);

				let popActual = new Object();
				_.each(listCreeps, c => {
					switch (_.get(c, ["memory", "role"])) {
						default:
							let role = _.get(c, ["memory", "role"]);
							popActual[role] = _.get(popActual, role, 0) + 1;
							break;
						
						case "upgrader":
							popActual["upgrader"] = _.get(popActual, "upgrader", 0) + 1;
							break;
					}
				});

				let popTarget = new Object();
				let popSetting = _.get(Memory, ["rooms", rmColony, "set_population"]);
				if (popSetting)
					popTarget = _.cloneDeep(popSetting);
				else
					popTarget = _.cloneDeep(Population_Colony[listSpawnRooms == null ? "Standalone" : "Assisted"][Math.max(1, room_level)]);

				// Adjust soldier amounts & levels based on threat level
				if (threat_level != NONE && _.get(Game, ["rooms", rmColony, "controller", "safeMode"]) == null) {
					if (threat_level == LOW || threat_level == null) {
						_.set(popTarget, ["ranger", "amount"], _.get(popTarget, ["ranger", "amount"], 0) + 1);
						if (is_safe)
							_.set(popTarget, ["ranger", "level"], Math.max(2, room_level - 1));
					} else if (threat_level == MEDIUM) {
						_.set(popTarget, ["soldier", "amount"], _.get(popTarget, ["soldier", "amount"], 0) + 1);
						_.set(popTarget, ["ranger", "amount"], _.get(popTarget, ["ranger", "amount"], 0) + 1);
						if (is_safe) {
							_.set(popTarget, ["soldier", "level"], Math.max(2, room_level - 1));
							_.set(popTarget, ["ranger", "level"], Math.max(2, room_level - 1));
						}
					} else if (threat_level == HIGH) {
						_.set(popTarget, ["soldier", "amount"], _.get(popTarget, ["soldier", "amount"], 0) + 6);
						_.set(popTarget, ["ranger", "amount"], _.get(popTarget, ["ranger", "amount"], 0) + 2);
					}
				}

				// Adjust worker amounts based on is_safe, energy_level
				if (!is_safe) {
					_.set(popTarget, ["worker", "level"], Math.max(1, Math.round(_.get(popTarget, ["worker", "level"]) * 0.5)))
				} else if (is_safe) {
					if (energy_level == CRITICAL) {
						_.set(popTarget, ["worker", "amount"], Math.max(1, Math.round(_.get(popTarget, ["worker", "amount"]) * 0.33)))
						_.set(popTarget, ["worker", "level"], Math.max(1, Math.round(_.get(popTarget, ["worker", "level"]) * 0.33)))
					} else if (energy_level == LOW) {
						_.set(popTarget, ["worker", "amount"], Math.max(1, Math.round(_.get(popTarget, ["worker", "amount"]) * 0.5)))
						_.set(popTarget, ["worker", "level"], Math.max(1, Math.round(_.get(popTarget, ["worker", "level"]) * 0.5)))
					} else if (energy_level == EXCESS && room_level < 8) {
						_.set(popTarget, ["worker", "amount"], Math.max(1, Math.round(_.get(popTarget, ["worker", "amount"]) * 2)))
					}
				}

				// Tally population levels for level scaling and statistics
				Control.populationTally(rmColony,
					_.sum(popTarget, p => { return _.get(p, "amount", 0); }),
					_.sum(popActual));

				// Grafana population stats
				Stats_Grafana.populationTally(rmColony, popTarget, popActual);

				if (_.get(Game, ["rooms", rmColony, "controller", "safeMode"]) == null
					&& ((_.get(popActual, "soldier", 0) < _.get(popTarget, ["soldier", "amount"], 0))
						|| (_.get(popActual, "soldier", 0) < hostiles.length))) {
					Memory["shard"]["spawn_requests"].push({
						room: rmColony, listRooms: listSpawnRooms,
						priority: (!is_safe ? 1 : 21),
						level: _.get(popTarget, ["soldier", "level"], room_level),
						scale: _.get(popTarget, ["soldier", "scale"], true),
						body: "soldier", name: null, args: { role: "soldier", room: rmColony }
					});
				}

				if (_.get(Game, ["rooms", rmColony, "controller", "safeMode"]) == null
					&& _.get(popActual, "healer", 0) < _.get(popTarget, ["healer", "amount"], 0)) {
					Memory["shard"]["spawn_requests"].push({
						room: rmColony, listRooms: listSpawnRooms,
						priority: (!is_safe ? 2 : 22),
						level: _.get(popTarget, ["healer", "level"], 1),
						scale: _.get(popTarget, ["healer", "scale"], true),
						body: "healer", name: null, args: { role: "healer", room: rmColony }
					});
				}

				if (_.get(popActual, "worker", 0) < _.get(popTarget, ["worker", "amount"], 0)) {
					Memory["shard"]["spawn_requests"].push({
						room: rmColony, listRooms: listSpawnRooms,
						priority: Math.lerpSpawnPriority(23, 25, _.get(popActual, "worker", 0), _.get(popTarget, ["worker", "amount"], 0)),
						level: _.get(popTarget, ["worker", "level"], 1),
						scale: _.get(popTarget, ["worker", "scale"], true),
						body: _.get(popTarget, ["worker", "body"], "worker"),
						name: null, args: { role: "worker", room: rmColony }
					});
				}

				// Check for force spawn request
				let forceSpawn = _.get(Memory, ["rooms", rmColony, "upgrader_force_spawn"]);
				if (forceSpawn && forceSpawn.timestamp == Game.time) {
					for (let i = 0; i < forceSpawn.amount; i++) {
						Memory["shard"]["spawn_requests"].push({
							room: rmColony, listRooms: listSpawnRooms,
							priority: 1, // High priority for force spawn
							level: room_level,
							scale: true,
							body: "upgrader",
							name: null, args: { role: "upgrader", room: rmColony }
						});
					}
					delete Memory.rooms[rmColony].upgrader_force_spawn;
				}

				// Check if room has reached RCL 5+ and should spawn upgraders
				let roomLevel = Game.rooms[rmColony].controller.level;
				if (roomLevel >= 5) {
					// Calculate upgrader amount based on remote mining sources
					let remoteMiningSources = 0;
					let remote_mining = _.get(Memory, ["sites", "mining"]);
					if (remote_mining) {
						let remote_list = _.filter(Object.keys(remote_mining), rem => { 
							return rem != rmColony && _.get(remote_mining[rem], "colony") == rmColony; 
						});
						_.each(remote_list, rem => { 
							remoteMiningSources += _.get(Memory, ["sites", "mining", rem, "survey", "source_amount"], 0); 
						});
					}
					
					// Base upgrader amount: 1 for every room level 5+
					// Additional upgrader for every 2 remote mining sources
					let baseUpgraders = 1;
					let additionalUpgraders = Math.floor(remoteMiningSources / 2);
					let totalUpgraders = baseUpgraders + additionalUpgraders;
					
					// Check if we need upgraders
					if (_.get(popActual, "upgrader", 0) < totalUpgraders) {
						Memory["shard"]["spawn_requests"].push({
							room: rmColony, listRooms: listSpawnRooms,
							priority: Math.lerpSpawnPriority(20, 22, _.get(popActual, "upgrader", 0), totalUpgraders),
							level: _.get(popTarget, ["upgrader", "level"], room_level),
							scale: _.get(popTarget, ["upgrader", "scale"], true),
							body: _.get(popTarget, ["upgrader", "body"], "upgrader"),
							name: null, args: { role: "upgrader", room: rmColony }
						});
					}
				}
			},


			runCreeps: function (rmColony, listCreeps, listSpawnRoute) {
				_.each(listCreeps, creep => {
					_.set(creep, ["memory", "list_route"], listSpawnRoute);

					switch (_.get(creep, ["memory", "role"])) {
						case "worker": Creep_Roles.Worker(creep); break;
						case "upgrader": Creep_Roles.Upgrader(creep, _.get(Memory, ["rooms", rmColony, "defense", "is_safe"], true)); break;
						case "healer": Creep_Roles.Healer(creep, true); break;
						case "portal_scout": Creep_Roles.Portal_Scout(creep); break;

						case "soldier": case "paladin":
							Creep_Roles.Soldier(creep, false, true);
							break;

						case "ranger": case "archer":
							Creep_Roles.Archer(creep, false, true);
							break;
					}
				});
			},


			runTowers: function (rmColony) {
				let is_safe = (_.get(Memory, ["rooms", rmColony, "defense", "hostiles"], new Array()).length == 0);

				if (!is_safe) {
					_.set(Memory, ["rooms", rmColony, "defense", "targets", "heal"], null);
					_.set(Memory, ["rooms", rmColony, "defense", "targets", "repair"], null);

					this.towerAcquireAttack(rmColony);
					this.towerRunAttack(rmColony);
					return;
				} else {
					_.set(Memory, ["rooms", rmColony, "defense", "targets", "attack"], null);

					this.towerAcquireHeal(rmColony);
					if (_.get(Memory, ["rooms", rmColony, "defense", "targets", "heal"]) != null) {
						this.towerRunHeal(rmColony);
						return;
					}

					this.towerAcquireRepair(rmColony);
					if (_.get(Memory, ["rooms", rmColony, "defense", "targets", "repair"]) != null) {
						this.towerRunRepair(rmColony);
						return;
					}
				}
			},

			towerAcquireAttack: function (rmColony) {
				let target = _.get(Memory, ["rooms", rmColony, "defense", "targets", "attack"]);

				// Check if existing target is still alive and in room... otherwise nullify and re-acquire
				if (target != null) {
					let hostile = Game.getObjectById(target);
					if (hostile == null) {
						target == null;
						_.set(Memory, ["rooms", rmColony, "defense", "targets", "attack"], null);
					}
				}

				// Acquire target if no target exists, or re-acquire target every 15 ticks
				if (target == null || Game.time % 15 == 0) {
					let base_structures = _.filter(Game.rooms[rmColony].find(FIND_STRUCTURES),
						s => {
							return s.structureType != "link" && s.structureType != "container"
								&& s.structureType != "extractor" && s.structureType != "controller"
								&& s.structureType != "road";
						});
					let spawns = _.filter(base_structures, s => { return s.structureType == "spawn"; });

					// Find the center of base by averaging position of all spawns
					let originX = 0, originY = 0;
					for (let i = 0; i < spawns.length; i++) {
						originX += spawns[i].pos.x;
						originY += spawns[i].pos.y;
					}
					originX /= spawns.length;
					originY /= spawns.length;

					//Ensure we have a spawn, otherwise return 25, 25
					if(!originX || !originY)
					{
						console.log(`<font color=\"#FF0000\">[Invasion]</font> Could not detect any spawns in room ${rmColony}`);
						originX = 25;
						originY = 25;
					}

					let my_creeps = Game.rooms[rmColony].find(FIND_MY_CREEPS);
					// Only attack creeps that are 1) not allies and 2) within 10 sq of base structures (or Invader within 5 sq of creeps)
					// Then sort by 1) if they have heal parts, and 2) sort by distance (attack closest)
					target = _.head(_.sortBy(_.filter(Game.rooms[rmColony].find(FIND_HOSTILE_CREEPS),
						c => {
							return !c.isAlly() && (c.pos.inRangeToListTargets(base_structures, 10)
								|| (c.owner.username == "Invader" && c.pos.inRangeToListTargets(my_creeps, 3)));
						}),
						c => {
							return (c.hasPart("heal") > 0
								? -100 + new RoomPosition(originX, originY, rmColony).getRangeTo(c.pos.x, c.pos.y)
								: new RoomPosition(originX, originY, rmColony).getRangeTo(c.pos.x, c.pos.y));
						}));
					_.set(Memory, ["rooms", rmColony, "defense", "targets", "attack"], _.get(target, "id"));
				}
			},

			towerRunAttack: function (rmColony) {
				let hostile_id = _.get(Memory, ["rooms", rmColony, "defense", "targets", "attack"]);
				if (hostile_id != null) {
					let hostile = Game.getObjectById(hostile_id);
					if (hostile == null) {
						_.set(Memory, ["rooms", rmColony, "defense", "targets", "attack"], null);
					} else {
						_.each(_.filter(Game.rooms[rmColony].find(FIND_MY_STRUCTURES),
							s => { return s.structureType == "tower"; }),
							t => { t.attack(hostile); });
					}
				}
			},

			towerAcquireHeal: function (rmColony) {
				if (Game.time % 15 == 0 && _.get(Game, ["rooms", rmColony]) != null) {
					let injured = _.head(_.filter(Game.rooms[rmColony].find(FIND_MY_CREEPS),
						c => { return c.hits < c.hitsMax; }));
					_.set(Memory, ["rooms", rmColony, "defense", "targets", "heal"], _.get(injured, "id"));
				}
			},

			towerRunHeal: function (rmColony) {
				let injured_id = _.get(Memory, ["rooms", rmColony, "defense", "targets", "heal"]);
				if (injured_id != null) {
					let injured = Game.getObjectById(injured_id);
					if (injured == null || injured.hits == injured.hitsMax) {
						_.set(Memory, ["rooms", rmColony, "defense", "targets", "heal"], null);
					} else {
						_.each(Game.rooms[rmColony].find(FIND_MY_STRUCTURES, {
							filter: (s) => {
								return s.structureType == "tower" && s.energy > s.energyCapacity * 0.5;
							}
						}),
							t => { t.heal(injured) });
					}
				}
			},

			towerAcquireRepair: function (rmColony) {
				let energy_level = _.get(Memory, ["rooms", rmColony, "survey", "energy_level"]);
				if (energy_level == CRITICAL) {
					_.set(Memory, ["rooms", rmColony, "defense", "targets", "repair"], null);
					return;
				}

				if (Game.time % 15 == 0 && _.get(Game, ["rooms", rmColony]) != null) {
					let room = Game["rooms"][rmColony];

					let repair = _.head(_.sortBy(_.filter(room.findRepair_Maintenance(),
						r => {
							return ((r.structureType == "rampart" || r.structureType == "constructedWall") && r.hits / room.getWallTarget() < 1.05)
								|| ((r.structureType == "container" || r.structureType == "road") && r.hits / r.hitsMax < 0.9);
						}),
						r => {
							switch (r.structureType) {
								case "container": return 1;
								case "road": return 2;
								case "rampart":
								case "constructedWall": return 3;
							}
						}));

					_.set(Memory, ["rooms", rmColony, "defense", "targets", "repair"], _.get(repair, "id"));
				}
			},

			towerRunRepair: function (rmColony) {
				let repair_id = _.get(Memory, ["rooms", rmColony, "defense", "targets", "repair"]);
				if (repair_id != null) {
					let repair = Game.getObjectById(repair_id);
					if (repair == null) {
						_.set(Memory, ["rooms", rmColony, "defense", "targets", "repair"], null);
					} else {
						_.each(Game.rooms[rmColony].find(FIND_MY_STRUCTURES, {
							filter: (s) => {
								return s.structureType == "tower" && s.energy > s.energyCapacity * 0.8;
							}
						}),
							t => { t.repair(repair) });
					}
				}
			},

			defineLinks: function (rmColony) {
				let link_defs = _.get(Memory, ["rooms", rmColony, "links"]);
				let room = Game.rooms[rmColony];
				let structures = room.find(FIND_MY_STRUCTURES);
				let links = _.filter(structures, s => { return s.structureType == "link"; });

				// Check that link definitions are current with GameObject ID's
				if (link_defs != null && Object.keys(link_defs).length == links.length) {
					for (let i = 0; i < Object.keys(link_defs).length; i++) {
						if (_.filter(links, s => { return s.id == link_defs[i].id }).length == 0) {
							delete Memory["rooms"][rmColony]["links"];
						}
					}
				}

				// Define missing link definitions
				if (link_defs == null || Object.keys(link_defs).length != links.length) {
					link_defs = [];
					let sources = room.findSources();
					_.each(sources, source => {
						_.each(source.pos.findInRange(links, 2), link => {
							link_defs.push({ id: link.id, dir: "send" });
						});
					});

					_.each(_.filter(structures, s => { return s.structureType == "storage"; }), storage => {
						_.each(storage.pos.findInRange(links, 3), link => {
							link_defs.push({ id: link.id, dir: "receive" });
						});
					});

					_.each(room.controller.pos.findInRange(links, 2), link => {
						link_defs.push({ id: link.id, dir: "receive", role: "upgrade" });
					});

					Memory["rooms"][rmColony]["links"] = link_defs;
					console.log(`<font color=\"#D3FFA3\">[Console]</font> Links defined for ${rmColony}.`);
				}

			},

			runLinks: function (rmColony) {
				let links = _.get(Memory, ["rooms", rmColony, "links"]);

				if (links != null) {
					let linksSend = _.filter(links, l => { return l["dir"] == "send"; });
					let linksReceive = _.filter(links, l => { return l["dir"] == "receive"; });

					_.each(linksReceive, r => {
						let receive = Game.getObjectById(r["id"]);
						_.each(linksSend, s => {
							if (receive != null) {
								let send = Game.getObjectById(s["id"]);
								if (send != null && send.energy > send.energyCapacity * 0.1 && receive.energy < receive.energyCapacity * 0.9) {
									send.transferEnergy(receive);
								}
							}
						});
					});
				}
			}
		};

		Colony.Run(rmColony)
	},

	Mining: function (rmColony, rmHarvest) {
		let Mining = {

			Run: function (rmColony, rmHarvest) {
				Stats_CPU.Start(rmColony, "Mining-init");

				// Local mining: ensure the room has a spawn or tower... rebuilding? Sacked? Unclaimed?
				if (rmColony == rmHarvest) {
					if (_.get(Game, ["rooms", rmColony, "controller", "my"]) != true) {
						delete Memory.sites.mining.rmHarvest;
						return;
					}

					if (_.filter(_.get(Game, ["spawns"]), s => { return s.room.name == rmColony; }).length < 1
						&& _.get(Memory, ["rooms", rmColony, "focus_defense"]) != true)
						return;

					if (_.get(Memory, ["rooms", rmColony, "focus_defense"]) == true
						&& _.get(Game, ["rooms", rmColony, "controller", "level"]) < 3)
						return;
				}

				// Remote mining: colony destroyed? Stop mining :(
				if (Game.rooms[rmColony] == null) {
					delete Memory.sites.mining.rmHarvest;
					return;
				}

				let listSpawnRooms = _.get(Memory, ["sites", "mining", rmHarvest, "spawn_assist", "rooms"]);
				let listRoute = _.get(Memory, ["sites", "mining", rmHarvest, "list_route"]);
				let hasKeepers = _.get(Memory, ["sites", "mining", rmHarvest, "has_keepers"], false);
				if (rmColony == rmHarvest
					&& _.filter(_.get(Game, ["spawns"]), s => { return s.room.name == rmColony; }).length < 1) {
					listSpawnRooms = _.get(Memory, ["rooms", rmColony, "spawn_assist", "rooms"]);
					listRoute = _.get(Memory, ["rooms", rmColony, "spawn_assist", "list_route"]);
				}

				let listCreeps = _.filter(Game.creeps, c => c.memory.room == rmHarvest && c.memory.colony == rmColony);

				Stats_CPU.End(rmColony, "Mining-init");

				Stats_CPU.Start(rmColony, `Mining-${rmHarvest}-surveyRoom`);
				if (isPulse_Defense())
					this.surveyRoom(rmColony, rmHarvest);
				Stats_CPU.End(rmColony, `Mining-${rmHarvest}-surveyRoom`);

				if (isPulse_Spawn()) {
					Stats_CPU.Start(rmColony, `Mining-${rmHarvest}-runPopulation`);
					this.runPopulation(rmColony, rmHarvest, listCreeps, listSpawnRooms, hasKeepers);
					Stats_CPU.End(rmColony, `Mining-${rmHarvest}-runPopulation`);
				}

				Stats_CPU.Start(rmColony, `Mining-${rmHarvest}-runCreeps`);
				this.runCreeps(rmColony, rmHarvest, listCreeps, hasKeepers, listRoute);
				Stats_CPU.End(rmColony, `Mining-${rmHarvest}-runCreeps`);

				Stats_CPU.Start(rmColony, `Mining-${rmHarvest}-buildContainers`);
				this.buildContainers(rmColony, rmHarvest);
				Stats_CPU.End(rmColony, `Mining-${rmHarvest}-buildContainers`);
			},

			surveyRoom: function (rmColony, rmHarvest) {
				let visible = _.keys(Game.rooms).includes(rmHarvest);
				_.set(Memory, ["sites", "mining", rmHarvest, "survey", "visible"], visible);
				
				// Cache survey data to avoid repeated calculations
				let surveyData = _.get(Memory, ["sites", "mining", rmHarvest, "survey"]);
				if (!surveyData) {
					surveyData = {};
					_.set(Memory, ["sites", "mining", rmHarvest, "survey"], surveyData);
				}
				
				// Only calculate minerals and sources if not already cached
				if (visible && surveyData.has_minerals === undefined) {
					let minerals = Game.rooms[rmHarvest].find(FIND_MINERALS);
					surveyData.has_minerals = minerals.some(m => m.mineralAmount > 0);
					surveyData.source_amount = Game.rooms[rmHarvest].findSources().length;
				} else if (!visible) {
					surveyData.has_minerals = false;
					surveyData.source_amount = 0;
				}
				
				// Cache hostile detection
				let hostiles = [];
				let invaderCore = null;
				
				if (visible) {
					// Optimize hostile detection with early exit
					let allCreeps = Game.rooms[rmHarvest].find(FIND_HOSTILE_CREEPS);
					for (let creep of allCreeps) {
						if (creep.isHostile() && creep.owner.username !== "Source Keeper") {
							hostiles.push(creep);
						}
					}
					
					// Only search for invader core if no hostiles found
					if (hostiles.length === 0) {
						let structures = Game.rooms[rmHarvest].find(FIND_STRUCTURES);
						for (let structure of structures) {
							if (structure.structureType === "invaderCore") {
								invaderCore = structure;
								break;
							}
						}
					}
				}
				
				// Only consider hostiles with attack capabilities as threats for safety assessment
				let dangerous_hostiles = !visible ? new Array()
					: _.filter(Game.rooms[rmHarvest].find(FIND_HOSTILE_CREEPS), c => { 
						return c.isHostile() && (c.hasPart("attack") || c.hasPart("ranged_attack")); 
					});
				let is_safe = visible && dangerous_hostiles.length == 0 && invaderCore == null;
				_.set(Memory, ["rooms", rmHarvest, "defense", "is_safe"], is_safe);
				_.set(Memory, ["sites", "mining", rmHarvest, "defense", "is_safe"], is_safe);
				_.set(Memory, ["sites", "mining", rmHarvest, "defense", "hostiles"], hostiles);

				// Can only mine a site/room if it is not reserved, or is reserved by the player
				let reservation = _.get(Game, ["rooms", rmHarvest, "controller", "reservation"], null);
				let can_mine = visible && (reservation == null || _.get(reservation, "username", null) == getUsername());
				_.set(Memory, ["sites", "mining", rmHarvest, "can_mine"], can_mine);

				// Tally energy sitting in containers awaiting carriers to take to storage...
				if (_.get(Game, ["rooms", rmColony, "storage"], null) != null) {
					let containers = null;
					if (visible) {
						let allStructures = Game.rooms[rmHarvest].find(FIND_STRUCTURES);
						containers = allStructures.filter(s => s.structureType === STRUCTURE_CONTAINER);
					}

					if (!containers || containers.length === 0) {
						_.set(Memory, ["sites", "mining", rmHarvest, "store_total"], 0);
						_.set(Memory, ["sites", "mining", rmHarvest, "store_percent"], 0);
					} else {
						let store_energy = 0;
						for (let container of containers) {
							store_energy += container.store["energy"] || 0;
						}
						let store_capacity = containers.length * 2000;
						_.set(Memory, ["sites", "mining", rmHarvest, "store_total"], store_energy);
						_.set(Memory, ["sites", "mining", rmHarvest, "store_percent"], store_energy / store_capacity);
					}
				}

				// Only calculate reserve access if controller exists
				if (visible && Game.rooms[rmHarvest].controller && Game.rooms[rmHarvest].controller.pos) {
					_.set(Memory, ["sites", "mining", rmHarvest, "survey", "reserve_access"], 
						Game.rooms[rmHarvest].controller.pos.getAccessAmount(false));
				} else {
					_.set(Memory, ["sites", "mining", rmHarvest, "survey", "reserve_access"], 0);
				}
			},

			runPopulation: function (rmColony, rmHarvest, listCreeps, listSpawnRooms, hasKeepers) {
				let room_level = Game["rooms"][rmColony].getLevel();
				let has_minerals = _.get(Memory, ["sites", "mining", rmHarvest, "survey", "has_minerals"]);
				let threat_level = _.get(Memory, ["rooms", rmColony, "defense", "threat_level"]);
				let is_safe = _.get(Memory, ["sites", "mining", rmHarvest, "defense", "is_safe"]);
				let hostiles = _.get(Memory, ["sites", "mining", rmHarvest, "defense", "hostiles"], new Array());

				let is_safe_colony = _.get(Memory, ["rooms", rmColony, "defense", "is_safe"], true);
				let is_visible = _.get(Memory, ["sites", "mining", rmHarvest, "survey", "visible"], true);
				let can_mine = _.get(Memory, ["sites", "mining", rmHarvest, "can_mine"]);

				// If the colony is not safe (under siege?) pause spawning remote mining; frees colony spawns to make soldiers
				if (rmColony != rmHarvest && !is_safe_colony)
					return;

				// Is the room visible? If not, only spawn a scout to check the room out!
				if (rmColony != rmHarvest && !is_visible) {
					let lScout = _.filter(listCreeps, c => c.memory.role == "scout");

					if (lScout.length < 1) {
						Memory["shard"]["spawn_requests"].push({
							room: rmColony, listRooms: listSpawnRooms, priority: 0, level: 1,
							scale: false, body: "scout", name: null, args: { role: "scout", room: rmHarvest, colony: rmColony }
						});
					}
					return;
				}

				let popActual = new Object();
				_.each(listCreeps, c => {
					switch (_.get(c, ["memory", "role"])) {
						default:
							let role = _.get(c, ["memory", "role"]);
							popActual[role] = _.get(popActual, role, 0) + 1;
							break;

						case "paladin": popActual["paladin"] = _.get(popActual, "paladin", 0) + ((c.ticksToLive == undefined || c.ticksToLive > 200) ? 1 : 0); break;
						case "burrower": popActual["burrower"] = _.get(popActual, "burrower", 0) + ((c.ticksToLive == undefined || c.ticksToLive > 100) ? 1 : 0); break;
						case "carrier": popActual["carrier"] = _.get(popActual, "carrier", 0) + ((c.ticksToLive == undefined || c.ticksToLive > 50) ? 1 : 0); break;
					}
				});

				let popTarget = new Object();
				let popSetting = (rmColony == rmHarvest
					? _.get(Memory, ["rooms", rmHarvest, "set_population"])
					: _.get(Memory, ["sites", "mining", rmHarvest, "set_population"]));

				if (popSetting)
					popTarget = _.cloneDeep(popSetting);
				else {
					if (rmColony == rmHarvest)
						popTarget = _.cloneDeep(Population_Mining[`S${Game.rooms[rmHarvest].findSources().length}`][Math.max(1, room_level)]);
					else if (hasKeepers != true) {
						popTarget = (is_visible && _.get(Game, ["rooms", rmHarvest]) != null)
							? _.cloneDeep(Population_Mining[`R${Game.rooms[rmHarvest].findSources().length}`][Math.max(1, room_level)])
							: _.cloneDeep(Population_Mining["R1"][Math.max(1, room_level)]);
					} else if (hasKeepers == true)
						popTarget = _.cloneDeep(Population_Mining["SK"]);
				}

				// Remote mining: adjust soldier levels based on threat level
				if (rmHarvest != rmColony && threat_level != NONE && hasKeepers == false) {
					if (threat_level == LOW || threat_level == null) {
						_.set(popTarget, ["ranger", "amount"], _.get(popTarget, ["ranger", "amount"], 0) + 1);
						_.set(popTarget, ["soldier", "amount"], _.get(popTarget, ["soldier", "amount"], 0) + 1);
						if (is_safe) {
							_.set(popTarget, ["ranger", "level"], Math.max(2, room_level - 2));
							_.set(popTarget, ["soldier", "level"], Math.max(2, room_level - 2));
						}
					} else if (threat_level == MEDIUM) {
						_.set(popTarget, ["soldier", "amount"], _.get(popTarget, ["soldier", "amount"], 0) + 1);
						_.set(popTarget, ["ranger", "amount"], _.get(popTarget, ["ranger", "amount"], 0) + 1);
						if (is_safe) {
							_.set(popTarget, ["soldier", "level"], Math.max(2, room_level - 1));
							_.set(popTarget, ["ranger", "level"], Math.max(2, room_level - 1));
						}
					} else if (threat_level == HIGH) {
						_.set(popTarget, ["soldier", "amount"], _.get(popTarget, ["soldier", "amount"], 0) + 4);
						_.set(popTarget, ["ranger", "amount"], _.get(popTarget, ["ranger", "amount"], 0) + 1);
					}
				}

				// Enhanced carrier population adjustment based on energy flow efficiency
				let store_percent = _.get(Memory, ["sites", "mining", rmHarvest, "store_percent"], 0);
				let energy_level = _.get(Memory, ["rooms", rmColony, "survey", "energy_level"]);
				
				// Dynamic carrier scaling based on container fill and energy demand
				if (store_percent > 0.8) {
					// High container fill - emergency carriers needed
					_.set(popTarget, ["carrier", "amount"], _.get(popTarget, ["carrier", "amount"], 0) + 3);
				} else if (store_percent > 0.6) {
					// Moderate container fill - add carriers
					_.set(popTarget, ["carrier", "amount"], _.get(popTarget, ["carrier", "amount"], 0) + 2);
				} else if (store_percent > 0.4) {
					// Some backlog - add one carrier
					_.set(popTarget, ["carrier", "amount"], _.get(popTarget, ["carrier", "amount"], 0) + 1);
				}
				
				// Additional carriers for energy-critical situations
				if (energy_level == CRITICAL || energy_level == LOW) {
					_.set(popTarget, ["carrier", "amount"], _.get(popTarget, ["carrier", "amount"], 0) + 1);
				}

				// Tally population levels for level scaling
				Control.populationTally(rmColony,
					_.sum(popTarget, p => { return _.get(p, "amount", 0); }),
					_.sum(popActual));

				// Grafana population stats
				Stats_Grafana.populationTally(rmColony, popTarget, popActual);

				if (_.get(popActual, "paladin", 0) < _.get(popTarget, ["paladin", "amount"], 0)) {
					Memory["shard"]["spawn_requests"].push({
						room: rmColony, listRooms: listSpawnRooms,
						priority: 14,
						level: popTarget["paladin"]["level"],
						scale: _.get(popTarget, ["paladin", "scale"], true),
						body: "paladin", name: null, args: { role: "paladin", room: rmHarvest, colony: rmColony }
					});
				}
				if (_.get(popActual, "ranger", 0) < _.get(popTarget, ["ranger", "amount"], 0)) {
					Memory["shard"]["spawn_requests"].push({
						room: rmColony, listRooms: listSpawnRooms,
						priority: 14,
						level: _.get(popTarget, ["ranger", "level"], room_level),
						scale: _.get(popTarget, ["ranger", "scale"], true),
						body: "ranger", name: null, args: { role: "ranger", room: rmHarvest, colony: rmColony }
					});
				}

				if ((!hasKeepers && !is_safe && hostiles.length > _.get(popActual, "soldier", 0))
					|| (_.get(popActual, "soldier", 0) < _.get(popTarget, ["soldier", "amount"], 0))) {
					Memory["shard"]["spawn_requests"].push({
						room: rmColony, listRooms: listSpawnRooms,
						priority: (!is_safe ? 3 : 14),
						level: _.get(popTarget, ["soldier", "level"], room_level),
						scale: _.get(popTarget, ["soldier", "scale"], true),
						body: "soldier", name: null, args: { role: "soldier", room: rmHarvest, colony: rmColony }
					});
				}

				if (_.get(popActual, "healer", 0) < _.get(popTarget, ["healer", "amount"], 0)) {
					Memory["shard"]["spawn_requests"].push({
						room: rmColony, listRooms: listSpawnRooms,
						priority: (!is_safe ? 4 : 15),
						level: popTarget["healer"]["level"],
						scale: _.get(popTarget, ["healer", "scale"], true),
						body: "healer", name: null, args: { role: "healer", room: rmHarvest, colony: rmColony }
					});
				}

				if (_.get(popActual, "multirole", 0) < _.get(popTarget, ["multirole", "amount"], 0)) {
					Memory["shard"]["spawn_requests"].push({
						room: rmColony, listRooms: listSpawnRooms,
						priority: 19,
						level: popTarget["multirole"]["level"],
						scale: _.get(popTarget, ["multirole", "scale"], true),
						body: _.get(popTarget, ["multirole", "body"], "worker"),
						name: null, args: { role: "multirole", room: rmHarvest, colony: rmColony }
					});
				}

				if (is_safe) {
					if (_.get(popActual, "reserver", 0) < _.get(popTarget, ["reserver", "amount"], 0)
						&& Game.rooms[rmHarvest] != null && Game.rooms[rmHarvest].controller != null
						&& (Game.rooms[rmHarvest].controller.reservation == null
							|| Game.rooms[rmHarvest].controller.reservation.ticksToEnd < 2000)
						&& (_.get(Memory, ["sites", "mining", rmHarvest, "survey", "reserve_access"], null) == null
							|| _.get(popActual, "reserver", 0) < _.get(Memory, ["sites", "mining", rmHarvest, "survey", "reserve_access"], 0))) {
						Memory["shard"]["spawn_requests"].push({
							room: rmColony, listRooms: listSpawnRooms,
							priority: 17,
							level: _.get(popTarget, ["reserver", "level"], 1),
							scale: _.get(popTarget, ["reserver", "scale"], true),
							body: _.get(popTarget, ["reserver", "body"], "reserver"),
							name: null, args: { role: "reserver", room: rmHarvest, colony: rmColony }
						});
					}

					if (can_mine) {
						if (_.get(popActual, "burrower", 0) < _.get(popTarget, ["burrower", "amount"], 0)) {
							Memory["shard"]["spawn_requests"].push({
								room: rmColony, listRooms: listSpawnRooms,
								priority: (rmColony == rmHarvest ? 12 : 15),
								level: _.get(popTarget, ["burrower", "level"], 1),
								scale: _.get(popTarget, ["burrower", "scale"], true),
								body: _.get(popTarget, ["burrower", "body"], "burrower"),
								name: null, args: { role: "burrower", room: rmHarvest, colony: rmColony }
							});
						}

						if (_.get(popActual, "carrier", 0) < _.get(popTarget, ["carrier", "amount"], 0)) {
							Memory["shard"]["spawn_requests"].push({
								room: rmColony, listRooms: listSpawnRooms,
								priority: (rmColony == rmHarvest ? 13 : 16),
								level: _.get(popTarget, ["carrier", "level"], 1),
								scale: _.get(popTarget, ["carrier", "scale"], true),
								body: _.get(popTarget, ["carrier", "body"], "carrier"),
								name: null, args: { role: "carrier", room: rmHarvest, colony: rmColony }
							});
						}

						if (_.get(popActual, "miner", 0) < 2 // Population stalling? Energy defecit? Replenish with miner group
							&& (_.get(popActual, "burrower", 0) < _.get(popTarget, ["burrower", "amount"], 0)
								&& _.get(popActual, "carrier", 0) < _.get(popTarget, ["carrier", "amount"], 0))) {
							Memory["shard"]["spawn_requests"].push({
								room: rmColony, listRooms: listSpawnRooms,
								priority: (rmColony == rmHarvest ? 11 : 14),
								level: Math.max(1, Game["rooms"][rmColony].getLevel_Available()),
								scale: true, body: "worker",
								name: null, args: { role: "miner", room: rmHarvest, colony: rmColony, spawn_renew: false }
							});
						}

						if (_.get(popActual, "miner", 0) < _.get(popTarget, ["miner", "amount"], 0)) {
							Memory["shard"]["spawn_requests"].push({
								room: rmColony, listRooms: listSpawnRooms,
								priority: (rmColony == rmHarvest ? 12 : 15),
								level: _.get(popTarget, ["miner", "level"], 1),
								scale: _.get(popTarget, ["miner", "scale"], true),
								body: _.get(popTarget, ["miner", "body"], "worker"),
								name: null, args: { role: "miner", room: rmHarvest, colony: rmColony }
							});
						}

						if (_.get(popActual, "dredger", 0) < _.get(popTarget, ["dredger", "amount"], 0)) {
							Memory["shard"]["spawn_requests"].push({
								room: rmColony, listRooms: listSpawnRooms,
								priority: 19,
								level: _.get(popTarget, ["dredger", "level"], 1),
								scale: _.get(popTarget, ["dredger", "scale"], true),
								body: _.get(popTarget, ["dredger", "body"], "dredger"),
								name: null, args: { role: "dredger", room: rmHarvest, colony: rmColony }
							});
						}

						let pause_extraction = _.get(Memory, ["hive", "pause", "extracting"], false);
						if (has_minerals && !pause_extraction
							&& _.get(popActual, "extractor", 0) < _.get(popTarget, ["extractor", "amount"], 0)) {
							Memory["shard"]["spawn_requests"].push({
								room: rmColony, listRooms: listSpawnRooms,
								priority: 18,
								level: _.get(popTarget, ["extractor", "level"], 1),
								scale: _.get(popTarget, ["extractor", "scale"], true),
								body: _.get(popTarget, ["extractor", "body"], "extractor"),
								name: null, args: { role: "extractor", room: rmHarvest, colony: rmColony }
							});
						}
					}
				}
			},

			runCreeps: function (rmColony, rmHarvest, listCreeps, hasKeepers, listRoute) {
				// Cache safety and mining status to avoid repeated memory lookups
				let is_safe = _.get(Memory, ["sites", "mining", rmHarvest, "defense", "is_safe"]);
				let can_mine = _.get(Memory, ["sites", "mining", rmHarvest, "can_mine"]);

				// Cache route assignment to avoid repeated memory writes
				if (listRoute && listRoute.length > 0) {
					_.each(listCreeps, creep => {
						if (!creep.memory.list_route || creep.memory.list_route.length !== listRoute.length) {
							creep.memory.list_route = listRoute;
						}
					});
				}

				_.each(listCreeps, creep => {
					let role = creep.memory.role;
					
				switch (role) {
					case "scout": 
						Creep_Roles.Scout(creep); 
						break;
					case "portal_scout":
						Creep_Roles.Portal_Scout(creep);
						break;
					case "extractor":
							Creep_Roles.Extractor(creep, is_safe); 
							break;
						case "reserver": 
							Creep_Roles.Reserver(creep); 
							break;
						case "healer": 
							Creep_Roles.Healer(creep, true); 
							break;
						case "miner": 
						case "burrower": 
						case "carrier":
							Creep_Roles.Mining(creep, is_safe, can_mine);
							break;
						case "dredger":
							// This role hasn't been implemented yet...
							//Creep_Roles.Dredger(creep, can_mine);
							break;
						case "soldier": 
						case "paladin":
							Creep_Roles.Soldier(creep, false, true);
							break;
						case "ranger": 
						case "archer":
							Creep_Roles.Archer(creep, false, true);
							break;
						case "multirole":
							if (hasKeepers || (is_safe && can_mine))
								Creep_Roles.Worker(creep, is_safe);
							else
								Creep_Roles.Soldier(creep, false, true);
							break;
					}
				});
			},

			buildContainers: function (rmColony, rmHarvest) {
				hasKeepers = _.get(Memory, ["sites", "mining", rmHarvest, "has_keepers"], false);
				if (Game.time % 1500 != 0 || rmColony == rmHarvest || hasKeepers)
					return;		// Blueprint builds containers in colony rooms

				let room = Game["rooms"][rmHarvest];
				if (room == null)
					return;

				let sources = room.findSources();
				let containers = _.filter(room.find(FIND_STRUCTURES), s => { return s.structureType == "container"; });
				_.each(sources, source => {
					if (source.pos.findInRange(containers, 1).length < 1) {
						let adj = source.pos.getBuildableTile_Adjacent();
						if (adj != null && adj.createConstructionSite("container") == OK)
							console.log(`<font color=\"#6065FF\">[Mining]</font> ${room.name} placing container at (${adj.x}, ${adj.y})`);
					}
				});
			}
		};
		Mining.Run(rmColony, rmHarvest);
	},

	Industry: function (rmColony) {
		let Industry = {

			Run: function (rmColony) {
				// Expanded scope variables:
				labDefinitions = _.get(Memory, ["rooms", rmColony, "labs", "definitions"]);

				Stats_CPU.Start(rmColony, "Industry-listCreeps");
				let listCreeps = _.filter(Game.creeps, c => c.memory.room == rmColony);
				Stats_CPU.End(rmColony, "Industry-listCreeps");

				if (isPulse_Spawn()) {
					Stats_CPU.Start(rmColony, "Industry-runPopulation");
					this.runPopulation(rmColony, listCreeps);
					Stats_CPU.End(rmColony, "Industry-runPopulation");
				}

				Stats_CPU.Start(rmColony, "Industry-defineLabs");
				if (isPulse_Lab()) {
					this.defineLabs(rmColony);
				}
				Stats_CPU.End(rmColony, "Industry-defineLabs");

				Stats_CPU.Start(rmColony, "Industry-runLabs");
				this.runLabs(rmColony);
				Stats_CPU.End(rmColony, "Industry-runLabs");

				Stats_CPU.Start(rmColony, "Industry-runFactories");
				this.runFactories(rmColony);
				Stats_CPU.End(rmColony, "Industry-runFactories");

				if (isPulse_Mid()) {
					// Reset task list for recompilation
					_.set(Memory, ["rooms", rmColony, "industry", "tasks"], new Array());
					_.set(Memory, ["rooms", rmColony, "industry", "boosts"], new Array());

					Stats_CPU.Start(rmColony, "Industry-loadNukers");
					this.loadNukers(rmColony);
					Stats_CPU.End(rmColony, "Industry-loadNukers");

					Stats_CPU.Start(rmColony, "Industry-createLabTasks");
					_.set(Memory, ["rooms", rmColony, "industry", "tasks", "list"], new Object());
					_.set(Memory, ["rooms", rmColony, "industry", "tasks", "running"], new Object());
					this.createLabTasks(rmColony);
					Stats_CPU.End(rmColony, "Industry-createLabTasks");

					Stats_CPU.Start(rmColony, "Industry-createFactoryTasks");
					this.createFactoryTasks(rmColony);
					Stats_CPU.End(rmColony, "Industry-createFactoryTasks");

					Stats_CPU.Start(rmColony, "Industry-runTerminal");
					this.runTerminal(rmColony);
					Stats_CPU.End(rmColony, "Industry-runTerminal");
				}

				Stats_CPU.Start(rmColony, "Industry-runCreeps");
				this.runCreeps(rmColony, listCreeps);
				Stats_CPU.End(rmColony, "Industry-runCreeps");
			},


			runPopulation: function (rmColony, listCreeps) {
				let listSpawnRooms = _.get(Memory, ["rooms", rmColony, "spawn_assist", "rooms"]);

				let popActual = new Object();
				_.set(popActual, "courier", _.filter(listCreeps, (c) => c.memory.role == "courier" && (c.ticksToLive == undefined || c.ticksToLive > 80)).length);
				_.set(popActual, "factory_operator", _.filter(listCreeps, (c) => c.memory.role == "factory_operator" && (c.ticksToLive == undefined || c.ticksToLive > 80)).length);

				let popTarget = new Object();
				let popSetting = _.get(Memory, ["rooms", rmColony, "set_population"]);
				if (popSetting)
					popTarget = _.cloneDeep(popSetting)
				else
					popTarget = _.cloneDeep(Population_Industry);

				// Tally population levels for level scaling and statistics
				Control.populationTally(rmColony,
					_.sum(popTarget, p => { return _.get(p, "amount", 0); }),
					_.sum(popActual));

				// Grafana population stats
				Stats_Grafana.populationTally(rmColony, popTarget, popActual);

				if (_.get(Game, ["rooms", rmColony, "terminal"])
					&& _.get(popActual, "courier", 0) < _.get(popTarget, ["courier", "amount"], 0)) {
					Memory["shard"]["spawn_requests"].push({
						room: rmColony, listRooms: listSpawnRooms,
						priority: Math.lerpSpawnPriority(14, 16, _.get(popActual, "courier"), _.get(popTarget, ["courier", "amount"])),
						level: popTarget["courier"]["level"],
						scale: popTarget["courier"] == null ? true : popTarget["courier"]["scale"],
						body: "courier", name: null, args: { role: "courier", room: rmColony }
					});
				}

				// Spawn factory operators if there are factories and we need them
				let factories = _.filter(Game.rooms[rmColony].find(FIND_MY_STRUCTURES), 
					s => s.structureType == "factory");
				if (factories.length > 0 && _.get(popActual, "factory_operator", 0) < 1) {
					Memory["shard"]["spawn_requests"].push({
						room: rmColony, listRooms: listSpawnRooms,
						priority: 15,
						level: 6,
						scale: true,
						body: "worker", name: null, args: { role: "factory_operator", room: rmColony }
					});
				}
			},

			loadNukers: function (rmColony) {
				let nuker = _.head(Game.rooms[rmColony].find(FIND_STRUCTURES, { filter: (s) => { return s.structureType == "nuker"; } }));
				let storage = Game.rooms[rmColony].storage;

				if (nuker == null || storage == null)
					return;

				if (nuker.store[RESOURCE_ENERGY] < nuker.store.getCapacity(RESOURCE_ENERGY) && _.get(storage, ["store", "energy"], 0) > 0) {
					Memory.rooms[rmColony].industry.tasks.push(
						{ type: "withdraw", resource: "energy", id: storage.id, timer: 60, priority: 5 },
						{ type: "deposit", resource: "energy", id: nuker.id, timer: 60, priority: 5 });
				}
				if (nuker.store[RESOURCE_GHODIUM] < nuker.store.getCapacity(RESOURCE_GHODIUM)) {
					if (_.get(Memory, ["rooms", rmColony, "stockpile", "G"]) == null)
						_.set(Memory, ["rooms", rmColony, "stockpile", "G"], 500)
					if (_.get(storage, ["store", "G"], 0) > 0) {
						Memory.rooms[rmColony].industry.tasks.push(
							{ type: "withdraw", resource: "G", id: storage.id, timer: 60, priority: 5 },
							{ type: "deposit", resource: "G", id: nuker.id, timer: 60, priority: 5 });
					}
				}
			},

			assignReaction: function (rmColony) {
				if (_.filter(Game["rooms"][rmColony].find(FIND_MY_STRUCTURES), s => {
					return s.structureType == "lab"
						&& _.filter(labDefinitions, def => { return _.get(def, "action") == "boost" && _.get(def, "lab") == s.id; }).length == 0
				}).length < 3) {
					console.log(`<font color=\"#A17BFF\">[Labs]</font> Unable to assign a reaction to ${rmColony}- not enough labs available for reactions (labs boosting?).`);
					return;
				}

				let target = _.head(_.sortBy(_.sortBy(_.sortBy(_.filter(_.get(Memory, ["resources", "labs", "targets"]),
					t => {
						let amount = 0, r1_amount = 0, r2_amount = 0;
						let reagents = getReagents(_.get(t, "mineral"));
						_.each(_.filter(Game.rooms,
							r => { return r.controller != null && r.controller.my && r.terminal; }),
							r => {
								amount += r.store(_.get(t, "mineral"));
								r1_amount += r.store(reagents[0]);
								r2_amount += r.store(reagents[1]);
							});
						return (_.get(t, "amount") < 0 || amount < _.get(t, "amount")) && r1_amount >= 1000 && r2_amount >= 1000;
					}),
					t => _.get(t, "priority")),
					t => _.get(t, "is_reagent")),
					t => _.filter(_.get(Memory, ["resources", "labs", "reactions"]), r => { return _.get(r, "mineral") == _.get(t, "mineral"); }).length));

				if (target != null) {
					_.set(Memory, ["resources", "labs", "reactions", rmColony], { mineral: target.mineral, amount: target.amount });
					console.log(`<font color=\"#A17BFF\">[Labs]</font> Assigning ${rmColony} to create ${target.mineral}.`);
				} else {
					_.set(Memory, ["resources", "labs", "reactions", rmColony], { mineral: null, amount: null });
					console.log(`<font color=\"#A17BFF\">[Labs]</font> No reaction to assign to ${rmColony}, idling.`);
				}

			},

			defineLabs: function (rmColony) {
				// Clean up labDefinitions, remove duplicate "boosts", remove "empty" if already empty
				if (labDefinitions != null) {
					for (let i = labDefinitions.length - 1; i >= 0; i--) {
						if (_.get(labDefinitions[i], "action") == "boost") {
							if (_.get(labDefinitions[i], "expire") != null && _.get(labDefinitions[i], "expire") < Game.time)
								labDefinitions.splice(i, 1);

							for (let j = labDefinitions.length - 1; j >= 0; j--) {
								if (i != j && _.get(labDefinitions[i], "lab") == _.get(labDefinitions[j], "lab"))
									labDefinitions.splice(i, 1);
							}
						} else if (_.get(labDefinitions[i], "action") == "empty") {
							let labs = _.get(labDefinitions[i], "labs");
							for (let j = labs.length - 1; j >= 0; j--) {
								let lab = Game.getObjectById(labs[j]);
								if (lab == null || lab.mineralAmount == 0)
									labs.splice(j, 1);
							}

							if (labs.length == 0)
								labDefinitions.splice(i, 1)
							else
								_.set(labDefinitions[i], "labs", labs);
						}
					}
					_.set(Memory, ["rooms", rmColony, "labs", "definitions"], labDefinitions);
				}

				// Get labs able to process reactions (exclude labs defined to boost)
				let labs = _.filter(Game["rooms"][rmColony].find(FIND_MY_STRUCTURES), s => {
					return s.structureType == "lab"
						&& _.filter(labDefinitions, def => { return _.get(def, "action") == "boost" && _.get(def, "lab") == s.id; }).length == 0
				});

				// Not enough labs to support a reaction? Remove defined reactions, empty labs (if needed) and return
				if (labDefinitions != null && labs.length < 3) {
					for (let i = labDefinitions.length - 1; i >= 0; i--) {
						if (_.get(labDefinitions, [i, "action"]) == "reaction")
							labDefinitions.splice(i, 1)
					}

					for (let i = 0; i < labs.length; i++) {
						if (labs[i].mineralAmount > 0 && _.filter(labDefinitions, d => {
							return _.get(d, "action") == "empty"
								&& _.filter(_.get(d, "labs"), l => { return l == labs[i].id; }).length > 0
						}).length == 0) {

							labDefinitions.push({ action: "empty", labs: [labs[i].id] });
						}
					}

					_.set(Memory, ["rooms", rmColony, "labs", "definitions"], labDefinitions);
					return;
				}

				let terminal = _.get(Game, ["rooms", rmColony, "terminal"]);
				if (terminal == null)
					terminal = _.head(labs);

				labs = _.sortBy(labs, lab => { return lab.pos.getRangeTo(terminal.pos.x, terminal.pos.y); });
				let supply1 = _.get(labs, [0, "id"]);
				let supply2 = _.get(labs, [1, "id"]);
				let reactors = [];
				for (let i = 2; i < labs.length; i++)
					reactors.push(_.get(labs, [i, "id"]));

				// Clear existing "reaction" actions before adding new ones
				if (labDefinitions == null)
					labDefinitions = [];
				else {
					for (let i = labDefinitions.length - 1; i >= 0; i--) {
						if (_.get(labDefinitions, [i, "action"]) == "reaction")
							labDefinitions.splice(i, 1)
					}
				}

				labDefinitions.push({ action: "reaction", supply1: supply1, supply2: supply2, reactors: reactors });
				_.set(Memory, ["rooms", rmColony, "labs", "definitions"], labDefinitions);
				console.log(`<font color=\"#A17BFF\">[Labs]</font> Labs defined for ${rmColony}.`);
			},

			runLabs: function (rmColony) {
				/* Arguments for labDefinitions:

					Memory["rooms"][rmColony]["labs"]["definitions"]

					[ { action: "reaction", supply1: "5827cdeb16de9e4869377e4a", supply2: "5827f4b3a0ed8e9f6bf5ae3c",
						reactors: [ "5827988a4f975a7d696dba90", "5828280b74d604b04955e2f6", "58283338cc371cf674426315", "5827fcc4d448f67249f48185",
							"582825566948cb7d61593ab9", "58271f0e740746b259c029e9", "5827e49f0177f1ea2582a419" ] } ]);

					{ action: "boost", mineral: "", lab: "", role: "", subrole: "" }
					{ action: "reaction", amount: -1, mineral: "",
					  supply1: "", supply2: "",
					  reactors: ["", "", ...] }
					{ action: "empty", labs: ["", "", ...] }
				*/

				if (isPulse_Lab()) {
					this.assignReaction(rmColony);
				}

				for (let l in labDefinitions) {
					let listing = labDefinitions[l];
					switch (listing["action"]) {
						default:
							break;

						case "boost":
							let lab = Game.getObjectById(listing["lab"]);
							if (lab == null || (_.get(listing, "expire") != null && _.get(listing, "expire") < Game.time))
								break;

							if (!lab.canBoost(_.get(listing, "mineral"))) {
								_.each(_.filter(_.get(Memory, ["rooms", rmColony, "industry", "boosts"]),
									b => { return b.active && b.id == listing["lab"] && b.resource == listing["mineral"]; }),
									b => { b.active = false; });
							}

							let creep = _.head(lab.pos.findInRange(FIND_MY_CREEPS, 1, {
								filter: (c) => {
									return c.ticksToLive > 1250 && c.memory.role == listing["role"]
										&& (!listing["dest"] || c.memory.room == listing["dest"])
								}
							}));
							if (creep)
								lab.boostCreep(creep);

							break;

						case "reaction":
							let labSupply1 = Game.getObjectById(listing["supply1"]);
							let labSupply2 = Game.getObjectById(listing["supply2"]);

							if (labSupply1 == null && labSupply2 == null)
								break;

							let mineral = _.get(Memory, ["resources", "labs", "reactions", rmColony, "mineral"]);
							if (mineral == null)
								return;

							if (_.get(REACTIONS, [labSupply1.mineralType, labSupply2.mineralType]) != mineral)
								return;

							let amount = _.get(Memory, ["resources", "labs", "reactions", rmColony, "amount"], -1);
							if (amount > 0 && Game.rooms[rmColony].store(mineral) >= amount) {
								if (_.get(Memory, ["resources", "labs", "targets", mineral, "is_reagent"]))
									delete Memory["resources"]["labs"]["targets"][mineral];
								delete Memory["resources"]["labs"]["reactions"][rmColony];
								console.log(`<font color=\"#A17BFF\">[Labs]</font> ${rmColony} completed target for ${mineral}, re-assigning lab.`);
								delete Memory["hive"]["pulses"]["lab"];
								return;
							}

							_.forEach(listing["reactors"], r => {
								let labReactor = Game.getObjectById(r);
								if (labReactor != null)
									labReactor.runReaction(labSupply1, labSupply2);
							});

							break;
					}
				}
			},

			createLabTasks: function (rmColony) {
				/* Terminal task priorities:
				 * 2: emptying labs
				 * 3: filling labs
				 * 4: filling nuker
				 * 5: filling orders
				 * 6: emptying terminal
				 */

				for (let l in labDefinitions) {
					var lab, storage;
					let listing = labDefinitions[l];

					switch (listing["action"]) {
						default:
							break;

						case "boost":
							lab = Game.getObjectById(listing["lab"]);
							if (lab == null)
								break;

							if (_.get(Memory, ["rooms", rmColony, "stockpile", listing["mineral"]]) == null)
								_.set(Memory, ["rooms", rmColony, "stockpile", listing["mineral"]], 1000)

							// Minimum amount necessary to boost 1x body part: 30 mineral & 20 energy
							if (lab.mineralType == listing["mineral"] && lab.mineralAmount > 30 && lab.energy > 20) {
								Memory.rooms[rmColony].industry.boosts.push(
									{
										type: "boost", role: listing["role"], resource: listing["mineral"], dest: listing["dest"],
										id: lab.id, pos: lab.pos, timer: 30, active: true
									});
							}

							storage = Game.rooms[rmColony].storage;
							if (storage == null) break;

							if (lab.mineralType != null && lab.mineralType != listing["mineral"]) {
								Memory.rooms[rmColony].industry.tasks.push(
									{ type: "withdraw", resource: lab.mineralType, id: lab.id, timer: 60, priority: 2 });
							} else if (lab.energy < lab.energyCapacity * 0.75 && storage.store["energy"] > 0) {
								Memory.rooms[rmColony].industry.tasks.push(
									{ type: "withdraw", resource: "energy", id: storage.id, timer: 60, priority: 3 },
									{ type: "deposit", resource: "energy", id: lab.id, timer: 60, priority: 3 });
							} else if (lab.mineralAmount < lab.mineralCapacity * 0.75 && Object.keys(storage.store).includes(listing["mineral"])) {
								Memory.rooms[rmColony].industry.tasks.push(
									{ type: "withdraw", resource: listing["mineral"], id: storage.id, timer: 60, priority: 3 },
									{ type: "deposit", resource: listing["mineral"], id: lab.id, timer: 60, priority: 3 });
							}
							break;

						case "empty":
							storage = Game.rooms[rmColony].storage;
							if (storage == null) break;
							_.forEach(listing["labs"], l => {
								lab = Game.getObjectById(l);
								if (lab.mineralAmount > 0) {
									Memory.rooms[rmColony].industry.tasks.push(
										{ type: "withdraw", resource: lab.mineralType, id: lab.id, timer: 60, priority: 2 });
								}
							});
							break;

						case "reaction":
							storage = Game.rooms[rmColony].storage;
							if (storage == null) break;

							let mineral = _.get(Memory, ["resources", "labs", "reactions", rmColony, "mineral"]);
							if (mineral == null)
								return;

							let reagents = getReagents(mineral);
							let supply1_mineral = reagents[0];
							let supply2_mineral = reagents[1];
							_.set(Memory, ["rooms", rmColony, "stockpile", supply1_mineral], 1000)
							_.set(Memory, ["rooms", rmColony, "stockpile", supply2_mineral], 1000)


							lab = Game.getObjectById(listing["supply1"]);
							if (lab == null) {
								console.log(`<font color=\"#FF0000\">[Error]</font> Sites.Industry: Game.getObjectById(${listing["supply1"]}) is null.`);
								return;
							}
							else if (lab.mineralType != null && lab.mineralType != supply1_mineral) {
								Memory.rooms[rmColony].industry.tasks.push(
									{ type: "withdraw", resource: lab.mineralType, id: lab.id, timer: 60, priority: 2 });
							}
							else if (Object.keys(storage.store).includes(supply1_mineral)
								&& lab.mineralAmount < lab.mineralCapacity * 0.25) {
								Memory.rooms[rmColony].industry.tasks.push(
									{ type: "withdraw", resource: supply1_mineral, id: storage.id, timer: 60, priority: 3 },
									{ type: "deposit", resource: supply1_mineral, id: lab.id, timer: 60, priority: 3 });
							}

							lab = Game.getObjectById(listing["supply2"]);
							if (lab == null) {
								console.log(`<font color=\"#FF0000\">[Error]</font> Sites.Industry: Game.getObjectById(${listing["supply2"]}) is null.`);
								return;
							}
							else if (lab.mineralType != null && lab.mineralType != supply2_mineral) {
								Memory.rooms[rmColony].industry.tasks.push(
									{ type: "withdraw", resource: lab.mineralType, id: lab.id, timer: 60, priority: 2 });
							}
							else if (Object.keys(storage.store).includes(supply2_mineral)
								&& lab.mineralAmount < lab.mineralCapacity * 0.25) {
								Memory.rooms[rmColony].industry.tasks.push(
									{ type: "withdraw", resource: supply2_mineral, id: storage.id, timer: 60, priority: 3 },
									{ type: "deposit", resource: supply2_mineral, id: lab.id, timer: 60, priority: 3 });
							}

							_.forEach(listing["reactors"], r => {
								lab = Game.getObjectById(r);
								if (lab == null) {
									console.log(`<font color=\"#FF0000\">[Error]</font> Sites.Industry: Game.getObjectById(${r}) is null.`);
									return;
								}
								else if (lab.mineralType != null && lab.mineralType != mineral) {
									Memory.rooms[rmColony].industry.tasks.push(
										{ type: "withdraw", resource: lab.mineralType, id: lab.id, timer: 60, priority: 2 });
								} else if (lab.mineralAmount > lab.mineralCapacity * 0.2) {
									Memory.rooms[rmColony].industry.tasks.push(
										{ type: "withdraw", resource: mineral, id: lab.id, timer: 60, priority: 2 });
								}
							});

							break;
					}
				}
			},

			runTerminal: function (rmColony) {
				if (Game.rooms[rmColony].terminal != null && Game.rooms[rmColony].terminal.my) {

					if (_.get(Memory, ["resources", "terminal_orders"]) == null)
						_.set(Memory, ["resources", "terminal_orders"], new Object());
					if (_.get(Memory, ["rooms", rmColony, "stockpile"]) == null)
						_.set(Memory, ["rooms", rmColony, "stockpile"], new Object());

					let shortage = {};
					let room = Game.rooms[rmColony];
					let storage = Game.rooms[rmColony].storage;
					let terminal = Game.rooms[rmColony].terminal;
					let energy_level = room.store("energy");
					let energy_critical = room.getCriticalEnergy();

					// Check total colony energy and create market orders if needed
					this.checkColonyEnergyAndCreateMarketOrders(rmColony);

					// Create orders to request resources to meet per-room stockpile
					for (let res in _.get(Memory, ["rooms", rmColony, "stockpile"])) {
						shortage[res] = _.get(Memory, ["rooms", rmColony, "stockpile", res]) - room.store(res);

						if (shortage[res] > 0)
							_.set(Memory, ["resources", "terminal_orders", `${rmColony}-${res}`],
								{ room: rmColony, resource: res, amount: shortage[res], automated: true, priority: 2 });
					}

					// Set critical energy threshold to room's stockpile (to prevent sending to other rooms)
					if (_.get(Memory, ["rooms", rmColony, "stockpile", "energy"], 0) < energy_critical)
						_.set(Memory, ["rooms", rmColony, "stockpile", "energy"], energy_critical);

					// Create high priority order to fix critical shortage of energy in this room (include margins for error)
					if (energy_level < energy_critical) {
						let amount = Math.max((energy_critical * 1.25) - energy_level, 1000);

						if (amount > 0) {
							// Prevent spamming "new energy order creted" if it's just modifying the amount on an existing order...
							if (_.get(Memory, ["resources", "terminal_orders", `${rmColony}-energy_critical`]) == null)
								console.log(`<font color=\"#DC00FF\">[Terminals]</font> Creating critical energy order for ${rmColony} for ${amount} energy.`);
							_.set(Memory, ["resources", "terminal_orders", `${rmColony}-energy_critical`],
								{ room: rmColony, resource: "energy", amount: amount, automated: true, priority: 1 });

							// Prevent double energy orders (one for critical, one for regular stockpile)
							delete Memory["resources"]["terminal_orders"][`${rmColony}-energy`];
						}
					} else {
						delete Memory["resources"]["terminal_orders"][`${rmColony}-energy_critical`];
					}

					let filling = new Array();
					this.runTerminal_Orders(rmColony, storage, terminal, shortage, filling);
					this.runTerminal_Empty(rmColony, storage, terminal, filling);
				}
			},

			checkColonyEnergyAndCreateMarketOrders: function (rmColony) {
				// Only check every 50 ticks to avoid spam
				if (Game.time % 50 != 0) return;

				// Calculate total energy across all colonies
				let totalEnergy = 0;
				let colonies = _.filter(Game.rooms, r => r.controller && r.controller.my);
				_.each(colonies, colony => {
					totalEnergy += colony.store("energy");
				});

				// Check if total energy is below threshold (1,000,000)
				let energyThreshold = _.get(Memory, ["resources", "market_energy_threshold"], 1000000);
				if (totalEnergy < energyThreshold) {
					// Find all energy sell orders and calculate average price
					let energyOrders = Game.market.getAllOrders(
						order => order.type == "sell" && order.resourceType == "energy"
					);
					
					if (energyOrders.length > 0) {
						// Calculate average market price (excluding outliers)
						let prices = energyOrders.map(order => order.price).sort((a, b) => a - b);
						let avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
						
						// Calculate median price for better outlier detection
						let medianPrice = prices[Math.floor(prices.length / 2)];
						
						// Get configurable price protection settings
						let priceProtection = _.get(Memory, ["resources", "market_price_protection"], { avg_multiplier: 2.0, median_multiplier: 1.5 });
						let creditLimit = _.get(Memory, ["resources", "market_credit_limit"], 0.8);
						
						// Filter out orders that are too expensive based on configurable thresholds
						let maxPrice = Math.min(avgPrice * priceProtection.avg_multiplier, medianPrice * priceProtection.median_multiplier);
						let reasonableOrders = energyOrders.filter(order => order.price <= maxPrice);
						
						if (reasonableOrders.length > 0) {
							// Sort by price and find best order
							let bestOrder = _.sortBy(reasonableOrders, order => order.price)[0];
							let amountToBuy = Math.min(5000, energyThreshold - totalEnergy); // Buy in chunks of 5000
							
							// Check if we have enough credits to make this purchase
							let totalCost = bestOrder.price * amountToBuy;
							let availableCredits = Game.market.credits || 0;
							
							if (totalCost <= availableCredits * creditLimit) { // Use configurable credit limit
								// Calculate energy cost for the transaction
								let energyCost = Game.market.calcTransactionCost(amountToBuy, bestOrder.roomName, rmColony);
								let netEnergyGained = amountToBuy - energyCost;
								
								// Check if this transaction is profitable (we gain more energy than we spend)
								if (netEnergyGained <= 0) {
									console.log(`<font color=\"#FF6B6B\">[Market Emergency]</font> Transaction not profitable: buying ${amountToBuy} energy costs ${energyCost} energy (net gain: ${netEnergyGained}). Skipping.`);
									return;
								}
								
								// Check if the energy gain is significant enough to make a difference
								let minSignificantGain = _.get(Memory, ["resources", "market_min_energy_gain"], 1000); // Minimum 1000 net energy gain
								if (netEnergyGained < minSignificantGain) {
									console.log(`<font color=\"#FF6B6B\">[Market Emergency]</font> Energy gain too small: ${netEnergyGained} net energy (minimum: ${minSignificantGain}). Skipping.`);
									return;
								}
								
								// Find the best room to receive the energy (one with terminal and sufficient energy for transaction costs)
								let bestReceivingRoom = null;
								let bestRoomEnergy = 0;
								let bestRoomScore = -1;
								
								_.each(colonies, colony => {
									if (colony.terminal && colony.terminal.my) {
										let terminalEnergy = colony.terminal.store.energy || 0;
										// Score rooms by terminal energy, prioritizing rooms with enough energy for the transaction
										let score = terminalEnergy >= energyCost ? terminalEnergy + 10000 : terminalEnergy;
										if (score > bestRoomScore) {
											bestRoomScore = score;
											bestRoomEnergy = terminalEnergy;
											bestReceivingRoom = colony.name;
										}
									}
								});
								
								// If no room has sufficient terminal energy, create a high-priority energy order first
								if (bestRoomEnergy < energyCost) {
									let energyNeeded = energyCost + 1000; // Add buffer
									let energyOrderName = `${rmColony}-energy_emergency_terminal`;
									_.set(Memory, ["resources", "terminal_orders", energyOrderName], {
										room: rmColony,
										resource: "energy",
										amount: energyNeeded,
										automated: true,
										priority: 0, // Super high priority (higher than 1)
										terminal_fuel: true, // Mark as terminal fuel order
										emergency: true // Mark as emergency to get special handling
									});
									console.log(`<font color=\"#FF6B6B\">[Market Emergency]</font> Terminal in ${rmColony} needs ${energyNeeded} energy for transaction. Creating high-priority energy order.`);
									return; // Wait for terminal to get energy first
								}
								
								// Create market buy order
								let orderName = `market_energy_emergency_${Game.time}`;
								_.set(Memory, ["resources", "terminal_orders", orderName], {
									market_id: bestOrder.id,
									amount: amountToBuy,
									to: bestReceivingRoom,
									priority: 1, // High priority for emergency energy
									automated: true,
									emergency: true,
									energy_cost: energyCost,
									net_gain: netEnergyGained
								});

								console.log(`<font color=\"#FF6B6B\">[Market Emergency]</font> Creating market buy order: ${amountToBuy} energy at ${bestOrder.price} credits (cost: ${energyCost} energy, net gain: ${netEnergyGained}) to ${bestReceivingRoom} (terminal energy: ${bestRoomEnergy}).`);
							} else {
								console.log(`<font color=\"#FF6B6B\">[Market Emergency]</font> Energy below threshold but insufficient credits. Need ${totalCost} credits, have ${availableCredits}.`);
							}
						} else {
							console.log(`<font color=\"#FF6B6B\">[Market Emergency]</font> Energy below threshold but all available orders are too expensive. Average price: ${avgPrice.toFixed(2)}, max acceptable: ${maxPrice.toFixed(2)}.`);
						}
					} else {
						console.log(`<font color=\"#FF6B6B\">[Market Emergency]</font> Energy below threshold but no energy sell orders available on market.`);
					}
				}
			},

			runTerminal_Orders: function (rmColony, storage, terminal, shortage, filling) {
				/* Priority list for terminal orders:
				 * 	1: console injected...
				 * 	2: filling a shortage (internal transfers)
				 * 	3: filling energy for an internal transfer
				 *	4: filling a market order
				 *	5: filling energy for a market order
				*/

				for (let o in _.get(Memory, ["resources", "terminal_orders"]))
					_.set(Memory, ["resources", "terminal_orders", o, "name"], o);

				let orders = _.sortBy(_.get(Memory, ["resources", "terminal_orders"]), "priority");

				for (let n in orders) {
					let order = orders[n];

					if (_.get(order, "active", true) == false) {
						if (order.emergency) {
							console.log(`<font color=\"#FFA500\">[Debug]</font> Emergency order ${order.name} skipped - inactive`);
						}
						continue;
					}

					if (this.runOrder_Sync(order, rmColony) == false)
						continue;

					// Only process emergency orders in the room they're supposed to be processed in
					if (order.emergency && order.to != rmColony) {
						continue;
					}

					// Debug logging removed for CPU optimization

					if ((order["market_id"] == null && order["room"] != rmColony)
						|| (order["market_id"] != null && order["type"] == "buy" && order["from"] == rmColony)) {
						// Buy order means I'm selling...
						if (this.runOrder_Send(rmColony, order, storage, terminal, shortage, filling) == true)
							return;
					} else if (order["market_id"] != null && order["type"] == "sell" && order["to"] == rmColony) {
						// Sell order means I'm buying...
						if (this.runOrder_Receive(rmColony, order, storage, terminal, filling) == true)
							return;
					} else if (order.emergency) {
						// Debug logging removed for CPU optimization
					}
				}
			},

			runOrder_Sync: function (order, rmColony) {
				let o = order["name"];

				if (_.get(order, "market_id") != null) {	// Sync market orders, update/find new if expired...
					if (order["sync"] != Game.time) {
						order["sync"] = Game.time;
						let sync = Game.market.getOrderById(order["market_id"]);

						if (sync != null) {
							order["market_item"] = sync;
							order["type"] = sync.type;
							order["room"] = sync.roomName;
							order["resource"] = sync.resourceType;
						} else {
							let replacement = _.head(_.sortBy(Game.market.getAllOrders(
								obj => {
									return _.get(obj, "resourceType") == _.get(order, ["market_item", "resourceType"])
										&& _.get(obj, "type") == _.get(order, ["market_item", "type"])
										&& _.get(obj, "price") == _.get(order, ["market_item", "price"]);
								}),
								obj => { return Game.map.getRoomLinearDistance(rmColony, obj.roomName); }));

							if (replacement != null) {
								order["market_item"] = replacement;
								order["market_id"] = replacement.id;
								order["type"] = replacement.type;
								order["room"] = replacement.roomName;
								order["resource"] = replacement.resourceType;

								console.log(`<font color=\"#00F0FF\">[Market]</font> Replacement market order found for ${o}!`);
								return true;
							} else {
								console.log(`<font color=\"#00F0FF\">[Market]</font> No replacement market order found for ${o}; order deleted!`);

								if (order.emergency) {
									console.log(`<font color=\"#FFA500\">[Debug]</font> Emergency order ${o} deleted - no replacement found`);
								}
								delete Memory["resources"]["terminal_orders"][o];
								return false;
							}
						}
					}
				}

				return true;
			},

			runOrder_Send: function (rmColony, order, storage, terminal, shortage, filling) {
				/* Notes: Minimum transfer amount is 100.
				 *	 Don't try fulfilling orders with near-shortages- can cause an endless send loop and confuse couriers
				*/

				let o = order["name"];
				let res = order["resource"];
				let room = Game.rooms[rmColony];

				if (_.get(shortage, res, 0) < -2000 || (!_.keys(shortage).includes(res) && room.store(res) > 100)) {
					if (terminal.store[res] != null && ((res != "energy" && terminal.store[res] >= 100) || (res == "energy" && terminal.store[res] > 200))) {
						filling.push(res);
						filling.push("energy");

						let amount;
						if (res == "energy") {
							let calc_transfer = Game.market.calcTransactionCost(10000, rmColony, order["room"]);
							let calc_total = calc_transfer + 10000;
							let calc_coeff = (1 - calc_transfer / calc_total) * 0.95;
							amount = Math.floor(Math.clamp(terminal.store[res] * calc_coeff, 100, order["amount"]));
						} else {
							amount = Math.floor(Math.clamp(terminal.store[res], 100, order["amount"]));
						}

						let cost = Game.market.calcTransactionCost(amount, rmColony, order["room"]);

						if ((res != "energy" && terminal.store["energy"] >= cost)
							|| (res == "energy" && terminal.store["energy"] >= cost + amount)) {

							if (terminal.cooldown > 0)
								return false;

							let result = (order["market_id"] == null)
								? terminal.send(res, amount, order["room"])
								: Game.market.deal(order["market_id"], amount, rmColony);

							if (result == OK) {
								console.log(`<font color=\"#DC00FF\">[Terminals]</font> ${o}: ${amount} of ${res} sent, ${rmColony}`
									+ ` -> ${order["room"]}`);

								Memory["resources"]["terminal_orders"][o]["amount"] -= amount;
								if (_.get(Memory, ["resources", "terminal_orders", o, "amount"]) <= 0)
									delete Memory["resources"]["terminal_orders"][o];

								return true;

							} else {
								console.log(`<font color=\"#DC00FF\">[Terminals]</font> ${o}: failed to send, `
									+ `${amount} of ${res} ${rmColony} -> ${order["room"]} (code: ${result})`);
							}
						} else {
							if (storage != null && storage.store["energy"] > room.getCriticalEnergy()) {
								Memory.rooms[rmColony].industry.tasks.push(
									{ type: "withdraw", resource: "energy", id: storage.id, timer: 60, priority: 5 },
									{ type: "deposit", resource: "energy", id: terminal.id, timer: 60, priority: 5 });
							} else if (res != "energy") {
								shortage["energy"] = (shortage["energy"] == null) ? cost : shortage["energy"] + cost;
								_.set(Memory, ["resources", "terminal_orders", `${rmColony}-energy`],
									{ room: rmColony, resource: "energy", amount: cost, automated: true, priority: order["market_id"] == null ? 3 : 5 });
							}
						}
					} else if (storage != null && storage.store[res] != null) {
						filling.push(res);

						Memory.rooms[rmColony].industry.tasks.push(
							{
								type: "withdraw", resource: res, id: storage.id, timer: 60, priority: 5,
								amount: Object.keys(shortage).includes(res) ? Math.abs(shortage[res] + 100) : null
							},
							{ type: "deposit", resource: res, id: terminal.id, timer: 60, priority: 5 });
					}
				}

				return false;
			},

			runOrder_Receive: function (rmColony, order, storage, terminal, filling) {
				/* Notes: Minimum transfer amount is 100
				 * And always buy in small amounts! ~500-5000
				 */

				if (terminal.cooldown > 0) {
					// Debug logging removed for CPU optimization
					return false;
				}

				let o = order["name"];
				let res = order["resource"];
				let room = Game.rooms[rmColony];
				let amount = Math.max(100, Math.min(_.get(Memory, ["resources", "terminal_orders", o, "amount"]), 5000));
				let cost = Game.market.calcTransactionCost(amount, rmColony, order["room"]);

				if (_.get(terminal, ["store", "energy"]) > cost) {
					let result = Game.market.deal(order["market_id"], amount, rmColony);

					if (result == OK) {
						console.log(`<font color=\"#DC00FF\">[Terminals]</font> ${o}: ${amount} of ${res} received, ${order["room"]}`
							+ ` -> ${rmColony} `);

						Memory["resources"]["terminal_orders"][o]["amount"] -= amount;
						if (_.get(Memory, ["resources", "terminal_orders", o, "amount"]) <= 0)
							delete Memory["resources"]["terminal_orders"][o];

						return true;
					} else {
						console.log(`<font color=\"#DC00FF\">[Terminals]</font> ${o}: failed to receive`
							+ ` ${amount} of ${res} ${order["room"]} -> ${rmColony} (code: ${result})`);
					}
				} else {
					// Debug logging removed for CPU optimization
					
					// For emergency orders, create a high-priority energy order to get energy to the terminal
					if (order.emergency) {
						let energyNeeded = Math.max(cost + 1000, 5000); // Need cost + buffer
						_.set(Memory, ["resources", "terminal_orders", `${rmColony}-energy_emergency`], 
							{ room: rmColony, resource: "energy", amount: energyNeeded, automated: true, priority: 1 });
						console.log(`<font color=\"#FF6B6B\">[Market Emergency]</font> Creating emergency energy order for terminal in ${rmColony}: ${energyNeeded} energy needed`);
					}
					
					if (_.get(storage, ["store", "energy"]) > room.getCriticalEnergy()) {
						filling.push("energy");

						Memory.rooms[rmColony].industry.tasks.push(
							{ type: "withdraw", resource: "energy", id: storage.id, timer: 60, priority: 5 },
							{ type: "deposit", resource: "energy", id: terminal.id, timer: 60, priority: 5 });
					} else if (res != "energy") {
						_.set(Memory, ["resources", "terminal_orders", `${rmColony}-energy`],
							{ room: rmColony, resource: "energy", amount: cost, automated: true, priority: 5 });
					}
				}

				return false;
			},

			runTerminal_Empty: function (rmColony, storage, terminal, filling) {
				// Dynamically get all resources in the terminal
				let terminalResources = Object.keys(terminal.store);
				
				// Get all factory components that might be needed
				let factoryComponents = new Set();
				let factories = _.filter(Game.rooms[rmColony].find(FIND_MY_STRUCTURES), 
					s => s.structureType == "factory");
				
				// Collect all components from active factory assignments
				for (let factory of factories) {
					let assignment = _.get(Memory, ["resources", "factories", "assignments", factory.id]);
					if (assignment && assignment.components) {
						for (let component in assignment.components) {
							factoryComponents.add(component);
						}
					}
				}
				
				// Also add common factory components that might not be in current assignments
				let commonFactoryComponents = ["battery", "cell", "phlegm", "tissue", "muscle", "organoid", "organism"];
				for (let component of commonFactoryComponents) {
					factoryComponents.add(component);
				}

				// Process each resource in the terminal
				for (let res of terminalResources) {
					// Skip if this resource is being filled or has no amount
					if (filling.includes(res)
						|| ((res != "energy" && (terminal.store[res] == null || terminal.store[res] == 0))
							|| (res == "energy" && terminal.store[res] == 0)))
						continue;

					// Check if this resource is needed by any factory in the room
					let isFactoryComponent = factoryComponents.has(res);
					
					// Check if this resource is needed by any active factory assignment
					if (!isFactoryComponent) {
						for (let factory of factories) {
							let assignment = _.get(Memory, ["resources", "factories", "assignments", factory.id]);
							if (assignment && assignment.components && assignment.components[res]) {
								isFactoryComponent = true;
								break;
							}
						}
					}

					// Use higher priority for factory components to ensure they get moved quickly
					let priority = isFactoryComponent ? 1 : 6; // Priority 1 for factory components, 6 for others

					Memory.rooms[rmColony].industry.tasks.push(
						{ type: "withdraw", resource: res, id: terminal.id, timer: 60, priority: priority },
						{ type: "deposit", resource: res, id: storage.id, timer: 60, priority: priority });
				}
			},

			runCreeps: function (rmColony, listCreeps) {
				_.each(listCreeps, creep => {
					if (creep.memory.role == "courier") {
						Creep_Roles.Courier(creep);
					} else if (creep.memory.role == "factory_operator") {
						Creep_Roles.Factory_Operator(creep);
					} else if (creep.memory.role == "factory_operator") {
						Creep_Roles.Factory_Operator(creep);
					}
				});
			},

			runFactories: function (rmColony) {
				// Cache factory structures to avoid repeated find() calls
				if (!Game.rooms[rmColony]._cachedFactories) {
					Game.rooms[rmColony]._cachedFactories = _.filter(Game.rooms[rmColony].find(FIND_MY_STRUCTURES), 
						s => s.structureType == "factory");
				}
				let factories = Game.rooms[rmColony]._cachedFactories;
				
				if (factories.length == 0) return;

				// Initialize commodity cache if needed
				if (_.get(Memory, ["resources", "factories", "commodity_cache"]) == null) {
					this.cacheCommodityData();
				}

				// Assign factories based on priority (like labs do) - only on factory pulse
				if (isPulse_Factory()) {
					this.assignFactories(rmColony);
				}

				let targets = _.get(Memory, ["resources", "factories", "targets"]);
				if (targets == null || Object.keys(targets).length == 0) return;

				// Cache commodity counts to avoid repeated room iterations
				if (!Memory._commodityCounts || Game.time % 10 == 0) {
					Memory._commodityCounts = {};
					_.each(_.filter(Game.rooms, r => { return r.controller != null && r.controller.my; }), room => {
						for (let commodity in targets) {
							if (!Memory._commodityCounts[commodity]) Memory._commodityCounts[commodity] = 0;
							Memory._commodityCounts[commodity] += room.store(commodity);
						}
					});
				}

				// Sort targets by priority (lower number = higher priority)
				let sortedTargets = _.sortBy(targets, "priority");

				for (let target of sortedTargets) {
					let commodity = target.commodity;
					let current = Memory._commodityCounts[commodity] || 0;

					// If we've reached the target, skip this commodity
					if (current >= target.amount) continue;

					// Find a factory that can produce this commodity
					for (let factory of factories) {
						if (factory.cooldown > 0) continue;

						// Check if factory has the required components to produce this commodity
						let components = this.getCommodityComponents(commodity);
						if (components == null) continue;

						let hasComponents = true;
						for (let component in components) {
							let amount = components[component];
							if (factory.store[component] < amount) {
								hasComponents = false;
								break;
							}
						}

						if (hasComponents) {
							// Try to produce the commodity
							let result = factory.produce(commodity);
							if (result == OK) {
								// Only produce one commodity at a time
								return;
							}
						}
					}
				}
			},
		
			assignFactories: function (rmColony) {
				// This function is called per room, but we need to do global assignment
				// Only run the global assignment once per pulse using the first room
				let factoryPulse = _.get(Memory, ["hive", "pulses", "factory"]);
				if (!factoryPulse || !factoryPulse.active) {
					return;
				}
				
				// Use the first controlled room as the processing room for this pulse
				let processingRoom = null;
				for (let roomName in Game.rooms) {
					let room = Game.rooms[roomName];
					if (room.controller && room.controller.my) {
						processingRoom = roomName;
						break;
					}
				}
				
				// Only run assignment in the processing room
				if (rmColony !== processingRoom) {
					return;
				}

				// Cache all factories to avoid repeated find() calls
				if (!Memory._cachedAllFactories || Game.time % 20 == 0) {
					Memory._cachedAllFactories = [];
					_.each(_.filter(Game.rooms, r => { return r.controller != null && r.controller.my; }), room => {
						if (!room._cachedFactories) {
							room._cachedFactories = _.filter(room.find(FIND_MY_STRUCTURES), s => s.structureType == "factory");
						}
						Memory._cachedAllFactories = Memory._cachedAllFactories.concat(room._cachedFactories);
					});
				}
				let allFactories = Memory._cachedAllFactories;
				
				// Removed: DEBUG: Log factories found
				// console.log('[FACTORY DEBUG] Factories found:', allFactories.map(f => f.id));

				if (allFactories.length == 0) return;

				let targets = _.get(Memory, ["resources", "factories", "targets"]);
				// Removed: DEBUG: Log targets
				// console.log('[FACTORY DEBUG] Targets:', targets);
				if (targets == null || Object.keys(targets).length == 0) {
					// Clear assignments if no targets
					delete Memory["resources"]["factories"]["assignments"];
					return;
				}

				// Sort targets by priority (lower number = higher priority)
				let sortedTargets = _.sortBy(targets, "priority");

				// Store existing assignments to check for changes
				let existingAssignments = _.get(Memory, ["resources", "factories", "assignments"], {});
				let newAssignments = {};
				let assignmentsChanged = false;
				let assignedFactories = new Set(); // Track factories assigned in this iteration

				// Create a list of commodities that need production (sorted by priority)
				let commoditiesToProduce = [];
				
				// Use cached commodity counts if available
				let commodityCounts = Memory._commodityCounts || {};
				let componentCounts = Memory._componentCounts || {};
				
				// Cache component counts if not available
				if (!Memory._componentCounts || Game.time % 15 == 0) {
					Memory._componentCounts = {};
					_.each(_.filter(Game.rooms, r => { return r.controller != null && r.controller.my; }), room => {
						for (let target of sortedTargets) {
							let components = this.getCommodityComponents(target.commodity);
							if (components) {
								for (let component in components) {
									if (!Memory._componentCounts[component]) Memory._componentCounts[component] = 0;
									Memory._componentCounts[component] += room.store(component);
								}
							}
						}
					});
					componentCounts = Memory._componentCounts;
				}
				
				for (let target of sortedTargets) {
					let commodity = target.commodity;
					let current = commodityCounts[commodity] || 0;

					// Removed: DEBUG: Log each target considered
					// console.log('[FACTORY DEBUG] Considering target:', commodity, 'Current:', current, 'Needed:', target.amount);

					// If we've reached the target, skip this commodity
					if (current >= target.amount) continue;

					// Get commodity components
					let components = this.getCommodityComponents(commodity);
					if (components == null) continue;

					// Check if we have enough components available using cached counts
					let hasComponents = true;
					for (let component in components) {
						let amount = components[component];
						let available = componentCounts[component] || 0;
						if (available < amount) {
							hasComponents = false;
							break;
						}
					}

					if (!hasComponents) {
						// Removed: DEBUG: Skipping not enough components
						// console.log('[FACTORY DEBUG] Skipping', commodity, 'not enough components');
						continue;
					}

					// Add this commodity to our production list
					commoditiesToProduce.push({
						commodity: commodity,
						components: components,
						priority: target.priority
					});
				}

				// Round-robin assignment: cycle through commodities until all factories are assigned
				let commodityIndex = 0;
				let factoriesAssigned = 0;
				let totalFactories = allFactories.length;
				let consecutiveFailures = 0; // Track consecutive failures to prevent infinite loops

				while (factoriesAssigned < totalFactories && commoditiesToProduce.length > 0 && consecutiveFailures < commoditiesToProduce.length) {
					let commodityData = commoditiesToProduce[commodityIndex % commoditiesToProduce.length];
					let commodity = commodityData.commodity;
					let components = commodityData.components;
					let priority = commodityData.priority;

					// Find an available factory for this commodity
					let factoryAssigned = false;
					let availableFactories = 0;
					let assignedFactoriesCount = 0;
					
					for (let factory of allFactories) {
						if (factory.cooldown > 0) {
							continue;
						}

						// Check if this factory is already assigned in this iteration
						if (assignedFactories.has(factory.id)) {
							assignedFactoriesCount++;
							continue;
						}

						availableFactories++;

						// Assign this factory to produce this commodity
						let newAssignment = {
							commodity: commodity,
							components: components,
							room: factory.pos.roomName
						};
						
						newAssignments[factory.id] = newAssignment;
						assignedFactories.add(factory.id); // Mark this factory as assigned

						// Removed: DEBUG: Log assignment
						// console.log('[FACTORY DEBUG] Assigned factory', factory.id, 'to', commodity);

						assignmentsChanged = true;
						
						factoriesAssigned++;
						factoryAssigned = true;
						consecutiveFailures = 0; // Reset failure counter on success
						break; // Move to next commodity after assigning this factory
					}

					// If no factory was assigned for this commodity, move to next commodity
					if (!factoryAssigned) {
						consecutiveFailures++;
						commodityIndex++;
					} else {
						commodityIndex++;
					}
				}

				// Update assignments
				_.set(Memory, ["resources", "factories", "assignments"], newAssignments);

				// Clear factory pulse if assignments actually changed
				if (assignmentsChanged) {
					_.set(Memory, ["hive", "pulses", "factory", "active"], false);
					// Show status table after assignments are renewed
					if (typeof factories !== 'undefined' && factories.status) {
						factories.status();
					}
				}
			},

			createFactoryTasks: function (rmColony) {
				// Throttle cleanup removed for CPU optimization
				
				let factories = _.filter(Game.rooms[rmColony].find(FIND_MY_STRUCTURES), 
					s => s.structureType == "factory");
				
				if (factories.length == 0) {
					return;
				}

				let targets = _.get(Memory, ["resources", "factories", "targets"]);
				if (targets == null || Object.keys(targets).length == 0) {
					// Debug logging removed for CPU optimization
					return;
				}

				let storage = Game.rooms[rmColony].storage;
				if (storage == null) {
					// Debug logging removed for CPU optimization
					return;
				}

				// Create cleanup tasks for factories first (priority 1)
				this.createFactoryCleanupTasks(rmColony);
				
				// Check if there are active cleanup tasks - if so, don't create loading tasks
				let activeCleanupTasks = _.filter(Memory.rooms[rmColony].industry.tasks, t => t.priority == 1);
				if (activeCleanupTasks.length > 0) {
					// Create tasks for factory operators to move produced commodities to storage
					this.createFactoryOperatorTasks(rmColony);
					return; // Don't create loading tasks while cleanup is in progress
				}

				// Process factory assignments (created by assignFactories)
				let assignments = _.get(Memory, ["resources", "factories", "assignments"]);
				if (assignments) {
					for (let factoryId in assignments) {
						let assignment = assignments[factoryId];
						let factory = Game.getObjectById(factoryId);
						if (!factory) continue;

						// Only process factories that are in this room
						if (factory.pos.roomName !== rmColony) continue;

						let commodity = assignment.commodity;
						let components = assignment.components;

						// Set stockpile targets for components (like labs do for reagents)
						for (let component in components) {
							let amount = components[component];
							// Set stockpile target to 2x the amount needed for one production cycle
							// This ensures we have enough for production and some buffer
							let stockpileTarget = amount * 2;
							_.set(Memory, ["rooms", rmColony, "stockpile", component], stockpileTarget);
						}

						// Check if we have enough components
						let hasComponents = true;
						for (let component in components) {
							let amount = components[component];
							let available = 0;
							_.each(_.filter(Game.rooms, r => { return r.controller != null && r.controller.my; }), room => {
								available += room.store(component);
							});
							if (available < amount) {
								hasComponents = false;
								break;
							}
						}

						if (!hasComponents) {
							// Debug logging removed for CPU optimization
							continue;
						}

						// Check if factory needs components loaded
						let needsComponents = false;
						for (let component in components) {
							let amount = components[component];
							if (factory.store[component] < amount) {
								needsComponents = true;
								break;
							}
						}

						if (needsComponents) {
							// Debug logging removed for CPU optimization
							// Create tasks to load components into factory
							for (let component in components) {
								let amount = components[component];
								if (factory.store[component] < amount) {
									let needed = amount - factory.store[component];
									Memory.rooms[rmColony].industry.tasks.push(
										{ type: "withdraw", resource: component, id: storage.id, timer: 60, priority: 2 },
										{ type: "deposit", resource: component, id: factory.id, timer: 60, priority: 2 }
									);
									// Debug logging removed for CPU optimization
								}
							}
						}
					}
				}

				// Create tasks for factory operators to move produced commodities to storage
				this.createFactoryOperatorTasks(rmColony);
			},

			getCommodityComponents: function (commodity) {
				// Check if we have cached commodity data
				if (_.get(Memory, ["resources", "factories", "commodity_cache"]) == null) {
					this.cacheCommodityData();
				}
				
				// Get from cache first
				let cached = _.get(Memory, ["resources", "factories", "commodity_cache", commodity]);
				if (cached) {
					// Extract components from recipe
					return cached.components || cached;
				}
				
				// No recipe found
				return null;
			},

			cacheCommodityData: function () {
				// Cache all available commodities from Screeps API
				_.set(Memory, ["resources", "factories", "commodity_cache"], COMMODITIES);
			},

			cleanupFactoryStockpileTargets: function (rmColony) {
				// Get all active factory targets
				let targets = _.get(Memory, ["resources", "factories", "targets"]);
				if (targets == null || Object.keys(targets).length == 0) {
					// No targets, clean up all factory-related stockpile targets
					let stockpile = _.get(Memory, ["rooms", rmColony, "stockpile"]);
					if (stockpile) {
						for (let resource in stockpile) {
							// Check if this resource is used by any commodity
							let isUsed = false;
							let cache = _.get(Memory, ["resources", "factories", "commodity_cache"]);
							if (cache) {
								for (let commodity in cache) {
									let recipe = cache[commodity];
									let components = recipe.components || recipe;
									if (components && components[resource]) {
										isUsed = true;
										break;
									}
								}
							}
							
							// If not used by any commodity, remove the stockpile target
							if (!isUsed) {
								delete stockpile[resource];
								// Debug logging removed for CPU optimization
							}
						}
					}
					return;
				}

				// Get all components needed by active targets
				let neededComponents = new Set();
				for (let commodity in targets) {
					let components = this.getCommodityComponents(commodity);
					if (components) {
						for (let component in components) {
							neededComponents.add(component);
						}
					}
				}

				// Clean up stockpile targets for components that are no longer needed
				let stockpile = _.get(Memory, ["rooms", rmColony, "stockpile"]);
				if (stockpile) {
					for (let resource in stockpile) {
						// Check if this is a factory component (not a lab reagent)
						let isFactoryComponent = false;
						let cache = _.get(Memory, ["resources", "factories", "commodity_cache"]);
						if (cache) {
							for (let commodity in cache) {
								let recipe = cache[commodity];
								let components = recipe.components || recipe;
								if (components && components[resource]) {
									isFactoryComponent = true;
									break;
								}
							}
						}

						// If it's a factory component and not needed, remove the stockpile target
						if (isFactoryComponent && !neededComponents.has(resource)) {
							delete stockpile[resource];
							// Debug logging removed for CPU optimization
						}
					}
				}
			},

			createFactoryOperatorTasks: function (rmColony) {
				let factories = _.filter(Game.rooms[rmColony].find(FIND_MY_STRUCTURES), 
					s => s.structureType == "factory");
				
				if (factories.length == 0) return;

				// Check if any factory needs operator attention (produced commodities OR unwanted materials)
				for (let factory of factories) {
					let needsOperator = false;
					let assignment = _.get(Memory, ["resources", "factories", "assignments", factory.id]);
					
					// Check for any non-energy materials
					for (let resource in factory.store) {
						if (resource != "energy" && factory.store[resource] > 0) {
							needsOperator = true;
							break;
						}
					}

					if (needsOperator) {
						// Create task for operator to handle factory contents (priority 3 - lower than cleanup tasks)
						Memory.rooms[rmColony].industry.tasks.push(
							{ type: "factory_operate", id: factory.id, timer: 60, priority: 3 }
						);
					}
				}
			},

			createFactoryCleanupTasks: function (rmColony) {
				let factories = _.filter(Game.rooms[rmColony].find(FIND_MY_STRUCTURES), 
					s => s.structureType == "factory");
				
				if (factories.length == 0) return;

				let storage = Game.rooms[rmColony].storage;
				if (storage == null) return;

				// Only run cleanup if there are no active component loading tasks
				let activeLoadingTasks = _.filter(Memory.rooms[rmColony].industry.tasks, t => t.priority == 2);
				if (activeLoadingTasks.length > 0) {
					// Debug logging removed for CPU optimization
					return;
				}

				// Clean up stockpile targets for components that are no longer needed
				this.cleanupFactoryStockpileTargets(rmColony);

				let cleanupTasksCreated = 0;
				let cleanupDetails = [];
				
				for (let factory of factories) {
					let assignment = _.get(Memory, ["resources", "factories", "assignments", factory.id]);
					
					// If factory has no assignment, clean everything except energy
					if (assignment == null) {
						for (let resource in factory.store) {
							if (resource != "energy" && factory.store[resource] > 0) {
								Memory.rooms[rmColony].industry.tasks.push(
									{ type: "withdraw", resource: resource, id: factory.id, timer: 60, priority: 1 }
								);
								cleanupTasksCreated++;
								cleanupDetails.push(`${factory.id}: ${resource}:${factory.store[resource]}`);
							}
						}
						continue;
					}

					// Factory has assignment - clean unnecessary items (following labs pattern)
					let commodity = assignment.commodity;
					let components = assignment.components || {};
					let allowedResources = ["energy", commodity].concat(Object.keys(components));

					for (let resource in factory.store) {
						// If this resource is not allowed for current production, clean it immediately (priority 1)
						if (!allowedResources.includes(resource) && factory.store[resource] > 0) {
							Memory.rooms[rmColony].industry.tasks.push(
								{ type: "withdraw", resource: resource, id: factory.id, timer: 60, priority: 1 }
							);
							cleanupTasksCreated++;
							cleanupDetails.push(`${factory.id}: ${resource}:${factory.store[resource]} (unwanted)`);
							continue;
						}

						// For allowed resources, check if we have excess
						if (allowedResources.includes(resource)) {
							// For components, keep only what's needed for production (like labs keep 25% capacity)
							if (components[resource]) {
								let neededAmount = components[resource];
								let currentAmount = factory.store[resource];
								
								// If we have more than 1.5x what we need, clean the excess
								if (currentAmount > neededAmount * 1.5) {
									let excess = currentAmount - neededAmount;
									Memory.rooms[rmColony].industry.tasks.push(
										{ type: "withdraw", resource: resource, id: factory.id, timer: 60, priority: 1, amount: excess }
									);
									cleanupTasksCreated++;
								}
							}
							
							// For the output commodity, keep only a reasonable amount (like labs keep 20% capacity)
							if (resource === commodity) {
								let currentAmount = factory.store[resource];
								let maxKeep = 1000; // Keep max 1000 of output commodity
								
								if (currentAmount > maxKeep) {
									let excess = currentAmount - maxKeep;
									Memory.rooms[rmColony].industry.tasks.push(
										{ type: "withdraw", resource: resource, id: factory.id, timer: 60, priority: 1, amount: excess }
									);
									cleanupTasksCreated++;
								}
							}
						}
					}
				}
				
				if (cleanupTasksCreated > 0) {
					// Debug logging removed for CPU optimization
				}
			},
		};

		Industry.Run(rmColony);
	},

	Colonization: function (rmColony, rmTarget) {
		let Colonization = {

			Run: function (rmColony, rmTarget) {

				controller = _.get(Game, ["rooms", rmColony, "controller"]);
				if (controller == null || !_.get(controller, "my") || _.get(controller, "level") < 3)
					return;

				Stats_CPU.Start(rmColony, `Colonization-${rmTarget}-init`);
				listRoute = _.get(Memory, ["sites", "colonization", rmTarget, "list_route"]);
				Stats_CPU.End(rmColony, `Colonization-${rmTarget}-init`);

				Stats_CPU.Start(rmColony, `Colonization-${rmTarget}-listCreeps`);
				let listCreeps = _.filter(Game.creeps, c => c.memory.room == rmTarget && c.memory.colony == rmColony);
				Stats_CPU.End(rmColony, `Colonization-${rmTarget}-listCreeps`);

				if (isPulse_Spawn()) {
					Stats_CPU.Start(rmColony, `Colonization-${rmTarget}-runPopulation`);
					this.runPopulation(rmColony, rmTarget, listCreeps);
					Stats_CPU.End(rmColony, `Colonization-${rmTarget}-runPopulation`);
				}

				Stats_CPU.Start(rmColony, `Colonization-${rmTarget}-runCreeps`);
				this.runCreeps(rmColony, rmTarget, listCreeps, listRoute);
				Stats_CPU.End(rmColony, `Colonization-${rmTarget}-runCreeps`);
			},

			runPopulation: function (rmColony, rmTarget, listCreeps) {
				let popActual = new Object();
				_.set(popActual, "colonizer", _.filter(listCreeps, c => c.memory.role == "colonizer").length);

				let popTarget = _.cloneDeep(Population_Colonization);

				// Tally population levels for level scaling and statistics
				Control.populationTally(rmColony,
					_.sum(popTarget, p => { return _.get(p, "amount", 0); }),
					_.sum(popActual));

				if (_.get(popActual, "colonizer", 0) < _.get(popTarget, ["colonizer", "amount"], 0)) {
					Memory["shard"]["spawn_requests"].push({
						room: rmColony, listRooms: null,
						priority: 21,
						level: _.get(popTarget, ["colonizer", "level"], 6),
						scale: _.get(popTarget, ["colonizer", "scale"], false),
						body: _.get(popTarget, ["colonizer", "body"], "reserver_at"),
						name: null, args: { role: "colonizer", room: rmTarget, colony: rmColony }
					});
				}
			},

			runCreeps: function (rmColony, rmTarget, listCreeps, listRoute) {
				_.each(listCreeps, creep => {
					_.set(creep, ["memory", "list_route"], listRoute);

					if (creep.memory.role == "colonizer") {
						Creep_Roles.Colonizer(creep);
					}
				});
			}
		};

		Colonization.Run(rmColony, rmTarget);
	},

	Combat: function (memory_id) {
		let Combat = {
			Run: function (combat_id) {
				if (_.get(Memory, ["sites", "combat", combat_id, "tactic"]) == null)
					return;

				let rmColony = _.get(Memory, ["sites", "combat", combat_id, "colony"]);

				if (isPulse_Spawn()) {
					Stats_CPU.Start(rmColony, `Combat-${combat_id}-runPopulation`);
					this.setPopulation(combat_id);
					this.runPopulation(combat_id);
					Stats_CPU.End(rmColony, `Combat-${combat_id}-runPopulation`);
				}

				Stats_CPU.Start(rmColony, `Combat-${combat_id}-runTactic`);
				this.runTactic(combat_id);
				Stats_CPU.End(rmColony, `Combat-${combat_id}-runTactic`);
			},

			setPopulation: function (combat_id) {
				let combat = _.get(Memory, ["sites", "combat", combat_id]);
				let tacticType = _.get(combat, ["tactic", "type"]);
				let rmColony = _.get(combat, ["colony"]);
				let rmLevel = Game["rooms"][rmColony].getLevel();
				let army = _.get(combat, ["tactic", "army"]);


				if (_.get(combat, ["tactic", "spawn_repeat"]) == null)
					_.set(Memory, ["sites", "combat", combat_id, "tactic", "spawn_repeat"], true);

				if (army != null)
					return;

				switch (tacticType) {
					default:
					case "waves": army = _.cloneDeep(Population_Combat__Waves); break;
					case "trickle": army = _.cloneDeep(Population_Combat__Trickle); break;
					case "occupy": army = _.cloneDeep(Population_Combat__Occupy); break;
					case "dismantle": army = _.cloneDeep(Population_Combat__Dismantle); break;
					case "tower_drain": army = _.cloneDeep(Population_Combat__Tower_Drain); break;
					case "controller": army = _.cloneDeep(Population_Combat__Controller); break;
				}

				for (let each in army) {
					if (_.get(army[each], "level") == null)
						_.set(army[each], "level", rmLevel);
				}

				_.set(Memory, ["sites", "combat", combat_id, "tactic", "army"], _.cloneDeep(army));
			},

			runPopulation: function (combat_id) {
				if (_.get(Memory, ["sites", "combat", combat_id, "state_combat"]) == "spawning") {
					this.runPopulation_SpawnRequests(combat_id);
				}
			},

			runPopulation_SpawnRequests: function (combat_id) {
				if (!isPulse_Spawn())
					return;

				let combat = _.get(Memory, ["sites", "combat", combat_id]);
				let listArmy = _.get(combat, ["tactic", "army"]);
				let lengthArmy = _.sum(listArmy, s => { return s.amount; });
				let rmColony = _.get(combat, ["colony"]);
				let rmLevel = Game["rooms"][rmColony].getLevel();
				let listSpawnRooms = _.get(combat, ["list_spawns"]);
				let listCreeps = _.filter(Game.creeps, c => { return _.get(c, ["memory", "combat_id"]) == combat_id; });

				for (let role in listArmy) {
					let listRole = _.filter(listCreeps, c => { return _.get(c, ["memory", "role"]) == role; });
					if (listRole.length < _.get(listArmy, [role, "amount"])) {
						Memory["shard"]["spawn_requests"].push({
							room: rmColony,
							listRooms: listSpawnRooms,
							priority: 20,
							level: _.get(listArmy, [role, "level"], rmLevel),
							scale: false,
							body: _.get(listArmy, [role, "body"], role),
							name: null,
							args: {
								role: role, combat_id: combat_id,
								room: _.get(combat, "target_room"), colony: rmColony,
								list_route: _.get(combat, "list_route")
							}
						});
					}
				}
			},

			runTactic: function (combat_id) {
				let combat = _.get(Memory, ["sites", "combat", combat_id]);
				let state_combat = _.get(combat, "state_combat");

				if (state_combat == null)
					_.set(Memory, ["sites", "combat", combat_id, "state_combat"], "spawning");

				switch (_.get(combat, ["tactic", "type"])) {
					case "waves": this.runTactic_Waves(combat_id, combat); break;
					case "trickle": this.runTactic_Trickle(combat_id, combat); break;
					// Occupy tactic same as Trickle tactic using different army population.
					case "occupy": this.runTactic_Trickle(combat_id, combat); break;
					// Dismantle tactic same as Trickle tactic using different army population.
					case "dismantle": this.runTactic_Trickle(combat_id, combat); break;
					case "tower_drain": this.runTactic_Tower_Drain(combat_id, combat); break;
					case "controller": this.runTactic_Controller(combat_id, combat); break;
				}
			},

			runTactic_Waves: function (combat_id, combat) {
				let tactic = _.get(combat, "tactic");
				let state_combat = _.get(combat, "state_combat");
				let listCreeps = _.filter(Game.creeps, c => { return _.get(c, ["memory", "combat_id"]) == combat_id; });
				let army = _.get(combat, ["tactic", "army"]);
				let army_amount = _.sum(army, s => { return s.amount; });

				switch (state_combat) {
					case "spawning":
					case "rallying":
						let rally_range = 5;
						let rally_pos = _.get(tactic, "rally_pos");

						_.each(listCreeps, creep => {
							if (_.get(combat, "use_boosts") && this.creepBoost(creep, combat))
								return;
							this.creepRally(creep, rally_pos, rally_range);
						});

						if (this.checkSpawnComplete_toRally(combat_id, combat, listCreeps, army_amount))
							return;
						if (this.checkRallyComplete_toAttack(combat_id, combat, listCreeps, rally_pos, rally_range, army_amount))
							return;
						return;

					case "attacking":
						// Run the creeps' base roles!
						this.creepRoles(listCreeps, tactic);

						// Evaluate victory or reset conditions
						if (Game.time % 10 == 0) {
							if (this.evaluateDefeat_CreepsWiped(combat_id, combat, listCreeps))
								return;
							else if (listCreeps.length == 0 && _.get(tactic, "spawn_repeat")) {
								_.set(Memory, ["sites", "combat", combat_id, "state_combat"], "spawning");
								return;
							}

							let target_room = Game["rooms"][_.get(combat, "target_room")];
							if (target_room != null) {
								let room_structures = target_room.find(FIND_STRUCTURES);
								if (this.evaluateVictory_TargetStructures(combat_id, combat, room_structures))
									return;
								if (this.evaluateVictory_TargetList(combat_id, combat, room_structures))
									return;
							}
						}
						return;

					case "complete":
						if (_.get(combat, ["tactic", "to_occupy"]))
							this.setOccupation(combat_id, combat, tactic);
						delete Memory["sites"]["combat"][combat_id];
						console.log(`<font color=\"#FFA100\">[Combat: ${combat_id}]</font> Combat completed, removing from memory.`);
						return;
				}
			},

			runTactic_Trickle: function (combat_id, combat) {
				let tactic = _.get(combat, "tactic");
				let state_combat = _.get(combat, "state_combat");
				let listCreeps = _.filter(Game.creeps, c => { return _.get(c, ["memory", "combat_id"]) == combat_id; });

				// Dismantle is a Trickle tactic with dismantler population targeting structures.
				if (_.get(tactic, "type") == "dismantle") {
					_.set(tactic, "target_creeps", false);
					_.set(tactic, "target_structures", true);
					_.set(tactic, "to_occupy", false);
				}

				switch (state_combat) {
					// Trickle tactic is a constant state of spawning and moving to trickle into destination room
					case "spawning":
						_.each(listCreeps, creep => {
							if (_.get(combat, "use_boosts") && this.creepBoost(creep, combat))
								return;
						});

						// Run the creeps' base roles!
						this.creepRoles(listCreeps, tactic);

						// Evaluate victory; occupations are never-ending
						if (Game.time % 10 == 0 && _.get(combat, ["tactic", "type"]) != "occupy") {
							let target_room = Game["rooms"][_.get(combat, "target_room")];
							if (target_room != null) {
								let room_structures = target_room.find(FIND_STRUCTURES);
								if (this.evaluateVictory_TargetStructures(combat_id, combat, room_structures))
									return;
								if (this.evaluateVictory_TargetList(combat_id, combat, room_structures))
									return;
							}
						}
						return;

					case "complete":
						if (_.get(combat, ["tactic", "to_occupy"], false))
							this.setOccupation(combat_id, combat, tactic);
						delete Memory["sites"]["combat"][combat_id];
						console.log(`<font color=\"#FFA100\">[Combat: ${combat_id}]</font> Combat completed, removing from memory.`);
						return;
				}
			},

			runTactic_Tower_Drain: function (combat_id, combat) {
				let tactic = _.get(combat, "tactic");
				let state_combat = _.get(combat, "state_combat");
				let listCreeps = _.filter(Game.creeps, c => { return _.get(c, ["memory", "combat_id"]) == combat_id; });
				let army = _.get(combat, ["tactic", "army"]);
				let army_amount = _.sum(army, s => { return s.amount; });
				let rally_range = 3;
				let rally_pos = _.get(tactic, "rally_pos");
				let drain_pos = _.get(tactic, "drain_pos");

				switch (state_combat) {
					case "spawning":
					case "rallying":
						_.each(listCreeps, creep => {
							if (_.get(combat, "use_boosts") && this.creepBoost(creep, combat))
								return;
							this.creepRally(creep, rally_pos, rally_range);
						});

						if (this.checkSpawnComplete_toRally(combat_id, combat, listCreeps, army_amount))
							return;
						if (this.checkRallyComplete_toAttack(combat_id, combat, listCreeps, rally_pos, rally_range, army_amount))
							return;
						return;

					case "attacking":
						// Replenish any creeps that die
						this.runPopulation_SpawnRequests(combat_id);

						// Run the creeps' roles for griefing the room and draining the towers' energy
						let pos_rally = new RoomPosition(rally_pos.x, rally_pos.y, rally_pos.roomName);
						let pos_drain = new RoomPosition(drain_pos.x, drain_pos.y, drain_pos.roomName);

						_.each(listCreeps, creep => {
							if (creep.memory.role == "tank" || creep.memory.role == "dismantler") {
								if (creep.hits < (creep.hitsMax * 0.4)
									|| (creep.memory.role == "dismantler" && !creep.hasPart("work")))
									_.set(creep, ["memory", "combat_state"], "rally");
								else if (creep.hits == creep.hitsMax)
									_.set(creep, ["memory", "combat_state"], "drain");

								if (_.get(creep, ["memory", "combat_state"]) == null)
									_.set(creep, ["memory", "combat_state"], "rally");

								if (_.get(creep, ["memory", "combat_state"]) == "rally")
									creep.moveTo(pos_rally, { reusePath: 0 });
								else if (_.get(creep, ["memory", "combat_state"]) == "drain") {
									if (creep.memory.role == "dismantler")
										Creep_Roles.Dismantler(creep, true, _.get(tactic, "target_list"));
									creep.moveTo(pos_drain, { reusePath: 0 });
								}
							} else if (creep.memory.role == "healer") {
								let wounded = _.head(_.filter(listCreeps,
									c => {
										return c.hits < c.hitsMax && c.pos.roomName == pos_rally.roomName
											&& c.pos.getRangeTo(pos_rally) <= rally_range;
									}));
								if (wounded != null) {
									if (creep.heal(wounded) == ERR_NOT_IN_RANGE) {
										creep.rangedHeal(wounded);
										creep.moveTo(wounded, { reusePath: 0 });
									}
								} else {
									if (creep.hits < creep.hitsMax)
										creep.heal(creep);
									this.creepRally(creep, rally_pos, rally_range);
								}
							}
						});

						// Evaluate victory or reset conditions
						if (Game.time % 10 == 0) {
							if (this.evaluateDefeat_CreepsWiped(combat_id, combat, listCreeps))
								return;
							else if (listCreeps.length == 0 && _.get(tactic, "spawn_repeat")) {
								_.set(Memory, ["sites", "combat", combat_id, "state_combat"], "spawning");
								return;
							}

							let target_room = Game["rooms"][_.get(combat, "target_room")];
							if (target_room != null && _.filter(target_room.find(FIND_STRUCTURES), s => { return s.structureType == "tower"; }).length == 0) {
								_.set(Memory, ["sites", "combat", combat_id, "state_combat"], "complete");
								console.log(`<font color=\"#FFA100\">[Combat: ${combat_id}]</font> No enemy towers detected! Completing tower drain combat.`);
								return;
							}
						}
						return;

					case "complete":
						delete Memory["sites"]["combat"][combat_id];
						console.log(`<font color=\"#FFA100\">[Combat: ${combat_id}]</font> Combat completed, removing from memory.`);
						return;
				}
			},

			runTactic_Controller: function (combat_id, combat) {
				let tactic = _.get(combat, "tactic");
				let state_combat = _.get(combat, "state_combat");
				let listCreeps = _.filter(Game.creeps, c => { return _.get(c, ["memory", "combat_id"]) == combat_id; });
				let target_room = Game["rooms"][_.get(combat, "target_room")];

				switch (state_combat) {
					// Controller tactic is a constant state of spawning and moving to trickle into destination room
					case "spawning":
						_.each(listCreeps, creep => {
							if (_.get(combat, "use_boosts") && this.creepBoost(creep, combat))
								return;
						});

						if (target_room == null || target_room.controller.upgradeBlocked > 200)
							_.set(Memory, ["sites", "combat", combat_id, "tactic", "army"],
								{ scout: { amount: 1, level: 1 } });
						else
							_.set(Memory, ["sites", "combat", combat_id, "tactic", "army"],
								{ reserver: { amount: 1, level: 3, body: "reserver_at" } });

						// Run the creeps' base roles!
						this.creepRoles(listCreeps, tactic);

						// Evaluate victory
						if (Game.time % 10 == 0) {
							if (target_room != null) {
								if (this.evaluateVictory_Controller(combat_id, combat))
									return;
							}
						}
						return;

					case "complete":
						if (_.get(combat, ["tactic", "to_occupy"]))
							this.setOccupation(combat_id, combat, tactic);
						delete Memory["sites"]["combat"][combat_id];
						console.log(`<font color=\"#FFA100\">[Combat: ${combat_id}]</font> Combat completed, removing from memory.`);
						return;
				}
			},

			checkSpawnComplete_toRally: function (combat_id, combat, listCreeps, army_amount) {
				if (_.get(combat, "state_combat") == "spawning" && army_amount > 0 && listCreeps.length == army_amount) {
					_.set(Memory, ["sites", "combat", combat_id, "state_combat"], "rallying");
					return true;
				}
				return false;
			},

			checkRallyComplete_toAttack: function (combat_id, combat, listCreeps, rally_pos, rally_range, army_amount) {
				let state_combat = _.get(combat, "state_combat");
				let posRally = new RoomPosition(rally_pos.x, rally_pos.y, rally_pos.roomName);
				let creeps_rallied = _.filter(listCreeps, c => c.room.name == rally_pos.roomName && posRally.inRangeTo(c.pos, rally_range));
				if (state_combat == "rallying" && listCreeps.length > 0 && Game.time % 5 == 0) {
					if (creeps_rallied.length == listCreeps.length) {
						_.set(Memory, ["sites", "combat", combat_id, "state_combat"], "attacking");
						console.log(`<font color=\"#FFA100\">[Combat: ${combat_id}]</font> All creeps at rally point. Launching attack!`);
						return true;
					}
				} else if (Game.time % 50 == 0) {
					console.log(`<font color=\"#FFA100\">[Combat: ${combat_id}]</font> Spawning and rallying troops, `
						+ `${creeps_rallied.length} of ${army_amount} at rally point.`);
				}
				return false;
			},

			creepBoost: function (creep, combat) {
				let rmColony = _.get(combat, ["colony"]);
				if (creep.room.name == rmColony) {
					if (creep.memory.boost == null && !creep.isBoosted()) {
						if (Creep_Roles_Combat.seekBoost(creep))
							return true;
					} else if (creep.memory.boost != null && !creep.isBoosted()
						&& _.get(creep.memory, ["boost", "pos", "x"])
						&& _.get(creep.memory, ["boost", "pos", "y"])
						&& _.get(creep.memory, ["boost", "pos", "roomName"])) {
						creep.travel(new RoomPosition(creep.memory.boost.pos.x, creep.memory.boost.pos.y, creep.memory.boost.pos.roomName));
						return true;
					}
				}
				return false;
			},

			creepRally: function (creep, rally_pos, rallyRange) {
				let posRally = new RoomPosition(rally_pos.x, rally_pos.y, rally_pos.roomName);

				if (creep.room.name != posRally.roomName)
					creep.travelToRoom(posRally.roomName, true);
				else if (creep.room.name == posRally.roomName) {
					if (!posRally.inRangeTo(creep.pos, rallyRange)) {
						creep.moveTo(posRally);
					} else if (creep.hasPart("attack") || creep.hasPart("ranged_attack")) {
						let hostile = _.head(creep.pos.findInRange(FIND_HOSTILE_CREEPS, 3,
							{ filter: (c) => { return c.isHostile(); } }));
						if (hostile != null) {
							creep.rangedAttack(hostile);
							creep.attack(hostile);
						}
					} else if (creep.hasPart("heal")) {
						let wounded = _.head(creep.pos.findInRange(FIND_MY_CREEPS, 3,
							{ filter: (c) => { return c.hits < c.hitsMax; } }));
						if (wounded != null) {
							if (creep.pos.getRangeTo(wounded) <= 1)
								creep.heal(wounded);
							else
								creep.heal(wounded);
						}
					}

					if (Game.time % 15 == 0 && posRally.inRangeTo(creep.pos, rallyRange)) {
						creep.moveTo(posRally);
					}
				}
			},

			creepRoles: function (listCreeps, tactic) {
				let target_creeps = _.get(tactic, "target_creeps");
				let target_structures = _.get(tactic, "target_structures");
				let target_list = _.get(tactic, "target_list");

			_.each(listCreeps, creep => {
				if (creep.memory.role == "scout") {
					Creep_Roles.Scout(creep);
				} else if (creep.memory.role == "portal_scout") {
					Creep_Roles.Portal_Scout(creep);
				} else if (creep.memory.role == "soldier"
						|| creep.memory.role == "brawler"
						|| creep.memory.role == "paladin") {
						Creep_Roles.Soldier(creep, target_structures, target_creeps, target_list);
					} else if (creep.memory.role == "archer") {
						Creep_Roles.Archer(creep, target_structures, target_creeps, target_list);
					} else if (creep.memory.role == "dismantler") {
						Creep_Roles.Dismantler(creep, target_structures, target_list);
					} else if (creep.memory.role == "healer") {
						Creep_Roles.Healer(creep, true);
					} else if (creep.memory.role == "reserver") {
						Creep_Roles.Reserver(creep);
					}
				});
			},

			evaluateDefeat_CreepsWiped: function (combat_id, combat, listCreeps) {
				if (listCreeps.length == 0 && _.get(combat, ["tactic", "spawn_repeat"]) != true) {
					_.set(Memory, ["sites", "combat", combat_id, "state_combat"], "complete");
					console.log(`<font color=\"#FFA100\">[Combat: ${combat_id}]</font> Defeat detected by all friendly creeps killed! Stopping attack.`);
					return true;
				}
				return false;
			},

			evaluateVictory_TargetStructures: function (combat_id, combat, room_structures) {
				if (_.get(Game, ["rooms", _.get(combat, "target_room")]) != null) {
					let attack_structures = _.filter(room_structures,
						s => {
							return s.hits != null && s.hits > 0
								&& ((s.owner == null && s.structureType != "container")
									|| (s.owner != null && !s.my && s.owner != "Source Keeper" && s.structureType != "controller"
										&& _.get(Memory, ["hive", "allies"]).indexOf(s.owner.username) < 0));
						});
					if (_.get(combat, ["tactic", "target_structures"]) == true && attack_structures.length == 0) {
						_.set(Memory, ["sites", "combat", combat_id, "state_combat"], "complete");
						console.log(`<font color=\"#FFA100\">[Combat: ${combat_id}]</font> Victory detected by destroying all structures! Stopping attack.`);
						return true;
					}
				}
				return false;
			},

			evaluateVictory_TargetList: function (combat_id, combat, room_structures) {
				let target_list = _.get(combat, ["tactic", "target_list"]);

				if (target_list != null && _.get(combat, ["tactic", "target_structures"]) != true
					&& _.get(Game, ["rooms", _.get(combat, "target_room")]) != null) {
					let targets_remaining = _.filter(room_structures, s => {
						return target_list.indexOf(s.id) >= 0;
					});

					if (targets_remaining.length == 0) {
						_.set(Memory, ["sites", "combat", combat_id, "state_combat"], "complete");
						console.log(`<font color=\"#FFA100\">[Combat: ${combat_id}]</font> Victory detected by destroying all targets on target list! Stopping attack.`);
						return true;
					}
				}
				return false;
			},

			evaluateVictory_Controller: function (combat_id, combat) {
				if (_.get(Game, ["rooms", _.get(combat, "target_room")]) != null
					&& _.get(Game, ["rooms", _.get(combat, "target_room"), "controller", "owner"]) == null) {
					_.set(Memory, ["sites", "combat", combat_id, "state_combat"], "complete");
					return true;
				}
				return false;
			},

			setOccupation: function (combat_id, combat, tactic) {
				console.log(`<font color=\"#FFA100\">[Combat: ${combat_id}]</font> `
					+ `Setting occupation request in Memory; combat_id ${combat_id}-occupy.`);
				_.set(Memory, ["sites", "combat", `${combat_id}-occupy`],
					{
						colony: combat.colony, target_room: combat.target_room,
						list_spawns: combat.list_spawns, list_route: combat.list_route,
						tactic: {
							type: "occupy", target_creeps: tactic.target_creeps, target_structures: tactic.target_structures,
							target_list: tactic.target_list
						}
					});
			}
		};

		Combat.Run(memory_id);
	},

	HighwayMining: function (highway_id) {
		let HighwayMining = {

					Run: function (highway_id) {
			let highwayData = _.get(Memory, ["sites", "highway_mining", highway_id]);
			if (!highwayData) return;

			Stats_CPU.Start(highway_id, "HighwayMining-init");

			let listSpawnRooms = highwayData.spawn_assist;
			let listSpawnRoute = highwayData.list_route;

			let listCreeps = _.filter(Game.creeps, c => c.memory.highway_id == highway_id);
			
			// Debug: Log highway mining status
			if (Game.time % 50 == 0) {
				console.log(`<font color=\"#FFA500\">[Highway Debug]</font> Highway ${highway_id}: ${listCreeps.length} creeps, state: ${highwayData.state}`);
				_.each(listCreeps, c => {
					console.log(`<font color=\"#FFA500\">[Highway Debug]</font> - ${c.name}: ${c.memory.role} in ${c.room.name}`);
				});
			}
			
			Stats_CPU.End(highway_id, "HighwayMining-init");

				if (isPulse_Spawn()) {
					Stats_CPU.Start(highway_id, "HighwayMining-runPopulation");
					this.runPopulation(highway_id, listCreeps, listSpawnRooms);
					Stats_CPU.End(highway_id, "HighwayMining-runPopulation");
				}

				Stats_CPU.Start(highway_id, "HighwayMining-runCreeps");
				this.runCreeps(highway_id, listCreeps, listSpawnRoute);
				Stats_CPU.End(highway_id, "HighwayMining-runCreeps");
			},

			runPopulation: function (highway_id, listCreeps, listSpawnRooms) {
				let highwayData = _.get(Memory, ["sites", "highway_mining", highway_id]);
				if (!highwayData) return;

				let colony = highwayData.colony;
				let resourceType = highwayData.resource_type;
				let state = highwayData.state;

				let popActual = new Object();
				_.each(listCreeps, c => {
					let role = _.get(c, ["memory", "role"]);
					popActual[role] = _.get(popActual, role, 0) + 1;
				});

				let burrowers = _.filter(listCreeps, c => c.memory.role === "highway_burrower");
				let travel_time = highwayData.travel_time || 100;
				let buffer = 20;
				let replacement_window = 50;
				
				// Enhanced replacement logic with better overlap
				if (burrowers.length === 1) {
					let burrower = burrowers[0];
					let shouldQueueReplacement = false;
					let replacementReason = "";
					
					// More aggressive replacement timing to ensure overlap
					let earlyReplacementThreshold = travel_time + buffer + replacement_window * 2;
					let criticalThreshold = travel_time + buffer;
					
					// Queue replacement much earlier to ensure overlap
					if (burrower.ticksToLive && burrower.ticksToLive < earlyReplacementThreshold) {
						shouldQueueReplacement = true;
						replacementReason = "early replacement for overlap";
					}
					
					// Queue replacement if burrower is returning with resources and no replacement exists
					if (burrower.memory.state === "returning" && _.sum(burrower.carry) > 0 && !highwayData.replacement_queued) {
						shouldQueueReplacement = true;
						replacementReason = "returning with resources";
					}
					
					// Force replacement if we're very close to death with any resources
					if (burrower.ticksToLive && burrower.ticksToLive < criticalThreshold && _.sum(burrower.carry) > 0 && !highwayData.replacement_queued) {
						shouldQueueReplacement = true;
						replacementReason = "critical replacement near death";
					}
					
					// Queue replacement if we have any resources and are getting old (prevent resource loss)
					if (burrower.ticksToLive && burrower.ticksToLive < earlyReplacementThreshold && _.sum(burrower.carry) > 0 && !highwayData.replacement_queued) {
						shouldQueueReplacement = true;
						replacementReason = "preventive replacement with resources";
					}
					
					if (shouldQueueReplacement) {
						// Only queue if not already queued or if enough time has passed
						if (!highwayData.replacement_queued || Game.time - (highwayData.last_replacement || 0) > travel_time) {
							highwayData.replacement_queued = true;
							highwayData.last_replacement = Game.time;
							console.log(`<font color=\"#FFA500\">[Highway]</font> Queuing replacement burrower for ${highway_id} (${replacementReason})`);
							Memory["shard"]["spawn_requests"].push({
								room: highwayData.colony, listRooms: listSpawnRooms,
								priority: 15,
								level: 8, body: "extractor",
								args: {
									role: "highway_burrower",
									highway_id: highway_id,
									colony: highwayData.colony,
									resource_type: highwayData.resource_type
								}
							});
						}
					}
					
					// Clear replacement flag when new burrower arrives (fresh spawn)
					if (burrower.ticksToLive > 1500) { // Fresh spawn
						highwayData.replacement_queued = false;
						console.log(`<font color=\"#FFA500\">[Highway]</font> New burrower arrived, clearing replacement flag for ${highway_id}`);
					}
				}

				let popTarget = new Object();
				let popSetting = highwayData.population;
				if (popSetting) {
					popTarget = _.cloneDeep(popSetting);
				} else {
									// Default population based on resource type
				if (resourceType == "power") {
				popTarget = {
					// Largest possible melee attacker (10 TOUGH, 25 ATTACK, 15 MOVE)
					"highway_attacker": { amount: 4, level: 8, body: [].concat(
						Array(10).fill(TOUGH),
						Array(25).fill(ATTACK),
						Array(15).fill(MOVE)
					) },
					// Largest possible healer (25 HEAL, 25 MOVE)
					"highway_healer": { amount: 2, level: 8, body: [].concat(
						Array(25).fill(HEAL),
						Array(25).fill(MOVE)
					) },
					// Largest possible carrier (16 CARRY, 16 MOVE)
					"highway_carrier": { amount: 2, level: 8, body: [].concat(
						Array(16).fill(CARRY),
						Array(16).fill(MOVE)
					) }
				};
			} else {
			// Only one max-size extractor for commodities (level 8: 25 WORK, 8 CARRY, 17 MOVE)
			// Single creep handles both mining and carrying
			popTarget = {
				"highway_burrower": { amount: 1, level: 8, body: "extractor" }
			};
		}
				}

				// Tally population levels for level scaling and statistics
				Control.populationTally(colony,
					_.sum(popTarget, p => { return _.get(p, "amount", 0); }),
					_.sum(popActual));

				// Grafana population stats
				Stats_Grafana.populationTally(colony, popTarget, popActual);

				// Spawn requests
				_.each(popTarget, (pop, role) => {
					let amount = _.get(pop, "amount", 0);
					let actual = _.get(popActual, role, 0);
					let level = _.get(pop, "level", 4);
					let body = _.get(pop, "body", "worker");

					for (let i = actual; i < amount; i++) {
						Memory["shard"]["spawn_requests"].push({
							room: colony, listRooms: listSpawnRooms,
							priority: 15, // Highway mining priority
							level: level, body: body,
							args: {
								role: role,
								highway_id: highway_id,
								colony: colony,
								resource_type: resourceType
							}
						});
										if (role === "highway_burrower") {
					console.log(`<font color=\"#FFA500\">[Highway]</font> Spawning single extractor (level 8: 25 WORK, 8 CARRY, 17 MOVE) for commodity mining in ${highway_id}`);
				}
					}
				});
			},

			runCreeps: function (highway_id, listCreeps, listSpawnRoute) {
				// Check if target resource still exists
				let highwayData = _.get(Memory, ["sites", "highway_mining", highway_id]);
				if (highwayData && highwayData.state == "harvesting") {
					this.checkResourceStatus(highway_id, highwayData);
				}
				
				_.each(listCreeps, creep => {
					if (creep.spawning) return;

					// Set list_route for travel
					if (listSpawnRoute) {
						creep.memory.list_route = listSpawnRoute;
					}

					switch (creep.memory.role) {
						case "highway_attacker":
							this.runHighwayAttacker(creep);
							break;
						case "highway_healer":
							this.runHighwayHealer(creep);
							break;
						case "highway_burrower":
							this.runHighwayBurrower(creep);
							break;
						case "highway_carrier":
							this.runHighwayCarrier(creep);
							break;
					}
				});
			},

			checkResourceStatus: function (highway_id, highwayData) {
				let resourceId = highwayData.resource_id;
				let targetRoom = highwayData.target_room;
				let resourceType = highwayData.resource_type;
				
				// Skip check if resource_id hasn't been discovered yet
				if (!resourceId) {
					return;
				}
				
				// Check if there are still active creeps for this operation
				let activeCreeps = _.filter(Game.creeps, c => c.memory.highway_id === highway_id && !c.spawning);
				if (activeCreeps.length === 0) {
					// No active creeps, but don't mark as completed yet - wait for spawn
					console.log(`<font color=\"#FFA500\">[Highway]</font> No active creeps for ${highway_id}, waiting for spawn`);
					return;
				}
				
				// Check if the target resource still exists
				let resource = Game.getObjectById(resourceId);
				if (!resource) {
					// Resource no longer exists, mark as completed
					highwayData.state = "completed";
					console.log(`<font color=\"#FFA500\">[Highway]</font> Resource ${resourceId} no longer exists, marking operation as completed for ${highway_id}`);
					return;
				}
				
				// For power banks, check if they're depleted
				if (resourceType == 'power' && resource.structureType == STRUCTURE_POWER_BANK) {
					if (resource.hits <= 0) {
						highwayData.state = "completed";
						console.log(`<font color=\"#FFA500\">[Highway]</font> Power bank ${resourceId} depleted, marking operation as completed for ${highway_id}`);
						return;
					}
				}
				
				// For deposits, check if they're depleted
				if (resourceType != 'power' && resource.structureType == "deposit") {
					if (resource.ticksToDeposit <= 0) {
						highwayData.state = "completed";
						console.log(`<font color=\"#FFA500\">[Highway]</font> Deposit ${resourceId} depleted, marking operation as completed for ${highway_id}`);
						return;
					}
				}
				
				// Check for operation timeout (only if no active creeps and resource is gone)
				let operationStart = highwayData.operation_start || Game.time;
				let timeElapsed = Game.time - operationStart;
				if (timeElapsed > 5000 && activeCreeps.length === 0) { // Much longer timeout, only if no creeps
					highwayData.state = "completed";
					console.log(`<font color=\"#FFA500\">[Highway]</font> Operation timeout after ${timeElapsed} ticks with no active creeps, marking as completed for ${highway_id}`);
					return;
				}
			},

			runHighwayAttacker: function (creep) {
				// For power attacks, prioritize immediate travel to target room
				let highwayData = _.get(Memory, ["sites", "highway_mining", creep.memory.highway_id]);
				if (highwayData && highwayData.resource_type === "power") {
					// If not in target room, travel there immediately
					if (creep.room.name !== highwayData.target_room) {
						creep.travelToRoom(highwayData.target_room, true);
						return;
					}
					
					// In target room, attack immediately
					creep.memory.task = creep.getTask_Highway_Attack_Power();
					creep.runTask(creep);
					return;
				}
				
				// Fallback to original logic for other resource types
				if (this.moveToDestination(creep))
					return;

				creep.memory.task = creep.memory.task || creep.getTask_Highway_Attack_Power();
				creep.memory.task = creep.memory.task || creep.getTask_Wait(10);

				creep.runTask(creep);
			},

			runHighwayHealer: function (creep) {
				let highwayData = _.get(Memory, ["sites", "highway_mining", creep.memory.highway_id]);
				if (highwayData && highwayData.resource_type === "power") {
					// Move to target room if not there
					if (creep.room.name !== highwayData.target_room) {
						creep.travelToRoom(highwayData.target_room, true);
						return;
					}
			
					// Find all damaged attackers in range 3
					let attackers = creep.pos.findInRange(FIND_MY_CREEPS, 3, {
						filter: c => c.memory.role === "highway_attacker" && c.hits < c.hitsMax
					});
			
					// Prioritize the most damaged attacker
					let target = _.min(attackers, a => a.hits);
			
					if (target && target.hits < target.hitsMax) {
						if (creep.pos.isNearTo(target)) {
							creep.heal(target);
						} else {
							creep.rangedHeal(target);
							creep.travel(target.pos);
						}
						return;
					}
			
					// If no damaged attackers, move toward the closest attacker
					let allAttackers = creep.pos.findClosestByPath(FIND_MY_CREEPS, {
						filter: c => c.memory.role === "highway_attacker"
					});
					if (allAttackers) {
						creep.travel(allAttackers.pos);
					}
					return;
				}
			
				// Fallback to original logic for other resource types
				if (this.moveToDestination(creep))
					return;
			
				// Heal nearby damaged creeps
				let damagedCreeps = creep.pos.findInRange(FIND_MY_CREEPS, 3, {
					filter: c => c.hits < c.hitsMax
				});
			
				if (damagedCreeps.length > 0) {
					creep.heal(damagedCreeps[0]);
				} else {
					creep.memory.task = creep.memory.task || creep.getTask_Wait(10);
					creep.runTask(creep);
				}
			},

			runHighwayBurrower: function (creep) {
				let highwayData = _.get(Memory, ["sites", "highway_mining", creep.memory.highway_id]);
				let travel_time = highwayData && highwayData.travel_time ? highwayData.travel_time : 100;
				let buffer = 20;
				let replacement_window = 50;
				let carrySum = _.sum(creep.carry);
				let isInColony = creep.room.name === creep.memory.colony;
				
				// Enhanced lifecycle management
				let shouldReturn = false;
				let returnReason = "";
				
				// Check if creep is about to die
				if (creep.ticksToLive && travel_time && (creep.ticksToLive < travel_time + buffer)) {
					shouldReturn = true;
					returnReason = "dying soon";
				}
				
				// Check if deposit is about to expire
				if (highwayData && highwayData.resource_id) {
					let target = Game.getObjectById(highwayData.resource_id);
					if (target && target.ticksToDeposit && travel_time && (target.ticksToDeposit < travel_time + buffer)) {
						shouldReturn = true;
						returnReason = "deposit expiring";
					}
				}
				
				// Check if we're full (traditional condition)
				if (carrySum === creep.carryCapacity) {
					shouldReturn = true;
					returnReason = "full";
				}
				
				// Check if we have a significant amount of resources and should return
				// This prevents high-level creeps from never returning due to large capacity
				let significantLoad = carrySum > 0 && carrySum >= Math.min(creep.carryCapacity * 0.1, 50); // At least 10% or 50 units
				let timeToReturn = travel_time + buffer;
				let hasReplacement = highwayData && highwayData.replacement_queued;
				
				if (significantLoad && creep.ticksToLive && (creep.ticksToLive < timeToReturn + replacement_window) && hasReplacement) {
					shouldReturn = true;
					returnReason = "significant load with replacement ready";
				}
				
				// Force return if we have any resources and are very close to death
				if (carrySum > 0 && creep.ticksToLive && creep.ticksToLive < travel_time) {
					shouldReturn = true;
					returnReason = "force return with resources";
				}
				
				// Return if any condition is met
				if (shouldReturn) {
					console.log(`<font color=\"#FFA500\">[Highway]</font> Burrower ${creep.name} returning home (${returnReason}) from ${creep.room.name} with ${carrySum}/${creep.carryCapacity} resources`);
					creep.memory.state = "returning";
					creep.memory.task = creep.getTask_Highway_Carry_Resource();
					creep.runTask(creep);
					return;
				}
				
				// If we're empty and in colony room, go back to mining
				if (carrySum === 0 && isInColony) {
					// Check for dropped resources before going back to mining
					let droppedResources = creep.room.find(FIND_DROPPED_RESOURCES, {
						filter: r => r.resourceType === highwayData.resource_type
					});
					
					if (droppedResources.length > 0) {
						let closestDrop = creep.pos.findClosestByPath(droppedResources);
						if (closestDrop) {
							console.log(`<font color=\"#FFA500\">[Highway]</font> Empty burrower ${creep.name} picking up dropped ${highwayData.resource_type}`);
							creep.memory.task = {
								type: "pickup",
								id: closestDrop.id,
								timer: 10
							};
							creep.runTask(creep);
							return;
						}
					}
					
					creep.memory.state = "mining";
					delete creep.memory.task;
				}
				
				// If we're returning and reached colony, deposit resources
				if (creep.memory.state === "returning" && isInColony) {
					// First check for dropped resources to pick up
					let droppedResources = creep.room.find(FIND_DROPPED_RESOURCES, {
						filter: r => r.resourceType === highwayData.resource_type
					});
					
					if (droppedResources.length > 0 && _.sum(creep.carry) < creep.carryCapacity) {
						let closestDrop = creep.pos.findClosestByPath(droppedResources);
						if (closestDrop) {
							console.log(`<font color=\"#FFA500\">[Highway]</font> Returning burrower ${creep.name} picking up dropped ${highwayData.resource_type}`);
							creep.memory.task = {
								type: "pickup",
								id: closestDrop.id,
								timer: 10
							};
							creep.runTask(creep);
							return;
						}
					}
					
					creep.memory.task = creep.memory.task || creep.getTask_Highway_Carry_Resource();
					creep.memory.task = creep.memory.task || creep.getTask_Wait(10);
					creep.runTask(creep);
					return;
				}
				
				// If we're mining, go to target resource
				if (creep.memory.state === "mining" || !creep.memory.state) {
					// First check for dropped resources to pick up
					let droppedResources = creep.room.find(FIND_DROPPED_RESOURCES, {
						filter: r => r.resourceType === highwayData.resource_type
					});
					
					if (droppedResources.length > 0 && _.sum(creep.carry) < creep.carryCapacity) {
						let closestDrop = creep.pos.findClosestByPath(droppedResources);
						if (closestDrop) {
							console.log(`<font color=\"#FFA500\">[Highway]</font> Burrower ${creep.name} picking up dropped ${highwayData.resource_type}`);
							creep.memory.task = {
								type: "pickup",
								id: closestDrop.id,
								timer: 10
							};
							creep.runTask(creep);
							return;
						}
					}
					
					if (this.moveToDestination(creep))
						return;

					creep.memory.task = creep.memory.task || creep.getTask_Highway_Harvest_Commodity();
					creep.memory.task = creep.memory.task || creep.getTask_Wait(10);
					creep.runTask(creep);
				}
			},

			runHighwayCarrier: function (creep) {
				let highwayData = _.get(Memory, ["sites", "highway_mining", creep.memory.highway_id]);
				if (!highwayData) return;
			
				if (highwayData.resource_type === "power") {
					// If not in target room, travel there immediately
					if (creep.room.name !== highwayData.target_room) {
						creep.travelToRoom(highwayData.target_room, true);
						return;
					}
			
					// Check if power bank still exists
					let powerBank = highwayData.resource_id ? Game.getObjectById(highwayData.resource_id) : null;
			
					// If power bank exists and is alive, stay 5+ tiles away
					if (powerBank && powerBank.hits > 0) {
						if (creep.pos.getRangeTo(powerBank) < 5) {
							// Move away to a position 5 tiles away
							let positions = [];
							for (let dx = -5; dx <= 5; dx++) {
								for (let dy = -5; dy <= 5; dy++) {
									if (Math.abs(dx) === 5 || Math.abs(dy) === 5) {
										let pos = new RoomPosition(powerBank.pos.x + dx, powerBank.pos.y + dy, powerBank.pos.roomName);
										if (pos.isValid() && pos.getRangeTo(powerBank) >= 5) {
											positions.push(pos);
										}
									}
								}
							}
							if (positions.length > 0) {
								// Move to the closest valid position 5+ tiles away
								let safePos = _.min(positions, p => creep.pos.getRangeTo(p));
								creep.travel(safePos);
							}
						}
						return;
					}
			
					// If power bank is gone, look for power drops
					let powerDrops = creep.pos.findInRange(FIND_DROPPED_RESOURCES, 20, {
						filter: r => r.resourceType === RESOURCE_POWER
					});
			
					if (powerDrops.length > 0) {
						let closestDrop = creep.pos.findClosestByPath(powerDrops);
						if (closestDrop) {
							if (creep.pos.isNearTo(closestDrop)) {
								creep.pickup(closestDrop);
							} else {
								creep.travel(closestDrop.pos);
							}
						}
						return;
					}
			
					// If carrying power, return to colony
					if (creep.carry.power > 0) {
						if (creep.room.name !== highwayData.colony) {
							creep.travelToRoom(highwayData.colony, false);
							return;
						} else {
							// In colony, deposit power
							let storage = creep.room.storage;
							if (storage) {
								creep.transfer(storage, RESOURCE_POWER);
							} else {
								// Fallback to spawns
								let spawns = creep.room.find(FIND_MY_SPAWNS);
								if (spawns.length > 0) {
									creep.transfer(spawns[0], RESOURCE_POWER);
								}
							}
							return;
						}
					}
			
					// If no power drops and not carrying power, move toward attackers (but stay 5+ tiles from bank)
					let attackers = creep.pos.findInRange(FIND_MY_CREEPS, 10, {
						filter: c => c.memory.role === "highway_attacker"
					});
					if (attackers.length > 0) {
						let target = attackers[0];
						if (powerBank && creep.pos.getRangeTo(powerBank) < 5) {
							// Already handled above, but just in case
							return;
						}
						creep.travel(target.pos);
					}
					return;
				}
			
				// Fallback for other resource types (shouldn't happen with current setup)
				if (this.moveToDestination(creep))
					return;
			
				creep.memory.task = creep.memory.task || creep.getTask_Wait(10);
				creep.runTask(creep);
			},



			moveToDestination: function (creep) {
				let highwayData = _.get(Memory, ["sites", "highway_mining", creep.memory.highway_id]);
				if (!highwayData) return false;

				// Determine destination based on role
				let destination = null;

				if (creep.memory.role == "highway_attacker" || creep.memory.role == "highway_burrower") {
					// Attackers and burrowers go to the specific target resource
					let resource = Game.getObjectById(highwayData.resource_id);
					if (resource) {
						destination = resource.pos;
					}
				}

				if (destination) {
					return creep.travel(destination) == OK;
				}

				return false;
			}
		};

		HighwayMining.Run(highway_id);
	}

};
