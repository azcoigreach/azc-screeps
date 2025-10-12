/* ***********************************************************
 *	[sec07a] DEFINITIONS: CONSOLE COMMANDS
 * *********************************************************** */

 global.Console = {
	Init: function () {
		let help_main = new Array();
		let help_allies = new Array();
		let help_blueprint = new Array();
		let help_empire = new Array();
		let help_factories = new Array();
		let help_labs = new Array();
		let help_log = new Array();
		let help_path = new Array();
		let help_pause = new Array();
		let help_pixels = new Array();
		let help_profiler = new Array();
		let help_resources = new Array();
		let help_visuals = new Array();



		/* Main help() list */
		help_main.push("List of help() arguments, e.g. help(blueprint):");
		help_main.push(`- "allies" \t Manage ally list`);
		help_main.push(`- "blueprint" \t Settings for automatic base building`);
		help_main.push(`- "empire" \t Miscellaneous empire and colony management`);
		help_main.push(`- "factories" \t Management of factory commodity production`);
		help_main.push(`- "labs" \t Management of lab functions/reactions`);
		help_main.push(`- "log" \t Logs for statistical output`);
		help_main.push(`- "path" \t Utilities for enhancing creep pathfinding abilities`);
		help_main.push(`- "pause" \t Utilities for pausing specific creep or colony functions`);
		help_main.push(`- "pixels" \t Pixel generation management and statistics`);
	help_main.push(`- "profiler" \t Built-in CPU profiler`);
	help_main.push(`- "resources" \t Management of resources, empire-wide sharing and/or selling to market`);
	help_main.push(`- "shard" \t Multi-shard coordination and management`);
	help_main.push(`- "visuals" \t Manage visual objects (RoomVisual class)`);
		help_main.push("");


		help_profiler.push("profiler.run(cycles)");
		help_profiler.push("profiler.stop()");
		help_profiler.push("profiler.analyze()");



		help_allies.push("allies.add(ally)");

		allies = new Object();
		allies.add = function (ally) {
			if (_.get(Memory, ["hive", "allies"]) == null) _.set(Memory["hive", "allies"], []);
			Memory["hive"]["allies"].push(ally);
			return `<font color=\"#D3FFA3\">[Console]</font> Player ${ally} added to ally list.`
		};

		help_allies.push("allies.add_list([ally1, ally2, ...])");

		allies.add_list = function (allyList) {
			Array.prototype.push.apply(Memory["hive"]["allies"], allyList);
			return `<font color=\"#D3FFA3\">[Console]</font> Players added to ally list.`
		};

		help_allies.push("allies.remove(ally)");

		allies.remove = function (ally) {
			let index = _.get(Memory, ["hive", "allies"]).indexOf(ally);
			if (index >= 0) {
				Memory["hive"]["allies"].splice(index, 1);
				return `<font color=\"#D3FFA3\">[Console]</font> Player ${ally} removed from ally list.`
			} else {
				return `<font color=\"#D3FFA3\">[Console]</font> Error: Player ${ally} not found in ally list.`
			}
		};

		help_allies.push("allies.clear()");
		allies.clear = function () {
			_.set(Memory, ["hive", "allies"], []);
			return `<font color=\"#D3FFA3\">[Console]</font> Ally list cleared.`
		};


		blueprint = new Object();
		help_blueprint.push("blueprint.set_layout(rmName, originX, originY, layoutName)");

		blueprint.set_layout = function (rmName, originX, originY, layoutName) {
			_.set(Memory, ["rooms", rmName, "layout"], { origin: { x: originX, y: originY }, name: layoutName });
			return `<font color=\"#D3FFA3\">[Console]</font> Blueprint layout set for ${rmName}.`;
		};

		help_blueprint.push("blueprint.block(rmName, x, y)");

		blueprint.block = function (rmName, x, y) {
			if (_.get(Memory, ["rooms", rmName, "layout", "blocked_areas"]) == null)
				Memory["rooms"][rmName]["layout"]["blocked_areas"] = [];
			Memory["rooms"][rmName]["layout"]["blocked_areas"].push({ start: { x: x, y: y }, end: { x: x, y: y } });
			return `<font color=\"#D3FFA3\">[Console]</font> Blueprint position blocked for ${rmName} at (${x}, ${y}).`;
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
			return `<font color=\"#D3FFA3\">[Console]</font> Blueprint area blocked for ${rmName} from (${startX}, ${startY}) to (${endX}, ${endY}).`;
		};

		help_blueprint.push("blueprint.request(rmName)");

		blueprint.request = function (rmName) {
			_.set(Memory, ["hive", "pulses", "blueprint", "request"], rmName);
			return `<font color=\"#D3FFA3\">[Console]</font> Setting Blueprint() request for ${rmName}; Blueprint() will run this request next tick.`;
		};

	help_blueprint.push("blueprint.reset()");
	blueprint.reset = function () {
		if (_.get(Memory, ["shard", "pulses", "blueprint"], null) != null)
			delete Memory.shard.pulses.blueprint;				
		return `<font color=\"#D3FFA3\">[Console]</font> Resetting Blueprint() cycles; Blueprint() will initiate next tick.`;
	};

		help_blueprint.push("blueprint.redefine_links()");
		blueprint.redefine_links = function () {
			_.each(_.filter(Game.rooms, r => { return (r.controller != null && r.controller.my); }), r => {
				if (_.has(Memory, ["rooms", r.name, "links"]))
					delete Memory["rooms"][r.name]["links"];
			});

			_.set(Memory, ["hive", "pulses", "reset_links"], true);
			return `<font color=\"#D3FFA3\">[Console]</font> Resetting all link definitions; will redefine next tick.`;
		};

		help_blueprint.push("blueprint.toggle_walls(rmName)");

		blueprint.toggle_walls = function (rmName) {
			// For manual disabling of whether passive defensive will be placed (useful in order to prioritize RCL)
			if (_.get(Memory, ["rooms", rmName, "layout", "place_defenses"], false) == true)
				_.set(Memory, ["rooms", rmName, "layout", "place_defenses"], false)
			else
				_.set(Memory, ["rooms", rmName, "layout", "place_defenses"], true)

			return `<font color=\"#D3FFA3\">[Console]</font> Blueprint placing defensive walls and ramparts: ${_.get(Memory, ["rooms", rmName, "layout", "place_defenses"], true)}`;
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
			return `<font color=\"#D3FFA3\">[Console]</font> ${commodity} production target set to ${amount} (priority ${priority || 50}).`;
		};

		help_factories.push("factories.clear_production(commodity)");
		help_factories.push(" - Clears the production target for a specific commodity");
		help_factories.push(" - commodity: the resource to stop producing");
		help_factories.push(" - Example: factories.clear_production('battery')");

		factories.clear_production = function (commodity) {
			if (_.get(Memory, ["resources", "factories", "targets", commodity]) != null) {
				delete Memory["resources"]["factories"]["targets"][commodity];
				return `<font color=\"#D3FFA3\">[Console]</font> ${commodity} production target cleared.`;
			}
			return `<font color=\"#D3FFA3\">[Console]</font> No production target found for ${commodity}.`;
		};

		help_factories.push("factories.clear_all()");
		help_factories.push(" - Clears all factory production targets");
		help_factories.push(" - Stops all commodity production in all factories");

		factories.clear_all = function () {
			_.set(Memory, ["resources", "factories", "targets"], new Object());
			return `<font color=\"#D3FFA3\">[Console]</font> All factory production targets cleared.`;
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
			console.log(`<font color=\"#FFA500\">[Factory]</font> <b>Factory Production Targets:</b>`);
			if (targets == null || Object.keys(targets).length == 0) {
				console.log(`<font color=\"#FFA500\">[Factory]</font> No production targets set.`);
			} else {
				let targetTable = `<table ${tableStyle}><tr><th ${headerStyle}>Commodity</th><th ${headerStyle}>Current</th><th ${headerStyle}>Target</th><th ${headerStyle}>Progress</th><th ${headerStyle}>Priority</th></tr>`;
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
					targetTable += `<tr><td ${cellStyle}>${commodity}</td><td ${cellStyle}>${current}</td><td ${cellStyle}>${target.amount}</td><td ${cellStyle}>${progressBar} ${progress}%</td><td ${cellStyle}>${target.priority}</td></tr>`;
				});
				targetTable += "</table>";
				console.log(targetTable);
			}

			// Factory Assignments and Status Table
			console.log(`<font color=\"#FFA500\">[Factory]</font> <b>Factory Status:</b>`);
			let factoryTable = `<table ${tableStyle}><tr><th ${headerStyle}>Room</th><th ${headerStyle}>Assignment</th><th ${headerStyle}>Cooldown</th><th ${headerStyle}>Store</th><th ${headerStyle}>Status</th></tr>`;
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
						
						factoryTable += `<tr><td ${cellStyle}><font color=\"#D3FFA3\">${room.name}</font></td><td ${cellStyle}>${assignmentText}</td><td ${cellStyle}>${cooldownText}</td><td ${cellStyle}>${storeText}</td><td ${cellStyle}>${status}</td></tr>`;
					});
				}
			});
			factoryTable += "</table>";
			console.log(factoryTable);

			// Summary
			console.log(`<font color=\"#FFA500\">[Factory]</font> <b>Summary:</b> ${totalFactories} total factories, ${assignedFactories} assigned, ${activeFactories} active`);

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
				console.log(`<font color=\"#FFA500\">[Factory]</font> <b>Industry Tasks:</b> ${totalTasks} total (P2: ${priority2Tasks}, P3: ${priority3Tasks}, P5: ${priority5Tasks})`);
			}

			// CPU Usage Information
			let cpuUsed = Game.cpu.getUsed();
			let cpuBucket = Game.cpu.bucket;
			console.log(`<font color=\"#FFA500\">[Factory]</font> <b>CPU Status:</b> Used: ${cpuUsed.toFixed(2)}, Bucket: ${cpuBucket.toFixed(0)}`);

			return `<font color=\"#FFA500\">[Factory]</font> Factory status displayed.`;
		};

		factories.renew_assignments = function () {
			console.log(`<font color=\"#FFA500\">[Factory]</font> Renewing factory assignments...`);
			// Safely clear existing assignments to force fresh assignment
			if (Memory["resources"] && Memory["resources"]["factories"]) {
				delete Memory["resources"]["factories"]["assignments"];
			}
			// Trigger factory pulse to reassign factories based on priority (lab style)
			if (Memory["hive"] && Memory["hive"]["pulses"]) {
				delete Memory["hive"]["pulses"]["factory"];
			}
			return `<font color=\"#FFA500\">[Factory]</font> Factory assignments will be renewed next tick based on current priorities.`;
		};

		factories.clear_assignments = function () {
			if (Memory["resources"] && Memory["resources"]["factories"]) {
				delete Memory["resources"]["factories"]["assignments"];
				return `<font color=\"#FFA500\">[Factory]</font> Factory assignments cleared.`;
			} else {
				return `<font color=\"#FFA500\">[Factory]</font> No factory assignments to clear.`;
			}
		};

		// Internal maintenance function (not exposed in help)
		factories.maintenance = function () {
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
				console.log(`<font color=\"#FFA500\">[Factory]</font> Running scheduled factory cleanup...`);
				this.cleanup(1); // High priority cleanup
				Memory.factories.lastCleanup = currentTick;
				maintenanceActions.push("cleanup");
			}
			
			// Check if it's time for assignment renewal
			if (currentTick - Memory.factories.lastAssignmentCheck >= Memory.factories.assignmentCheckInterval) {
				console.log(`<font color=\"#FFA500\">[Factory]</font> Running scheduled assignment check...`);
				this.renew_assignments();
				Memory.factories.lastAssignmentCheck = currentTick;
				maintenanceActions.push("assignment renewal");
			}
			
			if (maintenanceActions.length > 0) {
				return `<font color=\"#FFA500\">[Factory]</font> Factory maintenance completed: ${maintenanceActions.join(', ')}`;
			} else {
				return `<font color=\"#FFA500\">[Factory]</font> No maintenance actions needed at tick ${currentTick}`;
			}
		};

		// Internal cleanup function (not exposed in help)
		factories.cleanup = function (priority = 1) {
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
			if (cleanupData.length > 0) {
				let tableStyle = "style=\"border-collapse: collapse; border: 1px solid #666; margin: 5px 0;\"";
				let cellStyle = "style=\"border: 1px solid #666; padding: 6px 8px; text-align: left; font-size: 12px;\"";
				let headerStyle = "style=\"border: 1px solid #666; padding: 8px 12px; text-align: left; background-color: #FFA500; color: white; font-weight: bold;\"";
				
				let cleanupTable = `<table ${tableStyle}><tr><th ${headerStyle}>Room</th><th ${headerStyle}>Status</th><th ${headerStyle}>Details</th></tr>`;
				
				_.each(cleanupData, data => {
					let statusColor = data.status.includes("✓") ? "green" : data.status.includes("✗") ? "red" : "orange";
					cleanupTable += `<tr><td ${cellStyle}>${data.room}</td><td ${cellStyle}><font color=\"${statusColor}\">${data.status}</font></td><td ${cellStyle}>${data.details}</td></tr>`;
					
					// Add factory details if available
					if (data.factories && data.factories.length > 0) {
						_.each(data.factories, factory => {
							cleanupTable += `<tr><td ${cellStyle} style=\"padding-left: 20px;\">└─ ${factory.factory}</td><td ${cellStyle}>${factory.assignment}</td><td ${cellStyle}>${factory.actions}</td></tr>`;
						});
					}
				});
				
				cleanupTable += "</table>";
				console.log(`<font color=\"#FFA500\">[Factory]</font> <b>Cleanup Summary (Priority ${priority}):</b><br>${cleanupTable}`);
			}
			
			if (roomsProcessed === 0) {
				return `<font color=\"#FFA500\">[Factory]</font> No rooms with factories found.`;
			}
			
			return `<font color=\"#FFA500\">[Factory]</font> Factory cleanup completed. Created ${totalCleanupTasks} cleanup tasks across ${roomsProcessed} rooms.`;
		};








		log = new Object();

		help_log.push("log.all()");

		log.all = function () {
			this.nukers();
			this.labs();
			this.controllers();
			this.resources();
			return `<font color=\"#D3FFA3\">[Console]</font> Main logs printed.`;
		}

		help_log.push("log.can_build()");

		log.can_build = function () {
			let rooms = _.filter(Game.rooms, n => { return n.controller != null && n.controller.my; });
			console.log("<font color=\"#D3FFA3\">[Console]</font> Buildable structures:");
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
			return "<font color=\"#D3FFA3\">[Console]</font> Report generated";
		};

		help_log.push("log.controllers()");

		log.controllers = function () {
			console.log("<font color=\"#D3FFA3\">[Console]</font> Room Controllers:");
			let output = "<table>";
			_.each(_.sortBy(_.sortBy(_.filter(Game.rooms,
				r => { return r.controller != null && r.controller.my; }),
				r => { return -r.controller.progress; }),
				r => { return -r.controller.level; }), r => {
					output += `<tr><td><font color=\"#D3FFA3\">${r.name}:</font>  (${r.controller.level})  </td> `
						+ `<td>${r.controller.progress}  </td><td>  /  </td><td>${r.controller.progressTotal}    </td> `
						+ `<td>(${(r.controller.progress / r.controller.progressTotal * 100).toFixed()} %)</td></tr>`;
				});
			console.log(`${output}</table>`);
			return "<font color=\"#D3FFA3\">[Console]</font> Report generated";
		};

		help_log.push("log.populations()");

		log.populations = function () {
			console.log("<font color=\"#D3FFA3\">[Console]</font> Populations for Colonies and Mining Sites (default and set_population):");

			let colonies = _.keys(_.filter(Game.rooms, room => { return (room.controller != null && room.controller.my); }));
			let mining = _.keys(_.get(Memory, ["sites", "mining"]));
			let rooms = _.keys(_.get(Memory, "rooms"));
			let output = "<table>";

			for (let i = 0; i < rooms.length; i++) {
				if (_.indexOf(colonies, rooms[i]) >= 0 || _.indexOf(mining, rooms[i]) >= 0) {
					if (_.has(Memory, ["rooms", rooms[i], "set_population"])) {
						output += `<tr><td><font color=\"#D3FFA3\">${(rooms[i])}</font>: \t</td>`;
						let populations = _.keys(Memory["rooms"][rooms[i]]["set_population"]);
						for (let j = 0; j < populations.length; j++) {
							output += `<td>${populations[j]}: </td> `
							+ `<td>lvl ${_.get(Memory, ["rooms", rooms[i], "set_population", populations[j], "level"])}</td>`
							+ `<td> x ${_.get(Memory, ["rooms", rooms[i], "set_population", populations[j], "amount"])} \t</td>  `;
						}
						output += `</tr>`;
					} else {
						output += `<tr><td><font color=\"#D3FFA3\">${(rooms[i])}</font>: \t</td>`
							+`<td>default</td></tr>`;
					}
				}
			}
			console.log(`${output}</table>`);
			return "<font color=\"#D3FFA3\">[Console]</font> Report generated";
		}

		help_log.push("log.labs()");

		log.labs = function () {
			let output = "<font color=\"#D3FFA3\">[Console]</font> Lab Report<br>"
				+ "<table><tr><th>Room \t</th><th>Mineral \t</th><th>Amount \t</th><th>Target Amount \t</th><th>Reagent #1 \t</th><th>Reagent #2</th></tr>";

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
						reagents += `<td>${reagent}: \t${r_amount}</td>`;
					});

				output += `<tr><td>${r}</td><td>${_.get(rxn, "mineral")}</td><td>${amount}</td><td>(${_.get(rxn, "amount")})${reagents}</tr>`
			});

			console.log(`${output}</table>`);
			return "<font color=\"#D3FFA3\">[Console]</font> Report generated";
		};

		help_log.push("log.resources()");

		log.resources = function (resource = null, limit = 1) {
			let resource_list = resource != null ? [resource] : RESOURCES_ALL;
			let room_list = _.filter(Game.rooms, r => { return r.controller != null && r.controller.my && (r.storage || r.terminal); });

			let output = `<font color=\"#FFF"><tr><th>Resource\t</th><th>Total \t\t</th>`;
			_.each(room_list, r => { output += `<th><font color=\"#${r.terminal ? "5DB65B" : "B65B5B"}\">${r.name}</font> \t</th>`; });

			_.each(resource_list, res => {
				let amount = 0;
				let output_rooms = "";

				_.each(room_list, r => {
					let a = r.store(res);
					amount += a;
					output_rooms += `<td>${a}</td>`
				});

				if (amount >= limit)
					output += `<tr><td>${res}</td><td>${amount}</td> ${output_rooms} </tr>`;
			});

			console.log(`<font color=\"#D3FFA3">log.resources</font> <table>${output}</table>`);
			return "<font color=\"#D3FFA3\">[Console]</font> Report generated";
		};

		help_log.push("log.remote_mining()");

		log.remote_mining = function () {
			let output = "";
			let remote = _.get(Memory, ["sites", "mining"]);

			_.each(_.filter(Game.rooms, r => { return r.controller != null && r.controller.my; }), r => {
				output += `<tr><td>${r.name}</td><td>  ->  </td>`;
				_.each(_.filter(Object.keys(remote), rem => { return rem != r.name && _.get(remote[rem], "colony") == r.name; }), rem => { output += `<td>  ${rem}  </td>`; });
				output += `</tr>`;
			});

			console.log(`<font color=\"#D3FFA3">log.mining</font><table>${output}</table>`);
			return "<font color=\"#D3FFA3\">[Console]</font> Report generated";
		};

		help_log.push("log.spawn_assist()");

		log.spawn_assist = function () {
			console.log("<font color=\"#D3FFA3\">[Console]</font> Active Spawn Assists:");

			let rooms = _.filter(Game.rooms, room => { return (room.controller != null && room.controller.my); });
			let output = "<table><tr><th>Colony \t\t</th><th>Assisted By:</th></tr>";
			for (let i = 0; i < rooms.length; i++) {
				let room = rooms[i].name;
				let spawn_rooms = _.get(Memory, ["rooms", room, "spawn_assist", "rooms"], null);
				if (spawn_rooms != null) {
					output += `<tr><td><font color=\"#D3FFA3\">${(room)}</font>: \t</td>`;
					_.each(spawn_rooms, r => { output += `<td>${r} \t</td>`; });
					output += `</tr>`;
				} else {
					output += `<tr><td><font color=\"#D3FFA3\">${(room)}</font>: \t</td>`
						+`<td>inactive</td></tr>`;
				}
			}
			console.log(`${output}</table>`);
			return "<font color=\"#D3FFA3\">[Console]</font> Report generated";
		}

		help_log.push("log.storage()");

		log.storage = function () {
			console.log(`<font color=\"#D3FFA3">log-storage</font>`);

			for (let i = 0; i < Object.keys(Game.rooms).length; i++) {
				let room = Game.rooms[Object.keys(Game.rooms)[i]];
				if (room.storage != null) {
					if (_.sum(room.storage) == 0) {
						console.log(`${room.name} storage: empty`);
					} else {
						let output = `<font color=\"#D3FFA3\">${room.name}</font> storage (${parseInt(_.sum(room.storage.store) / room.storage.storeCapacity * 100)}%): `;
						for (let res in room.storage.store) {
							if (room.storage.store[res] > 0)
								output += `<font color=\"#D3FFA3\">${res}</font>: ${_.floor(room.storage.store[res] / 1000)}k;  `;
						}
						console.log(output);
					}
				}

				if (room.terminal != null) {
					if (_.sum(room.terminal) == 0) {
						console.log(`${room.name} terminal: empty`);
					} else {
						let output = `<font color=\"#D3FFA3\">${room.name}</font> terminal (${parseInt(_.sum(room.terminal.store) / room.terminal.storeCapacity * 100)}%): `;
						for (let res in room.terminal.store) {
							if (room.terminal.store[res] > 0)
								output += `<font color=\"#D3FFA3\">${res}</font>: ${_.floor(room.terminal.store[res] / 1000)}k;  `;
						}
						console.log(output);
					}
				}
			}
			return "<font color=\"#D3FFA3\">[Console]</font> Report generated";
		};

		help_log.push("log.nukers()");

		log.nukers = function () {
			console.log("<font color=\"#D3FFA3\">[Console]</font> Nukers:");
			_.each(_.filter(Game.rooms, r => { return r.controller != null && r.controller.my; }), r => {
				let nuker = _.head(r.find(FIND_STRUCTURES, { filter: (s) => { return s.structureType == "nuker"; } }));
				if (nuker != null) {
					console.log(`<font color=\"#D3FFA3\">${r.name}:</font> `
						+ `<font color=\"#${nuker.cooldown == 0 ? "47FF3E" : "FF3E3E"}\">`
						+ `cooldown: ${nuker.cooldown};</font>  `
						+ `<font color=\"#${nuker.energy == nuker.energyCapacity ? "47FF3E" : "FF3E3E"}\">`
						+ `energy: ${nuker.energy} (${parseFloat(nuker.energy / nuker.energyCapacity * 100).toFixed(0)}%);</font>  `
						+ `<font color=\"#${nuker.ghodium == nuker.ghodiumCapacity ? "47FF3E" : "FF3E3E"}\">`
						+ `ghodium: ${nuker.ghodium} (${parseFloat(nuker.ghodium / nuker.ghodiumCapacity * 100).toFixed(0)}%)</font>`);
				}
			});
			return "<font color=\"#D3FFA3\">[Console]</font> Report generated";
		};


		help_labs.push("labs.set_reaction(mineral, amount, priority)");
		help_labs.push(" - Sets a lab reaction target for a specific mineral");
		help_labs.push(" - mineral: the resource to produce (H, O, X, etc.)");
		help_labs.push(" - amount: target amount to produce, priority: task priority");
		help_labs.push(" - Example: labs.set_reaction('H', 1000, 30)");

		labs = new Object();
		labs.set_reaction = function (mineral, amount, priority) {
			_.set(Memory, ["resources", "labs", "targets", mineral], { mineral: mineral, amount: amount, priority: priority });
			return `<font color=\"#D3FFA3\">[Console]</font> ${mineral} reaction target set to ${amount} (priority ${priority}).`;
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
			return `<font color=\"#D3FFA3\">[Console]</font> Boost added for ${mineral} to ${role} from ${labID}`;
		};

		help_labs.push("labs.clear_reactions()");
		help_labs.push(" - Clears all lab reaction targets");
		help_labs.push(" - Stops all mineral production in all labs");

		labs.clear_reactions = function () {
			_.set(Memory, ["resources", "labs", "targets"], new Object());
			delete Memory["hive"]["pulses"]["lab"];
			return `<font color=\"#D3FFA3\">[Console]</font> All lab mineral targets cleared.`;
		};

		help_labs.push("labs.clear_boosts(rmName)");
		help_labs.push(" - Clears all boost operations for a specific room");
		help_labs.push(" - rmName: room name to clear boosts from");
		help_labs.push(" - Example: labs.clear_boosts('W1N1')");

		labs.clear_boosts = function (rmName) {
			delete Memory["rooms"][rmName]["labs"]["definitions"];
			delete Memory["hive"]["pulses"]["lab"];
			return `<font color=\"#D3FFA3\">[Console]</font> All boosts cleared for ${rmName}`;
		};

		help_labs.push("labs.renew_assignments()");
		help_labs.push(" - Forces renewal of lab assignments and definitions");
		help_labs.push(" - Useful when lab assignments become stale or incorrect");

		labs.renew_assignments = function () {
			delete Memory["hive"]["pulses"]["lab"];
			return `<font color=\"#D3FFA3\">[Console]</font> Labs will renew definitions and reaction assignments next tick.`;
		};

		help_labs.push("labs.clear_assignments()");
		help_labs.push(" - Clears all lab reaction assignments");
		help_labs.push(" - Labs will be reassigned during the next lab pulse");

		labs.clear_assignments = function () {
			delete Memory["resources"]["labs"]["reactions"];
			return `<font color=\"#D3FFA3\">[Console]</font> Lab reaction assignments cleared- will reassign next lab pulse.`;
		};


		help_resources.push("resources.overflow_cap(capAmount)");
		help_resources.push(" - Sets the energy overflow cap for automatic market selling");
		help_resources.push(" - When total colony energy exceeds this amount, excess energy is sold to market");

		resources = new Object();
		resources.overflow_cap = function (amount) {
			_.set(Memory, ["resources", "to_overflow"], amount);
			return `<font color=\"#D3FFA3\">[Console]</font> Energy overflow cap set to ${amount}.`;
		};

		help_resources.push("resources.market_cap(resource, capAmount)");
		help_resources.push(" - Sets market overflow cap for a specific resource");
		help_resources.push(" - When resource amount exceeds this cap, excess is automatically sold to market");
		help_resources.push(" - Example: resources.market_cap('energy', 1000000)");

		resources.market_cap = function (resource, amount) {
			_.set(Memory, ["resources", "to_market", resource], amount);
			return `<font color=\"#D3FFA3\">[Console]</font> ${resource} market overflow set to ${amount}.`;
		};

		help_resources.push("resources.send(orderName, rmFrom, rmTo, resource, amount)");
		help_resources.push(" - Creates a terminal order to send resources between your rooms");
		help_resources.push(" - orderName: unique identifier for the order");
		help_resources.push(" - rmFrom: source room name, rmTo: destination room name");
		help_resources.push(" - resource: resource type (energy, battery, etc.), amount: quantity to transfer");

		resources.send = function (orderName, rmFrom, rmTo, resource, amount) {
			_.set(Memory, ["resources", "terminal_orders", orderName], { room: rmTo, from: rmFrom, resource: resource, amount: amount, priority: 1 });
			return `<font color=\"#D3FFA3\">[Console]</font> Order set at Memory["resources"]["terminal_orders"][${orderName}]; delete from Memory to cancel.`;
		};

		help_resources.push("resources.market_sell(orderName, marketOrderID, rmFrom, amount)");
		help_resources.push(" - Creates a market sell order to fulfill an existing buy order");
		help_resources.push(" - orderName: unique identifier for the order");
		help_resources.push(" - marketOrderID: ID of the buy order you want to fulfill");
		help_resources.push(" - rmFrom: your room that will send the resources, amount: quantity to sell");

		resources.market_sell = function (orderName, marketOrderID, rmFrom, amount) {
			_.set(Memory, ["resources", "terminal_orders", orderName], { market_id: marketOrderID, amount: amount, from: rmFrom, priority: 4 });
			return `<font color=\"#D3FFA3\">[Console]</font> Order set at Memory["resources"]["terminal_orders"][${orderName}]; delete from Memory to cancel.`;
		};

		help_resources.push("resources.market_buy(orderName, marketOrderID, rmTo, amount)");
		help_resources.push(" - Creates a market buy order to fulfill an existing sell order");
		help_resources.push(" - orderName: unique identifier for the order");
		help_resources.push(" - marketOrderID: ID of the sell order you want to fulfill");
		help_resources.push(" - rmTo: your room that will receive the resources, amount: quantity to buy");

		resources.market_buy = function (orderName, marketOrderID, rmTo, amount) {
			_.set(Memory, ["resources", "terminal_orders", orderName], { market_id: marketOrderID, amount: amount, to: rmTo, priority: 4 });
			return `<font color=\"#D3FFA3\">[Console]</font> Order set at Memory["resources", "terminal_orders"][${orderName}]; delete from Memory to cancel.`;
		};

		help_resources.push("resources.clear_market_cap()");
		help_resources.push(" - Clears all market overflow caps for all resources");
		help_resources.push(" - Stops automatic market selling of excess resources");

		resources.clear_market_cap = function () {
			_.set(Memory, ["resources", "to_market"], new Object());
			return `<font color=\"#D3FFA3\">[Console]</font> Market overflow limits deleted; existing transactions can be deleted with resources.clear_transactions().`;
		};

		help_resources.push("resources.clear_transactions()");
		help_resources.push(" - Clears all active terminal orders and market transactions");
		help_resources.push(" - Cancels all pending resource transfers and market orders");

		resources.clear_transactions = function () {
			_.set(Memory, ["resources", "terminal_orders"], new Object());
			return `<font color=\"#D3FFA3\">[Console]</font> All terminal transactions cleared.`;
		};

		help_resources.push("resources.set_energy_threshold(amount)");
		help_resources.push(" - Sets the energy threshold for emergency market orders");
		help_resources.push(" - When total colony energy falls below this amount, automatic buy orders are created");
		help_resources.push(" - Default threshold is 1,000,000 energy");

		resources.set_energy_threshold = function (amount) {
			_.set(Memory, ["resources", "market_energy_threshold"], amount);
			return `<font color=\"#D3FFA3\">[Console]</font> Market energy threshold set to ${amount}. Emergency market orders will trigger when total colony energy falls below this amount.`;
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
			console.log(`<font color=\"#D3FFA3\">[Market Status]</font> <b>Energy Status:</b> ${totalEnergy.toLocaleString()}/${energyThreshold.toLocaleString()} - <font color=\"${statusColor}\">${status}</font>`);

			// Terminal Orders Table (CSS)
			let terminalOrders = _.get(Memory, ["resources", "terminal_orders"]);
			if (terminalOrders && Object.keys(terminalOrders).length > 0) {
				let tableStyle = "style=\"border-collapse: collapse; border: 1px solid #666; margin: 5px 0; width: 100%;\"";
				let cellStyle = "style=\"border: 1px solid #666; padding: 2px 6px; text-align: left; font-size: 12px;\"";
				let headerStyle = "style=\"border: 1px solid #666; padding: 2px 6px; text-align: left; background-color: #444; color: #D3FFA3; font-weight: bold; font-size: 13px;\"";
				console.log(`<font color=\"#D3FFA3\">[Market Status]</font> <b>Terminal Orders:</b> ${Object.keys(terminalOrders).length}`);
				let ordersTable = `<table ${tableStyle}><tr><th ${headerStyle}>Order Name</th><th ${headerStyle}>Type</th><th ${headerStyle}>Resource</th><th ${headerStyle}>Amount</th><th ${headerStyle}>Priority</th><th ${headerStyle}>Room</th></tr>`;
				_.each(terminalOrders, (order, orderName) => {
					let orderType = order.market_id ? "Market" : "Internal";
					let emergency = order.emergency ? " (EMERGENCY)" : "";
					let priority = order.priority || "";
					let resource = order.resource || "";
					let amount = order.amount || "";
					let room = order.room || order.to || order.from || "";
					ordersTable += `<tr><td ${cellStyle}>${orderName}</td><td ${cellStyle}>${orderType}${emergency}</td><td ${cellStyle}>${resource}</td><td ${cellStyle}>${amount}</td><td ${cellStyle}>${priority}</td><td ${cellStyle}>${room}</td></tr>`;
				});
				ordersTable += "</table>";
				console.log(ordersTable);
			} else {
				console.log(`<font color=\"#D3FFA3\">[Market Status]</font> <b>No active terminal orders.</b>`);
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
				
				console.log(`<font color=\"#D3FFA3\">[Market Status]</font> <b>Energy Market Analysis:</b>`);
				console.log(`  <b>Price Stats:</b> Min: ${minPrice.toFixed(2)}, Avg: ${avgPrice.toFixed(2)}, Median: ${medianPrice.toFixed(2)}, Max: ${maxPrice.toFixed(2)}`);
				console.log(`  <b>Reasonable Price Threshold:</b> ${reasonablePrice.toFixed(2)} (${priceProtection.avg_multiplier}x avg or ${priceProtection.median_multiplier}x median, whichever is lower)`);
				console.log(`  <b>Available Orders:</b> ${reasonableOrders.length} reasonable, ${expensiveOrders.length} too expensive`);
				
				if (reasonableOrders.length > 0) {
					console.log(`<font color=\"#D3FFA3\">[Market Status]</font> <b>Top Reasonable Energy Orders:</b>`);
					_.each(_.sortBy(reasonableOrders, order => order.price).slice(0, 5), (order, i) => {
						console.log(`  ${i+1}. ${order.amount.toLocaleString()} energy @ ${order.price} credits from ${order.roomName}`);
					});
				} else {
					console.log(`<font color=\"#FF6B6B\">[Market Status]</font> <b>⚠️ No reasonable energy orders available!</b> All orders are too expensive.`);
				}
				
				if (expensiveOrders.length > 0) {
					console.log(`<font color=\"#FFA500\">[Market Status]</font> <b>Expensive Orders (skipped):</b>`);
					_.each(_.sortBy(expensiveOrders, order => order.price).slice(0, 3), (order, i) => {
						console.log(`  ${i+1}. ${order.amount.toLocaleString()} energy @ ${order.price} credits from ${order.roomName} (${((order.price / avgPrice) * 100).toFixed(0)}% of avg)`);
					});
				}
			} else {
				console.log(`<font color=\"#D3FFA3\">[Market Status]</font> <b>No energy sell orders available on market.</b>`);
			}

			// Credit Status
			let availableCredits = Game.market.credits || 0;
			console.log(`<font color=\"#D3FFA3\">[Market Status]</font> <b>Available Credits:</b> ${availableCredits.toLocaleString()}`);

			// CPU Usage Information
			let cpuUsed = Game.cpu.getUsed();
			let cpuBucket = Game.cpu.bucket;
			console.log(`<font color=\"#D3FFA3\">[Market Status]</font> <b>CPU Status:</b> Used: ${cpuUsed.toFixed(2)}, Bucket: ${cpuBucket.toFixed(0)}`);

			// Emergency Status with Enhanced Information
			if (totalEnergy < energyThreshold) {
				let nextCheckTick = Math.ceil(Game.time / 50) * 50 + 1;
				console.log(`<font color=\"#FF6B6B\">[Market Status]</font> <b>⚠️ Emergency:</b> Energy below threshold! Next check at tick ${nextCheckTick}`);
				
				// Show why we might not be buying
				if (energyOrders.length > 0) {
					let prices = energyOrders.map(order => order.price);
					let avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
					let priceProtection = _.get(Memory, ["resources", "market_price_protection"], { avg_multiplier: 2.0, median_multiplier: 1.5 });
					let creditLimit = _.get(Memory, ["resources", "market_credit_limit"], 0.8);
					let reasonablePrice = Math.min(avgPrice * priceProtection.avg_multiplier, prices[Math.floor(prices.length / 2)] * priceProtection.median_multiplier);
					let reasonableOrders = energyOrders.filter(order => order.price <= reasonablePrice);
					
					if (reasonableOrders.length == 0) {
						console.log(`<font color=\"#FFA500\">[Market Status]</font> <b>Reason for not buying:</b> All energy orders are too expensive (above ${reasonablePrice.toFixed(2)} credits)`);
					} else {
						let bestOrder = _.sortBy(reasonableOrders, order => order.price)[0];
						let totalCost = bestOrder.price * 5000; // Estimate cost for 5000 energy
						
						if (totalCost > availableCredits * creditLimit) {
							console.log(`<font color=\"#FFA500\">[Market Status]</font> <b>Reason for not buying:</b> Insufficient credits. Need ~${totalCost.toLocaleString()} credits, have ${availableCredits.toLocaleString()} (limit: ${(creditLimit * 100).toFixed(0)}%)`);
						}
					}
				}
			}

			// Transaction Cost Analysis
			if (energyOrders.length > 0) {
				let bestOrder = _.sortBy(energyOrders, order => order.price)[0];
				console.log(`<font color=\"#D3FFA3\">[Market Status]</font> <b>Transaction Cost Analysis (Best Order: ${bestOrder.price} credits):</b>`);
				
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
						
						console.log(`  ${colony.name}: ${energyStatus} Terminal energy: ${terminalEnergy}, Cost for ${sampleAmount} energy: ${energyCost} (${costPerUnit.toFixed(3)} per unit), Net gain: ${netGain} (<font color=\"${statusColor}\">${profitMargin.toFixed(1)}% profit</font>)`);
						
						if (terminalEnergy < energyCost) {
							console.log(`    ⚠️  Terminal needs ${energyCost - terminalEnergy} more energy for transaction`);
						}
					}
				});
			}

			return `<font color=\"#D3FFA3\">[Console]</font> Market status displayed.`;
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
			return `<font color=\"#D3FFA3\">[Console]</font> Cleared ${cleared} emergency market orders.`;
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
				return `<font color=\"#D3FFA3\">[Console]</font> Set ${key} to ${value}.`;
			} else {
				return `<font color=\"#FF6B6B\">[Console]</font> Unknown config key: ${key}. Available: market_min_energy_gain`;
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
			
			console.log(`<font color=\"#D3FFA3\">[System Status]</font> <b>CPU Performance:</b>`);
			console.log(`  Used: ${cpuUsed.toFixed(2)}/${cpuLimit} (${cpuPercent.toFixed(1)}%)`);
			console.log(`  Bucket: ${cpuBucket.toFixed(0)}`);
			console.log(`  Status: ${cpuPercent > 80 ? "⚠️ High" : cpuPercent > 60 ? "⚡ Medium" : "✅ Good"}`);
			
			// Memory Usage
			let memorySize = JSON.stringify(Memory).length;
			let memoryKB = (memorySize / 1024).toFixed(1);
			console.log(`<font color=\"#D3FFA3\">[System Status]</font> <b>Memory Usage:</b> ${memoryKB} KB`);
			
			// Colony Status
			let colonies = _.filter(Game.rooms, r => r.controller && r.controller.my);
			let totalCreeps = Object.keys(Game.creeps).length;
			let totalStructures = Object.keys(Game.structures).length;
			
			console.log(`<font color=\"#D3FFA3\">[System Status]</font> <b>Colony Status:</b>`);
			console.log(`  Colonies: ${colonies.length}`);
			console.log(`  Creeps: ${totalCreeps}`);
			console.log(`  Structures: ${totalStructures}`);
			
			// Energy Status
			let totalEnergy = 0;
			_.each(colonies, colony => {
				totalEnergy += colony.store("energy");
			});
			console.log(`<font color=\"#D3FFA3\">[System Status]</font> <b>Total Energy:</b> ${totalEnergy.toLocaleString()}`);
			
			// Market Status
			let availableCredits = Game.market.credits || 0;
			console.log(`<font color=\"#D3FFA3\">[System Status]</font> <b>Market Credits:</b> ${availableCredits.toLocaleString()}`);
			
			// Pulse Status
			console.log(`<font color=\"#D3FFA3\">[System Status]</font> <b>Pulse Status:</b>`);
			console.log(`  Defense: ${isPulse_Defense() ? "✅ Active" : "⏸️ Inactive"}`);
			console.log(`  Short: ${isPulse_Short() ? "✅ Active" : "⏸️ Inactive"}`);
			console.log(`  Mid: ${isPulse_Mid() ? "✅ Active" : "⏸️ Inactive"}`);
			console.log(`  Spawn: ${isPulse_Spawn() ? "✅ Active" : "⏸️ Inactive"}`);
			
			return `<font color=\"#D3FFA3\">[System Status]</font> System status displayed.`;
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
						console.log(`<font color=\"#D3FFA3\">[Console]</font> Created terminal fuel order for ${colony.name}: ${energyNeeded} energy (current: ${terminalEnergy})`);
					}
				}
			});
			
			return `<font color=\"#D3FFA3\">[Console]</font> Created ${fueled} terminal fuel orders.`;
		};

		resources.force_emergency_orders = function () {
			// Find a room with a terminal to trigger the emergency order creation
			let roomWithTerminal = _.find(Game.rooms, r => r.controller && r.controller.my && r.terminal);
			if (!roomWithTerminal) {
				return `<font color=\"#D3FFA3\">[Console]</font> Error: No room with terminal found.`;
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
								console.log(`<font color=\"#FF6B6B\">[Market Emergency]</font> Manual trigger: Transaction not profitable: buying ${amountToBuy} energy costs ${energyCost} energy (net gain: ${netEnergyGained}). Skipping.`);
								return;
							}
							
							// Check if the energy gain is significant enough
							let minSignificantGain = _.get(Memory, ["resources", "market_min_energy_gain"], 1000);
							if (netEnergyGained < minSignificantGain) {
								console.log(`<font color=\"#FF6B6B\">[Market Emergency]</font> Manual trigger: Energy gain too small: ${netEnergyGained} net energy (minimum: ${minSignificantGain}). Skipping.`);
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
								console.log(`<font color=\"#FF6B6B\">[Market Emergency]</font> Manual trigger: Terminal in ${roomWithTerminal.name} needs ${energyNeeded} energy for transaction. Creating high-priority energy order.`);
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

							console.log(`<font color=\"#FF6B6B\">[Market Emergency]</font> Manual trigger: Creating market buy order: ${amountToBuy} energy at ${bestOrder.price} credits (cost: ${energyCost} energy, net gain: ${netEnergyGained}) to ${bestReceivingRoom} (terminal energy: ${bestRoomEnergy}).`);
						} else {
							console.log(`<font color=\"#FF6B6B\">[Market Emergency]</font> Manual trigger: Insufficient credits. Need ${totalCost} credits, have ${availableCredits}.`);
						}
					} else {
						console.log(`<font color=\"#FF6B6B\">[Market Emergency]</font> Manual trigger: All energy orders too expensive. Average price: ${avgPrice.toFixed(2)}, max acceptable: ${maxPrice.toFixed(2)}.`);
					}
				} else {
					console.log(`<font color=\"#FF6B6B\">[Market Emergency]</font> Manual trigger: No energy sell orders available on market.`);
				}
			} else {
				console.log(`<font color=\"#FF6B6B\">[Market Emergency]</font> Manual trigger: Energy above threshold (${totalEnergy}/${energyThreshold}).`);
			}
			
			return `<font color=\"#D3FFA3\">[Console]</font> Emergency order creation triggered for ${roomWithTerminal.name}.`;
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

							console.log(`<font color=\"#FF6B6B\">[Market Emergency]</font> Manual trigger: Creating market buy order for ${amountToBuy} energy at ${bestOrder.price} credits to ${bestReceivingRoom} (terminal energy: ${bestRoomEnergy}).`);
						} else {
							console.log(`<font color=\"#FF6B6B\">[Market Emergency]</font> Manual trigger: Insufficient credits. Need ${totalCost} credits, have ${availableCredits}.`);
						}
					} else {
						console.log(`<font color=\"#FF6B6B\">[Market Emergency]</font> Manual trigger: All energy orders too expensive. Average price: ${avgPrice.toFixed(2)}, max acceptable: ${maxPrice.toFixed(2)}.`);
					}
				} else {
					console.log(`<font color=\"#FF6B6B\">[Market Emergency]</font> Manual trigger: No energy sell orders available on market.`);
				}
			} else {
				console.log(`<font color=\"#FF6B6B\">[Market Emergency]</font> Manual trigger: Energy above threshold (${totalEnergy}/${energyThreshold}).`);
			}
			
			return `<font color=\"#D3FFA3\">[Console]</font> Cleared ${cleared} emergency orders and triggered new emergency order creation.`;
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
			return `<font color=\"#D3FFA3\">[Console]</font> Price protection set to ${avgMultiplier || 2.0}x average and ${medianMultiplier || 1.5}x median.`;
		};

		help_resources.push("resources.set_credit_limit(percentage)");
		help_resources.push(" - Sets the maximum percentage of available credits to spend on emergency energy");
		help_resources.push(" - percentage: 0-100, default is 80%");
		help_resources.push(" - Example: resources.set_credit_limit(50) to only spend 50% of available credits");

		resources.set_credit_limit = function (percentage) {
			if (percentage < 0 || percentage > 100) {
				return `<font color=\"#FF6B6B\">[Console]</font> Error: Percentage must be between 0 and 100.`;
			}
			_.set(Memory, ["resources", "market_credit_limit"], percentage / 100);
			return `<font color=\"#D3FFA3\">[Console]</font> Credit limit set to ${percentage}% of available credits.`;
		};

		help_resources.push("resources.credits()");
		help_resources.push(" - Shows current available market credits");
		help_resources.push(" - Displays credits and spending limits");

		resources.credits = function () {
			let availableCredits = Game.market.credits || 0;
			let creditLimit = _.get(Memory, ["resources", "market_credit_limit"], 0.8);
			let maxSpendable = availableCredits * creditLimit;
			
			console.log(`<font color=\"#D3FFA3\">[Credits]</font> <b>Available Credits:</b> ${availableCredits.toLocaleString()}`);
			console.log(`<font color=\"#D3FFA3\">[Credits]</font> <b>Credit Limit:</b> ${(creditLimit * 100).toFixed(0)}%`);
			console.log(`<font color=\"#D3FFA3\">[Credits]</font> <b>Max Spendable:</b> ${maxSpendable.toLocaleString()}`);
			
			return `<font color=\"#D3FFA3\">[Console]</font> Credit information displayed.`;
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
			return `<font color=\"#D3FFA3\">[Console]</font> Combat request added to Memory.sites.combat.${combat_id} ... to cancel, delete the entry.`;
		};

		help_empire.push("");

		help_empire.push("empire.set_threat(roomName, level)  ... NONE, LOW, MEDIUM, HIGH")
		empire.set_threat = function (room_name, level) {
			_.set(Memory, ["rooms", room_name, "defense", "threat_level"], level);
			return `<font color=\"#D3FFA3\">[Console]</font> Threat level for room ${room_name} set.`;
		};

		help_empire.push("empire.set_threat_all(level)  ... NONE, LOW, MEDIUM, HIGH")
		empire.set_threat_all = function (level) {
			for (let i in Memory.rooms)
				_.set(Memory, ["rooms", i, "defense", "threat_level"], level);
			return `<font color=\"#D3FFA3\">[Console]</font> Threat level for all rooms set.`;
		};

		help_empire.push("empire.wall_target(hitpoints)  ... hitpoints can be null to reset")
		empire.wall_target = function (hitpoints) {
			if (hitpoints == null) {
				for (let i in Memory.rooms)
					if (_.has(Memory, ["rooms", i, "defense", "wall_hp_target"]))
						delete Memory["rooms"][i]["defense"]["wall_hp_target"];
				return `<font color=\"#D3FFA3\">[Console]</font> Wall/rampart hitpoint target reset to default for all rooms.`;
			} else {
				for (let i in Memory.rooms)
					_.set(Memory, ["rooms", i, "defense", "wall_hp_target"], hitpoints);
				return `<font color=\"#D3FFA3\">[Console]</font> Wall/rampart hitpoint target set for all rooms.`;
			}
		};

		help_empire.push("empire.set_camp(room_pos)")
		empire.set_camp = function (room_pos) {
			_.set(Memory, ["rooms", room_pos.roomName, "camp"], room_pos);
			return `<font color=\"#D3FFA3\">[Console]</font> Defensive camp set for room ${room_pos.roomName}.`;
		};

		help_empire.push("");
		help_empire.push("empire.colonize(rmFrom, rmTarget, {origin: {x: baseX, y: baseY}, name: layoutName}, focusDefense, [listRoute])");

		empire.colonize = function (from, target, layout, focus_defense, list_route) {
			_.set(Memory, ["sites", "colonization", target], { from: from, target: target, layout: layout, focus_defense: focus_defense, list_route: list_route });
			return `<font color=\"#D3FFA3\">[Console]</font> Colonization request added to Memory.sites.colonization.${target} ... to cancel, delete the entry.`;
		};

		help_empire.push("empire.spawn_assist(rmToAssist, [listRooms], [listRoute])");
		empire.spawn_assist = function (room_assist, list_rooms, list_route) {
			_.set(Memory, ["rooms", room_assist, "spawn_assist"], { rooms: list_rooms, list_route: list_route });
			return `<font color=\"#D3FFA3\">[Console]</font> Spawn assist added to Memory.rooms.${room_assist}.spawn_assist ... to cancel, delete the entry.`;
		};

		help_empire.push("empire.remote_mining(rmColony, rmHarvest, hasKeepers, [listRoute], [listSpawnAssistRooms], {customPopulation})");
		empire.remote_mining = function (rmColony, rmHarvest, hasKeepers, listRoute, listSpawnAssistRooms, customPopulation) {
			if (rmColony == null || rmHarvest == null)
				return `<font color=\"#D3FFA3\">[Console]</font> Error, invalid entry for remote_mining()`;

			_.set(Memory, ["sites", "mining", rmHarvest], { colony: rmColony, has_keepers: hasKeepers, list_route: listRoute, spawn_assist: listSpawnAssistRooms, population: customPopulation });
			return `<font color=\"#D3FFA3\">[Console]</font> Remote mining added to Memory.sites.mining.${rmHarvest} ... to cancel, delete the entry.`;
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
				return `<font color=\"#D3FFA3\">[Console]</font> Message for ${rmName} set.`;
			} else {
				_.set(Memory, ["hive", "signs", "default"], message);
				return `<font color=\"#D3FFA3\">[Console]</font> Default message set.`;
			}
		};

		help_empire.push("");
		help_empire.push("empire.upgrader_status(roomName)")
		empire.upgrader_status = function (roomName) {
			let room = Game.rooms[roomName];
			if (!room || !room.controller || !room.controller.my) {
				return `<font color=\"#D3FFA3\">[Console]</font> Error: Room ${roomName} not found or not controlled.`;
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

			console.log(`<font color=\"#D3FFA3\">[Console]</font> <b>Upgrader Status for ${roomName}:</b>`);
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

			return `<font color=\"#D3FFA3\">[Console]</font> Upgrader status displayed for ${roomName}.`;
		};

		help_empire.push("empire.upgrader_force_spawn(roomName, amount)")
		empire.upgrader_force_spawn = function (roomName, amount) {
			let room = Game.rooms[roomName];
			if (!room || !room.controller || !room.controller.my) {
				return `<font color=\"#D3FFA3\">[Console]</font> Error: Room ${roomName} not found or not controlled.`;
			}

			_.set(Memory, ["rooms", roomName, "upgrader_force_spawn"], { amount: amount, timestamp: Game.time });
			return `<font color=\"#D3FFA3\">[Console]</font> Force spawn ${amount} upgraders in ${roomName} next tick.`;
		};

		help_empire.push("empire.upgrader_clear_force_spawn(roomName)")
		empire.upgrader_clear_force_spawn = function (roomName) {
			delete Memory.rooms[roomName].upgrader_force_spawn;
			return `<font color=\"#D3FFA3\">[Console]</font> Force spawn cleared for ${roomName}.`;
		};

		help_empire.push("");
		help_empire.push("empire.clear_deprecated_memory()")
		empire.clear_deprecated_memory = function () {

			_.each(Memory.rooms, r => {
				delete r.tasks;
				delete r.structures;
			});

			return `<font color=\"#D3FFA3\">[Console]</font> Deleted deprecated Memory objects.`;
		};

		help_empire.push("empire.highway_mining(rmColony, targetRoom, resourceType, [listRoute], [listSpawnAssistRooms], {customPopulation})");
		help_empire.push(" - resourceType: 'power', 'silicon', 'metal', 'biomass', 'mist'");
		help_empire.push(" - Deploys single extractor to harvest commodity in target room (auto-returns when full)");
		empire.highway_mining = function (rmColony, targetRoom, resourceType, listRoute, listSpawnAssistRooms, customPopulation) {
			if (rmColony == null || targetRoom == null || resourceType == null)
				return `<font color=\"#D3FFA3\">[Console]</font> Error, invalid entry for highway_mining(). Required: colony room, target room, resource type.`;

			// Validate resource type
			let validResources = ['power', 'silicon', 'metal', 'biomass', 'mist'];
			if (!validResources.includes(resourceType)) {
				return `<font color=\"#D3FFA3\">[Console]</font> Error, invalid resource type. Valid types: ${validResources.join(', ')}`;
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
			return `<font color=\"#D3FFA3\">[Console]</font> ${message}`;
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
			if (!highwayMining) return `<font color=\"#D3FFA3\">[Console]</font> No highway mining operations found.`;

			let cleaned = 0;
			_.each(highwayMining, (data, highwayId) => {
				if (data.state === "completed") {
					delete highwayMining[highwayId];
					cleaned++;
				}
			});
			
			return `<font color=\"#D3FFA3\">[Console]</font> Cleaned up ${cleaned} completed highway mining operations.`;
		};

		help_empire.push("empire.highway_reset(highwayId)");
		empire.highway_reset = function (highwayId) {
			let highwayMining = Memory.sites.highway_mining;
			if (!highwayMining || !highwayMining[highwayId]) {
				return `<font color=\"#D3FFA3\">[Console]</font> Highway operation ${highwayId} not found.`;
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
			
			return `<font color=\"#D3FFA3\">[Console]</font> Reset highway operation ${highwayId}. Creeps will re-discover resources.`;
		};



		path = new Object();
		help_path.push("path.road(rmName, startX, startY, endX, endY)");

		path.road = function (rmName, startX, startY, endX, endY) {
			let room = Game.rooms[rmName];
			if (room == null)
				return `<font color=\"#D3FFA3\">[Console]</font> Error, ${rmName} not found.`;

			let from = new RoomPosition(startX, startY, rmName);
			let to = new RoomPosition(endX, endY, rmName);
			let path = room.findPath(from, to, { ignoreCreeps: true });
			for (let i = 0; i < path.length; i++)
				room.createConstructionSite(path[i].x, path[i].y, "road");
			room.createConstructionSite(startX, startY, "road");
			room.createConstructionSite(endX, endY, "road");

			return `<font color=\"#D3FFA3\">[Console]</font> Construction sites placed in ${rmName} for road from (${startX}, ${startY}) to (${endX}, ${endY}).`;
		};

		help_path.push("path.exit_tile(exit_pos)");

		path.exit_tile = function (exit_pos) {
			// Specifies preferred exit tiles to assist inter-room pathfinding
			if (!(exit_pos.x == 0 || exit_pos.x == 49 || exit_pos.y == 0 || exit_pos.y == 49)) {
				return `<font color=\"#D3FFA3\">[Console]</font> Invalid preferred exit tile position; must be an exit tile!`;
			}

			if (_.get(Memory, ["hive", "paths", "exits", "rooms", exit_pos.roomName]) == null)
				_.set(Memory, ["hive", "paths", "exits", "rooms", exit_pos.roomName], new Array());
			Memory["hive"]["paths"]["exits"]["rooms"][exit_pos.roomName].push(exit_pos);
			return `<font color=\"#D3FFA3\">[Console]</font> Preferred exit tile position added to Memory.hive.paths.exits.rooms.${exit_pos.roomName}`;
		};

		help_path.push("path.exit_area(roomName, startX, startY, endX, endY)");

		path.exit_area = function (room_name, start_x, start_y, end_x, end_y) {
			for (let x = start_x; x <= end_x; x++) {
				for (let y = start_y; y <= end_y; y++) {
					path.exit_tile(new RoomPosition(x, y, room_name));
				}
			}

			return `<font color=\"#D3FFA3\">[Console]</font> Preferred exit tile position added to Memory.hive.paths.exits.rooms.${room_name}`;
		};

		help_path.push("path.prefer(prefer_pos)");

		path.prefer = function (prefer_pos) {
			// Lowers the cost of specific tiles (e.g. swamp), so creeps take shorter paths through swamps rather than ERR_NO_PATH
			if (_.get(Memory, ["hive", "paths", "prefer", "rooms", prefer_pos.roomName]) == null)
				_.set(Memory, ["hive", "paths", "prefer", "rooms", prefer_pos.roomName], new Array());
			Memory["hive"]["paths"]["prefer"]["rooms"][prefer_pos.roomName].push(prefer_pos);
			return `<font color=\"#D3FFA3\">[Console]</font> Preference position added to Memory.hive.paths.prefer.rooms.${prefer_pos.roomName}`;
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

			return `<font color=\"#D3FFA3\">[Console]</font> Preference positions added to Memory.hive.paths.prefer.rooms.${room_name}`;
		};

		help_path.push("path.avoid(avoid_pos)");

		path.avoid = function (avoid_pos) {
			if (_.get(Memory, ["hive", "paths", "avoid", "rooms", avoid_pos.roomName]) == null)
				_.set(Memory, ["hive", "paths", "avoid", "rooms", avoid_pos.roomName], new Array());
			Memory["hive"]["paths"]["avoid"]["rooms"][avoid_pos.roomName].push(avoid_pos);
			return `<font color=\"#D3FFA3\">[Console]</font> Avoid position added to Memory.hive.paths.avoid.rooms.${avoid_pos.roomName}`;
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

			return `<font color=\"#D3FFA3\">[Console]</font> Avoid positions added to Memory.hive.paths.avoid.rooms.${room_name}`;
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

			return `<font color=\"#D3FFA3\">[Console]</font> Avoid positions added to Memory.hive.paths.avoid.rooms.${room_name}`;
		};

		help_path.push("path.reset(roomName)");

		path.reset = function (room_name) {
			delete Memory["hive"]["paths"]["avoid"]["rooms"][room_name];
			delete Memory["hive"]["paths"]["prefer"]["rooms"][room_name];
			delete Memory["hive"]["paths"]["exits"]["rooms"][room_name];
			return `<font color=\"#D3FFA3\">[Console]</font> Path modifiers reset for ${room_name}`;
		};


		visuals = new Object();
		help_visuals.push("visuals.toggle_path()");

		visuals.toggle_path = function () {
			if (_.get(Memory, ["hive", "visuals", "show_path"], false) == true)
				_.set(Memory, ["hive", "visuals", "show_path"], false)
			else
				_.set(Memory, ["hive", "visuals", "show_path"], true)

			return `<font color=\"#D3FFA3\">[Console]</font> Visuals for paths toggled to be shown: ${_.get(Memory, ["hive", "visuals", "show_path"], false)}`;
		};

		help_visuals.push("visuals.toggle_repair()");

		visuals.toggle_repair = function () {
			if (_.get(Memory, ["hive", "visuals", "show_repair"], false) == true)
				_.set(Memory, ["hive", "visuals", "show_repair"], false)
			else
				_.set(Memory, ["hive", "visuals", "show_repair"], true)

			return `<font color=\"#D3FFA3\">[Console]</font> Visuals for repairs toggled to be shown: ${_.get(Memory, ["hive", "visuals", "show_repair"], false)}`;
		};

		help_visuals.push("visuals.toggle_speech()");
		visuals.toggle_speech = function () {
			if (_.get(Memory, ["hive", "visuals", "show_speech"], false) == true)
				_.set(Memory, ["hive", "visuals", "show_speech"], false)
			else
				_.set(Memory, ["hive", "visuals", "show_speech"], true)

			return `<font color=\"#D3FFA3\">[Console]</font> Visuals for speech toggled to be shown: ${_.get(Memory, ["hive", "visuals", "show_speech"], false)}`;
		};

		help_visuals.push("visuals.set_performance(ticks)");
		help_visuals.push(" - Sets the update interval for expensive visualizations");
		help_visuals.push(" - ticks: how often to update visuals (default 5, higher = less CPU)");
		help_visuals.push(" - Example: visuals.set_performance(10) for updates every 10 ticks");

		visuals.set_performance = function (ticks) {
			if (ticks < 1) ticks = 1;
			if (ticks > 50) ticks = 50;
			_.set(Memory, ["hive", "visuals", "update_interval"], ticks);
			return `<font color=\"#D3FFA3\">[Console]</font> Visual performance set to update every ${ticks} ticks.`;
		};

		help_visuals.push("visuals.get_performance()");
		help_visuals.push(" - Shows current visual performance settings");

		visuals.get_performance = function () {
			const interval = _.get(Memory, ["hive", "visuals", "update_interval"], 5);
			const cpuUsed = Game.cpu.getUsed();
			const cpuLimit = Game.cpu.limit;
			const cpuPercent = (cpuUsed / cpuLimit * 100).toFixed(1);
			
			console.log(`<font color=\"#D3FFA3\">[Visuals]</font> <b>Performance Settings:</b>`);
			console.log(`  Update Interval: ${interval} ticks`);
			console.log(`  Current CPU: ${cpuUsed.toFixed(2)}/${cpuLimit} (${cpuPercent}%)`);
			console.log(`  Status: ${cpuPercent > 80 ? "⚠️ High" : cpuPercent > 60 ? "⚡ Medium" : "✅ Good"}`);
			
			return `<font color=\"#D3FFA3\">[Console]</font> Visual performance status displayed.`;
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
			return `<font color=\"#D3FFA3\">[Console]</font> Visual cache cleared.`;
		};
		pause = new Object();

		help_pause.push("pause.mineral_extraction()")
		pause.mineral_extraction = function () {
			_.set(Memory, ["hive", "pause", "extracting"], true);
			return `<font color=\"#D3FFA3\">[Console]</font> Pausing mineral extraction- delete Memory.hive.pause.extracting to resume.`;
		};

		help_pause.push("pause.refill_bucket()")
		pause.refill_bucket = function () {
			_.set(Memory, ["hive", "pause", "bucket"], true);
			return `<font color=\"#D3FFA3\">[Console]</font> Pausing main.js to refill bucket.`;
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
			
			console.log(`<font color=\"#FFD700\">[Pixels]</font> <b>Pixel Generation Status:</b>`);
			
			let statusTable = `<table ${tableStyle}>`;
			statusTable += `<tr><th ${headerStyle}>Setting</th><th ${headerStyle}>Value</th><th ${headerStyle}>Status</th></tr>`;
			statusTable += `<tr><td ${cellStyle}>Enabled</td><td ${cellStyle}>${enabled}</td><td ${cellStyle}>${enabled ? "<font color=\"#47FF3E\">✓ Active</font>" : "<font color=\"#FF6B6B\">✗ Disabled</font>"}</td></tr>`;
			statusTable += `<tr><td ${cellStyle}>CPU Threshold</td><td ${cellStyle}>${(cpuThreshold * 100).toFixed(0)}%</td><td ${cellStyle}>${cpuPercent < (cpuThreshold * 100) ? "<font color=\"#47FF3E\">✓ Below</font>" : "<font color=\"#FFA500\">⚠ Above</font>"}</td></tr>`;
			statusTable += `<tr><td ${cellStyle}>Current CPU</td><td ${cellStyle}>${cpuPercent}%</td><td ${cellStyle}>${cpuUsed.toFixed(2)}/${cpuLimit}</td></tr>`;
			statusTable += `<tr><td ${cellStyle}>CPU Bucket</td><td ${cellStyle}>${bucket}</td><td ${cellStyle}>${bucket >= 10000 ? "<font color=\"#47FF3E\">✓ Full</font>" : "<font color=\"#FFA500\">⚠ " + bucket + "/10000</font>"}</td></tr>`;
			statusTable += `</table>`;
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
				
				console.log(`<font color=\"#FFD700\">[Pixels]</font> <b>Statistics:</b>`);
				let statsTable = `<table ${tableStyle}>`;
				statsTable += `<tr><th ${headerStyle}>Metric</th><th ${headerStyle}>Value</th></tr>`;
				statsTable += `<tr><td ${cellStyle}>Total Pixels Generated</td><td ${cellStyle}>${totalGenerated}</td></tr>`;
				statsTable += `<tr><td ${cellStyle}>Last Generated</td><td ${cellStyle}>${lastGenerated > 0 ? "Tick " + lastGenerated : "Never"}</td></tr>`;
				statsTable += `<tr><td ${cellStyle}>Time Since Last Pixel</td><td ${cellStyle}>${timeSinceLastPixel !== "Never" ? timeSinceLastPixel + " ticks ago" : "Never"}</td></tr>`;
				statsTable += `<tr><td ${cellStyle}>Generation Rate</td><td ${cellStyle}>${generationRate}</td></tr>`;
				statsTable += `</table>`;
				console.log(statsTable);
			} else {
				console.log(`<font color=\"#FFD700\">[Pixels]</font> <b>Statistics:</b> No pixels generated yet.`);
			}
			
			// Recommendation
			if (enabled && bucket >= 10000 && cpuPercent >= (cpuThreshold * 100)) {
				console.log(`<font color=\"#FFA500\">[Pixels]</font> <b>⚠ Recommendation:</b> CPU usage (${cpuPercent}%) is above threshold (${(cpuThreshold * 100).toFixed(0)}%). Pixels will not generate until CPU usage decreases. Consider increasing threshold with pixels.set_threshold().`);
			} else if (!enabled) {
				console.log(`<font color=\"#FFA500\">[Pixels]</font> <b>Note:</b> Pixel generation is disabled. Use pixels.enable() to start generating.`);
			} else if (bucket < 10000) {
				console.log(`<font color=\"#FFA500\">[Pixels]</font> <b>Note:</b> Bucket must be full (10,000) to generate pixels. Current: ${bucket}.`);
			} else {
				console.log(`<font color=\"#47FF3E\">[Pixels]</font> <b>✓ Status:</b> All conditions met for pixel generation!`);
			}
			
			return `<font color=\"#FFD700\">[Pixels]</font> Pixel status displayed.`;
		};

		help_pixels.push("pixels.enable()");
		help_pixels.push(" - Enables automatic pixel generation");

		pixels.enable = function () {
			_.set(Memory, ["hive", "pixels", "enabled"], true);
			return `<font color=\"#FFD700\">[Pixels]</font> Pixel generation enabled.`;
		};

		help_pixels.push("pixels.disable()");
		help_pixels.push(" - Disables automatic pixel generation");

		pixels.disable = function () {
			_.set(Memory, ["hive", "pixels", "enabled"], false);
			return `<font color=\"#FFD700\">[Pixels]</font> Pixel generation disabled.`;
		};

		help_pixels.push("pixels.set_threshold(percent)");
		help_pixels.push(" - Sets the maximum CPU usage threshold for pixel generation");
		help_pixels.push(" - percent: 0-100, pixels only generate when CPU usage is below this");
		help_pixels.push(" - Default is 80%. Lower = more conservative, higher = more pixels");
		help_pixels.push(" - Example: pixels.set_threshold(70) for 70% threshold");

		pixels.set_threshold = function (percent) {
			if (percent == null || percent < 0 || percent > 100) {
				return `<font color=\"#FF6B6B\">[Pixels]</font> Error: Threshold must be between 0 and 100.`;
			}
			_.set(Memory, ["hive", "pixels", "cpu_threshold"], percent / 100);
			return `<font color=\"#FFD700\">[Pixels]</font> CPU threshold set to ${percent}%. Pixels will only generate when CPU usage is below this level.`;
		};

		help_pixels.push("pixels.reset_stats()");
		help_pixels.push(" - Resets pixel generation statistics (does not affect settings)");

		pixels.reset_stats = function () {
			_.set(Memory, ["hive", "pixels", "stats"], {
				total_generated: 0,
				last_generated: 0,
				generation_history: []
			});
			return `<font color=\"#FFD700\">[Pixels]</font> Pixel statistics reset.`;
		};


	/* ***********************************************************
	 *	SHARD COMMANDS (Multi-Shard Coordination)
	 * *********************************************************** */
	
	help_shard = new Array();
	help_shard.push(`<font color=\"#D3FFA3\"><u>Multi-Shard Commands:</u></font>`);
	
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
				return `<font color=\"#FF0000\">[Shard]</font> Error: Shard ${shardName} not found`;
			}
			
			// Display detailed status
			let colonies = Object.keys(status.colonies || {}).length;
			let energy = _.get(status, ["resources", "energy"], 0);
			let cpu = _.get(status, ["cpu", "used"], 0);
			let bucket = _.get(status, ["cpu", "bucket"], 0);
			let tick = status.tick || 0;
			let age = Game.time - tick;
			
			console.log(`<font color=\"#00FFFF\">[Shard]</font> === Shard: ${shardName} ===`);
			console.log(`<font color=\"#00FFFF\">[Shard]</font> Tick: ${tick} (age: ${age} ticks)`);
			console.log(`<font color=\"#00FFFF\">[Shard]</font> Colonies: ${colonies}`);
			console.log(`<font color=\"#00FFFF\">[Shard]</font> Energy: ${energy.toLocaleString()}`);
			console.log(`<font color=\"#00FFFF\">[Shard]</font> CPU: ${cpu.toFixed(1)} / Bucket: ${bucket}`);
			
			if (detailed) {
				// Show detailed colony info
				_.each(Object.keys(status.colonies || {}), colonyName => {
					let colony = status.colonies[colonyName];
					console.log(`<font color=\"#00FFFF\">[Shard]</font>   Colony ${colonyName}:`);
					console.log(`<font color=\"#00FFFF\">[Shard]</font>     RCL: ${colony.rcl}, Energy: ${colony.energy.toLocaleString()}`);
					console.log(`<font color=\"#00FFFF\">[Shard]</font>     Spawns: ${colony.spawns_available}/${colony.spawns_total}`);
				});
				
				// Show minerals
				let minerals = _.get(status, ["resources", "minerals"], {});
				if (Object.keys(minerals).length > 0) {
					console.log(`<font color=\"#00FFFF\">[Shard]</font> Minerals:`);
					_.each(Object.keys(minerals), mineral => {
						console.log(`<font color=\"#00FFFF\">[Shard]</font>   ${mineral}: ${minerals[mineral].toLocaleString()}`);
					});
				}
			}
			
			return `<font color=\"#00FFFF\">[Shard]</font> Status for ${shardName} displayed`;
		} else {
			// Show all shards
			ShardCoordinator.displayStatus();
			return `<font color=\"#00FFFF\">[Shard]</font> Status displayed`;
		}
	};
		
	help_shard.push("shard.portals()");
	help_shard.push(" - Display all known portals on current shard");
	
	shard.portals = function() {
		Portals.display();
		return `<font color=\"#00FFFF\">[Shard]</font> Portal list displayed`;
	};
	
	help_shard.push("shard.colonies(shardName)");
	help_shard.push(" - List all colonies on a specific shard");
	help_shard.push(" - shardName: Optional, defaults to current shard");
	
	shard.colonies = function(shardName) {
		if (!Game.shard && !shardName) {
			return `<font color=\"#FF0000\">[Shard]</font> Error: Not on multi-shard server`;
		}
		
		let targetShard = shardName || (Game.shard ? Game.shard.name : null);
		let status = ShardCoordinator.getShardStatus(targetShard);
		
		if (!status) {
			return `<font color=\"#FF0000\">[Shard]</font> Error: Shard ${targetShard} not found`;
		}
		
		console.log(`<font color=\"#00FFFF\">[Shard]</font> === Colonies on ${targetShard} ===`);
		
		let colonies = status.colonies || {};
		if (Object.keys(colonies).length === 0) {
			console.log(`<font color=\"#00FFFF\">[Shard]</font> No colonies found`);
		} else {
			_.each(Object.keys(colonies).sort(), roomName => {
				let colony = colonies[roomName];
				let portalIndicator = (colony.portal_rooms && colony.portal_rooms.length > 0) ? " 🌀" : "";
				console.log(`<font color=\"#00FFFF\">[Shard]</font> ${roomName}${portalIndicator}:`);
				console.log(`<font color=\"#00FFFF\">[Shard]</font>   RCL: ${colony.rcl}, Energy: ${colony.energy.toLocaleString()}`);
				console.log(`<font color=\"#00FFFF\">[Shard]</font>   Spawns: ${colony.spawns_available}/${colony.spawns_total}${colony.can_assist ? " (assist available)" : ""}`);
				if (colony.portal_rooms && colony.portal_rooms.length > 0) {
					console.log(`<font color=\"#00FFFF\">[Shard]</font>   Portal rooms: ${colony.portal_rooms.join(", ")}`);
				}
			});
		}
		
		return `<font color=\"#00FFFF\">[Shard]</font> Colonies for ${targetShard} displayed`;
	};
	
	help_shard.push("shard.resources(shardName)");
	help_shard.push(" - Show resource availability on a specific shard");
	help_shard.push(" - shardName: Optional, defaults to current shard");
	
	shard.resources = function(shardName) {
		if (!Game.shard && !shardName) {
			return `<font color=\"#FF0000\">[Shard]</font> Error: Not on multi-shard server`;
		}
		
		let targetShard = shardName || (Game.shard ? Game.shard.name : null);
		let status = ShardCoordinator.getShardStatus(targetShard);
		
		if (!status) {
			return `<font color=\"#FF0000\">[Shard]</font> Error: Shard ${targetShard} not found`;
		}
		
		console.log(`<font color=\"#00FFFF\">[Shard]</font> === Resources on ${targetShard} ===`);
		
		let resources = status.resources || {};
		
		// Show energy
		let energy = resources.energy || 0;
		console.log(`<font color=\"#00FFFF\">[Shard]</font> Energy: ${energy.toLocaleString()}`);
		
		// Show minerals
		let minerals = resources.minerals || {};
		if (Object.keys(minerals).length > 0) {
			console.log(`<font color=\"#00FFFF\">[Shard]</font> <b>Minerals:</b>`);
			let mineralKeys = Object.keys(minerals).sort();
			_.each(mineralKeys, mineral => {
				console.log(`<font color=\"#00FFFF\">[Shard]</font>   ${mineral}: ${minerals[mineral].toLocaleString()}`);
			});
		}
		
		// Show commodities
		let commodities = resources.commodities || {};
		if (Object.keys(commodities).length > 0) {
			console.log(`<font color=\"#00FFFF\">[Shard]</font> <b>Commodities:</b>`);
			let commodityKeys = Object.keys(commodities).sort();
			_.each(commodityKeys, commodity => {
				console.log(`<font color=\"#00FFFF\">[Shard]</font>   ${commodity}: ${commodities[commodity].toLocaleString()}`);
			});
		}
		
		return `<font color=\"#00FFFF\">[Shard]</font> Resources for ${targetShard} displayed`;
	};
	
	help_shard.push("shard.debug_ism()");
		help_shard.push(" - Show InterShardMemory contents and size");
		
		shard.debug_ism = function() {
			ISM.debug();
			return `<font color=\"#00FFFF\">[Shard]</font> ISM debug info displayed`;
		};
		
		help_shard.push("shard.colonize(targetShard, targetRoom, options)");
		help_shard.push(" - Plan colonization on another shard");
		help_shard.push(" - targetShard: Destination shard name (e.g., 'shard1')");
		help_shard.push(" - targetRoom: Destination room name (e.g., 'W1N1')");
		help_shard.push(" - options: { sourceRoom: 'W5N5', layout: 'def_hor' }");
		
		shard.colonize = function(targetShard, targetRoom, options = {}) {
			if (!targetShard || !targetRoom) {
				return `<font color=\"#FF0000\">[Shard]</font> Error: targetShard and targetRoom required`;
			}
			
			let opId = ShardCoordinator.planColonization(targetShard, targetRoom, options);
			if (opId) {
				return `<font color=\"#00FF00\">[Shard]</font> Colonization operation ${opId} created`;
			} else {
				return `<font color=\"#FF0000\">[Shard]</font> Failed to create colonization operation`;
			}
		};
		
		help_shard.push("shard.operations()");
		help_shard.push(" - Display all active cross-shard operations");
		
		shard.operations = function() {
			let colonizations = _.get(Memory, ["shard", "operations", "colonizations"], []);
			let transfers = _.get(Memory, ["shard", "operations", "creep_transfers"], []);
			
			console.log(`<font color=\"#00FFFF\">[Shard]</font> === Active Cross-Shard Operations ===`);
			
			if (colonizations.length > 0) {
				console.log(`<font color=\"#00FFFF\">[Shard]</font> <b>Colonizations (${colonizations.length}):</b>`);
				_.each(colonizations, op => {
					console.log(`<font color=\"#00FFFF\">[Shard]</font>   ${op.id}: ${op.dest_shard}/${op.dest_room} - ${op.status}`);
				});
			}
			
			if (transfers.length > 0) {
				console.log(`<font color=\"#00FFFF\">[Shard]</font> <b>Creep Transfers (${transfers.length}):</b>`);
				_.each(transfers, transfer => {
					console.log(`<font color=\"#00FFFF\">[Shard]</font>   ${transfer.creep_name}: → ${transfer.dest_shard}/${transfer.dest_room} - ${transfer.status}`);
				});
			}
			
			if (colonizations.length === 0 && transfers.length === 0) {
				console.log(`<font color=\"#00FFFF\">[Shard]</font> No active operations`);
			}
			
			return `<font color=\"#00FFFF\">[Shard]</font> Operations displayed`;
		};
		
		help_shard.push("shard.clear_operations()");
		help_shard.push(" - Clear all stuck operations");
		
		shard.clear_operations = function() {
			_.set(Memory, ["shard", "operations", "colonizations"], []);
			_.set(Memory, ["shard", "operations", "creep_transfers"], []);
			return `<font color=\"#00FFFF\">[Shard]</font> All operations cleared`;
		};


		help = function (submenu) {
			let menu = new Array()
			if (submenu == null)
				menu = help_main;
			else {
				switch (submenu.toString().toLowerCase()) {
					case "allies": menu = help_allies; break;
					case "blueprint": menu = help_blueprint; break;
					case "empire": menu = help_empire; break;
					case "factories": menu = help_factories; break;
					case "labs": menu = help_labs; break;
					case "log": menu = help_log; break;
					case "path": menu = help_path; break;
					case "pause": menu = help_pause; break;
					case "pixels": menu = help_pixels; break;
					case "profiler": menu = help_profiler; break;
					case "resources": menu = help_resources; break;
					case "shard": menu = help_shard; break;
					case "visuals": menu = help_visuals; break;
				}
			}

			console.log(`<font color=\"#D3FFA3\">Command list:</font> <br>${menu.join("<br>")}<br><br>`);
			return `<font color=\"#D3FFA3\">[Console]</font> Help("${submenu}") list complete`;
		};
	}
};
