/* ***********************************************************
 *	[sec07a] DEFINITIONS: CONSOLE COMMANDS
 * *********************************************************** */

 global.Console = {
	Init: function () {
		let help_main = new Array();
		let help_ai = new Array();
		let help_allies = new Array();
		let help_blueprint = new Array();
		let help_empire = new Array();
		let help_factories = new Array();
		let help_global_creeps = new Array();
		let help_labs = new Array();
		let help_log = new Array();
		let help_path = new Array();
		let help_pause = new Array();
		let help_pixels = new Array();
		let help_profiler = new Array();
		let help_resources = new Array();
		let help_visuals = new Array();
		let help_shards = new Array();
		let help_scouts = new Array();



		/* Main help() list */
		help_main.push("List of help() arguments, e.g. help(blueprint):");
		help_main.push(`- "allies" \t Manage ally list`);
		help_main.push(`- "ai" \t AI commander controls and diagnostics`);
		help_main.push(`- "blueprint" \t Settings for automatic base building`);
		help_main.push(`- "empire" \t Miscellaneous empire and colony management`);
		help_main.push(`- "factories" \t Management of factory commodity production`);
		help_main.push(`- "global_creeps" \t Cross-shard creep management (workers, miners, scouts)`);
		help_main.push(`- "labs" \t Management of lab functions/reactions`);
		help_main.push(`- "log" \t Logs for statistical output`);
		help_main.push(`- "path" \t Utilities for enhancing creep pathfinding abilities`);
		help_main.push(`- "pause" \t Utilities for pausing specific creep or colony functions`);
		help_main.push(`- "pixels" \t Pixel generation management and statistics`);
		help_main.push(`- "profiler" \t Built-in CPU profiler`);
		help_main.push(`- "resources" \t Management of resources, empire-wide sharing and/or selling to market`);
		help_main.push(`- "scouts" \t Scout mission status and diagnostics`);
		help_main.push(`- "shards" \t Inter-shard coordination and diagnostics`);
		help_main.push(`- "visuals" \t Manage visual objects (RoomVisual class)`);
		help_main.push("");


		help_profiler.push("profiler.run(cycles)");
		help_profiler.push("profiler.stop()");
		help_profiler.push("profiler.analyze()");



		global.ai = new Object();

		help_ai.push("ai.status() - Show AI commander state, order counts, and policy");
		ai.status = function () {
			return AIInterface.consoleStatus();
		};

		help_ai.push("ai.pause() - Pause acceptance and execution of AI orders");
		ai.pause = function () {
			AIInterface.initMemory();
			_.set(Memory, ["ai", "paused"], true);
			return `[AI] Commander paused by human operator.`;
		};

		help_ai.push("ai.resume() - Resume AI order handling");
		ai.resume = function () {
			AIInterface.initMemory();
			_.set(Memory, ["ai", "paused"], false);
			return `[AI] Commander resumed by human operator.`;
		};

		help_ai.push("ai.enable() - Enable the AI commander interface");
		ai.enable = function () {
			AIInterface.initMemory();
			_.set(Memory, ["ai", "enabled"], true);
			return `[AI] Commander enabled in ${_.get(Memory, ["ai", "mode"])} mode.`;
		};

		help_ai.push("ai.disable() - Disable AI order acceptance");
		ai.disable = function () {
			AIInterface.initMemory();
			_.set(Memory, ["ai", "enabled"], false);
			return `[AI] Commander disabled by human operator.`;
		};

		help_ai.push('ai.mode("observe"|"execute") - Set safe observation or execution mode');
		ai.mode = function (mode) {
			AIInterface.initMemory();
			if (mode !== "observe" && mode !== "execute")
				return `[AI] Error: mode must be "observe" or "execute".`;
			AIInterface.setAuthorityValue("mode", mode, "HUMAN_CONSOLE", "HUMAN", "ai.mode console command");
			return `[AI] Commander mode set to ${mode}.`;
		};

		help_ai.push("ai.orders() - Show pending, active, completed, and rejected orders");
		ai.orders = function () {
			return AIInterface.consoleOrders();
		};

		help_ai.push("ai.explain() - Show the latest user-visible strategic explanation");
		ai.explain = function () {
			return AIInterface.consoleExplain();
		};

		help_ai.push("ai.scouting(true|false) - Allow or deny AI scout mission execution");
		ai.scouting = function (allowed) {
			AIInterface.initMemory();
			if (!_.isBoolean(allowed))
				return `[AI] Error: scouting policy must be true or false.`;
			AIInterface.setAuthorityValue("allowScouting", allowed, "HUMAN_CONSOLE", "HUMAN", "ai.scouting console command");
			return `[AI] Scouting policy ${allowed ? "enabled" : "disabled"} by human operator.`;
		};

		help_ai.push("ai.autoScouting(true|false) - Allow or deny strategist-created scout missions");
		ai.autoScouting = function (allowed) {
			AIInterface.initMemory();
			if (!_.isBoolean(allowed))
				return `[AI] Error: automatic scouting policy must be true or false.`;
			AIInterface.setAuthorityValue("autoScouting", allowed, "HUMAN_CONSOLE", "HUMAN", "ai.autoScouting console command");
			return `[AI] Automatic scouting ${allowed ? "enabled" : "disabled"} by human operator.`;
		};

		help_ai.push("ai.remoteOps(true|false) - Allow or deny maintenance of existing remotes");
		ai.remoteOps = function (allowed) {
			AIInterface.initMemory();
			if (allowed === undefined)
				return AIInterface.consoleRemoteOps();
			if (!_.isBoolean(allowed))
				return `[AI] Error: remote maintenance policy must be true or false.`;
			AIInterface.setAuthorityValue("allowRemoteMaintenance", allowed, "HUMAN_CONSOLE", "HUMAN", "ai.remoteOps console command");
			return `[AI] Existing remote maintenance ${allowed ? "enabled" : "disabled"} by human operator.`;
		};

		help_ai.push("ai.autoRemoteOps(true|false) - Allow or deny strategist-created remote maintenance");
		ai.autoRemoteOps = function (allowed) {
			AIInterface.initMemory();
			if (!_.isBoolean(allowed))
				return `[AI] Error: automatic remote maintenance policy must be true or false.`;
			AIInterface.setAuthorityValue("autoRemoteMaintenance", allowed, "HUMAN_CONSOLE", "HUMAN", "ai.autoRemoteOps console command");
			return `[AI] Automatic existing-remote maintenance ${allowed ? "enabled" : "disabled"} by human operator.`;
		};

		help_ai.push("ai.authority() - Show the complete AI authority matrix");
		ai.authority = function () { return AIInterface.consoleAuthority(); };

		help_ai.push('ai.newRemotes(true|false) - Allow or deny new remote establishment');
		ai.newRemotes = function (allowed) {
			if (!_.isBoolean(allowed)) return "[AI] Error: new remote policy must be true or false.";
			AIInterface.setAuthorityValue("allowNewRemotes", allowed, "HUMAN_CONSOLE", "HUMAN", "ai.newRemotes console command");
			if (!allowed) AIInterface.setAuthorityValue("autoNewRemotes", false, "HUMAN_CONSOLE", "HUMAN", "ai.newRemotes disabled");
			return `[AI] New remote establishment ${allowed ? "enabled" : "disabled"} by human operator.`;
		};

		help_ai.push('ai.autoNewRemotes(true|false) - Allow one-at-a-time strategist remote expansion');
		ai.autoNewRemotes = function (allowed) {
			if (!_.isBoolean(allowed)) return "[AI] Error: automatic new remote policy must be true or false.";
			AIInterface.setAuthorityValue("allowNewRemotes", allowed, "HUMAN_CONSOLE", "HUMAN", "ai.autoNewRemotes console command");
			AIInterface.setAuthorityValue("autoNewRemotes", allowed, "HUMAN_CONSOLE", "HUMAN", "ai.autoNewRemotes console command");
			return `[AI] Automatic new remote establishment ${allowed ? "enabled" : "disabled"} by human operator.`;
		};

		help_ai.push('ai.remoteAbandonment(true|false) - Allow or deny guarded remote abandonment');
		ai.remoteAbandonment = function (allowed) {
			if (!_.isBoolean(allowed)) return "[AI] Error: remote abandonment policy must be true or false.";
			AIInterface.setAuthorityValue("allowRemoteAbandonment", allowed, "HUMAN_CONSOLE", "HUMAN", "ai.remoteAbandonment console command");
			if (!allowed) AIInterface.setAuthorityValue("autoRemoteAbandonment", false, "HUMAN_CONSOLE", "HUMAN", "ai.remoteAbandonment disabled");
			return `[AI] Guarded remote abandonment ${allowed ? "enabled" : "disabled"} by human operator.`;
		};

		help_ai.push('ai.autoRemoteAbandonment(true|false) - Allow sustained stop-loss evidence to archive one remote at a time');
		ai.autoRemoteAbandonment = function (allowed) {
			if (!_.isBoolean(allowed)) return "[AI] Error: automatic remote abandonment policy must be true or false.";
			AIInterface.setAuthorityValue("allowRemoteAbandonment", allowed, "HUMAN_CONSOLE", "HUMAN", "ai.autoRemoteAbandonment console command");
			AIInterface.setAuthorityValue("autoRemoteAbandonment", allowed, "HUMAN_CONSOLE", "HUMAN", "ai.autoRemoteAbandonment console command");
			return `[AI] Automatic guarded remote abandonment ${allowed ? "enabled" : "disabled"} by human operator.`;
		};

		help_ai.push('ai.abandonedRemotes() - Show archived remote configurations available for recovery');
		ai.abandonedRemotes = function () {
			AIInterface.initMemory();
			return JSON.stringify(_.get(Memory, ["ai", "abandonedRemotes"], {}), null, 2);
		};

		help_ai.push('ai.colonization(true|false) - Allow or deny guarded manual colonization');
		ai.colonization = function (allowed) {
			if (!_.isBoolean(allowed)) return "[AI] Error: colonization policy must be true or false.";
			AIInterface.setAuthorityValue("allowColonization", allowed, "HUMAN_CONSOLE", "HUMAN", "ai.colonization console command");
			AIInterface.setAuthorityValue("autoColonization", false, "HUMAN_CONSOLE", "HUMAN", "manual colonization never enables autonomy");
			return `[AI] Colonization ${allowed ? "enabled" : "disabled"} by human operator.`;
		};

		help_ai.push('ai.autoColonization(true|false) - Allow one-at-a-time automatic permanent colonization');
		ai.autoColonization = function (allowed) {
			if (!_.isBoolean(allowed)) return "[AI] Error: automatic colonization policy must be true or false.";
			AIInterface.setAuthorityValue("allowColonization", allowed, "HUMAN_CONSOLE", "HUMAN", "ai.autoColonization console command");
			AIInterface.setAuthorityValue("autoColonization", allowed, "HUMAN_CONSOLE", "HUMAN", "ai.autoColonization console command");
			return `[AI] Automatic permanent colonization ${allowed ? "enabled" : "disabled"} by human operator.`;
		};

		help_ai.push('ai.roomPolicy("W1N2", "PRIORITIZE"|"EXCLUDE"|"NO_REMOTE"|"NO_COLONY"|"NONE")');
		ai.roomPolicy = function (room, policy) { return AIInterface.consoleRoomPolicy(room, policy); };

		help_ai.push('ai.playerRelation("username", "ALLY"|"NEUTRAL"|"SUSPICIOUS"|"HOSTILE"|"WAR"|"AUTO")');
		ai.playerRelation = function (username, relation) {
			if (!_.isString(username) || username.length < 1 || username.length > 50)
				return "[AI] Error: username must be 1-50 characters.";
			let allowed = ["ALLY", "NEUTRAL", "SUSPICIOUS", "HOSTILE", "WAR", "AUTO"];
			if (!_.includes(allowed, relation)) return `[AI] Error: relationship must be ${allowed.join(", ")}.`;
			if (relation === "AUTO") delete Memory.ai.intelligence.relationshipOverrides[username];
			else _.set(Memory, ["ai", "intelligence", "relationshipOverrides", username], relation);
			return `[AI] ${username} relationship ${relation === "AUTO" ? "returned to derived classification" : `set to ${relation}`}.`;
		};

		help_ai.push("ai.operations() - Show active strategic orders and objectives");
		ai.operations = function () { return AIInterface.consoleOperations(); };



		help_allies.push("allies.add(ally)");

		allies = new Object();
		allies.add = function (ally) {
			if (_.get(Memory, ["hive", "allies"]) == null) _.set(Memory["hive", "allies"], []);
			Memory["hive"]["allies"].push(ally);
			return `[Console] Player ${ally} added to ally list.`
		};

		help_allies.push("allies.add_list([ally1, ally2, ...])");

		allies.add_list = function (allyList) {
			Array.prototype.push.apply(Memory["hive"]["allies"], allyList);
			return `[Console] Players added to ally list.`
		};

		help_allies.push("allies.remove(ally)");

		allies.remove = function (ally) {
			let index = _.get(Memory, ["hive", "allies"]).indexOf(ally);
			if (index >= 0) {
				Memory["hive"]["allies"].splice(index, 1);
				return `[Console] Player ${ally} removed from ally list.`
			} else {
				return `[Console] Error: Player ${ally} not found in ally list.`
			}
		};

		help_allies.push("allies.clear()");
		allies.clear = function () {
			_.set(Memory, ["hive", "allies"], []);
			return `[Console] Ally list cleared.`
		};


		blueprint = new Object();
		help_blueprint.push("blueprint.set_layout(rmName, originX, originY, layoutName)");

		blueprint.set_layout = function (rmName, originX, originY, layoutName) {
			_.set(Memory, ["rooms", rmName, "layout"], { origin: { x: originX, y: originY }, name: layoutName });
			return `[Console] Blueprint layout set for ${rmName}.`;
		};

		help_blueprint.push("blueprint.block(rmName, x, y)");

		blueprint.block = function (rmName, x, y) {
			if (_.get(Memory, ["rooms", rmName, "layout", "blocked_areas"]) == null)
				Memory["rooms"][rmName]["layout"]["blocked_areas"] = [];
			Memory["rooms"][rmName]["layout"]["blocked_areas"].push({ start: { x: x, y: y }, end: { x: x, y: y } });
			return `[Console] Blueprint position blocked for ${rmName} at (${x}, ${y}).`;
		};

		help_blueprint.push("blueprint.block_area(rmName, startX, startY, endX, endY)");

		blueprint.block_area = function (rmName, startX, startY, endX, endY) {
			if (endX == null)
				endX = startX;
			if (endY == null)
				endY = startY;

			if (_.get(Memory, ["rooms", rmName, "layout", "blocked_areas"]) == null)
				Memory["rooms"][rmName]["layout"]["blocked_areas"] = [];
			Memory["rooms"][rmName]["layout"]["blocked_areas"].push({ start: { x: startX, y: startY }, end: { x: endX, y: endY } });
			return `[Console] Blueprint area blocked for ${rmName} from (${startX}, ${startY}) to (${endX}, ${endY}).`;
		};

		help_blueprint.push("blueprint.request(rmName)");

		blueprint.request = function (rmName) {
			_.set(Memory, ["hive", "pulses", "blueprint", "request"], rmName);
			return `[Console] Setting Blueprint() request for ${rmName}; Blueprint() will run this request next tick.`;
		};

	help_blueprint.push("blueprint.reset()");
	blueprint.reset = function () {
		if (_.get(Memory, ["shard", "pulses", "blueprint"], null) != null)
			delete Memory.shard.pulses.blueprint;				
		return `[Console] Resetting Blueprint() cycles; Blueprint() will initiate next tick.`;
	};

		help_blueprint.push("blueprint.redefine_links()");
		blueprint.redefine_links = function () {
			_.each(_.filter(Game.rooms, r => { return (r.controller != null && r.controller.my); }), r => {
				if (_.has(Memory, ["rooms", r.name, "links"]))
					delete Memory["rooms"][r.name]["links"];
			});

			_.set(Memory, ["hive", "pulses", "reset_links"], true);
			return `[Console] Resetting all link definitions; will redefine next tick.`;
		};

		help_blueprint.push("blueprint.toggle_walls(rmName)");

		blueprint.toggle_walls = function (rmName) {
			// For manual disabling of whether passive defensive will be placed (useful in order to prioritize RCL)
			if (_.get(Memory, ["rooms", rmName, "layout", "place_defenses"], false) == true)
				_.set(Memory, ["rooms", rmName, "layout", "place_defenses"], false)
			else
				_.set(Memory, ["rooms", rmName, "layout", "place_defenses"], true)

			return `[Console] Blueprint placing defensive walls and ramparts: ${_.get(Memory, ["rooms", rmName, "layout", "place_defenses"], true)}`;
		};

		help_blueprint.push("blueprint.diagnose(roomName)");

		blueprint.diagnose = function (roomName) {
			let room = Game.rooms[roomName];
			if (!room || !room.controller || !room.controller.my) {
				return `[Console] Room ${roomName} not found or not owned.`;
			}

			let hasLayout = _.get(Memory, ["rooms", roomName, "layout"]) != null;
			let hasOrigin = _.get(Memory, ["rooms", roomName, "layout", "origin"]) != null;
			let layoutName = _.get(Memory, ["rooms", roomName, "layout", "name"]);
			let origin = _.get(Memory, ["rooms", roomName, "layout", "origin"]);
			let hasColonizationSite = _.get(Memory, ["sites", "colonization", roomName]) != null;
			let colonizationLayout = _.get(Memory, ["sites", "colonization", roomName, "layout"]);
			let spawns = room.find(FIND_MY_SPAWNS);
			let constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES).length;
			let sitesPerRoom = room.controller.level <= 4 ? 15 : 10;

			let output = [];
			output.push(`[Blueprint] Diagnostics for ${roomName}:`);
			output.push(`  Controller Level: ${room.controller.level}`);
			output.push(`  Has Layout: ${hasLayout}`);
			output.push(`  Has Origin: ${hasOrigin}`);
			output.push(`  Layout Name: ${layoutName || "N/A"}`);
			output.push(`  Origin: ${origin ? `(${origin.x}, ${origin.y})` : "N/A"}`);
			output.push(`  Construction Sites: ${constructionSites}/${sitesPerRoom}`);
			output.push(`  Spawns: ${spawns.length}`);
			
			if (spawns.length > 0) {
				let topLeftSpawn = _.head(_.sortBy(spawns, s => s.pos.y * 50 + s.pos.x));
				output.push(`  Top-left spawn: (${topLeftSpawn.pos.x}, ${topLeftSpawn.pos.y})`);
			}

			if (hasColonizationSite) {
				output.push(`  Colonization Site: Found (layout may be recoverable)`);
				if (colonizationLayout) {
					let originX = (colonizationLayout.origin && colonizationLayout.origin.x) ? colonizationLayout.origin.x : "?";
					let originY = (colonizationLayout.origin && colonizationLayout.origin.y) ? colonizationLayout.origin.y : "?";
					output.push(`  Colonization Layout: ${colonizationLayout.name || "N/A"} at (${originX}, ${originY})`);
				}
			}

			if (!hasOrigin) {
				output.push(`[Blueprint] ISSUE: No layout origin set!`);
				if (hasColonizationSite && colonizationLayout) {
					output.push(`  Solution: Run blueprint.recover_layout("${roomName}") to recover from colonization site`);
				} else if (spawns.length > 0) {
					let topLeftSpawn = _.head(_.sortBy(spawns, s => s.pos.y * 50 + s.pos.x));
					output.push(`  Solution: Run blueprint.set_layout("${roomName}", ${topLeftSpawn.pos.x}, ${topLeftSpawn.pos.y}, "def_hor")`);
				} else {
					output.push(`  Solution: Set layout manually with blueprint.set_layout("${roomName}", x, y, "def_hor")`);
				}
			} else if (constructionSites >= sitesPerRoom) {
				output.push(`  Status: At construction site limit (${sitesPerRoom})`);
			} else {
				output.push(`  Status: Blueprint should be running`);
			}

			return output.join("\n");
		};

		help_blueprint.push("blueprint.recover_layout(roomName)");

		blueprint.recover_layout = function (roomName) {
			let room = Game.rooms[roomName];
			if (!room || !room.controller || !room.controller.my) {
				return `[Console] Room ${roomName} not found or not owned.`;
			}

			let colonizationSite = _.get(Memory, ["sites", "colonization", roomName]);
			if (!colonizationSite || !colonizationSite.layout) {
				return `[Console] No colonization site found for ${roomName} with layout data.`;
			}

			let layout = colonizationSite.layout;
			_.set(Memory, ["rooms", roomName, "layout"], layout);
			_.set(Memory, ["hive", "pulses", "blueprint", "request"], roomName);
			
			return `[Console] Recovered layout for ${roomName}: ${layout.name} at (${layout.origin.x}, ${layout.origin.y}). Blueprint requested for next tick.`;
		};


		factories = new Object();
		help_factories.push("factories.set_production(commodity, amount, priority)");
		help_factories.push(" - Sets a factory production target for a specific commodity");
		help_factories.push(" - commodity: the resource to produce (battery, wire, etc.)");
		help_factories.push(" - amount: target amount to produce, priority: task priority (default 50)");
		help_factories.push(" - Example: factories.set_production('battery', 1000, 30)");

		factories.set_production = function (commodity, amount, priority) {
			if (_.get(Memory, ["resources", "factories", "targets"]) == null) {
				_.set(Memory, ["resources", "factories", "targets"], new Object());
			}
			_.set(Memory, ["resources", "factories", "targets", commodity], { 
				commodity: commodity, 
				amount: amount, 
				priority: priority || 50 
			});
			return `[Console] ${commodity} production target set to ${amount} (priority ${priority || 50}).`;
		};

		help_factories.push("factories.clear_production(commodity)");
		help_factories.push(" - Clears the production target for a specific commodity");
		help_factories.push(" - commodity: the resource to stop producing");
		help_factories.push(" - Example: factories.clear_production('battery')");

		factories.clear_production = function (commodity) {
			if (_.get(Memory, ["resources", "factories", "targets", commodity]) != null) {
				delete Memory["resources"]["factories"]["targets"][commodity];
				return `[Console] ${commodity} production target cleared.`;
			}
			return `[Console] No production target found for ${commodity}.`;
		};

		help_factories.push("factories.clear_all()");
		help_factories.push(" - Clears all factory production targets");
		help_factories.push(" - Stops all commodity production in all factories");

		factories.clear_all = function () {
			_.set(Memory, ["resources", "factories", "targets"], new Object());
			return `[Console] All factory production targets cleared.`;
		};

		help_factories.push("factories.status()");
		help_factories.push(" - Shows detailed factory status and production progress");
		help_factories.push(" - Displays production targets, factory assignments, and industry tasks");

		help_factories.push("factories.renew_assignments()");
		help_factories.push(" - Forces renewal of factory assignments based on current priorities");
		help_factories.push(" - Useful when factory assignments become stale or incorrect");

		help_factories.push("factories.clear_assignments()");
		help_factories.push(" - Clears all factory assignments");
		help_factories.push(" - Factories will be reassigned during the next factory pulse");

		factories.status = function () {
			let targets = _.get(Memory, ["resources", "factories", "targets"]);
			let assignments = _.get(Memory, ["resources", "factories", "assignments"]);
			
			// CSS styles for better table formatting
			let tableStyle = "style=\"border-collapse: collapse; border: 1px solid #666; margin: 5px 0;\"";
			let cellStyle = "style=\"border: 1px solid #666; padding: 8px 12px; text-align: left;\"";
			let headerStyle = "style=\"border: 1px solid #666; padding: 8px 12px; text-align: left; background-color: #444; color: #D3FFA3; font-weight: bold;\"";
			
			// Production Targets Table
			console.log(`[Factory] Factory Production Targets:`);
			if (targets == null || Object.keys(targets).length == 0) {
				console.log(`[Factory] No production targets set.`);
			} else {
				let targetTable = `	Commodity		Current		Target		Progress		Priority	`;
				_.each(targets, (target, commodity) => {
					let current = 0;
					_.each(_.filter(Game.rooms, r => { return r.controller != null && r.controller.my; }), room => {
						// Count in storage
						current += room.store(commodity);
						
						// Count in factories
						let factories = _.filter(room.find(FIND_MY_STRUCTURES), s => s.structureType == "factory");
						_.each(factories, factory => {
							if (factory.store[commodity]) {
								current += factory.store[commodity];
							}
						});
					});
					let progress = Math.min(100, Math.round((current / target.amount) * 100));
					let progressBar = "|".repeat(Math.floor(progress/10)) + "-".repeat(10 - Math.floor(progress/10));
					targetTable += `	${commodity}		${current}		${target.amount}		${progressBar} ${progress}%		${target.priority}	`;
				});
				targetTable += "";
				console.log(targetTable);
			}

			// Factory Assignments and Status Table
			console.log(`[Factory] Factory Status:`);
			let factoryTable = `	Room		Assignment		Cooldown		Store		Status	`;
			let totalFactories = 0;
			let assignedFactories = 0;
			let activeFactories = 0;

			_.each(_.filter(Game.rooms, r => { return r.controller != null && r.controller.my; }), room => {
				let factories = _.filter(room.find(FIND_MY_STRUCTURES), s => s.structureType == "factory");
				if (factories.length > 0) {
					totalFactories += factories.length;
					_.each(factories, factory => {
						let assignment = assignments ? assignments[factory.id] : null;
						let assignmentText = assignment ? `${assignment.commodity}` : "None";
						let cooldownText = factory.cooldown > 0 ? `${factory.cooldown}` : "Ready";
						
						// Count store contents (excluding energy)
						let storeContents = [];
						for (let resource in factory.store) {
							if (resource != "energy" && factory.store[resource] > 0) {
								storeContents.push(`${resource}:${factory.store[resource]}`);
							}
						}
						let storeText = storeContents.length > 0 ? storeContents.join(", ") : "Empty";
						
						// Determine status
						let status = "Idle";
						if (factory.cooldown > 0) {
							status = "Cooldown";
						} else if (assignment) {
							assignedFactories++;
							if (storeContents.length > 0) {
								status = "Has Output";
								activeFactories++;
							} else {
								status = "Ready";
								activeFactories++;
							}
						}
						
						factoryTable += `	${room.name}		${assignmentText}		${cooldownText}		${storeText}		${status}	`;
					});
				}
			});
			factoryTable += "";
			console.log(factoryTable);

			// Summary
			console.log(`[Factory] Summary: ${totalFactories} total factories, ${assignedFactories} assigned, ${activeFactories} active`);

			// Industry Tasks Summary (condensed)
			let totalTasks = 0;
			let priority2Tasks = 0;
			let priority3Tasks = 0;
			let priority5Tasks = 0;
			
			_.each(_.filter(Game.rooms, r => { return r.controller != null && r.controller.my; }), room => {
				let tasks = _.get(Memory, ["rooms", room.name, "industry", "tasks"]);
				if (tasks && tasks.length > 0) {
					totalTasks += tasks.length;
					_.each(tasks, task => {
						if (task.priority == 2) priority2Tasks++;
						else if (task.priority == 3) priority3Tasks++;
						else if (task.priority == 5) priority5Tasks++;
					});
				}
			});
			
			if (totalTasks > 0) {
				console.log(`[Factory] Industry Tasks: ${totalTasks} total (P2: ${priority2Tasks}, P3: ${priority3Tasks}, P5: ${priority5Tasks})`);
			}

			// CPU Usage Information
			let cpuUsed = Game.cpu.getUsed();
			let cpuBucket = Game.cpu.bucket;
			console.log(`[Factory] CPU Status: Used: ${cpuUsed.toFixed(2)}, Bucket: ${cpuBucket.toFixed(0)}`);

			return `[Factory] Factory status displayed.`;
		};

		factories.renew_assignments = function (announce = true) {
			if (announce) {
				console.log(`[Factory] Renewing factory assignments...`);
			}
			// Safely clear existing assignments to force fresh assignment
			if (Memory["resources"] && Memory["resources"]["factories"]) {
				delete Memory["resources"]["factories"]["assignments"];
			}
			// Trigger factory pulse to reassign factories based on priority (lab style)
			if (Memory["hive"] && Memory["hive"]["pulses"]) {
				delete Memory["hive"]["pulses"]["factory"];
			}
			return `[Factory] Factory assignments will be renewed next tick based on current priorities.`;
		};

		factories.clear_assignments = function () {
			if (Memory["resources"] && Memory["resources"]["factories"]) {
				delete Memory["resources"]["factories"]["assignments"];
				return `[Factory] Factory assignments cleared.`;
			} else {
				return `[Factory] No factory assignments to clear.`;
			}
		};

		// Internal maintenance function (not exposed in help)
		factories.maintenance = function (announce = true) {
			// Initialize factory maintenance memory if needed
			if (!Memory.factories) {
				Memory.factories = {
					lastCleanup: 0,
					cleanupInterval: 50, // Run cleanup every 50 ticks
					lastAssignmentCheck: 0,
					assignmentCheckInterval: 200 // Check assignments every 200 ticks
				};
			}
			
			let currentTick = Game.time;
			let maintenanceActions = [];
			
			// Check if it's time for cleanup
			if (currentTick - Memory.factories.lastCleanup >= Memory.factories.cleanupInterval) {
				if (announce) {
					console.log(`[Factory] Running scheduled factory cleanup...`);
				}
				this.cleanup(1, announce); // High priority cleanup
				Memory.factories.lastCleanup = currentTick;
				maintenanceActions.push("cleanup");
			}
			
			// Check if it's time for assignment renewal
			if (currentTick - Memory.factories.lastAssignmentCheck >= Memory.factories.assignmentCheckInterval) {
				if (announce) {
					console.log(`[Factory] Running scheduled assignment check...`);
				}
				this.renew_assignments(announce);
				Memory.factories.lastAssignmentCheck = currentTick;
				maintenanceActions.push("assignment renewal");
			}
			
			if (maintenanceActions.length > 0) {
				return `[Factory] Factory maintenance completed: ${maintenanceActions.join(', ')}`;
			} else {
				return `[Factory] No maintenance actions needed at tick ${currentTick}`;
			}
		};

		// Internal cleanup function (not exposed in help)
		factories.cleanup = function (priority = 1, announce = true) {
			let totalCleanupTasks = 0;
			let roomsProcessed = 0;
			let cleanupData = [];
			
			_.each(_.filter(Game.rooms, r => { return r.controller != null && r.controller.my; }), room => {
				let factories = _.filter(room.find(FIND_MY_STRUCTURES), s => s.structureType == "factory");
				if (factories.length > 0) {
					roomsProcessed++;
					
					// Create cleanup tasks for this room
					let Industry = {
						createFactoryCleanupTasks: function (rmColony) {
							let factories = _.filter(Game.rooms[rmColony].find(FIND_MY_STRUCTURES), 
								s => s.structureType == "factory");
							
							if (factories.length == 0) {
								return;
							}

							let storage = Game.rooms[rmColony].storage;
							if (storage == null) {
								cleanupData.push({
									room: rmColony,
									status: "No Storage",
									details: "Cannot clean factories without storage"
								});
								return;
							}

							// If priority is 1 (high), we'll override loading tasks
							if (priority === 1) {
								// Clear existing priority 2 tasks to make room for cleanup
								if (Memory.rooms[rmColony] && Memory.rooms[rmColony].industry && Memory.rooms[rmColony].industry.tasks) {
									let loadingTasks = _.filter(Memory.rooms[rmColony].industry.tasks, t => t.priority == 2);
									if (loadingTasks.length > 0) {
										Memory.rooms[rmColony].industry.tasks = _.filter(Memory.rooms[rmColony].industry.tasks, t => t.priority != 2);
									}
								}
							} else {
								// Check for active loading tasks (priority 2) - only block if not high priority
								let activeLoadingTasks = [];
								if (Memory.rooms[rmColony] && Memory.rooms[rmColony].industry && Memory.rooms[rmColony].industry.tasks) {
									activeLoadingTasks = _.filter(Memory.rooms[rmColony].industry.tasks, t => t.priority == 2);
								}
								
								if (activeLoadingTasks.length > 0) {
									cleanupData.push({
										room: rmColony,
										status: "Skipped",
										details: `${activeLoadingTasks.length} active loading tasks`
									});
									return;
								}
							}

							let roomCleanupTasks = 0;
							let factoryDetails = [];
							
							for (let factory of factories) {
								let assignment = _.get(Memory, ["resources", "factories", "assignments", factory.id]);
								let factoryCleanupTasks = 0;
								let factoryActions = [];
								
								// If factory has no assignment, clean everything except energy
								if (assignment == null) {
									for (let resource in factory.store) {
										if (resource != "energy" && factory.store[resource] > 0) {
											Memory.rooms[rmColony].industry.tasks.push(
												{ type: "withdraw", resource: resource, id: factory.id, timer: 60, priority: 1 }
											);
											factoryCleanupTasks += 1;
											factoryActions.push(`Clean ${resource}:${factory.store[resource]}`);
										}
									}
								} else {
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
											factoryCleanupTasks += 1;
											factoryActions.push(`Remove ${resource}:${factory.store[resource]}`);
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
													factoryCleanupTasks += 1;
													factoryActions.push(`Reduce ${resource}: ${excess} excess`);
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
													factoryCleanupTasks += 1;
													factoryActions.push(`Reduce ${resource}: ${excess} excess`);
												}
											}
										}
									}
								}
								
								if (factoryCleanupTasks > 0) {
									factoryDetails.push({
										factory: factory.id,
										assignment: assignment ? assignment.commodity : "None",
										actions: factoryActions.join(", "),
										tasks: factoryCleanupTasks
									});
									roomCleanupTasks += factoryCleanupTasks;
								}
							}
							
							if (roomCleanupTasks > 0) {
								cleanupData.push({
									room: rmColony,
									status: "✓ Cleaned",
									details: `${roomCleanupTasks} tasks created`,
									factories: factoryDetails
								});
								totalCleanupTasks += roomCleanupTasks;
							} else {
								cleanupData.push({
									room: rmColony,
									status: "No Action",
									details: "No cleanup needed"
								});
							}
						}
					};
					
					Industry.createFactoryCleanupTasks(room.name);
				}
			});
			
			// Display consolidated cleanup table
			if (announce && cleanupData.length > 0) {
				let tableStyle = "style=\"border-collapse: collapse; border: 1px solid #666; margin: 5px 0;\"";
				let cellStyle = "style=\"border: 1px solid #666; padding: 6px 8px; text-align: left; font-size: 12px;\"";
				let headerStyle = "style=\"border: 1px solid #666; padding: 8px 12px; text-align: left; background-color: #FFA500; color: white; font-weight: bold;\"";
				
				let cleanupTable = ``;
				cleanupTable += `	Room		Status		Details	`;
				cleanupTable += `	${cleanupData[0].room}		${cleanupData[0].status}		${cleanupData[0].details}	`;
				
				// Add factory details if available
				if (cleanupData[0].factories && cleanupData[0].factories.length > 0) {
					_.each(cleanupData[0].factories, factory => {
						cleanupTable += `	└─ ${factory.factory}		${factory.assignment}		${factory.actions}	`;
					});
				}
				
				cleanupTable += "";
				console.log(`[Factory] Cleanup Summary (Priority ${priority}):\n${cleanupTable}`);
			}
			
			if (roomsProcessed === 0) {
				return `[Factory] No rooms with factories found.`;
			}
			
			return `[Factory] Factory cleanup completed. Created ${totalCleanupTasks} cleanup tasks across ${roomsProcessed} rooms.`;
		};








		log = new Object();

		help_log.push("log.all()");

		log.all = function () {
			this.nukers();
			this.labs();
			this.controllers();
			this.resources();
			return `[Console] Main logs printed.`;
		}

		help_log.push("log.can_build()");

		log.can_build = function () {
			let rooms = _.filter(Game.rooms, n => { return n.controller != null && n.controller.my; });
			console.log("[Console] Buildable structures:");
			for (let r in rooms) {
				room = rooms[r];

				let output = `${room.name}: `;
				for (let s in CONTROLLER_STRUCTURES) {
					if (s == "road" || s == "constructedWall" || s == "rampart")
						continue;

					let amount = CONTROLLER_STRUCTURES[s][room.controller.level]
						- room.find(FIND_STRUCTURES, { filter: t => { return t.structureType == s; } }).length;
					output += amount < 1 ? "" : `${amount} x ${s};  `;
				}
				console.log(output);
			}
			return "[Console] Report generated";
		};

		help_log.push("log.controllers()");

		log.controllers = function () {
			console.log("[Console] Room Controllers:");
			let output = "";
			_.each(_.sortBy(_.sortBy(_.filter(Game.rooms,
				r => { return r.controller != null && r.controller.my; }),
				r => { return -r.controller.progress; }),
				r => { return -r.controller.level; }), r => {
					output += `	${r.name}:  (${r.controller.level})  	 `
						+ `	${r.controller.progress}  		  /  		${r.controller.progressTotal}    	 `
						+ `	(${(r.controller.progress / r.controller.progressTotal * 100).toFixed()} %)	`;
				});
			console.log(`${output}`);
			return "[Console] Report generated";
		};

		help_log.push("log.populations()");

		log.populations = function () {
			console.log("[Console] Populations for Colonies and Mining Sites (default and set_population):");

			let colonies = _.keys(_.filter(Game.rooms, room => { return (room.controller != null && room.controller.my); }));
			let mining = _.keys(_.get(Memory, ["sites", "mining"]));
			let rooms = _.keys(_.get(Memory, "rooms"));
			let output = "";

			for (let i = 0; i < rooms.length; i++) {
				if (_.indexOf(colonies, rooms[i]) >= 0 || _.indexOf(mining, rooms[i]) >= 0) {
					if (_.has(Memory, ["rooms", rooms[i], "set_population"])) {
						output += `	${(rooms[i])}: \t	`;
						let populations = _.keys(Memory["rooms"][rooms[i]]["set_population"]);
						for (let j = 0; j < populations.length; j++) {
							output += `	${populations[j]}: 	 `
							+ `	lvl ${_.get(Memory, ["rooms", rooms[i], "set_population", populations[j], "level"])}	`
							+ `	 x ${_.get(Memory, ["rooms", rooms[i], "set_population", populations[j], "amount"])} \t	  `;
						}
						output += ``;
					} else {
						output += `	${(rooms[i])}: \t	`
							+`	default	`;
					}
				}
			}
			console.log(`${output}`);
			return "[Console] Report generated";
		}

		help_log.push("log.labs()");

		log.labs = function () {
			let output = "[Console] Lab Report\n"
				+ "	Room \t		Mineral \t		Amount \t		Target Amount \t		Reagent #1 \t		Reagent #2	";

			_.each(_.keys(_.get(Memory, ["resources", "labs", "reactions"])), r => {
				let rxn = Memory["resources"]["labs"]["reactions"][r];

				let amount = 0;
				_.each(_.filter(Game.rooms,
					r => { return r.controller != null && r.controller.my && (r.storage || r.terminal); }),
					r => { amount += r.store(_.get(rxn, "mineral")); });

				let reagents = "";
				_.each(getReagents(_.get(rxn, "mineral")),
					reagent => {

						let r_amount = 0;
						_.each(_.filter(Game.rooms,
							r => { return r.controller != null && r.controller.my && (r.storage || r.terminal); }),
							r => { r_amount += r.store(reagent); });
						reagents += `	${reagent}: \t${r_amount}	`;
					});

				output += `	${r}		${_.get(rxn, "mineral")}		${amount}		(${_.get(rxn, "amount")})${reagents}`
			});

			console.log(`${output}`);
			return "[Console] Report generated";
		};

		help_log.push("log.resources()");

		log.resources = function (resource = null, limit = 1) {
			let resource_list = resource != null ? [resource] : RESOURCES_ALL;
			let room_list = _.filter(Game.rooms, r => { return r.controller != null && r.controller.my && (r.storage || r.terminal); });

			let output = `	Resource\t		Total \t\t	`;
			_.each(room_list, r => { output += `	${r.terminal ? "[T]" : "[--]"} ${r.name} \t	`; });

			_.each(resource_list, res => {
				let amount = 0;
				let output_rooms = "";

				_.each(room_list, r => {
					let a = r.store(res);
					amount += a;
					output_rooms += `	${a}	`
				});

				if (amount >= limit)
					output += `	${res}		${amount}	 ${output_rooms} `;
			});

			console.log(`log.resources ${output}`);
			return "[Console] Report generated";
		};

		help_log.push("log.remote_mining()");

		log.remote_mining = function () {
			let output = "";
			let remote = _.get(Memory, ["sites", "mining"]);

			_.each(_.filter(Game.rooms, r => { return r.controller != null && r.controller.my; }), r => {
				output += `	${r.name}		  ->  	`;
				_.each(_.filter(Object.keys(remote), rem => { return rem != r.name && _.get(remote[rem], "colony") == r.name; }), rem => { output += `	  ${rem}  	`; });
				output += ``;
			});

			console.log(`log.mining${output}`);
			return "[Console] Report generated";
		};

		help_log.push("log.spawn_assist()");

		log.spawn_assist = function () {
			console.log("[Console] Active Spawn Assists:");

			let rooms = _.filter(Game.rooms, room => { return (room.controller != null && room.controller.my); });
			let output = "	Colony \t\t		Assisted By:	";
			for (let i = 0; i < rooms.length; i++) {
				let room = rooms[i].name;
				let spawn_rooms = _.get(Memory, ["rooms", room, "spawn_assist", "rooms"], null);
				if (spawn_rooms != null) {
					output += `	${(room)}: \t	`;
					_.each(spawn_rooms, r => { output += `	${r} \t	`; });
					output += ``;
				} else {
					output += `	${(room)}: \t	`
						+`	inactive	`;
				}
			}
			console.log(`${output}`);
			return "[Console] Report generated";
		}

		help_log.push("log.storage()");

		log.storage = function () {
			console.log(`log-storage`);

			for (let i = 0; i < Object.keys(Game.rooms).length; i++) {
				let room = Game.rooms[Object.keys(Game.rooms)[i]];
				if (room.storage != null) {
					if (_.sum(room.storage) == 0) {
						console.log(`${room.name} storage: empty`);
					} else {
						let output = `${room.name} storage (${parseInt(_.sum(room.storage.store) / room.storage.storeCapacity * 100)}%): `;
						for (let res in room.storage.store) {
							if (room.storage.store[res] > 0)
								output += `${res}: ${_.floor(room.storage.store[res] / 1000)}k;  `;
						}
						console.log(output);
					}
				}

				if (room.terminal != null) {
					if (_.sum(room.terminal) == 0) {
						console.log(`${room.name} terminal: empty`);
					} else {
						let output = `${room.name} terminal (${parseInt(_.sum(room.terminal.store) / room.terminal.storeCapacity * 100)}%): `;
						for (let res in room.terminal.store) {
							if (room.terminal.store[res] > 0)
								output += `${res}: ${_.floor(room.terminal.store[res] / 1000)}k;  `;
						}
						console.log(output);
					}
				}
			}
			return "[Console] Report generated";
		};

		help_log.push("log.nukers()");

		log.nukers = function () {
			console.log("[Console] Nukers:");
			_.each(_.filter(Game.rooms, r => { return r.controller != null && r.controller.my; }), r => {
				let nuker = _.head(r.find(FIND_STRUCTURES, { filter: (s) => { return s.structureType == "nuker"; } }));
				if (nuker != null) {
					console.log(`${r.name}: `
						+ `${nuker.cooldown == 0 ? "[OK]" : "[!!]"} cooldown: ${nuker.cooldown};  `
						+ `${nuker.energy == nuker.energyCapacity ? "[OK]" : "[!!]"} energy: ${nuker.energy} (${parseFloat(nuker.energy / nuker.energyCapacity * 100).toFixed(0)}%);  `
						+ `${nuker.ghodium == nuker.ghodiumCapacity ? "[OK]" : "[!!]"} ghodium: ${nuker.ghodium} (${parseFloat(nuker.ghodium / nuker.ghodiumCapacity * 100).toFixed(0)}%)`);  
				}
			});
			return "[Console] Report generated";
		};


		help_labs.push("labs.set_reaction(mineral, amount, priority)");
		help_labs.push(" - Sets a lab reaction target for a specific mineral");
		help_labs.push(" - mineral: the resource to produce (H, O, X, etc.)");
		help_labs.push(" - amount: target amount to produce, priority: task priority");
		help_labs.push(" - Example: labs.set_reaction('H', 1000, 30)");

		labs = new Object();
		labs.set_reaction = function (mineral, amount, priority) {
			_.set(Memory, ["resources", "labs", "targets", mineral], { mineral: mineral, amount: amount, priority: priority });
			return `[Console] ${mineral} reaction target set to ${amount} (priority ${priority}).`;
		};

		help_labs.push("labs.set_boost(labID, mineral, role, destination, ticks)");
		help_labs.push(" - Sets a lab boost operation for creeps");
		help_labs.push(" - labID: the lab structure ID, mineral: boost type (UH, UO, etc.)");
		help_labs.push(" - role: creep role to boost, destination: target room");
		help_labs.push(" - ticks: duration (optional), Example: labs.set_boost('labId', 'UH', 'harvester', 'W1N1', 1500)");

		labs.set_boost = function (labID, mineral, role, destination, ticks) {
			let lab = Game.getObjectById(labID);
			let rmName = lab.pos.roomName;
			let labDefinitions = _.get(Memory, ["rooms", rmName, "labs", "definitions"]);
			if (lab == null) return;

			if (labDefinitions == null)
				labDefinitions = [];

			labDefinitions.push(
				{
					action: "boost", mineral: mineral, lab: labID, role: role, dest: destination,
					expire: (ticks == null ? null : Game.time + ticks)
				});

			_.set(Memory, ["rooms", rmName, "labs", "definitions"], labDefinitions);
			delete Memory["hive"]["pulses"]["lab"];
			return `[Console] Boost added for ${mineral} to ${role} from ${labID}`;
		};

		help_labs.push("labs.clear_reactions()");
		help_labs.push(" - Clears all lab reaction targets");
		help_labs.push(" - Stops all mineral production in all labs");

		labs.clear_reactions = function () {
			_.set(Memory, ["resources", "labs", "targets"], new Object());
			delete Memory["hive"]["pulses"]["lab"];
			return `[Console] All lab mineral targets cleared.`;
		};

		help_labs.push("labs.clear_boosts(rmName)");
		help_labs.push(" - Clears all boost operations for a specific room");
		help_labs.push(" - rmName: room name to clear boosts from");
		help_labs.push(" - Example: labs.clear_boosts('W1N1')");

		labs.clear_boosts = function (rmName) {
			delete Memory["rooms"][rmName]["labs"]["definitions"];
			delete Memory["hive"]["pulses"]["lab"];
			return `[Console] All boosts cleared for ${rmName}`;
		};

		help_labs.push("labs.renew_assignments()");
		help_labs.push(" - Forces renewal of lab assignments and definitions");
		help_labs.push(" - Useful when lab assignments become stale or incorrect");

		labs.renew_assignments = function () {
			delete Memory["hive"]["pulses"]["lab"];
			return `[Console] Labs will renew definitions and reaction assignments next tick.`;
		};

		help_labs.push("labs.clear_assignments()");
		help_labs.push(" - Clears all lab reaction assignments");
		help_labs.push(" - Labs will be reassigned during the next lab pulse");

		labs.clear_assignments = function () {
			delete Memory["resources"]["labs"]["reactions"];
			return `[Console] Lab reaction assignments cleared- will reassign next lab pulse.`;
		};


		help_resources.push("resources.overflow_cap(capAmount)");
		help_resources.push(" - Sets the energy overflow cap for automatic market selling");
		help_resources.push(" - When total colony energy exceeds this amount, excess energy is sold to market");

		resources = new Object();
		resources.overflow_cap = function (amount) {
			_.set(Memory, ["resources", "to_overflow"], amount);
			return `[Console] Energy overflow cap set to ${amount}.`;
		};

		help_resources.push("resources.market_cap(resource, capAmount)");
		help_resources.push(" - Sets market overflow cap for a specific resource");
		help_resources.push(" - When resource amount exceeds this cap, excess is automatically sold to market");
		help_resources.push(" - Example: resources.market_cap('energy', 1000000)");

		resources.market_cap = function (resource, amount) {
			_.set(Memory, ["resources", "to_market", resource], amount);
			return `[Console] ${resource} market overflow set to ${amount}.`;
		};

		help_resources.push("resources.send(orderName, rmFrom, rmTo, resource, amount)");
		help_resources.push(" - Creates a terminal order to send resources between your rooms");
		help_resources.push(" - orderName: unique identifier for the order");
		help_resources.push(" - rmFrom: source room name, rmTo: destination room name");
		help_resources.push(" - resource: resource type (energy, battery, etc.), amount: quantity to transfer");

		resources.send = function (orderName, rmFrom, rmTo, resource, amount) {
			_.set(Memory, ["resources", "terminal_orders", orderName], { room: rmTo, from: rmFrom, resource: resource, amount: amount, priority: 1 });
			return `[Console] Order set at Memory["resources"]["terminal_orders"][${orderName}]; delete from Memory to cancel.`;
		};

		help_resources.push("resources.market_sell(orderName, marketOrderID, rmFrom, amount)");
		help_resources.push(" - Creates a market sell order to fulfill an existing buy order");
		help_resources.push(" - orderName: unique identifier for the order");
		help_resources.push(" - marketOrderID: ID of the buy order you want to fulfill");
		help_resources.push(" - rmFrom: your room that will send the resources, amount: quantity to sell");

		resources.market_sell = function (orderName, marketOrderID, rmFrom, amount) {
			_.set(Memory, ["resources", "terminal_orders", orderName], { market_id: marketOrderID, amount: amount, from: rmFrom, priority: 4 });
			return `[Console] Order set at Memory["resources"]["terminal_orders"][${orderName}]; delete from Memory to cancel.`;
		};

		help_resources.push("resources.market_buy(orderName, marketOrderID, rmTo, amount)");
		help_resources.push(" - Creates a market buy order to fulfill an existing sell order");
		help_resources.push(" - orderName: unique identifier for the order");
		help_resources.push(" - marketOrderID: ID of the sell order you want to fulfill");
		help_resources.push(" - rmTo: your room that will receive the resources, amount: quantity to buy");

		resources.market_buy = function (orderName, marketOrderID, rmTo, amount) {
			_.set(Memory, ["resources", "terminal_orders", orderName], { market_id: marketOrderID, amount: amount, to: rmTo, priority: 4 });
			return `[Console] Order set at Memory["resources", "terminal_orders"][${orderName}]; delete from Memory to cancel.`;
		};

		help_resources.push("resources.clear_market_cap()");
		help_resources.push(" - Clears all market overflow caps for all resources");
		help_resources.push(" - Stops automatic market selling of excess resources");

		resources.clear_market_cap = function () {
			_.set(Memory, ["resources", "to_market"], new Object());
			return `[Console] Market overflow limits deleted; existing transactions can be deleted with resources.clear_transactions().`;
		};

		help_resources.push("resources.clear_transactions()");
		help_resources.push(" - Clears all active terminal orders and market transactions");
		help_resources.push(" - Cancels all pending resource transfers and market orders");

		resources.clear_transactions = function () {
			_.set(Memory, ["resources", "terminal_orders"], new Object());
			return `[Console] All terminal transactions cleared.`;
		};

		help_resources.push("resources.set_energy_threshold(amount)");
		help_resources.push(" - Sets the energy threshold for emergency market orders");
		help_resources.push(" - When total colony energy falls below this amount, automatic buy orders are created");
		help_resources.push(" - Default threshold is 1,000,000 energy");

		resources.set_energy_threshold = function (amount) {
			_.set(Memory, ["resources", "market_energy_threshold"], amount);
			return `[Console] Market energy threshold set to ${amount}. Emergency market orders will trigger when total colony energy falls below this amount.`;
		};

		help_resources.push("resources.market_status()");
		help_resources.push(" - Shows current market status and energy levels");
		help_resources.push(" - Displays total colony energy, energy threshold, and available market orders");
		help_resources.push(" - Shows top 5 cheapest energy and battery orders from the market");

		resources.market_status = function () {
			// Calculate total colony energy
			let totalEnergy = 0;
			let colonies = _.filter(Game.rooms, r => r.controller && r.controller.my);
			_.each(colonies, colony => {
				totalEnergy += colony.store("energy");
			});

			let energyThreshold = _.get(Memory, ["resources", "market_energy_threshold"], 1000000);
			let status = totalEnergy >= energyThreshold ? "OK" : "LOW";
			let statusColor = status === "OK" ? "#47FF3E" : "#FF6B6B";

			// Energy Status Summary
			console.log(`[Market Status] Energy Status: ${totalEnergy.toLocaleString()}/${energyThreshold.toLocaleString()} - ${status}`);

			// Terminal Orders Table (CSS)
			let terminalOrders = _.get(Memory, ["resources", "terminal_orders"]);
			if (terminalOrders && Object.keys(terminalOrders).length > 0) {
				let tableStyle = "style=\"border-collapse: collapse; border: 1px solid #666; margin: 5px 0; width: 100%;\"";
				let cellStyle = "style=\"border: 1px solid #666; padding: 2px 6px; text-align: left; font-size: 12px;\"";
				let headerStyle = "style=\"border: 1px solid #666; padding: 2px 6px; text-align: left; background-color: #444; color: #D3FFA3; font-weight: bold; font-size: 13px;\"";
				console.log(`[Market Status] Terminal Orders: ${Object.keys(terminalOrders).length}`);
				let ordersTable = `	Order Name		Type		Resource		Amount		Priority		Room	`;
				_.each(terminalOrders, (order, orderName) => {
					let orderType = order.market_id ? "Market" : "Internal";
					let emergency = order.emergency ? " (EMERGENCY)" : "";
					let priority = order.priority || "";
					let resource = order.resource || "";
					let amount = order.amount || "";
					let room = order.room || order.to || order.from || "";
					ordersTable += `	${orderName}		${orderType}${emergency}		${resource}		${amount}		${priority}		${room}	`;
				});
				ordersTable += "";
				console.log(ordersTable);
			} else {
				console.log(`[Market Status] No active terminal orders.`);
			}

			// Available Market Orders Summary with Price Analysis
			let energyOrders = Game.market.getAllOrders(
				order => order.type == "sell" && order.resourceType == "energy"
			);

			if (energyOrders.length > 0) {
				// Calculate price statistics
				let prices = energyOrders.map(order => order.price).sort((a, b) => a - b);
				let avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
				let medianPrice = prices[Math.floor(prices.length / 2)];
				let minPrice = prices[0];
				let maxPrice = prices[prices.length - 1];
				
				// Get configurable price protection settings
				let priceProtection = _.get(Memory, ["resources", "market_price_protection"], { avg_multiplier: 2.0, median_multiplier: 1.5 });
				let reasonablePrice = Math.min(avgPrice * priceProtection.avg_multiplier, medianPrice * priceProtection.median_multiplier);
				
				// Filter reasonable orders
				let reasonableOrders = energyOrders.filter(order => order.price <= reasonablePrice);
				let expensiveOrders = energyOrders.filter(order => order.price > reasonablePrice);
				
				console.log(`[Market Status] Energy Market Analysis:`);
				console.log(`  Price Stats: Min: ${minPrice.toFixed(2)}, Avg: ${avgPrice.toFixed(2)}, Median: ${medianPrice.toFixed(2)}, Max: ${maxPrice.toFixed(2)}`);
				console.log(`  Reasonable Price Threshold: ${reasonablePrice.toFixed(2)} (${priceProtection.avg_multiplier}x avg or ${priceProtection.median_multiplier}x median, whichever is lower)`);
				console.log(`  Available Orders: ${reasonableOrders.length} reasonable, ${expensiveOrders.length} too expensive`);
				
				if (reasonableOrders.length > 0) {
					console.log(`[Market Status] Top Reasonable Energy Orders:`);
					_.each(_.sortBy(reasonableOrders, order => order.price).slice(0, 5), (order, i) => {
						console.log(`  ${i+1}. ${order.amount.toLocaleString()} energy @ ${order.price} credits from ${order.roomName}`);
					});
				} else {
					console.log(`[Market Status] ⚠️ No reasonable energy orders available! All orders are too expensive.`);
				}
				
				if (expensiveOrders.length > 0) {
					console.log(`[Market Status] Expensive Orders (skipped):`);
					_.each(_.sortBy(expensiveOrders, order => order.price).slice(0, 3), (order, i) => {
						console.log(`  ${i+1}. ${order.amount.toLocaleString()} energy @ ${order.price} credits from ${order.roomName} (${((order.price / avgPrice) * 100).toFixed(0)}% of avg)`);
					});
				}
			} else {
				console.log(`[Market Status] No energy sell orders available on market.`);
			}

			// Credit Status
			let availableCredits = Game.market.credits || 0;
			console.log(`[Market Status] Available Credits: ${availableCredits.toLocaleString()}`);

			// CPU Usage Information
			let cpuUsed = Game.cpu.getUsed();
			let cpuBucket = Game.cpu.bucket;
			console.log(`[Market Status] CPU Status: Used: ${cpuUsed.toFixed(2)}, Bucket: ${cpuBucket.toFixed(0)}`);

			// Emergency Status with Enhanced Information
			if (totalEnergy < energyThreshold) {
				let nextCheckTick = Math.ceil(Game.time / 50) * 50 + 1;
				console.log(`[Market Status] ⚠️ Emergency: Energy below threshold! Next check at tick ${nextCheckTick}`);
				
				// Show why we might not be buying
				if (energyOrders.length > 0) {
					let prices = energyOrders.map(order => order.price);
					let avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
					let priceProtection = _.get(Memory, ["resources", "market_price_protection"], { avg_multiplier: 2.0, median_multiplier: 1.5 });
					let creditLimit = _.get(Memory, ["resources", "market_credit_limit"], 0.8);
					let reasonablePrice = Math.min(avgPrice * priceProtection.avg_multiplier, prices[Math.floor(prices.length / 2)] * priceProtection.median_multiplier);
					let reasonableOrders = energyOrders.filter(order => order.price <= reasonablePrice);
					
					if (reasonableOrders.length == 0) {
						console.log(`[Market Status] Reason for not buying: All energy orders are too expensive (above ${reasonablePrice.toFixed(2)} credits)`);
					} else {
						let bestOrder = _.sortBy(reasonableOrders, order => order.price)[0];
						let totalCost = bestOrder.price * 5000; // Estimate cost for 5000 energy
						
						if (totalCost > availableCredits * creditLimit) {
							console.log(`[Market Status] Reason for not buying: Insufficient credits. Need ~${totalCost.toLocaleString()} credits, have ${availableCredits.toLocaleString()} (limit: ${(creditLimit * 100).toFixed(0)}%)`);
						}
					}
				}
			}

			// Transaction Cost Analysis
			if (energyOrders.length > 0) {
				let bestOrder = _.sortBy(energyOrders, order => order.price)[0];
				console.log(`[Market Status] Transaction Cost Analysis (Best Order: ${bestOrder.price} credits):`);
				
				_.each(colonies, colony => {
					if (colony.terminal && colony.terminal.my) {
						let terminalEnergy = colony.terminal.store.energy || 0;
						let sampleAmount = 5000; // Sample transaction size
						let energyCost = Game.market.calcTransactionCost(sampleAmount, bestOrder.roomName, colony.name);
						let netGain = sampleAmount - energyCost;
						let costPerUnit = energyCost / sampleAmount;
						let profitMargin = (netGain / sampleAmount) * 100;
						
						let statusColor = netGain > 0 ? "#47FF3E" : "#FF6B6B";
						let energyStatus = terminalEnergy >= energyCost ? "✅" : "⚠️";
						
						console.log(`  ${colony.name}: ${energyStatus} Terminal energy: ${terminalEnergy}, Cost for ${sampleAmount} energy: ${energyCost} (${costPerUnit.toFixed(3)} per unit), Net gain: ${netGain} (${profitMargin.toFixed(1)}% profit)`);
						
						if (terminalEnergy < energyCost) {
							console.log(`    ⚠️  Terminal needs ${energyCost - terminalEnergy} more energy for transaction`);
						}
					}
				});
			}

		return `[Console] Market status displayed.`;
	};

	help_resources.push("resources.check_dropped()");
	help_resources.push(" - Scans all owned rooms for dropped resources on the ground");
	help_resources.push(" - Shows location and amount of each dropped resource pile");
	help_resources.push(" - Useful for finding hydrogen and other resources that creeps can't store");

	resources.check_dropped = function () {
		let colonies = _.filter(Game.rooms, r => r.controller && r.controller.my);
		let totalDropped = {};
		let detailOutput = "[Dropped Resources] Scanning all owned rooms...\n";
		
		_.each(colonies, room => {
			let dropped = room.find(FIND_DROPPED_RESOURCES);
			if (dropped.length > 0) {
				detailOutput += `${room.name}:\n`;
				_.each(dropped, pile => {
					detailOutput += `  - ${pile.resourceType}: ${pile.amount} at (${pile.pos.x}, ${pile.pos.y})\n`;
					totalDropped[pile.resourceType] = (totalDropped[pile.resourceType] || 0) + pile.amount;
				});
			}
		});
		
		console.log(detailOutput);
		
		if (Object.keys(totalDropped).length > 0) {
			let summaryOutput = "[Dropped Resources] Summary:\n";
			_.each(Object.keys(totalDropped).sort(), resourceType => {
				summaryOutput += `  ${resourceType}: ${totalDropped[resourceType]} total\n`;
			});
			console.log(summaryOutput);
		} else {
			console.log("[Dropped Resources] No dropped resources found.");
		}
		
		return `[Console] Dropped resource scan complete.`;
	};

	help_resources.push("resources.clear_emergency_orders()");
	help_resources.push(" - Clears all emergency market orders created by the automatic system");
	help_resources.push(" - Only affects orders marked as 'emergency', leaves manual orders intact");

		resources.clear_emergency_orders = function () {
			let cleared = 0;
			let orders = _.get(Memory, ["resources", "terminal_orders"]);
			if (orders) {
				_.each(Object.keys(orders), orderName => {
					if (orders[orderName].emergency) {
						delete orders[orderName];
						cleared++;
					}
				});
			}
			return `[Console] Cleared ${cleared} emergency market orders.`;
		};

		help_resources.push("resources.force_emergency_orders()");
		help_resources.push(" - Manually triggers emergency market order creation");
		help_resources.push(" - Useful for testing when energy is below threshold");

		help_resources.push("resources.set_market_config(key, value)");
		help_resources.push(" - Sets market configuration values");
		help_resources.push(" - Keys: market_min_energy_gain (minimum net energy gain for transactions)");
		help_resources.push(" - Example: resources.set_market_config('market_min_energy_gain', 2000)");

		resources.set_market_config = function(key, value) {
			if (key === 'market_min_energy_gain') {
				_.set(Memory, ["resources", key], parseInt(value));
				return `[Console] Set ${key} to ${value}.`;
			} else {
				return `[Console] Unknown config key: ${key}. Available: market_min_energy_gain`;
			}
		};

		help_resources.push("resources.system_status()");
		help_resources.push(" - Shows comprehensive system status including CPU, memory, and performance metrics");

		resources.system_status = function() {
			// CPU Usage
			let cpuUsed = Game.cpu.getUsed();
			let cpuBucket = Game.cpu.bucket;
			let cpuLimit = Game.cpu.limit;
			let cpuPercent = (cpuUsed / cpuLimit) * 100;
			
			console.log(`[System Status] CPU Performance:`);
			console.log(`  Used: ${cpuUsed.toFixed(2)}/${cpuLimit} (${cpuPercent.toFixed(1)}%)`);
			console.log(`  Bucket: ${cpuBucket.toFixed(0)}`);
			console.log(`  Status: ${cpuPercent > 80 ? "⚠️ High" : cpuPercent > 60 ? "⚡ Medium" : "✅ Good"}`);
			
			// Memory Usage
			let memorySize = JSON.stringify(Memory).length;
			let memoryKB = (memorySize / 1024).toFixed(1);
			console.log(`[System Status] Memory Usage: ${memoryKB} KB`);
			
			// Colony Status
			let colonies = _.filter(Game.rooms, r => r.controller && r.controller.my);
			let totalCreeps = Object.keys(Game.creeps).length;
			let totalStructures = Object.keys(Game.structures).length;
			
			console.log(`[System Status] Colony Status:`);
			console.log(`  Colonies: ${colonies.length}`);
			console.log(`  Creeps: ${totalCreeps}`);
			console.log(`  Structures: ${totalStructures}`);
			
			// Energy Status
			let totalEnergy = 0;
			_.each(colonies, colony => {
				totalEnergy += colony.store("energy");
			});
			console.log(`[System Status] Total Energy: ${totalEnergy.toLocaleString()}`);
			
			// Market Status
			let availableCredits = Game.market.credits || 0;
			console.log(`[System Status] Market Credits: ${availableCredits.toLocaleString()}`);
			
			// Pulse Status
			console.log(`[System Status] Pulse Status:`);
			console.log(`  Defense: ${isPulse_Defense() ? "✅ Active" : "⏸️ Inactive"}`);
			console.log(`  Short: ${isPulse_Short() ? "✅ Active" : "⏸️ Inactive"}`);
			console.log(`  Mid: ${isPulse_Mid() ? "✅ Active" : "⏸️ Inactive"}`);
			console.log(`  Spawn: ${isPulse_Spawn() ? "✅ Active" : "⏸️ Inactive"}`);
			
			return `[System Status] System status displayed.`;
		};

		help_resources.push("resources.fuel_terminals()");
		help_resources.push(" - Manually creates terminal fuel orders for all rooms");
		help_resources.push(" - Useful for testing terminal energy distribution");

		resources.fuel_terminals = function() {
			let colonies = _.filter(Game.rooms, r => r.controller && r.controller.my);
			let fueled = 0;
			
			_.each(colonies, colony => {
				if (colony.terminal && colony.terminal.my) {
					let terminalEnergy = colony.terminal.store.energy || 0;
					if (terminalEnergy < 5000) { // Fuel terminals to 5000 energy
						let energyNeeded = 5000 - terminalEnergy;
						let energyOrderName = `${colony.name}-energy_terminal_fuel`;
						_.set(Memory, ["resources", "terminal_orders", energyOrderName], {
							room: colony.name,
							resource: "energy",
							amount: energyNeeded,
							automated: true,
							priority: 0, // Super high priority
							terminal_fuel: true,
							emergency: true
						});
						fueled++;
						console.log(`[Console] Created terminal fuel order for ${colony.name}: ${energyNeeded} energy (current: ${terminalEnergy})`);
					}
				}
			});
			
			return `[Console] Created ${fueled} terminal fuel orders.`;
		};

		resources.force_emergency_orders = function () {
			// Find a room with a terminal to trigger the emergency order creation
			let roomWithTerminal = _.find(Game.rooms, r => r.controller && r.controller.my && r.terminal);
			if (!roomWithTerminal) {
				return `[Console] Error: No room with terminal found.`;
			}

			// Implement the emergency order creation logic directly
			let totalEnergy = 0;
			let colonies = _.filter(Game.rooms, r => r.controller && r.controller.my);
			_.each(colonies, colony => {
				totalEnergy += colony.store("energy");
			});

			let energyThreshold = _.get(Memory, ["resources", "market_energy_threshold"], 1000000);
			if (totalEnergy < energyThreshold) {
				let energyOrders = Game.market.getAllOrders(
					order => order.type == "sell" && order.resourceType == "energy"
				);
				
				if (energyOrders.length > 0) {
					let prices = energyOrders.map(order => order.price).sort((a, b) => a - b);
					let avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
					let medianPrice = prices[Math.floor(prices.length / 2)];
					
					let priceProtection = _.get(Memory, ["resources", "market_price_protection"], { avg_multiplier: 2.0, median_multiplier: 1.5 });
					let creditLimit = _.get(Memory, ["resources", "market_credit_limit"], 0.8);
					
					let maxPrice = Math.min(avgPrice * priceProtection.avg_multiplier, medianPrice * priceProtection.median_multiplier);
					let reasonableOrders = energyOrders.filter(order => order.price <= maxPrice);
					
					if (reasonableOrders.length > 0) {
						let bestOrder = _.sortBy(reasonableOrders, order => order.price)[0];
						let amountToBuy = Math.min(5000, energyThreshold - totalEnergy);
						
						let totalCost = bestOrder.price * amountToBuy;
						let availableCredits = Game.market.credits || 0;
						
						if (totalCost <= availableCredits * creditLimit) {
							// Calculate energy cost for the transaction
							let energyCost = Game.market.calcTransactionCost(amountToBuy, bestOrder.roomName, roomWithTerminal.name);
							let netEnergyGained = amountToBuy - energyCost;
							
							// Check if this transaction is profitable
							if (netEnergyGained <= 0) {
								console.log(`[Market Emergency] Manual trigger: Transaction not profitable: buying ${amountToBuy} energy costs ${energyCost} energy (net gain: ${netEnergyGained}). Skipping.`);
								return;
							}
							
							// Check if the energy gain is significant enough
							let minSignificantGain = _.get(Memory, ["resources", "market_min_energy_gain"], 1000);
							if (netEnergyGained < minSignificantGain) {
								console.log(`[Market Emergency] Manual trigger: Energy gain too small: ${netEnergyGained} net energy (minimum: ${minSignificantGain}). Skipping.`);
								return;
							}
							
							// Find the best room to receive the energy
							let bestReceivingRoom = null;
							let bestRoomEnergy = 0;
							let bestRoomScore = -1;
							
							_.each(colonies, colony => {
								if (colony.terminal && colony.terminal.my) {
									let terminalEnergy = colony.terminal.store.energy || 0;
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
								let energyNeeded = energyCost + 1000;
								let energyOrderName = `${roomWithTerminal.name}-energy_emergency_terminal`;
								_.set(Memory, ["resources", "terminal_orders", energyOrderName], {
									room: roomWithTerminal.name,
									resource: "energy",
									amount: energyNeeded,
									automated: true,
									priority: 0, // Super high priority
									terminal_fuel: true,
									emergency: true
								});
								console.log(`[Market Emergency] Manual trigger: Terminal in ${roomWithTerminal.name} needs ${energyNeeded} energy for transaction. Creating high-priority energy order.`);
								return;
							}
							
							let orderName = `market_energy_emergency_${Game.time}`;
							_.set(Memory, ["resources", "terminal_orders", orderName], {
								market_id: bestOrder.id,
								amount: amountToBuy,
								to: bestReceivingRoom,
								priority: 1,
								automated: true,
								emergency: true,
								energy_cost: energyCost,
								net_gain: netEnergyGained
							});

							console.log(`[Market Emergency] Manual trigger: Creating market buy order: ${amountToBuy} energy at ${bestOrder.price} credits (cost: ${energyCost} energy, net gain: ${netEnergyGained}) to ${bestReceivingRoom} (terminal energy: ${bestRoomEnergy}).`);
						} else {
							console.log(`[Market Emergency] Manual trigger: Insufficient credits. Need ${totalCost} credits, have ${availableCredits}.`);
						}
					} else {
						console.log(`[Market Emergency] Manual trigger: All energy orders too expensive. Average price: ${avgPrice.toFixed(2)}, max acceptable: ${maxPrice.toFixed(2)}.`);
					}
				} else {
					console.log(`[Market Emergency] Manual trigger: No energy sell orders available on market.`);
				}
			} else {
				console.log(`[Market Emergency] Manual trigger: Energy above threshold (${totalEnergy}/${energyThreshold}).`);
			}
			
			return `[Console] Emergency order creation triggered for ${roomWithTerminal.name}.`;
		};

		help_resources.push("resources.clear_and_force_emergency()");
		help_resources.push(" - Clears all existing emergency orders and forces creation of new ones");
		help_resources.push(" - Useful when emergency orders are stuck due to terminal energy issues");

		resources.clear_and_force_emergency = function () {
			// Clear existing emergency orders
			let cleared = 0;
			let orders = _.get(Memory, ["resources", "terminal_orders"]);
			if (orders) {
				_.each(Object.keys(orders), orderName => {
					if (orders[orderName].emergency) {
						delete orders[orderName];
						cleared++;
					}
				});
			}
			
			// Force creation of new emergency orders by implementing the logic directly
			let totalEnergy = 0;
			let colonies = _.filter(Game.rooms, r => r.controller && r.controller.my);
			_.each(colonies, colony => {
				totalEnergy += colony.store("energy");
			});

			let energyThreshold = _.get(Memory, ["resources", "market_energy_threshold"], 1000000);
			if (totalEnergy < energyThreshold) {
				let energyOrders = Game.market.getAllOrders(
					order => order.type == "sell" && order.resourceType == "energy"
				);
				
				if (energyOrders.length > 0) {
					let prices = energyOrders.map(order => order.price).sort((a, b) => a - b);
					let avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
					let medianPrice = prices[Math.floor(prices.length / 2)];
					
					let priceProtection = _.get(Memory, ["resources", "market_price_protection"], { avg_multiplier: 2.0, median_multiplier: 1.5 });
					let creditLimit = _.get(Memory, ["resources", "market_credit_limit"], 0.8);
					
					let maxPrice = Math.min(avgPrice * priceProtection.avg_multiplier, medianPrice * priceProtection.median_multiplier);
					let reasonableOrders = energyOrders.filter(order => order.price <= maxPrice);
					
					if (reasonableOrders.length > 0) {
						let bestOrder = _.sortBy(reasonableOrders, order => order.price)[0];
						let amountToBuy = Math.min(5000, energyThreshold - totalEnergy);
						
						let totalCost = bestOrder.price * amountToBuy;
						let availableCredits = Game.market.credits || 0;
						
						if (totalCost <= availableCredits * creditLimit) {
							// Find the best room to receive the energy
							let bestReceivingRoom = null;
							let bestRoomEnergy = 0;
							
							_.each(colonies, colony => {
								if (colony.terminal && colony.terminal.my) {
									let terminalEnergy = colony.terminal.store.energy || 0;
									if (terminalEnergy > bestRoomEnergy) {
										bestRoomEnergy = terminalEnergy;
										bestReceivingRoom = colony.name;
									}
								}
							});
							
							if (!bestReceivingRoom) {
								bestReceivingRoom = colonies[0].name;
							}
							
							let orderName = `market_energy_emergency_${Game.time}`;
							_.set(Memory, ["resources", "terminal_orders", orderName], {
								market_id: bestOrder.id,
								amount: amountToBuy,
								to: bestReceivingRoom,
								priority: 1,
								automated: true,
								emergency: true
							});

							console.log(`[Market Emergency] Manual trigger: Creating market buy order for ${amountToBuy} energy at ${bestOrder.price} credits to ${bestReceivingRoom} (terminal energy: ${bestRoomEnergy}).`);
						} else {
							console.log(`[Market Emergency] Manual trigger: Insufficient credits. Need ${totalCost} credits, have ${availableCredits}.`);
						}
					} else {
						console.log(`[Market Emergency] Manual trigger: All energy orders too expensive. Average price: ${avgPrice.toFixed(2)}, max acceptable: ${maxPrice.toFixed(2)}.`);
					}
				} else {
					console.log(`[Market Emergency] Manual trigger: No energy sell orders available on market.`);
				}
			} else {
				console.log(`[Market Emergency] Manual trigger: Energy above threshold (${totalEnergy}/${energyThreshold}).`);
			}
			
			return `[Console] Cleared ${cleared} emergency orders and triggered new emergency order creation.`;
		};

		help_resources.push("resources.set_price_protection(avgMultiplier, medianMultiplier)");
		help_resources.push(" - Sets the price protection multipliers for emergency energy purchases");
		help_resources.push(" - avgMultiplier: maximum price as multiple of average (default: 2.0)");
		help_resources.push(" - medianMultiplier: maximum price as multiple of median (default: 1.5)");
		help_resources.push(" - Example: resources.set_price_protection(1.5, 1.2) for more conservative buying");

		resources.set_price_protection = function (avgMultiplier, medianMultiplier) {
			_.set(Memory, ["resources", "market_price_protection"], {
				avg_multiplier: avgMultiplier || 2.0,
				median_multiplier: medianMultiplier || 1.5
			});
			return `[Console] Price protection set to ${avgMultiplier || 2.0}x average and ${medianMultiplier || 1.5}x median.`;
		};

		help_resources.push("resources.set_credit_limit(percentage)");
		help_resources.push(" - Sets the maximum percentage of available credits to spend on emergency energy");
		help_resources.push(" - percentage: 0-100, default is 80%");
		help_resources.push(" - Example: resources.set_credit_limit(50) to only spend 50% of available credits");

		resources.set_credit_limit = function (percentage) {
			if (percentage < 0 || percentage > 100) {
				return `[Console] Error: Percentage must be between 0 and 100.`;
			}
			_.set(Memory, ["resources", "market_credit_limit"], percentage / 100);
			return `[Console] Credit limit set to ${percentage}% of available credits.`;
		};

		help_resources.push("resources.credits()");
		help_resources.push(" - Shows current available market credits");
		help_resources.push(" - Displays credits and spending limits");

		resources.credits = function () {
			let availableCredits = Game.market.credits || 0;
			let creditLimit = _.get(Memory, ["resources", "market_credit_limit"], 0.8);
			let maxSpendable = availableCredits * creditLimit;
			
			console.log(`[Credits] Available Credits: ${availableCredits.toLocaleString()}`);
			console.log(`[Credits] Credit Limit: ${(creditLimit * 100).toFixed(0)}%`);
			console.log(`[Credits] Max Spendable: ${maxSpendable.toLocaleString()}`);
			
			return `[Console] Credit information displayed.`;
		};


		empire = new Object();

		help_empire.push("empire.combat(combatID, rmColony, rmTarget, listSpawnRooms, listRoute, tactic)");
		help_empire.push(" - tactic 'waves': { type: 'waves', spawn_repeat: t/f, rally_pos: new RoomPosition(rallyX, rallyY, rallyRoom), target_creeps: t/f, target_structures: t/f, target_list: [], to_occupy: t/f }");
		help_empire.push(" - tactic 'trickle': { type: 'trickle', target_creeps: t/f, target_structures: t/f, target_list: [], to_occupy: t/f }");
		help_empire.push(" - tactic 'occupy': { type: 'occupy', target_creeps: t/f, target_structures: t/f, target_list: [] }");
		help_empire.push(" - tactic 'dismantle': { type: 'dismantle', target_list: [] }");
		help_empire.push(" - tactic 'tower_drain': { type: 'tower_drain', rally_pos: new RoomPosition(rallyX, rallyY, rallyRoom), drain_pos: new RoomPosition(drainX, drainY, drainRoom) }");
		help_empire.push(" - tactic 'controller': { type: 'controller', to_occupy: t/f }");

		empire.combat = function (combat_id, colony, target_room, list_spawns, list_route, tactic) {
			_.set(Memory, ["sites", "combat", combat_id],
				{
					colony: colony, target_room: target_room, list_spawns: list_spawns,
					list_route: list_route, tactic: tactic
				});
			return `[Console] Combat request added to Memory.sites.combat.${combat_id} ... to cancel, delete the entry.`;
		};

		help_empire.push("");

		help_empire.push("empire.set_threat(roomName, level)  ... NONE, LOW, MEDIUM, HIGH")
		empire.set_threat = function (room_name, level) {
			_.set(Memory, ["rooms", room_name, "defense", "threat_level"], level);
			return `[Console] Threat level for room ${room_name} set.`;
		};

		help_empire.push("empire.set_threat_all(level)  ... NONE, LOW, MEDIUM, HIGH")
		empire.set_threat_all = function (level) {
			for (let i in Memory.rooms)
				_.set(Memory, ["rooms", i, "defense", "threat_level"], level);
			return `[Console] Threat level for all rooms set.`;
		};

		help_empire.push("empire.wall_target(hitpoints)  ... hitpoints can be null to reset")
		empire.wall_target = function (hitpoints) {
			if (hitpoints == null) {
				for (let i in Memory.rooms)
					if (_.has(Memory, ["rooms", i, "defense", "wall_hp_target"]))
						delete Memory["rooms"][i]["defense"]["wall_hp_target"];
				return `[Console] Wall/rampart hitpoint target reset to default for all rooms.`;
			} else {
				for (let i in Memory.rooms)
					_.set(Memory, ["rooms", i, "defense", "wall_hp_target"], hitpoints);
				return `[Console] Wall/rampart hitpoint target set for all rooms.`;
			}
		};

		help_empire.push("empire.set_camp(room_pos)")
		empire.set_camp = function (room_pos) {
			_.set(Memory, ["rooms", room_pos.roomName, "camp"], room_pos);
			return `[Console] Defensive camp set for room ${room_pos.roomName}.`;
		};

		help_empire.push("");
		help_empire.push("empire.colonize(rmFrom, rmTarget, {origin: {x: baseX, y: baseY}, name: layoutName}, focusDefense, [listRoute])");

		empire.colonize = function (from, target, layout, focus_defense, list_route) {
			_.set(Memory, ["sites", "colonization", target], { from: from, target: target, layout: layout, focus_defense: focus_defense, list_route: list_route });
			return `[Console] Colonization request added to Memory.sites.colonization.${target} ... to cancel, delete the entry.`;
		};

		help_empire.push("empire.spawn_assist(rmToAssist, [listRooms], [listRoute])");
		empire.spawn_assist = function (room_assist, list_rooms, list_route) {
			_.set(Memory, ["rooms", room_assist, "spawn_assist"], { rooms: list_rooms, list_route: list_route });
			return `[Console] Spawn assist added to Memory.rooms.${room_assist}.spawn_assist ... to cancel, delete the entry.`;
		};

		help_empire.push("empire.remote_mining(rmColony, rmHarvest, hasKeepers, [listRoute], [listSpawnAssistRooms], {customPopulation})");
		empire.remote_mining = function (rmColony, rmHarvest, hasKeepers, listRoute, listSpawnAssistRooms, customPopulation) {
			if (rmColony == null || rmHarvest == null)
				return `[Console] Error, invalid entry for remote_mining()`;

			_.set(Memory, ["sites", "mining", rmHarvest], { colony: rmColony, has_keepers: hasKeepers, list_route: listRoute, spawn_assist: listSpawnAssistRooms, population: customPopulation });
			return `[Console] Remote mining added to Memory.sites.mining.${rmHarvest} ... to cancel, delete the entry.`;
		};
		help_empire.push("empire.scout(rmColony, rally_pos, dest_pos, { count, respawn, waitForFullRally, priority, level, body, name, spawnRooms, patrol_mode, transfer_intent, global, listRoute, rallyShard, destShard })");
		help_empire.push(" - rally_pos / dest_pos accept RoomPosition or plain objects ({ x, y, roomName, shard? })");
		help_empire.push(" - options.count: number of scouts to keep active (default 1) | respawn: keep mission alive (default true)");
		help_empire.push(" - waitForFullRally: hold at rally until all count creeps arrive (default true)");
		help_empire.push(" - patrol_mode: 'station' (hold destination) or 'loop' (bounce between rally/destination)");
		help_empire.push(" - spawnRooms: string or array of rooms allowed to spawn the request (falls back to spawn_assist)");
		help_empire.push(" - listRoute: array of waypoint rooms (accepts 'shard/room' when crossing shards)");
		help_empire.push(" - transfer_intent: { destination_shard, destination_room, portal_pos, return_portal?, portals? } (used for cross-shard portal transfers)");
		help_empire.push("   · portal_pos / return_portal.portal_pos accept { x, y, roomName, shard? }");
		help_empire.push("   · transfer_intent.portals allows explicit portal network [{ from: { shard, roomName, pos }, to: { shard, roomName? } }]");
		help_empire.push(" - rallyShard / destShard override inferred shard when the RoomPosition lacks shard metadata");
		help_empire.push(" - global: mission manifest stored in Memory.hive.ism (e.g. { mission: 'portal_scout', origin: { shard, room }, target: { shard, room } })");
		help_empire.push("   transfer/global are optional but recommended when sending scouts through inter-shard portals");
		help_empire.push(" - example: empire.scout('E48S21', new RoomPosition(25,20,'E48S21'), new RoomPosition(45,24,'E50S20'), { count: 3, respawn: true, patrol_mode: 'loop' })");
		empire.scout = function (rmColony, rally_pos, dest_pos, options) {
			let parseShardRoom = function (value, defaultShard) {
				let shard = defaultShard || Game.shard.name;
				let roomName = null;

				if (value == null)
					return { shard: shard, roomName: roomName };

				if (value instanceof RoomPosition) {
					return { shard: shard, roomName: value.roomName };
				}

				if (_.isString(value)) {
					let parts = value.split("/");
					if (parts.length === 2) {
						shard = parts[0];
						roomName = parts[1];
					} else {
						roomName = value;
					}
					return { shard: shard, roomName: roomName };
				}

				if (_.isObject(value)) {
					let candidate = _.get(value, "roomName") || _.get(value, "room") || _.get(value, "name");
					if (_.isString(candidate)) {
						let parts = candidate.split("/");
						if (parts.length === 2) {
							shard = parts[0];
							roomName = parts[1];
						} else {
							roomName = candidate;
						}
					}
					if (_.isString(_.get(value, "shard")))
						shard = value.shard;
				}

				return { shard: shard, roomName: roomName };
			};

			let packPos = function (pos, fallbackShard) {
				if (pos == null)
					return null;

				if (pos instanceof RoomPosition) {
					return {
						x: pos.x,
						y: pos.y,
						roomName: pos.roomName,
						shard: fallbackShard || Game.shard.name
					};
				}

				if (_.isObject(pos)) {
					let x = _.get(pos, "x");
					let y = _.get(pos, "y");
					let roomName = _.get(pos, "roomName") || _.get(pos, "room");
					let shard = _.get(pos, "shard", fallbackShard || Game.shard.name);

					if (_.isString(roomName) && roomName.indexOf("/") >= 0) {
						let parsed = parseShardRoom(roomName, shard);
						roomName = parsed.roomName;
						shard = parsed.shard;
					}

					if (_.isNumber(x) && _.isNumber(y) && _.isString(roomName)) {
						return {
							x: x,
							y: y,
							roomName: roomName,
							shard: shard
						};
					}
				}

				return null;
			};

			let normalizeRoomsArray = function (rooms, fallbackShard) {
				if (rooms == null)
					return null;

				let list = _.isArray(rooms) ? rooms : [rooms];
				let result = [];

				_.each(list, entry => {
					let parsed = parseShardRoom(entry, fallbackShard);
					if (_.isString(parsed.roomName) && (!parsed.shard || parsed.shard === fallbackShard))
						result.push(parsed.roomName);
				});

				return _.uniq(result);
			};

			let normalizeRoute = function (route, fallbackShard) {
				if (!_.isArray(route))
					return null;

				let normalized = [];
				_.each(route, step => {
					if (step == null)
						return;

					if (_.isString(step)) {
						let parts = step.split("/");
						if (parts.length === 2) {
							normalized.push(`${parts[0]}/${parts[1]}`);
						} else {
							normalized.push(step);
						}
						return;
					}

					if (_.isObject(step)) {
						let parsed = parseShardRoom(step, fallbackShard);
						if (!_.isString(parsed.roomName))
							return;
						if (parsed.shard && parsed.shard !== fallbackShard)
							normalized.push(`${parsed.shard}/${parsed.roomName}`);
						else
							normalized.push(parsed.roomName);
					}
				});

				return _.uniq(normalized);
			};

			let uniquePortalEntries = function (entries) {
				if (!_.isArray(entries))
					return [];

				let deduped = [];
				let seen = {};

				for (let i = 0; i < entries.length; i++) {
					let entry = entries[i];
					if (!entry || !_.get(entry, ["from", "pos"]))
						continue;

					let from = entry.from;
					let to = entry.to || {};
					let pos = from.pos;

					if (!_.isNumber(pos.x) || !_.isNumber(pos.y) || !_.isString(from.roomName) || !_.isString(from.shard) || !_.isString(to.shard))
						continue;

					let key = `${from.shard}/${from.roomName}:${pos.x}:${pos.y}->${to.shard}/${to.roomName || ""}`;
					if (!seen[key]) {
						seen[key] = true;
						deduped.push(entry);
					}
				}

				return deduped;
			};

			let normalizeTransferIntent = function (intent, defaults) {
				if (!_.isObject(intent))
					return null;

				let normalized = _.cloneDeep(intent);

				normalized.origin_shard = _.get(normalized, "origin_shard", defaults.originShard);
				normalized.origin_room = _.get(normalized, "origin_room", defaults.originRoom);
				normalized.destination_shard = _.get(normalized, "destination_shard", defaults.destinationShard);
				normalized.destination_room = _.get(normalized, "destination_room", defaults.destinationRoom);

				if (_.has(normalized, "portal_pos")) {
					normalized.portal_pos = packPos(normalized.portal_pos, normalized.origin_shard);
					if (!normalized.portal_pos)
						delete normalized.portal_pos;
				}

				if (_.has(normalized, "return_portal")) {
					let ret = _.get(normalized, "return_portal");
					if (_.isObject(ret)) {
						ret.shard = _.get(ret, "shard", normalized.destination_shard);
						ret.destination_shard = _.get(ret, "destination_shard", normalized.origin_shard);
						ret.destination_room = _.get(ret, "destination_room", normalized.origin_room);
						if (_.has(ret, "portal_pos"))
							ret.portal_pos = packPos(ret.portal_pos, ret.shard);
						if (!_.get(ret, ["portal_pos", "roomName"]))
							delete normalized.return_portal;
						else
							normalized.return_portal = ret;
					} else {
						delete normalized.return_portal;
					}
				}

				let portalEntries = [];

				let addPortalEntry = function (fromShard, fromRoom, portalPos, toShard, toRoom, label) {
					if (!fromShard || !fromRoom || !portalPos || !toShard)
						return;
					if (!_.isNumber(portalPos.x) || !_.isNumber(portalPos.y) || !_.isString(portalPos.roomName))
						return;

					portalEntries.push({
						from: {
							shard: fromShard,
							roomName: fromRoom,
							pos: {
								x: portalPos.x,
								y: portalPos.y,
								roomName: portalPos.roomName,
								shard: portalPos.shard || fromShard
							}
						},
						to: {
							shard: toShard,
							roomName: toRoom || null
						},
						label: label || null
					});
				};

				if (_.get(normalized, ["portal_pos", "roomName"]) && normalized.destination_shard) {
					addPortalEntry(
						normalized.origin_shard,
						normalized.portal_pos.roomName,
						normalized.portal_pos,
						normalized.destination_shard,
						normalized.destination_room,
						"outbound"
					);
				}

				if (_.get(normalized, ["return_portal", "portal_pos", "roomName"])) {
					let ret = normalized.return_portal;
					addPortalEntry(
						ret.shard,
						ret.portal_pos.roomName,
						ret.portal_pos,
						ret.destination_shard,
						ret.destination_room,
						"return"
					);
				}

				if (_.isArray(_.get(normalized, "portals"))) {
					_.each(normalized.portals, entry => {
						let fromParsed = parseShardRoom(_.get(entry, "from"), normalized.origin_shard);
						let toParsed = parseShardRoom(_.get(entry, "to"), normalized.destination_shard);
						let fromPos = packPos(_.get(entry, ["from", "pos"]) || _.get(entry, ["from", "portal_pos"]) || entry.from, fromParsed.shard);

						if (!fromPos || !fromParsed.roomName || !toParsed.shard)
							return;

						portalEntries.push({
							from: {
								shard: fromPos.shard || fromParsed.shard,
								roomName: fromPos.roomName,
								pos: fromPos
							},
							to: {
								shard: toParsed.shard,
								roomName: toParsed.roomName || null
							},
							label: _.get(entry, "label", null)
						});
					});
				}

				let filteredEntries = [];
				_.each(portalEntries, entry => {
					if (entry && entry.from && entry.to && entry.from.pos)
						filteredEntries.push(entry);
				});

				normalized.portals = uniquePortalEntries(filteredEntries);

				return normalized;
			};

			let parsedColony = parseShardRoom(rmColony, Game.shard.name);
			if (!_.isString(parsedColony.roomName))
				return `[Console] Error: Invalid rmColony ${rmColony}.`;

			let colonyShard = parsedColony.shard;
			let colonyRoomName = parsedColony.roomName;

			if (colonyShard === Game.shard.name) {
				let colonyRoom = _.get(Game, ["rooms", colonyRoomName]);
				if (!colonyRoom || !_.get(colonyRoom, ["controller", "my"]))
					return `[Console] Error: rmColony ${colonyRoomName} is not under our control.`;
			}

			options = (options && typeof options === "object") ? options : {};

			let rallyShardHint = _.get(options, "rallyShard") || colonyShard;
			let destShardHint = _.get(options, "destShard") || colonyShard;

			let packedRally = packPos(rally_pos, rallyShardHint);
			let packedDest = packPos(dest_pos, destShardHint);

			if (!packedRally)
				return `[Console] Error: rally_pos must include x, y, roomName.`;
			if (!packedDest)
				return `[Console] Error: dest_pos must include x, y, roomName.`;

			let rallyShard = packedRally.shard || rallyShardHint;
			let destShard = packedDest.shard || destShardHint;

			let spawnRooms = options.spawnRooms;
			if (typeof spawnRooms === "string")
				spawnRooms = [spawnRooms];
			spawnRooms = normalizeRoomsArray(spawnRooms, colonyShard);

			let mission = {
				id: `scout:${colonyShard}/${colonyRoomName}:${destShard}/${packedDest.roomName}:${Game.time}`,
				colony: colonyRoomName,
				colony_shard: colonyShard,
				created: Game.time,
				rally_pos: packedRally,
				dest_pos: packedDest,
				custom: null,
				list_route: null,
				transfer_intent: null,
				portals: null,
				global: null,
				spawn_rooms: spawnRooms || null,
				creeps: [],
				spawned_total: 0,
				count: Math.max(1, _.get(options, "count", 1)),
				respawn: _.get(options, "respawn", true) !== false,
				wait_for_full_rally: _.get(options, "waitForFullRally") !== false,
				patrol_mode: null,
				rally_ready: false
			};

			let patrolMode = options.patrol_mode;
			patrolMode = _.includes(["station", "loop"], patrolMode) ? patrolMode : "station";
			mission.patrol_mode = patrolMode;

			let priority = _.get(options, "priority");
			let level = _.get(options, "level");
			let body = _.get(options, "body");
			let name = _.get(options, "name");
			mission.custom = {
				priority: priority,
				level: level,
				body: body,
				name: name
			};

			if (options.transfer_intent) {
				let transferIntent = normalizeTransferIntent(options.transfer_intent, {
					originShard: rallyShard,
					originRoom: packedRally.roomName,
					destinationShard: destShard,
					destinationRoom: packedDest.roomName
				});
				if (transferIntent) {
					mission.transfer_intent = transferIntent;
					if (_.isArray(transferIntent.portals) && transferIntent.portals.length > 0)
						mission.portals = transferIntent.portals;
				}
			}
			if (options.global)
				mission.global = _.cloneDeep(options.global);
			if (options.listRoute)
				mission.list_route = normalizeRoute(options.listRoute, colonyShard);

			if (!mission.list_route) {
				if (colonyShard !== destShard) {
					console.log(`[Scout] Warning: cross-shard scout mission ${mission.id} has no listRoute; please supply options.listRoute to guide portal approach.`);
				} else {
					let derivedRoute = [colonyRoomName];
					try {
						let routeResult = Game.map.findRoute(colonyRoomName, packedDest.roomName);
						if (_.isArray(routeResult)) {
							_.each(routeResult, step => {
								let lastRoom = _.last(derivedRoute);
								if (lastRoom !== step.room)
									derivedRoute.push(step.room);
							});
						} else if (routeResult === ERR_NO_PATH) {
							derivedRoute.push(packedDest.roomName);
						}
					} catch (err) {
						console.log(`[Scout] Warning: Unable to derive route for ${colonyRoomName} -> ${packedDest.roomName}; ${err}`);
					}
					if (_.last(derivedRoute) !== packedDest.roomName)
						derivedRoute.push(packedDest.roomName);
					mission.list_route = _.uniq(derivedRoute);
				}
			}

			if (_.isArray(options.portals) && options.portals.length > 0) {
				let extraIntent = normalizeTransferIntent({ portals: options.portals }, {
					originShard: rallyShard,
					originRoom: packedRally.roomName,
					destinationShard: destShard,
					destinationRoom: packedDest.roomName
				});
				if (extraIntent && _.isArray(extraIntent.portals)) {
					let combined = [];
					if (_.isArray(mission.portals))
						combined = combined.concat(mission.portals);
					combined = combined.concat(extraIntent.portals);
					combined = _.filter(combined, Boolean);
					combined = uniquePortalEntries(combined);
					if (combined.length > 0)
						mission.portals = combined;
				}
			}

			let requests = _.get(Memory, ["rooms", colonyRoomName, "scout_requests"], []);
			if (!_.isArray(requests))
				requests = [];

			requests.push(mission);
			_.set(Memory, ["rooms", colonyRoomName, "scout_requests"], requests);

			return `[Console] Scout mission ${mission.id} queued for ${colonyRoomName} -> ${packedDest.roomName}.`;
		};

		help_empire.push("empire.set_sign(message)")
		help_empire.push("empire.set_sign(message, rmName)")
		empire.set_sign = function (message, rmName) {
			/* Sorting algorithm for left -> right, top -> bottom (in SW sector!! Reverse sortBy() for other sectors...
				* Ensure quote.length == room.length!! Place in main.js

				let quote = [];
				let rooms = _.sortBy(_.sortBy(_.filter(Game.rooms,
					r => {return r.controller != null && r.controller.my}),
					r => {return 0 - r.name.substring(1).split("S")[0]}),
					r => {return r.name.substring(1).split("S")[1]});
				for (let i = 0; i < rooms.length; i++) {
					set_sign(quote[i], rooms[i].name);
				}
			*/

			if (rmName != null) {
				_.set(Memory, ["hive", "signs", rmName], message);
				return `[Console] Message for ${rmName} set.`;
			} else {
				_.set(Memory, ["hive", "signs", "default"], message);
				return `[Console] Default message set.`;
			}
		};

		help_empire.push("");
		help_empire.push("empire.upgrader_status(roomName)")
		empire.upgrader_status = function (roomName) {
			let room = Game.rooms[roomName];
			if (!room || !room.controller || !room.controller.my) {
				return `[Console] Error: Room ${roomName} not found or not controlled.`;
			}

			let upgraders = _.filter(Game.creeps, c => c.memory.role == "upgrader" && c.memory.room == roomName);
			let roomLevel = room.controller.level;
			let controllerProgress = room.controller.progress;
			let controllerProgressTotal = room.controller.progressTotal;

			// Calculate expected upgrader amount based on remote mining sources
			let remoteMiningSources = 0;
			let remote_mining = _.get(Memory, ["sites", "mining"]);
			let remoteRooms = [];
			if (remote_mining) {
				remoteRooms = _.filter(Object.keys(remote_mining), rem => { 
					return rem != roomName && _.get(remote_mining[rem], "colony") == roomName; 
				});
				_.each(remoteRooms, rem => { 
					remoteMiningSources += _.get(Memory, ["sites", "mining", rem, "survey", "source_amount"], 0); 
				});
			}
			
			let baseUpgraders = roomLevel >= 5 ? 1 : 0;
			let additionalUpgraders = Math.floor(remoteMiningSources / 2);
			let totalExpectedUpgraders = baseUpgraders + additionalUpgraders;

			console.log(`[Console] Upgrader Status for ${roomName}:`);
			console.log(`Room Level: ${roomLevel}, Controller Progress: ${controllerProgress}/${controllerProgressTotal}`);
			console.log(`Active Upgraders: ${upgraders.length}/${totalExpectedUpgraders}`);
			console.log(`Remote Mining: ${remoteRooms.length} rooms, ${remoteMiningSources} sources`);
			console.log(`Upgrader Calculation: Base(${baseUpgraders}) + Remote(${additionalUpgraders}) = ${totalExpectedUpgraders}`);
			
			if (upgraders.length > 0) {
				console.log(`Upgrader Details:`);
				_.each(upgraders, (creep, i) => {
					console.log(`  ${i+1}. ${creep.name} - Energy: ${creep.carry.energy || 0}/${creep.carryCapacity}, State: ${creep.memory.state}`);
				});
			}

			return `[Console] Upgrader status displayed for ${roomName}.`;
		};

		help_empire.push("empire.upgrader_force_spawn(roomName, amount)")
		empire.upgrader_force_spawn = function (roomName, amount) {
			let room = Game.rooms[roomName];
			if (!room || !room.controller || !room.controller.my) {
				return `[Console] Error: Room ${roomName} not found or not controlled.`;
			}

			_.set(Memory, ["rooms", roomName, "upgrader_force_spawn"], { amount: amount, timestamp: Game.time });
			return `[Console] Force spawn ${amount} upgraders in ${roomName} next tick.`;
		};

		help_empire.push("empire.upgrader_clear_force_spawn(roomName)")
		empire.upgrader_clear_force_spawn = function (roomName) {
			delete Memory.rooms[roomName].upgrader_force_spawn;
			return `[Console] Force spawn cleared for ${roomName}.`;
		};

		help_empire.push("");
		help_empire.push("empire.clear_deprecated_memory()")
		empire.clear_deprecated_memory = function () {

			_.each(Memory.rooms, r => {
				delete r.tasks;
				delete r.structures;
			});

			return `[Console] Deleted deprecated Memory objects.`;
		};

		help_empire.push("empire.highway_mining(rmColony, targetRoom, resourceType, [listRoute], [listSpawnAssistRooms], {customPopulation})");
		help_empire.push(" - resourceType: 'power', 'silicon', 'metal', 'biomass', 'mist'");
		help_empire.push(" - Deploys single extractor to harvest commodity in target room (auto-returns when full)");
		empire.highway_mining = function (rmColony, targetRoom, resourceType, listRoute, listSpawnAssistRooms, customPopulation) {
			if (rmColony == null || targetRoom == null || resourceType == null)
				return `[Console] Error, invalid entry for highway_mining(). Required: colony room, target room, resource type.`;

			// Validate resource type
			let validResources = ['power', 'silicon', 'metal', 'biomass', 'mist'];
			if (!validResources.includes(resourceType)) {
				return `[Console] Error, invalid resource type. Valid types: ${validResources.join(', ')}`;
			}

			// Generate unique ID for this highway mining operation (no resourceId)
			let highwayId = `highway_${targetRoom}_${resourceType}`;

			_.set(Memory, ["sites", "highway_mining", highwayId], {
				colony: rmColony,
				target_room: targetRoom,
				resource_type: resourceType,
				resource_id: null, // Will be set by first burrower
				list_route: listRoute,
				spawn_assist: listSpawnAssistRooms,
				population: customPopulation,
				state: "harvesting", // harvesting, completed
				operation_start: Game.time, // Track operation start time
				active_harvesters: []
			});
			
			let message = resourceType === "power" 
				? `Highway power mining operation created for ${resourceType} in ${targetRoom}. Deploys attackers, healers, and carriers. To cancel, delete the entry.`
				: `Highway commodity mining operation created for ${resourceType} in ${targetRoom}. Single extractor will auto-return when full. To cancel, delete the entry.`;
			return `[Console] ${message}`;
		};

		help_empire.push("empire.highway_status()");
		empire.highway_status = function () {
			let out = [];
			let mining = _.get(Memory, ["sites", "highway_mining"], {});
			for (let id in mining) {
				let data = mining[id];
				let creeps = _.filter(Game.creeps, c => c.memory.highway_id === id);
				let resource = Game.getObjectById(data.resource_id);
				let depositTicks = (resource && resource.ticksToDecay) ? resource.ticksToDecay : "?";
				let dropped = 0;
				if (data.colony && Game.rooms[data.colony]) {
					dropped = _.sum(Game.rooms[data.colony].find(FIND_DROPPED_RESOURCES, {
						filter: r => r.resourceType === data.resource_type
					}), r => r.amount);
				}
				out.push(
					`[${id}] State: ${data.state} | Resource: ${data.resource_type} | DepositTicks: ${depositTicks} | Creeps: ${creeps.length} | Replacement: ${data.replacement_queued ? "YES" : "no"} | Dropped: ${dropped}`
				);
			}
			if (out.length === 0) return "No highway mining operations active.";
			return out.join("\n");
		};

		help_empire.push("empire.highway_cleanup()");
		empire.highway_cleanup = function () {
			let highwayMining = Memory.sites.highway_mining;
			if (!highwayMining) return `[Console] No highway mining operations found.`;

			let cleaned = 0;
			_.each(highwayMining, (data, highwayId) => {
				if (data.state === "completed") {
					delete highwayMining[highwayId];
					cleaned++;
				}
			});
			
			return `[Console] Cleaned up ${cleaned} completed highway mining operations.`;
		};

		help_empire.push("empire.highway_reset(highwayId)");
		empire.highway_reset = function (highwayId) {
			let highwayMining = Memory.sites.highway_mining;
			if (!highwayMining || !highwayMining[highwayId]) {
				return `[Console] Highway operation ${highwayId} not found.`;
			}

			let data = highwayMining[highwayId];
			// Reset operation data but keep basic info
			data.resource_id = null;
			data.last_discovery = null;
			data.last_harvest = null;
			data.operation_start = Game.time;
			data.state = "harvesting";
			
			// Clear creep memory
			let creeps = _.filter(Game.creeps, c => c.memory.highway_id == highwayId);
			_.each(creeps, c => {
				delete c.memory.hasHarvested;
				delete c.memory.state;
				delete c.memory.task;
			});
			
			return `[Console] Reset highway operation ${highwayId}. Creeps will re-discover resources.`;
		};



		path = new Object();
		help_path.push("path.road(rmName, startX, startY, endX, endY)");

		path.road = function (rmName, startX, startY, endX, endY) {
			let room = Game.rooms[rmName];
			if (room == null)
				return `[Console] Error, ${rmName} not found.`;

			let from = new RoomPosition(startX, startY, rmName);
			let to = new RoomPosition(endX, endY, rmName);
			let path = room.findPath(from, to, { ignoreCreeps: true });
			for (let i = 0; i < path.length; i++)
				room.createConstructionSite(path[i].x, path[i].y, "road");
			room.createConstructionSite(startX, startY, "road");
			room.createConstructionSite(endX, endY, "road");

			return `[Console] Construction sites placed in ${rmName} for road from (${startX}, ${startY}) to (${endX}, ${endY}).`;
		};

		help_path.push("path.exit_tile(exit_pos)");

		path.exit_tile = function (exit_pos) {
			// Specifies preferred exit tiles to assist inter-room pathfinding
			if (!(exit_pos.x == 0 || exit_pos.x == 49 || exit_pos.y == 0 || exit_pos.y == 49)) {
				return `[Console] Invalid preferred exit tile position; must be an exit tile!`;
			}

			if (_.get(Memory, ["hive", "paths", "exits", "rooms", exit_pos.roomName]) == null)
				_.set(Memory, ["hive", "paths", "exits", "rooms", exit_pos.roomName], new Array());
			Memory["hive"]["paths"]["exits"]["rooms"][exit_pos.roomName].push(exit_pos);
			return `[Console] Preferred exit tile position added to Memory.hive.paths.exits.rooms.${exit_pos.roomName}`;
		};

		help_path.push("path.exit_area(roomName, startX, startY, endX, endY)");

		path.exit_area = function (room_name, start_x, start_y, end_x, end_y) {
			for (let x = start_x; x <= end_x; x++) {
				for (let y = start_y; y <= end_y; y++) {
					path.exit_tile(new RoomPosition(x, y, room_name));
				}
			}

			return `[Console] Preferred exit tile position added to Memory.hive.paths.exits.rooms.${room_name}`;
		};

		help_path.push("path.prefer(prefer_pos)");

		path.prefer = function (prefer_pos) {
			// Lowers the cost of specific tiles (e.g. swamp), so creeps take shorter paths through swamps rather than ERR_NO_PATH
			if (_.get(Memory, ["hive", "paths", "prefer", "rooms", prefer_pos.roomName]) == null)
				_.set(Memory, ["hive", "paths", "prefer", "rooms", prefer_pos.roomName], new Array());
			Memory["hive"]["paths"]["prefer"]["rooms"][prefer_pos.roomName].push(prefer_pos);
			return `[Console] Preference position added to Memory.hive.paths.prefer.rooms.${prefer_pos.roomName}`;
		};

		help_path.push("path.prefer_area(roomName, startX, startY, endX, endY)");

		path.prefer_area = function (room_name, start_x, start_y, end_x, end_y) {
			if (_.get(Memory, ["hive", "paths", "prefer", "rooms", room_name]) == null)
				_.set(Memory, ["hive", "paths", "prefer", "rooms", room_name], new Array());

			for (let x = start_x; x <= end_x; x++) {
				for (let y = start_y; y <= end_y; y++) {
					Memory["hive"]["paths"]["prefer"]["rooms"][room_name].push(new RoomPosition(x, y, room_name));
				}
			}

			return `[Console] Preference positions added to Memory.hive.paths.prefer.rooms.${room_name}`;
		};

		help_path.push("path.avoid(avoid_pos)");

		path.avoid = function (avoid_pos) {
			if (_.get(Memory, ["hive", "paths", "avoid", "rooms", avoid_pos.roomName]) == null)
				_.set(Memory, ["hive", "paths", "avoid", "rooms", avoid_pos.roomName], new Array());
			Memory["hive"]["paths"]["avoid"]["rooms"][avoid_pos.roomName].push(avoid_pos);
			return `[Console] Avoid position added to Memory.hive.paths.avoid.rooms.${avoid_pos.roomName}`;
		};

		help_path.push("path.avoid_area(roomName, startX, startY, endX, endY)");

		path.avoid_area = function (room_name, start_x, start_y, end_x, end_y) {
			if (_.get(Memory, ["hive", "paths", "avoid", "rooms", room_name]) == null)
				_.set(Memory, ["hive", "paths", "avoid", "rooms", room_name], new Array());

			for (let x = start_x; x <= end_x; x++) {
				for (let y = start_y; y <= end_y; y++) {
					Memory["hive"]["paths"]["avoid"]["rooms"][room_name].push(new RoomPosition(x, y, room_name));
				}
			}

			return `[Console] Avoid positions added to Memory.hive.paths.avoid.rooms.${room_name}`;
		};

		help_path.push("path.avoid_radius(roomName, centerX, centerY, radius)");

		path.avoid_radius = function (room_name, center_x, center_y, radius) {
			if (_.get(Memory, ["hive", "paths", "avoid", "rooms", room_name]) == null)
				_.set(Memory, ["hive", "paths", "avoid", "rooms", room_name], new Array());

			for (let x = Math.max(center_x - radius, 0); x <= Math.min(center_x + radius, 49); x++) {
				for (let y = Math.max(center_y - radius, 0); y <= Math.min(center_y + radius, 49); y++) {
					Memory["hive"]["paths"]["avoid"]["rooms"][room_name].push(new RoomPosition(x, y, room_name));
				}
			}

			return `[Console] Avoid positions added to Memory.hive.paths.avoid.rooms.${room_name}`;
		};

		help_path.push("path.reset(roomName)");

		path.reset = function (room_name) {
			delete Memory["hive"]["paths"]["avoid"]["rooms"][room_name];
			delete Memory["hive"]["paths"]["prefer"]["rooms"][room_name];
			delete Memory["hive"]["paths"]["exits"]["rooms"][room_name];
			return `[Console] Path modifiers reset for ${room_name}`;
		};


		visuals = new Object();
		help_visuals.push("visuals.toggle_path()");

		visuals.toggle_path = function () {
			if (_.get(Memory, ["hive", "visuals", "show_path"], false) == true)
				_.set(Memory, ["hive", "visuals", "show_path"], false)
			else
				_.set(Memory, ["hive", "visuals", "show_path"], true)

			return `[Console] Visuals for paths toggled to be shown: ${_.get(Memory, ["hive", "visuals", "show_path"], false)}`;
		};

		help_visuals.push("visuals.toggle_repair()");

		visuals.toggle_repair = function () {
			if (_.get(Memory, ["hive", "visuals", "show_repair"], false) == true)
				_.set(Memory, ["hive", "visuals", "show_repair"], false)
			else
				_.set(Memory, ["hive", "visuals", "show_repair"], true)

			return `[Console] Visuals for repairs toggled to be shown: ${_.get(Memory, ["hive", "visuals", "show_repair"], false)}`;
		};

		help_visuals.push("visuals.toggle_speech()");
		visuals.toggle_speech = function () {
			if (_.get(Memory, ["hive", "visuals", "show_speech"], false) == true)
				_.set(Memory, ["hive", "visuals", "show_speech"], false)
			else
				_.set(Memory, ["hive", "visuals", "show_speech"], true)

			return `[Console] Visuals for speech toggled to be shown: ${_.get(Memory, ["hive", "visuals", "show_speech"], false)}`;
		};

		help_visuals.push("visuals.set_performance(ticks)");
		help_visuals.push(" - Sets the update interval for expensive visualizations");
		help_visuals.push(" - ticks: how often to update visuals (default 5, higher = less CPU)");
		help_visuals.push(" - Example: visuals.set_performance(10) for updates every 10 ticks");

		visuals.set_performance = function (ticks) {
			if (ticks < 1) ticks = 1;
			if (ticks > 50) ticks = 50;
			_.set(Memory, ["hive", "visuals", "update_interval"], ticks);
			return `[Console] Visual performance set to update every ${ticks} ticks.`;
		};

		help_visuals.push("visuals.get_performance()");
		help_visuals.push(" - Shows current visual performance settings");

		visuals.get_performance = function () {
			const interval = _.get(Memory, ["hive", "visuals", "update_interval"], 5);
			const cpuUsed = Game.cpu.getUsed();
			const cpuLimit = Game.cpu.limit;
			const cpuPercent = (cpuUsed / cpuLimit * 100).toFixed(1);
			
			console.log(`[Visuals] Performance Settings:`);
			console.log(`  Update Interval: ${interval} ticks`);
			console.log(`  Current CPU: ${cpuUsed.toFixed(2)}/${cpuLimit} (${cpuPercent}%)`);
			console.log(`  Status: ${cpuPercent > 80 ? "⚠️ High" : cpuPercent > 60 ? "⚡ Medium" : "✅ Good"}`);
			
			return `[Console] Visual performance status displayed.`;
		};

		help_visuals.push("visuals.clear_cache()");
		help_visuals.push(" - Clears all visual caches to force fresh calculations");

		visuals.clear_cache = function () {
			if (Stats_Visual._cache) {
				Stats_Visual._cache = {
					statusBarStats: {},
					sourceOverlays: {},
					creepCounts: {},
					lastUpdate: 0,
					cacheDuration: 5
				};
			}
			return `[Console] Visual cache cleared.`;
		};
		pause = new Object();

		help_pause.push("pause.mineral_extraction()")
		pause.mineral_extraction = function () {
			_.set(Memory, ["hive", "pause", "extracting"], true);
			return `[Console] Pausing mineral extraction- delete Memory.hive.pause.extracting to resume.`;
		};

		help_pause.push("pause.refill_bucket()")
		pause.refill_bucket = function () {
			_.set(Memory, ["hive", "pause", "bucket"], true);
			return `[Console] Pausing main.js to refill bucket.`;
		};


		pixels = new Object();

		help_pixels.push("pixels.status()");
		help_pixels.push(" - Shows pixel generation statistics and current settings");
		help_pixels.push(" - Displays total pixels generated, generation rate, CPU threshold");

		pixels.status = function () {
			let enabled = _.get(Memory, ["hive", "pixels", "enabled"], true);
			let cpuThreshold = _.get(Memory, ["hive", "pixels", "cpu_threshold"], 0.8);
			let stats = _.get(Memory, ["hive", "pixels", "stats"], null);
			
			let cpuUsed = Game.cpu.getUsed();
			let cpuLimit = Game.cpu.limit;
			let cpuPercent = (cpuUsed / cpuLimit * 100).toFixed(1);
			let bucket = Game.cpu.bucket;
			
			// CSS styles for table
			let tableStyle = "style=\"border-collapse: collapse; border: 1px solid #666; margin: 5px 0;\"";
			let cellStyle = "style=\"border: 1px solid #666; padding: 8px 12px; text-align: left;\"";
			let headerStyle = "style=\"border: 1px solid #666; padding: 8px 12px; text-align: left; background-color: #444; color: #FFD700; font-weight: bold;\"";
			
			console.log(`[Pixels] Pixel Generation Status:`);
			
			let statusTable = ``;
			statusTable += `	Setting		Value		Status	`;
			statusTable += `	Enabled		${enabled}		${enabled ? "✓ Active" : "✗ Disabled"}	`;
			statusTable += `	CPU Threshold		${(cpuThreshold * 100).toFixed(0)}%		${cpuPercent < (cpuThreshold * 100) ? "✓ Below" : "⚠ Above"}	`;
			statusTable += `	Current CPU		${cpuPercent}%		${cpuUsed.toFixed(2)}/${cpuLimit}	`;
			statusTable += `	CPU Bucket		${bucket}		${bucket >= 10000 ? "✓ Full" : "⚠ " + bucket + "/10000"}	`;
			statusTable += ``;
			console.log(statusTable);
			
			if (stats) {
				let totalGenerated = stats.total_generated || 0;
				let lastGenerated = stats.last_generated || 0;
				let history = stats.generation_history || [];
				
				let generationRate = "N/A";
				if (history.length >= 2) {
					let timeSpan = history[history.length - 1] - history[0];
					let pixelsInSpan = history.length;
					if (timeSpan > 0) {
						let ticksPerPixel = timeSpan / pixelsInSpan;
						generationRate = `${ticksPerPixel.toFixed(0)} ticks/pixel`;
					}
				}
				
				let timeSinceLastPixel = lastGenerated > 0 ? (Game.time - lastGenerated) : "Never";
				
				console.log(`[Pixels] Statistics:`);
				let statsTable = ``;
				statsTable += `	Metric		Value	`;
				statsTable += `	Total Pixels Generated		${totalGenerated}	`;
				statsTable += `	Last Generated		${lastGenerated > 0 ? "Tick " + lastGenerated : "Never"}	`;
				statsTable += `	Time Since Last Pixel		${timeSinceLastPixel !== "Never" ? timeSinceLastPixel + " ticks ago" : "Never"}	`;
				statsTable += `	Generation Rate		${generationRate}	`;
				statsTable += ``;
				console.log(statsTable);
			} else {
				console.log(`[Pixels] Statistics: No pixels generated yet.`);
			}
			
			// Recommendation
			if (enabled && bucket >= 10000 && cpuPercent >= (cpuThreshold * 100)) {
				console.log(`[Pixels] ⚠ Recommendation: CPU usage (${cpuPercent}%) is above threshold (${(cpuThreshold * 100).toFixed(0)}%). Pixels will not generate until CPU usage decreases. Consider increasing threshold with pixels.set_threshold().`);
			} else if (!enabled) {
				console.log(`[Pixels] Note: Pixel generation is disabled. Use pixels.enable() to start generating.`);
			} else if (bucket < 10000) {
				console.log(`[Pixels] Note: Bucket must be full (10,000) to generate pixels. Current: ${bucket}.`);
			} else {
				console.log(`[Pixels] ✓ Status: All conditions met for pixel generation!`);
			}
			
			return `[Pixels] Pixel status displayed.`;
		};

		help_pixels.push("pixels.enable()");
		help_pixels.push(" - Enables automatic pixel generation");

		pixels.enable = function () {
			_.set(Memory, ["hive", "pixels", "enabled"], true);
			return `[Pixels] Pixel generation enabled.`;
		};

		help_pixels.push("pixels.disable()");
		help_pixels.push(" - Disables automatic pixel generation");

		pixels.disable = function () {
			_.set(Memory, ["hive", "pixels", "enabled"], false);
			return `[Pixels] Pixel generation disabled.`;
		};

		help_pixels.push("pixels.set_threshold(percent)");
		help_pixels.push(" - Sets the maximum CPU usage threshold for pixel generation");
		help_pixels.push(" - percent: 0-100, pixels only generate when CPU usage is below this");
		help_pixels.push(" - Default is 80%. Lower = more conservative, higher = more pixels");
		help_pixels.push(" - Example: pixels.set_threshold(70) for 70% threshold");

		pixels.set_threshold = function (percent) {
			if (percent == null || percent < 0 || percent > 100) {
				return `[Pixels] Error: Threshold must be between 0 and 100.`;
			}
			_.set(Memory, ["hive", "pixels", "cpu_threshold"], percent / 100);
			return `[Pixels] CPU threshold set to ${percent}%. Pixels will only generate when CPU usage is below this level.`;
		};

		help_pixels.push("pixels.reset_stats()");
		help_pixels.push(" - Resets pixel generation statistics (does not affect settings)");

		pixels.reset_stats = function () {
			_.set(Memory, ["hive", "pixels", "stats"], {
				total_generated: 0,
				last_generated: 0,
				generation_history: []
			});
			return `[Pixels] Pixel statistics reset.`;
		};

		shards = new Object();

		help_shards.push("shards.help()");
		help_shards.push(" - Print a quick reference to shard commands");
		shards.help = function () {
			return `[Shards] Commands: shards.status(), shards.requests(), shards.global(), shards.set_primary(). Use help("shards") for full descriptions.`;
		};

		help_shards.push("shards.status(shardName?)");
		help_shards.push(" - Show local shard pulse and remote shard summaries (optional shardName)");
		shards.status = function (targetShard) {
			if (typeof ShardMemory === "undefined") {
				return `[Shards] Inter-shard interface not initialized.`;
			}

			let payload = ShardMemory.getLocalPayload();
			let role = _.get(payload, ["summary", "role"], ShardMemory.isPrimaryShard() ? "primary" : "follower");
			let primaryShard = ShardMemory.getPrimaryShardName();

			let lines = new Array();
			lines.push(`[Shards] Local shard ${Game.shard.name} (${role})`);
			lines.push(`  Primary shard: ${primaryShard}`);
			lines.push(`  Heartbeat: ${payload.heartbeat} (summary tick ${_.get(payload, ["summary", "tick"], "n/a")})`);
			lines.push(`  Local globals: ${_.size(_.get(payload, ["global", "creeps"], {}))}`);
			lines.push(`  Queues (R/C/M): ${_.size(_.get(payload, ["queues", "resource"], []))}/${_.size(_.get(payload, ["queues", "creep"], []))}/${_.size(_.get(payload, ["queues", "mission"], []))}`);

			if (targetShard) {
				let remote = ShardMemory.readRemote(targetShard);
				if (!remote) {
					lines.push(`  No payload detected for ${targetShard}.`);
				} else {
					lines.push(`  -- Remote ${targetShard} --`);
					lines.push(`    Heartbeat: ${remote.heartbeat} (tick ${_.get(remote, ["summary", "tick"], "n/a")})`);
					lines.push(`    Role: ${_.get(remote, ["summary", "role"], "unknown")}`);
					lines.push(`    Globals: ${_.size(_.get(remote, ["global", "creeps"], {}))}`);
					lines.push(`    Queues (R/C/M): ${_.size(_.get(remote, ["queues", "resource"], []))}/${_.size(_.get(remote, ["queues", "creep"], []))}/${_.size(_.get(remote, ["queues", "mission"], []))}`);
				}
			} else if (ShardMemory.isPrimaryShard()) {
				let remotes = _.get(Memory, ["hive", "ism", "primary_snapshot", "remoteSummaries"], {});
				if (_.size(remotes) === 0) {
					lines.push(`  No remote shard summaries captured yet.`);
				} else {
					lines.push(`  Remote shard summaries:`);
					_.each(remotes, (summary, shardName) => {
						let queues = _.get(summary, "queues", {});
						lines.push(`    ${shardName}: heartbeat ${summary.heartbeat}, globals ${_.get(summary, ["summary", "global_local"], "n/a")}, queues ${_.get(queues, "resource", 0)}/${_.get(queues, "creep", 0)}/${_.get(queues, "mission", 0)}`);
					});
				}
			} else {
				let follower = _.get(Memory, ["hive", "ism", "follower_snapshot"]);
				if (follower) {
					lines.push(`  Primary heartbeat: ${_.get(follower, "heartbeat", "n/a")} (tick ${_.get(follower, ["summary", "tick"], "n/a")})`);
					if (_.get(follower, "directive")) {
						lines.push(`  Active directive: ${JSON.stringify(_.get(follower, "directive"))}`);
					}
				} else {
					lines.push(`  No data from primary yet.`);
				}
			}

			return lines.join("\n");
		};

		help_shards.push("shards.requests(type?)");
		help_shards.push(" - Inspect pending inter-shard requests (resource|creep|mission)");
		shards.requests = function (type) {
			if (typeof ShardMemory === "undefined") {
				return `[Shards] Inter-shard interface not initialized.`;
			}

			let validTypes = ["resource", "creep", "mission"];
			let filters = validTypes;
			if (type != null) {
				type = type.toString().toLowerCase();
				if (!_.includes(validTypes, type)) {
					return `[Shards] Unknown request type "${type}". Use resource, creep, or mission.`;
				}
				filters = [type];
			}

			let lines = new Array();
			if (ShardMemory.isPrimaryShard()) {
				let snapshot = _.get(Memory, ["hive", "ism", "primary_snapshot", "requests"]);
				lines.push(`[Shards] Aggregated remote requests (primary view)`);
				if (!snapshot) {
					lines.push("  No requests recorded yet.");
				} else {
					_.each(filters, queue => {
						let items = _.get(snapshot, queue, []);
						lines.push(`  ${queue}: ${items.length} pending`);
						_.each(_.take(items, 10), item => {
							let origin = _.get(item, "shard", "unknown");
							lines.push(`    ${origin}: ${JSON.stringify(_.omit(item, "shard"))}`);
						});
						if (items.length > 10)
							lines.push(`    ... ${items.length - 10} more`);
					});
				}
			} else {
				let payload = ShardMemory.getLocalPayload();
				lines.push(`[Shards] Local outbound requests`);
				_.each(filters, queue => {
					let items = _.get(payload, ["queues", queue], []);
					lines.push(`  ${queue}: ${items.length} queued`);
					_.each(_.take(items, 10), item => {
						lines.push(`    ${JSON.stringify(item)}`);
					});
					if (items.length > 10)
						lines.push(`    ... ${items.length - 10} more`);
				});
			}

			return lines.join("\n");
		};

		help_shards.push("shards.global(creepName?)");
		help_shards.push(" - List known global creeps or inspect a specific creep");
		shards.global = function (creepName) {
			if (typeof ShardMemory === "undefined") {
				return `[Shards] Inter-shard interface not initialized.`;
			}

			let manifest = {};
			let localPayload = ShardMemory.getLocalPayload();
			_.each(_.get(localPayload, ["global", "creeps"], {}), (descriptor, name) => {
				manifest[name] = _.assign({ shard: Game.shard.name }, descriptor);
			});

			if (ShardMemory.isPrimaryShard()) {
				let aggregated = _.get(Memory, ["hive", "ism", "primary_snapshot", "globalManifest"], {});
				_.assign(manifest, aggregated);
			} else {
				let primaryPayload = ShardMemory.readPrimary();
				if (primaryPayload) {
					_.each(_.get(primaryPayload, ["global", "creeps"], {}), (descriptor, name) => {
						manifest[name] = _.assign({ shard: ShardMemory.getPrimaryShardName() }, descriptor);
					});
				}
			}

			if (creepName != null) {
				let info = manifest[creepName];
				if (!info) {
					return `[Shards] Global creep ${creepName} not found.`;
				}
				return `[Shards] ${creepName}\n${JSON.stringify(info, null, 2)}`;
			}

			let entries = Object.entries(manifest);
			let lines = new Array();
			lines.push(`[Shards] Known global creeps: ${entries.length}`);

			if (entries.length === 0) {
				return lines.join("\n");
			}

			_.each(_.take(entries, 12), ([name, info]) => {
				lines.push(`  ${name}: ${info.status || "unknown"} | shard ${info.shard || "?"} | room ${info.room || _.get(info, ["target", "room"], "?")} | ttl ${_.get(info, "ttl", "?")} | mission ${info.mission || "?"}`);
			});

			if (entries.length > 12) {
				lines.push(`  ... ${entries.length - 12} more (use shards.global("name"))`);
			}

			return lines.join("\n");
		};

		help_shards.push("shards.set_primary(shardName)");
		help_shards.push(" - Update the designated primary shard (defaults to shard0)");
		shards.set_primary = function (shardName) {
			if (!_.isString(shardName) || shardName.length === 0) {
				return `[Shards] Provide a shard name, e.g. shards.set_primary('shard0').`;
			}
			if (typeof ShardMemory === "undefined") {
				return `[Shards] Inter-shard interface not initialized.`;
			}
			ShardMemory.setPrimaryShardName(shardName);
			return `[Shards] Primary shard set to ${shardName}.`;
		};

		// Primary-shard mission registry commands (Option A)
		help_shards.push("shards.mission(creepName)");
		help_shards.push(" - Inspect the authoritative mission for a creep (primary shard)");
		shards.mission = function (creepName) {
			if (!creepName)
				return `[Shards] Provide a creep name: shards.mission('MyCreep')`;
			if (typeof ShardMemory === "undefined")
				return `[Shards] Inter-shard interface not initialized.`;
			var mission = ShardMemory.getMission(creepName);
			if (!mission)
				return `[Shards] No mission found for ${creepName} on primary.`;
			console.log(`[Shards] Mission for ${creepName}:\n` + JSON.stringify(mission, null, 2));
			return `[Shards] Mission displayed for ${creepName}.`;
		};

		help_shards.push("shards.missions(limit?)");
		help_shards.push(" - List missions registered on the primary shard (default limit 12)");
		shards.missions = function (limit) {
			if (typeof ShardMemory === "undefined")
				return `[Shards] Inter-shard interface not initialized.`;
			var primary = ShardMemory.readPrimary();
			if (!primary)
				return `[Shards] No primary payload available.`;
			var missions = _.get(primary, "missions", {});
			var names = Object.keys(missions);
			var max = parseInt(limit) || 12;
			console.log(`[Shards] Missions on primary: ${names.length}`);
			_.each(_.take(names, max), function (name) {
				var m = missions[name] || {};
				console.log(`  ${name}: role=${_.get(m, 'role', 'unknown')} mission=${_.get(m, 'mission', 'unknown')} shard=${_.get(m, 'current_shard', _.get(m, ['origin','shard'], 'n/a'))} updated=${_.get(m, 'updated', 'n/a')}`);
			});
			if (names.length > max)
				console.log(`  ... ${names.length - max} more`);
			return `[Shards] Listed ${Math.min(names.length, max)} mission(s).`;
		};

		help_shards.push("shards.set_mission(creepName, mission)");
		help_shards.push(" - Set/replace the authoritative mission for a creep (primary only)");
		shards.set_mission = function (creepName, mission) {
			if (!creepName || typeof mission !== "object")
				return `[Shards] Usage: shards.set_mission('MyCreep', { role: 'worker', mission: 'assist', origin: { shard: 'shard0', room: 'E1N1' } })`;
			if (typeof ShardMemory === "undefined")
				return `[Shards] Inter-shard interface not initialized.`;
			if (!ShardMemory.isPrimaryShard()) {
				console.log(`[Shards] Warning: set_mission should be run on the primary shard (${ShardMemory.getPrimaryShardName()}).`);
			}
			// Minimal normalization
			mission = _.assign({}, mission, { updated: Game.time });
			ShardMemory.registerMission(creepName, mission);
			return `[Shards] Mission registered for ${creepName}.`;
		};

		help_shards.push("shards.remove_mission(creepName)");
		help_shards.push(" - Remove the mission entry for a creep (primary only)");
		shards.remove_mission = function (creepName) {
			if (!creepName)
				return `[Shards] Provide a creep name: shards.remove_mission('MyCreep')`;
			if (typeof ShardMemory === "undefined")
				return `[Shards] Inter-shard interface not initialized.`;
			if (!ShardMemory.isPrimaryShard()) {
				console.log(`[Shards] Warning: remove_mission should be run on the primary shard (${ShardMemory.getPrimaryShardName()}).`);
			}
			ShardMemory.removeMission(creepName);
			return `[Shards] Mission removed for ${creepName}.`;
		};

		// Scout mission diagnostics
		scouts = new Object();
		help_scouts.push("scouts.status(requestId?)");
		help_scouts.push(" - Show status of scout missions (optional requestId for specific mission)");
		help_scouts.push(" - Displays active scouts, patrol state, shard locations, and mission details");
		scouts.status = function (requestId) {
			if (typeof Control === "undefined") {
				return `[Scouts] Control system not initialized.`;
			}

			let allRequests = {};
			let totalScouts = 0;
			let totalRequests = 0;

			// Collect all scout requests
			for (let roomName in Memory.rooms) {
				let requests = _.get(Memory, ["rooms", roomName, "scout_requests"]);
				if (_.isArray(requests) && requests.length > 0) {
					for (let i = 0; i < requests.length; i++) {
						let req = requests[i];
						if (!req || (requestId && req.id !== requestId))
							continue;
						
						totalRequests++;
						let reqId = req.id || `unknown_${totalRequests}`;
						allRequests[reqId] = {
							request: req,
							colony: roomName
						};
					}
				}
			}

			if (requestId && Object.keys(allRequests).length === 0) {
				return `[Scouts] No scout request found with ID: ${requestId}`;
			}

			let lines = [];
			lines.push(`[Scouts] Scout Mission Status (Tick ${Game.time})`);
			lines.push("");

			for (let reqId in allRequests) {
				let reqData = allRequests[reqId];
				let req = reqData.request;
				let colony = reqData.colony;

				lines.push(`Request ID: ${reqId}`);
				lines.push(`  Colony: ${colony}`);
				lines.push(`  Patrol Mode: ${req.patrol_mode || "station"}`);
				lines.push(`  Count: ${req.count || 1} (Active: ${req.active || 0}, Remote: ${req.remote_count || 0})`);
				lines.push(`  Respawn: ${req.respawn !== false ? "Yes" : "No"}`);
				lines.push(`  Rally Ready: ${req.rally_ready ? "Yes" : "No"}`);
				lines.push(`  Rally Release: ${req.rally_release ? "Yes" : "No"}`);

				if (req.rally_pos) {
					let rallyShard = _.get(req.rally_pos, "shard", Game.shard.name);
					lines.push(`  Rally: ${req.rally_pos.roomName} (${req.rally_pos.x},${req.rally_pos.y}) [${rallyShard}]`);
				}
				if (req.dest_pos) {
					let destShard = _.get(req.dest_pos, "shard", Game.shard.name);
					lines.push(`  Destination: ${req.dest_pos.roomName} (${req.dest_pos.x},${req.dest_pos.y}) [${destShard}]`);
				}

				// List active creeps
				let creeps = _.get(req, "creeps", []);
				if (creeps.length > 0) {
					lines.push(`  Active Scouts (${creeps.length}):`);
					for (let i = 0; i < creeps.length; i++) {
						let creepName = creeps[i];
						let creep = Game.creeps[creepName];
						if (creep) {
							let patrolState = _.get(creep.memory, "scout_patrol_state", "unknown");
							let shard = Game.shard.name;
							let room = creep.room.name;
							let ttl = creep.ticksToLive;
							lines.push(`    - ${creepName}: ${room} [${shard}], state=${patrolState}, TTL=${ttl}`);
						} else {
							lines.push(`    - ${creepName}: not found`);
						}
					}
				}

				// List remote creeps
				let remoteCreeps = _.get(req, "remote_creeps", {});
				let remoteNames = Object.keys(remoteCreeps);
				if (remoteNames.length > 0) {
					lines.push(`  Remote Scouts (${remoteNames.length}):`);
					let globalState = Control.getGlobalCreepState();
					for (let i = 0; i < remoteNames.length; i++) {
						let creepName = remoteNames[i];
						let lastSeen = remoteCreeps[creepName];
						let isAlive = Control.isCreepTrackedGlobally(creepName, globalState);
						let status = isAlive ? "alive" : "dead";
						lines.push(`    - ${creepName}: ${status}, last seen ${Game.time - lastSeen} ticks ago`);
					}
				}

				lines.push("");
			}

			if (Object.keys(allRequests).length === 0) {
				lines.push("No active scout requests found.");
			}

			console.log(lines.join("\n"));
			return `[Scouts] Status displayed for ${Object.keys(allRequests).length} request(s).`;
		};

		help_scouts.push("scouts.debug(level)");
		help_scouts.push(" - Set debug logging level for scouts");
		help_scouts.push(" - level: 0 = none, 1 = errors/state changes, 2 = +movement/portals, 3 = full verbose");
		help_scouts.push(" - Example: scouts.debug(2) for movement and portal logging");
		scouts.debug = function (level) {
			if (level === undefined || level === null) {
				let currentLevel = _.get(Memory, ["hive", "debug", "scout"], 0);
				return `[Scouts] Current debug level: ${currentLevel} (0=none, 1=errors, 2=movement, 3=verbose)`;
			}
			level = parseInt(level);
			if (isNaN(level) || level < 0 || level > 3) {
				return `[Scouts] Invalid debug level. Use 0-3.`;
			}
			_.set(Memory, ["hive", "debug", "scout"], level);
			let levelNames = ["none", "errors/state", "movement/portals", "verbose"];
			return `[Scouts] Debug level set to ${level} (${levelNames[level]}).`;
		};

		help_scouts.push("scouts.trace(creepName)");
		help_scouts.push(" - Show detailed trace for specific scout");
		help_scouts.push(" - Displays current state, memory, position, and mission details");
		scouts.trace = function (creepName) {
			if (!creepName) {
				return `[Scouts] Please provide a creep name.`;
			}
			let creep = Game.creeps[creepName];
			if (!creep) {
				return `[Scouts] Creep ${creepName} not found.`;
			}
			if (creep.memory.role !== "scout") {
				return `[Scouts] ${creepName} is not a scout.`;
			}

			let output = [];
			output.push(`[Scouts] Trace for ${creepName}:`);
			output.push(`Position: ${creep.pos.x},${creep.pos.y} in ${creep.room.name} (shard: ${Game.shard.name})`);
			output.push(`TTL: ${creep.ticksToLive}`);
			output.push(`Role: ${creep.memory.role}`);
			output.push(`Colony: ${creep.memory.colony || "none"}`);
			output.push(`Mission ID: ${creep.memory.scout_request_id || "none"}`);
			output.push(`Patrol Mode: ${creep.memory.patrol_mode || "station"}`);
			output.push(`Patrol State: ${creep.memory.scout_patrol_state || "none"}`);
			output.push(`Dest Reached: ${creep.memory.scout_dest_reached || false}`);
			output.push(`Rally Reached: ${creep.memory.scout_rally_reached || false}`);
			output.push(`Transfer Recorded: ${creep.memory._scout_transfer_recorded || false}`);
			output.push(`Restored: ${creep.memory._scout_restored || false}`);
			
			if (creep.memory.rally_pos) {
				let rp = creep.memory.rally_pos;
				output.push(`Rally: ${rp.shard || Game.shard.name}/${rp.roomName} (${rp.x},${rp.y})`);
			}
			if (creep.memory.dest_pos) {
				let dp = creep.memory.dest_pos;
				output.push(`Destination: ${dp.shard || Game.shard.name}/${dp.roomName} (${dp.x},${dp.y})`);
			}
			
			let pathDest = _.get(creep.memory, ["path", "destination"]);
			if (pathDest) {
				output.push(`Path Destination: ${pathDest.roomName} (${pathDest.x},${pathDest.y})`);
			}

			console.log(output.join("\n"));
			return `[Scouts] Trace complete for ${creepName}.`;
		};

		help_scouts.push("scouts.state(creepName)");
		help_scouts.push(" - Show current state and memory for scout");
		help_scouts.push(" - Compact version of trace() focused on state information");
		scouts.state = function (creepName) {
			if (!creepName) {
				return `[Scouts] Please provide a creep name.`;
			}
			let creep = Game.creeps[creepName];
			if (!creep) {
				return `[Scouts] Creep ${creepName} not found.`;
			}
			if (creep.memory.role !== "scout") {
				return `[Scouts] ${creepName} is not a scout.`;
			}

			let state = {
				position: `${creep.pos.x},${creep.pos.y}@${creep.room.name}`,
				shard: Game.shard.name,
				patrol_mode: creep.memory.patrol_mode || "station",
				patrol_state: creep.memory.scout_patrol_state || "none",
				dest_reached: creep.memory.scout_dest_reached || false,
				rally_reached: creep.memory.scout_rally_reached || false,
				transfer_recorded: creep.memory._scout_transfer_recorded || false,
				restored: creep.memory._scout_restored || false
			};

			return `[Scouts] ${creepName} state: ${JSON.stringify(state)}`;
		};

		help_scouts.push("scouts.movement(creepName)");
		help_scouts.push(" - Show movement history for scout (last 10 ticks)");
		help_scouts.push(" - Requires movement tracking to be enabled");
		scouts.movement = function (creepName) {
			if (!creepName) {
				return `[Scouts] Please provide a creep name.`;
			}
			let creep = Game.creeps[creepName];
			if (!creep) {
				return `[Scouts] Creep ${creepName} not found.`;
			}
			if (creep.memory.role !== "scout") {
				return `[Scouts] ${creepName} is not a scout.`;
			}

			let history = _.get(creep.memory, "_scout_movement_history", []);
			if (history.length === 0) {
				return `[Scouts] No movement history available for ${creepName}. Movement tracking may not be enabled.`;
			}

			let output = [];
			output.push(`[Scouts] Movement history for ${creepName} (last ${Math.min(10, history.length)} ticks):`);
			let recent = history.slice(-10);
			_.each(recent, (entry, idx) => {
				output.push(`Tick ${entry.tick}: ${entry.action} at ${entry.pos.x},${entry.pos.y}@${entry.room}`);
			});

			console.log(output.join("\n"));
			return `[Scouts] Movement history displayed for ${creepName}.`;
		};


	/* ***********************************************************
	 *	SHARD COMMANDS (Multi-Shard Coordination)
	 * *********************************************************** */
	
	help_shard = new Array();
	help_shard.push(`Multi-Shard Commands:`);
	
	global.shard = new Object();
	
	help_shard.push("shard.status(shardName, detailed)");
	help_shard.push(" - Display status of all shards or specific shard");
	help_shard.push(" - shardName: Optional, show specific shard only");
	help_shard.push(" - detailed: Optional, show detailed metrics (default: false)");
	
	shard.status = function(shardName, detailed = false) {
		if (shardName) {
			// Show specific shard
			let status = ShardCoordinator.getShardStatus(shardName);
			if (!status) {
				return `[Shard] Error: Shard ${shardName} not found`;
			}
			
			// Display detailed status
			let colonies = Object.keys(status.colonies || {}).length;
			let energy = _.get(status, ["resources", "energy"], 0);
			let cpu = _.get(status, ["cpu", "used"], 0);
			let bucket = _.get(status, ["cpu", "bucket"], 0);
			let tick = status.tick || 0;
			let age = Game.time - tick;
			
			console.log(`[Shard] === Shard: ${shardName} ===`);
			console.log(`[Shard] Tick: ${tick} (age: ${age} ticks)`);
			console.log(`[Shard] Colonies: ${colonies}`);
			console.log(`[Shard] Energy: ${energy.toLocaleString()}`);
			console.log(`[Shard] CPU: ${cpu.toFixed(1)} / Bucket: ${bucket}`);
			
			if (detailed) {
				// Show detailed colony info
				_.each(Object.keys(status.colonies || {}), colonyName => {
					let colony = status.colonies[colonyName];
					console.log(`[Shard]   Colony ${colonyName}:`);
					console.log(`[Shard]     RCL: ${colony.rcl}, Energy: ${colony.energy.toLocaleString()}`);
					console.log(`[Shard]     Spawns: ${colony.spawns_available}/${colony.spawns_total}`);
				});
				
				// Show minerals
				let minerals = _.get(status, ["resources", "minerals"], {});
				if (Object.keys(minerals).length > 0) {
					console.log(`[Shard] Minerals:`);
					_.each(Object.keys(minerals), mineral => {
						console.log(`[Shard]   ${mineral}: ${minerals[mineral].toLocaleString()}`);
					});
				}
			}
			
			return `[Shard] Status for ${shardName} displayed`;
		} else {
			// Show all shards
			ShardCoordinator.displayStatus();
			return `[Shard] Status displayed`;
		}
	};
		
	help_shard.push("shard.portals()");
	help_shard.push(" - Display all known portals on current shard");
	
	shard.portals = function() {
		Portals.display();
		return `[Shard] Portal list displayed`;
	};
	
	help_shard.push("shard.colonies(shardName)");
	help_shard.push(" - List all colonies on a specific shard");
	help_shard.push(" - shardName: Optional, defaults to current shard");
	
	shard.colonies = function(shardName) {
		if (!Game.shard && !shardName) {
			return `[Shard] Error: Not on multi-shard server`;
		}
		
		let targetShard = shardName || (Game.shard ? Game.shard.name : null);
		let status = ShardCoordinator.getShardStatus(targetShard);
		
		if (!status) {
			return `[Shard] Error: Shard ${targetShard} not found`;
		}
		
		console.log(`[Shard] === Colonies on ${targetShard} ===`);
		
		let colonies = status.colonies || {};
		if (Object.keys(colonies).length === 0) {
			console.log(`[Shard] No colonies found`);
		} else {
			_.each(Object.keys(colonies).sort(), roomName => {
				let colony = colonies[roomName];
				let portalIndicator = (colony.portal_rooms && colony.portal_rooms.length > 0) ? " 🌀" : "";
				console.log(`[Shard] ${roomName}${portalIndicator}:`);
				console.log(`[Shard]   RCL: ${colony.rcl}, Energy: ${colony.energy.toLocaleString()}`);
				console.log(`[Shard]   Spawns: ${colony.spawns_available}/${colony.spawns_total}${colony.can_assist ? " (assist available)" : ""}`);
				if (colony.portal_rooms && colony.portal_rooms.length > 0) {
					console.log(`[Shard]   Portal rooms: ${colony.portal_rooms.join(", ")}`);
				}
			});
		}
		
		return `[Shard] Colonies for ${targetShard} displayed`;
	};
	
	help_shard.push("shard.resources(shardName)");
	help_shard.push(" - Show resource availability on a specific shard");
	help_shard.push(" - shardName: Optional, defaults to current shard");
	
	shard.resources = function(shardName) {
		if (!Game.shard && !shardName) {
			return `[Shard] Error: Not on multi-shard server`;
		}
		
		let targetShard = shardName || (Game.shard ? Game.shard.name : null);
		let status = ShardCoordinator.getShardStatus(targetShard);
		
		if (!status) {
			return `[Shard] Error: Shard ${targetShard} not found`;
		}
		
		console.log(`[Shard] === Resources on ${targetShard} ===`);
		
		let resources = status.resources || {};
		
		// Show energy
		let energy = resources.energy || 0;
		console.log(`[Shard] Energy: ${energy.toLocaleString()}`);
		
		// Show minerals
		let minerals = resources.minerals || {};
		if (Object.keys(minerals).length > 0) {
			console.log(`[Shard] Minerals:`);
			let mineralKeys = Object.keys(minerals).sort();
			_.each(mineralKeys, mineral => {
				console.log(`[Shard]   ${mineral}: ${minerals[mineral].toLocaleString()}`);
			});
		}
		
		// Show commodities
		let commodities = resources.commodities || {};
		if (Object.keys(commodities).length > 0) {
			console.log(`[Shard] Commodities:`);
			let commodityKeys = Object.keys(commodities).sort();
			_.each(commodityKeys, commodity => {
				console.log(`[Shard]   ${commodity}: ${commodities[commodity].toLocaleString()}`);
			});
		}
		
		return `[Shard] Resources for ${targetShard} displayed`;
	};
	
	help_shard.push("shard.debug_ism()");
		help_shard.push(" - Show InterShardMemory contents and size");
		
		shard.debug_ism = function() {
			ISM.debug();
			return `[Shard] ISM debug info displayed`;
		};
		
		help_shard.push("shard.colonize(targetShard, targetRoom, options)");
		help_shard.push(" - Plan colonization on another shard");
		help_shard.push(" - targetShard: Destination shard name (e.g., 'shard1')");
		help_shard.push(" - targetRoom: Destination room name (e.g., 'W1N1')");
		help_shard.push(" - options: { sourceRoom: 'W5N5', layout: 'def_hor' }");
		
		shard.colonize = function(targetShard, targetRoom, options = {}) {
			if (!targetShard || !targetRoom) {
				return `[Shard] Error: targetShard and targetRoom required`;
			}
			
			let opId = ShardCoordinator.planColonization(targetShard, targetRoom, options);
			if (opId) {
				return `[Shard] Colonization operation ${opId} created`;
			} else {
				return `[Shard] Failed to create colonization operation`;
			}
		};
		
		help_shard.push("shard.operations()");
		help_shard.push(" - Display all active cross-shard operations");
		
		shard.operations = function() {
			let colonizations = _.get(Memory, ["shard", "operations", "colonizations"], []);
			let transfers = _.get(Memory, ["shard", "operations", "creep_transfers"], []);
			
			console.log(`[Shard] === Active Cross-Shard Operations ===`);
			
			if (colonizations.length > 0) {
				console.log(`[Shard] Colonizations (${colonizations.length}):`);
				_.each(colonizations, op => {
					console.log(`[Shard]   ${op.id}: ${op.dest_shard}/${op.dest_room} - ${op.status}`);
				});
			}
			
			if (transfers.length > 0) {
				console.log(`[Shard] Creep Transfers (${transfers.length}):`);
				_.each(transfers, transfer => {
					console.log(`[Shard]   ${transfer.creep_name}: → ${transfer.dest_shard}/${transfer.dest_room} - ${transfer.status}`);
				});
			}
			
			if (colonizations.length === 0 && transfers.length === 0) {
				console.log(`[Shard] No active operations`);
			}
			
			return `[Shard] Operations displayed`;
		};
		
		help_shard.push("shard.clear_operations()");
		help_shard.push(" - Clear all stuck operations");
		
	shard.clear_operations = function() {
		_.set(Memory, ["shard", "operations", "colonizations"], []);
		_.set(Memory, ["shard", "operations", "creep_transfers"], []);
		return `[Shard] All operations cleared`;
	};

	help_shard.push("shard.spawn_scout(targetRoom)");
	help_shard.push(" - Spawn a scout to explore toward target room");
	help_shard.push(" - targetRoom: Target room to explore (e.g., 'E10N10')");
	
	shard.spawn_scout = function(targetRoom) {
		// Find an available spawn
		let spawn = _.find(Game.spawns, s => !s.spawning);
		if (!spawn) {
			return `[Shard] No available spawns`;
		}
		
		// Generate scout name using standard naming convention
		let scoutName = "port:xxxx".replace(/[xy]/g, (c) => {
			let r = Math.random() * 16 | 0, v = c == "x" ? r : (r & 0x3 | 0x8);
			return v.toString(16);
		});
		
		// Spawn scout (5x MOVE = 250 energy)
		let result = spawn.spawnCreep(
			[MOVE, MOVE, MOVE, MOVE, MOVE],
			scoutName,
			{
				memory: {
					role: "portal_scout",
					room: spawn.room.name,
					target_room: targetRoom,
					explore_mode: true
				}
			}
		);
		
		if (result === OK) {
			return `[Shard] Spawning scout ${scoutName} to explore toward ${targetRoom}`;
		} else {
			return `[Shard] Failed to spawn scout: ${result}`;
		}
	};

	help_shard.push("shard.test_portal(creepName, targetShard, targetRoom)");
	help_shard.push(" - Test portal traversal with specific creep");
	help_shard.push(" - creepName: Name of creep to send");
	help_shard.push(" - targetShard: Destination shard (e.g., 'shard1')");
	help_shard.push(" - targetRoom: Destination room (e.g., 'W21N11')");
	
	shard.fix_scout = function(creepName) {
		let creep = Game.creeps[creepName];
		if (!creep) {
			return `[Shard] Creep ${creepName} not found`;
		}
		
		if (creep.memory.role !== "portal_scout") {
			return `[Shard] ${creepName} is not a portal scout`;
		}
		
		// Fix missing room property
		creep.memory.room = creep.room.name;
		console.log(`[Shard] Fixed scout ${creepName} - set room to ${creep.room.name}`);
		
		return `[Shard] Fixed scout ${creepName} - set room to ${creep.room.name}`;
	};
	
	help_shard.push("shard.fix_scout(creepName)");
	help_shard.push(" - Fix scout creep memory (add missing room property)");
	help_shard.push(" - creepName: Name of scout to fix");
	
	shard.force_scout = function(creepName) {
		let creep = Game.creeps[creepName];
		if (!creep) {
			return `[Shard] Creep ${creepName} not found`;
		}

		if (creep.memory.role !== "portal_scout") {
			return `[Shard] ${creepName} is not a portal scout`;
		}

		// Force fix the room property and execute the role immediately
		creep.memory.room = creep.room.name;
		console.log(`[Shard] Fixed and executing scout ${creepName}`);

		// Execute the role directly
		Creep_Roles.Portal_Scout(creep);

		return `[Shard] Fixed and executed scout ${creepName}`;
	};

	shard.reset_scout = function(creepName) {
		let creep = Game.creeps[creepName];
		if (!creep) {
			return `[Shard] Creep ${creepName} not found`;
		}

		if (creep.memory.role !== "portal_scout") {
			return `[Shard] ${creepName} is not a portal scout`;
		}

		// Reset scout to exploration mode
		creep.memory.test_mode = false;
		creep.memory.portal_target_shard = undefined;
		creep.memory.portal_target_room = undefined;
		creep.memory.auto_test_attempted = false;
		creep.memory.target_room = undefined;
		creep.memory.explore_mode = true;
		creep.memory.room = creep.room.name;

		console.log(`[Shard] Reset scout ${creepName} to exploration mode`);

		return `[Shard] Reset scout ${creepName} to exploration mode`;
	};
	
	help_shard.push("shard.force_scout(creepName)");
	help_shard.push(" - Fix scout memory AND execute role immediately");
	help_shard.push(" - creepName: Name of scout to force execute");
	
	help_shard.push("shard.reset_scout(creepName)");
	help_shard.push(" - Reset scout to exploration mode (clear test mode)");
	help_shard.push(" - creepName: Name of scout to reset");
	
	
	/* ========================================
	 * GLOBAL CREEPS (Cross-Shard Operations)
	 * ======================================== */
	
	help_global_creeps.push("=== Global Creeps - Cross-Shard Creep Management ===");
	help_global_creeps.push("");
	help_global_creeps.push("Manage creeps operating on shards without colonies.");
	help_global_creeps.push("Enables exploration, mining, and operations across shards.");
	help_global_creeps.push("");
	
	global.global_creeps = {};
	
	global_creeps.stats = function() {
		let stats = GlobalCreeps.getStats();
		console.log(`[GlobalCreeps] === Global Creep Statistics ===`);
		console.log(`[GlobalCreeps] Total: ${stats.total} global creeps`);
		
		if (stats.total > 0) {
			console.log(`[GlobalCreeps] By Role:`);
			_.each(Object.keys(stats.byRole), role => {
				console.log(`[GlobalCreeps]   ${role}: ${stats.byRole[role]}`);
			});
			
			console.log(`[GlobalCreeps] Creeps:`);
			_.each(stats.creeps, creep => {
				console.log(`[GlobalCreeps]   ${creep.name} (${creep.role}) in ${creep.room} [assigned: ${creep.assignedRoom}]`);
			});
		}
		
		return `[GlobalCreeps] ${stats.total} global creeps found`;
	};
	
	help_global_creeps.push("global_creeps.stats()");
	help_global_creeps.push(" - Show statistics for global creeps (creeps on shards without colonies)");
	help_global_creeps.push("");
	
	global_creeps.assign_worker = function(creepName, targetRoom) {
		let creep = Game.creeps[creepName];
		if (!creep) {
			return `[GlobalCreeps] Creep ${creepName} not found`;
		}
		
		creep.memory.remote_target = targetRoom;
		return `[GlobalCreeps] Assigned ${creepName} to remote mine in ${targetRoom}`;
	};
	
	help_global_creeps.push("global_creeps.assign_worker(creepName, targetRoom)");
	help_global_creeps.push(" - Assign a worker to remote mine in target room");
	help_global_creeps.push(" - creepName: Name of worker creep");
	help_global_creeps.push(" - targetRoom: Room to mine (e.g., 'W49N50')");
	help_global_creeps.push("");
	
	global_creeps.assign_highway = function(creepName, targetRoom) {
		let creep = Game.creeps[creepName];
		if (!creep) {
			return `[GlobalCreeps] Creep ${creepName} not found`;
		}
		
		creep.memory.highway_target = targetRoom;
		return `[GlobalCreeps] Assigned ${creepName} to highway mine in ${targetRoom}`;
	};
	
	help_global_creeps.push("global_creeps.assign_highway(creepName, targetRoom)");
	help_global_creeps.push(" - Assign a miner to highway mine (power banks/deposits) in target room");
	help_global_creeps.push(" - creepName: Name of miner creep");
	help_global_creeps.push(" - targetRoom: Highway room with power banks or deposits");
	help_global_creeps.push("");
	
	global_creeps.spawn_resource_scout = function(targetRoom) {
		let spawn = _.find(Game.spawns, s => !s.spawning);
		if (!spawn) {
			return `[GlobalCreeps] No available spawns`;
		}
		
		let scoutName = "rsct:" + Math.floor(Math.random() * 0xFFFF).toString(16).padStart(4, "0");
		let body = [MOVE, MOVE, MOVE, MOVE, MOVE];  // Fast scout
		
		let result = spawn.spawnCreep(body, scoutName, {
			memory: {
				role: "resource_scout",
				room: spawn.room.name,
				scan_target: targetRoom,
				explore_mode: true,
				explored_rooms: []
			}
		});
		
		if (result === OK) {
			return `[GlobalCreeps] Spawning resource scout ${scoutName} to scan ${targetRoom}`;
		} else {
			return `[GlobalCreeps] Failed to spawn: ${result}`;
		}
	};
	
	help_global_creeps.push("global_creeps.spawn_resource_scout(targetRoom)");
	help_global_creeps.push(" - Spawn a scout to discover power banks, deposits, and minerals");
	help_global_creeps.push(" - targetRoom: Initial room to scan (e.g., 'E10N10')");
	help_global_creeps.push("");
	
	global_creeps.list_resources = function() {
		let currentShard = Game.shard ? Game.shard.name : "sim";
		let resources = _.get(Memory, ["global_resources", currentShard], {});
		
		if (Object.keys(resources).length === 0) {
			return `[Resources] No resources discovered yet`;
		}
		
		console.log(`[Resources] === Discovered Resources (${currentShard}) ===`);
		
		let byType = _.groupBy(Object.values(resources), r => r.type);
		
		_.each(Object.keys(byType), type => {
			console.log(`[Resources] ${type}: ${byType[type].length}`);
			_.each(byType[type], resource => {
				let age = Game.time - resource.discovered;
				let info = "";
				
				if (type === "power_bank") {
					info = `${resource.power} power, ${resource.ticksToDecay} ticks`;
				} else if (type === "deposit") {
					info = `${resource.depositType}, ${resource.ticksToDecay} ticks`;
				} else if (type === "mineral") {
					info = `${resource.mineralType}, ${resource.mineralAmount} amount`;
				}
				
				console.log(`[Resources]   ${resource.room} ${info} (${age} ticks ago)`);
			});
		});
		
		return `[Resources] ${Object.keys(resources).length} resources found`;
	};
	
	help_global_creeps.push("global_creeps.list_resources()");
	help_global_creeps.push(" - List all discovered resources (power banks, deposits, minerals)");
	help_global_creeps.push(" - Shows: power banks, deposits (silicon, metal, etc.), minerals, energy sources");
	help_global_creeps.push("");
	help_global_creeps.push("=== Related Commands ===");
	help_global_creeps.push("For portal scouts, see: help('shard')");
	
	shard.test_portal = function(creepName, targetShard, targetRoom) {
		let creep = Game.creeps[creepName];
		if (!creep) {
			return `[Shard] Creep ${creepName} not found`;
		}
		
		// Check for portal route
		let route = Portals.getPortalRoute(creep.room.name, targetShard, targetRoom);
		if (!route) {
			return `[Shard] No portal route from ${creep.room.name} to ${targetShard}`;
		}
		
		// Display route info
		console.log(`[Shard] Portal route found:`);
		console.log(`[Shard]   Portal: ${route.portal.pos.roomName} (${route.portal.pos.x}, ${route.portal.pos.y})`);
		console.log(`[Shard]   Destination: ${route.destShard} / ${route.destRoom}`);
		console.log(`[Shard]   Distance: ${route.distance} rooms`);
		console.log(`[Shard]   ETA: ${route.estimatedTravelTime} ticks`);
		console.log(`[Shard]   Cached: ${route.cached}`);
		
		// Initiate travel
		creep.memory.test_mode = true;
		creep.memory.portal_target_shard = targetShard;
		creep.memory.portal_target_room = targetRoom;
		
		return `[Shard] ${creepName} will travel to ${targetShard}/${targetRoom} via portal`;
	};


	help = function (submenu) {
			let menu = new Array()
			if (submenu == null)
				menu = help_main;
			else {
				switch (submenu.toString().toLowerCase()) {
					case "ai": menu = help_ai; break;
					case "allies": menu = help_allies; break;
					case "blueprint": menu = help_blueprint; break;
					case "empire": menu = help_empire; break;
					case "factories": menu = help_factories; break;
					case "global_creeps": menu = help_global_creeps; break;
					case "labs": menu = help_labs; break;
					case "log": menu = help_log; break;
					case "path": menu = help_path; break;
					case "pause": menu = help_pause; break;
					case "pixels": menu = help_pixels; break;
					case "profiler": menu = help_profiler; break;
					case "resources": menu = help_resources; break;
					case "scouts": menu = help_scouts; break;
					case "shards": menu = help_shards; break;
					case "visuals": menu = help_visuals; break;
				}
			}

			console.log(`Command list: \n${menu.join("\n")}\n\n`);
			return `[Console] Help("${submenu}") list complete`;
		};
	}
};
