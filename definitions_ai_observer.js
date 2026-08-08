/* ***********************************************************
 *  DEFINITIONS: AI COMMANDER STRATEGIC OBSERVER
 * *********************************************************** */

// Builds a compact, JSON-safe strategic view. Expensive raw game objects,
// individual creep state, and long time-series histories stay out of segments.
global.AIObserver = {

	SCHEMA_VERSION: 3,
	MAX_HOSTILE_EVENTS: 50,
	MAX_INTEL_ROOMS: 150,
	STRUCTURE_TYPES: [
		"spawn", "extension", "tower", "storage", "terminal", "link", "lab",
		"factory", "extractor", "observer", "nuker", "powerSpawn"
	],

	buildSnapshot: function () {
		this._populationCache = null;
		this._player = this._playerName();
		let alerts = [];
		let ownedRooms = _.filter(_.get(Game, "rooms", {}), room => {
			return _.get(room, ["controller", "my"], false) === true;
		});
		let ownedNames = _.map(ownedRooms, room => room.name);
		this._refreshVisibleIntelligence(ownedNames);

		let colonies = {};
		_.each(ownedRooms, room => {
			colonies[room.name] = this._colony(room);
			let hostileCount = _.get(colonies, [room.name, "defense", "hostileCreeps"], 0);
			if (hostileCount > 0)
				alerts.push(`HOSTILES:${room.name}:${hostileCount}`);
			if (_.get(Memory, ["rooms", room.name, "survey", "downgrade_critical"], false))
				alerts.push(`CONTROLLER_DOWNGRADE:${room.name}`);
			if (_.get(Memory, ["rooms", room.name, "spawn_assist", "rooms"]) != null)
				alerts.push(`SPAWN_ASSIST:${room.name}`);
		});

		let territory = this._territory(ownedNames);
		let gclLevel = _.get(Game, ["gcl", "level"], 0);
		return {
			schemaVersion: this.SCHEMA_VERSION,
			tick: _.get(Game, "time", 0),
			shard: _.get(Game, ["shard", "name"], "sim"),
			cpu: {
				limit: _.get(Game, ["cpu", "limit"], 0),
				used: _.isFunction(_.get(Game, ["cpu", "getUsed"])) ? Game.cpu.getUsed() : 0,
				bucket: _.get(Game, ["cpu", "bucket"], 0)
			},
			empire: {
				player: this._player,
				gcl: {
					level: gclLevel,
					progress: _.get(Game, ["gcl", "progress"], 0),
					progressTotal: _.get(Game, ["gcl", "progressTotal"], 0),
					ownedRooms: ownedRooms.length,
					availableClaimSlots: Math.max(0, gclLevel - ownedRooms.length)
				},
				creeps: _.size(_.get(Game, "creeps", {})),
				credits: _.get(Game, ["market", "credits"], 0)
			},
			colonies: colonies,
			operations: {
				colonizations: this._colonizations(),
				remoteMining: this._remoteMining(),
				combat: this._combat(),
				scouting: this._scouting()
			},
			intelligence: territory.intelligence,
			expansionCandidates: territory.candidates,
			authority: {
				mode: _.get(Memory, ["ai", "mode"], "observe"),
				allowedActions: [
					"NOOP", "REQUEST_STATUS", "SET_EXPLANATION", "SET_OPERATIONAL_AUTHORITY", "SET_EXECUTION_MODE", "SCOUT_ROOM",
					"REASSESS_REMOTE", "ENSURE_REMOTE_RESERVATION",
					"ENSURE_REMOTE_INFRASTRUCTURE", "REBALANCE_REMOTE_LOGISTICS"
				],
				execution: {
					scouting: _.get(Memory, ["ai", "policy", "allowScouting"], false) === true,
					autoScouting: _.get(Memory, ["ai", "policy", "autoScouting"], false) === true,
					expansion: false,
					remoteMaintenance: _.get(Memory, ["ai", "policy", "allowRemoteMaintenance"], false) === true,
					autoRemoteMaintenance: _.get(Memory, ["ai", "policy", "autoRemoteMaintenance"], false) === true,
					remoteMiningChanges: false,
					market: false,
					production: false,
					offensiveCombat: false
				},
				matrix: {
					SET_OPERATIONAL_AUTHORITY: { allowed: true, automatic: false },
					SET_EXECUTION_MODE: { allowed: true, automatic: false },
					SCOUT_ROOM: { allowed: _.get(Memory, ["ai", "policy", "allowScouting"], false) === true, automatic: _.get(Memory, ["ai", "policy", "autoScouting"], false) === true },
					REASSESS_REMOTE: { allowed: _.get(Memory, ["ai", "policy", "allowRemoteMaintenance"], false) === true, automatic: _.get(Memory, ["ai", "policy", "autoRemoteMaintenance"], false) === true },
					ENSURE_REMOTE_RESERVATION: { allowed: _.get(Memory, ["ai", "policy", "allowRemoteMaintenance"], false) === true, automatic: _.get(Memory, ["ai", "policy", "autoRemoteMaintenance"], false) === true },
					ENSURE_REMOTE_INFRASTRUCTURE: { allowed: _.get(Memory, ["ai", "policy", "allowRemoteMaintenance"], false) === true, automatic: _.get(Memory, ["ai", "policy", "autoRemoteMaintenance"], false) === true },
					REBALANCE_REMOTE_LOGISTICS: { allowed: _.get(Memory, ["ai", "policy", "allowRemoteMaintenance"], false) === true, automatic: _.get(Memory, ["ai", "policy", "autoRemoteMaintenance"], false) === true },
					START_REMOTE_MINING: { allowed: false, automatic: false },
					STOP_REMOTE_MINING: { allowed: false, automatic: false },
					COLONIZE_ROOM: { allowed: false, automatic: false },
					ATTACK_ROOM: { allowed: false, automatic: false }
				}
			},
			alerts: alerts
		};
	},

	serialize: function (snapshot) {
		let started = _.isFunction(_.get(Game, ["cpu", "getUsed"])) ? Game.cpu.getUsed() : 0;
		let value = snapshot == null ? this.buildSnapshot() : snapshot;
		let measured = _.isFunction(_.get(Game, ["cpu", "getUsed"])) ? Math.max(0, Game.cpu.getUsed() - started) : 0;
		value.observer = { cpuUsed: measured, payloadBytes: 0 };
		let serialized = JSON.stringify(value);
		// Re-serialize until the self-reported UTF-8 byte length is stable. Memory
		// Segment limits are bytes, while JavaScript string length counts UTF-16.
		for (let i = 0; i < 3; i++) {
			let payloadBytes = this._utf8Bytes(serialized);
			if (value.observer.payloadBytes === payloadBytes)
				break;
			value.observer.payloadBytes = payloadBytes;
			serialized = JSON.stringify(value);
		}
		_.set(Memory, ["ai", "metrics", "observerCpu"], measured);
		_.set(Memory, ["ai", "metrics", "payloadBytes"], this._utf8Bytes(serialized));
		return serialized;
	},

	_utf8Bytes: function (value) {
		let bytes = 0;
		for (let i = 0; i < value.length; i++) {
			let code = value.charCodeAt(i);
			if (code < 0x80)
				bytes += 1;
			else if (code < 0x800)
				bytes += 2;
			else if (code >= 0xD800 && code <= 0xDBFF && i + 1 < value.length
				&& value.charCodeAt(i + 1) >= 0xDC00 && value.charCodeAt(i + 1) <= 0xDFFF) {
				bytes += 4;
				i++;
			} else
				bytes += 3;
		}
		return bytes;
	},

	recordPopulationTarget: function (scope, colony, room, target, actual, source) {
		let expected = {};
		_.each(target || {}, (settings, role) => {
			let amount = _.get(settings, "amount", 0);
			if (_.isNumber(amount) && amount > 0)
				expected[role] = amount;
		});
		let requested = {};
		_.each(_.get(Memory, ["shard", "spawn_requests"], []), request => {
			let args = _.get(request, "args", {});
			if (_.get(request, "room") === colony && _.get(args, "room") === room) {
				let role = _.get(args, "role", "unknown");
				requested[role] = _.get(requested, role, 0) + 1;
			}
		});
		_.set(Memory, ["ai", "metrics", "population", scope, room], {
			colony: colony,
			expected: expected,
			actual: _.cloneDeep(actual || {}),
			requested: requested,
			source: source || "AZC_ACTIVE_TARGET",
			updatedTick: Game.time
		});
	},

	recordRemoteDelivery: function (creep, amount) {
		if (!creep || !_.isNumber(amount) || amount <= 0)
			return;
		let remote = _.get(creep, ["memory", "room"]);
		let colony = _.get(creep, ["memory", "colony"]);
		if (!remote || !colony || remote === colony || !_.has(Memory, ["sites", "mining", remote]))
			return;
		let path = ["ai", "metrics", "remotes", remote];
		_.set(Memory, path.concat("energyDeliveredTotal"), _.get(Memory, path.concat("energyDeliveredTotal"), 0) + amount);
		_.set(Memory, path.concat("lastDeliveryTick"), Game.time);
	},

	recordRemoteLoss: function (creepMemory) {
		let remote = _.get(creepMemory, "room");
		let colony = _.get(creepMemory, "colony");
		if (!remote || !colony || remote === colony || !_.has(Memory, ["sites", "mining", remote]))
			return;
		let path = ["ai", "metrics", "remotes", remote];
		_.set(Memory, path.concat("creepLossesTotal"), _.get(Memory, path.concat("creepLossesTotal"), 0) + 1);
		_.set(Memory, path.concat("lastCreepLossTick"), Game.time);
	},

	recordRemoteInterruption: function (roomName) {
		let path = ["ai", "metrics", "remotes", roomName];
		_.set(Memory, path.concat("hostileInterruptionsTotal"), _.get(Memory, path.concat("hostileInterruptionsTotal"), 0) + 1);
		_.set(Memory, path.concat("lastInterruptionTick"), Game.time);
	},

	_colony: function (room) {
		let structures = this._find(room, typeof FIND_STRUCTURES !== "undefined" ? FIND_STRUCTURES : null);
		let construction = this._find(room, typeof FIND_MY_CONSTRUCTION_SITES !== "undefined" ? FIND_MY_CONSTRUCTION_SITES : null);
		let dropped = this._find(room, typeof FIND_DROPPED_RESOURCES !== "undefined" ? FIND_DROPPED_RESOURCES : null);
		let hostiles = this._find(room, typeof FIND_HOSTILE_CREEPS !== "undefined" ? FIND_HOSTILE_CREEPS : null);
		let hostileStructures = this._find(room, typeof FIND_HOSTILE_STRUCTURES !== "undefined" ? FIND_HOSTILE_STRUCTURES : null);
		let level = _.get(room, ["controller", "level"], 0);
		let structureSummary = this._structureSummary(structures, level);
		let controller = _.get(room, "controller", {});
		let progress = _.get(controller, "progress", 0);
		let progressTotal = _.get(controller, "progressTotal", 0);
		let spawns = _.filter(structures, structure => structure.structureType === "spawn");
		if (spawns.length === 0)
			spawns = _.filter(_.get(Game, "spawns", {}), spawn => _.get(spawn, ["room", "name"]) === room.name);
		let busy = _.filter(spawns, spawn => _.get(spawn, "spawning") != null).length;
		let queue = this._spawnQueue(room.name);
		let containers = _.filter(structures, structure => structure.structureType === "container");
		let towers = _.filter(structures, structure => structure.structureType === "tower");
		let ramparts = _.filter(structures, structure => structure.structureType === "rampart");
		let walls = _.filter(structures, structure => structure.structureType === "constructedWall");
		let recentHostiles = _.filter(_.get(Memory, ["ai", "intelligence", "hostileEvents"], []), event => {
			return event.room === room.name && Game.time - event.tick <= 20000;
		});
		let expected = _.get(Memory, ["ai", "metrics", "population", "colonies", room.name, "expected"], {});
		let terminalAllowed = _.get(structureSummary, ["terminal", "allowed"], 0) > 0;

		return {
			controller: {
				rcl: level,
				progress: progress,
				progressTotal: progressTotal,
				progressPercent: progressTotal > 0 ? Math.round(progress * 10000 / progressTotal) / 100 : 100,
				ticksToDowngrade: _.get(controller, "ticksToDowngrade", null),
				downgradeCritical: _.get(Memory, ["rooms", room.name, "survey", "downgrade_critical"], false) === true,
				safeMode: _.get(controller, "safeMode", null),
				safeModeAvailable: _.get(controller, "safeModeAvailable", 0),
				safeModeCooldown: _.get(controller, "safeModeCooldown", null)
			},
			energy: {
				available: _.get(room, "energyAvailable", 0),
				capacity: _.get(room, "energyCapacityAvailable", 0),
				storageEnergy: this._resource(_.get(room, "storage"), "energy"),
				terminalEnergy: terminalAllowed ? this._resource(_.get(room, "terminal"), "energy") : null,
				droppedEnergy: _.sum(_.map(dropped, resource => _.get(resource, "resourceType") === "energy" ? _.get(resource, "amount", 0) : 0)),
				containers: {
					count: containers.length,
					energy: _.sum(_.map(containers, container => this._resource(container, "energy"))),
					capacity: _.sum(_.map(containers, container => this._capacity(container, "energy")))
				}
			},
			structures: structureSummary,
			capabilities: {
				canUseStorage: _.get(structureSummary, ["storage", "allowed"], 0) > 0,
				canUseTerminal: terminalAllowed,
				canUseLabs: _.get(structureSummary, ["lab", "allowed"], 0) > 0,
				canUseFactory: _.get(structureSummary, ["factory", "allowed"], 0) > 0,
				canUseLinks: _.get(structureSummary, ["link", "allowed"], 0) > 0,
				canUseExtractor: _.get(structureSummary, ["extractor", "allowed"], 0) > 0
			},
			spawning: {
				spawns: spawns.length,
				busy: busy,
				idle: Math.max(0, spawns.length - busy),
				queueDepth: queue.length,
				queuedRoles: _.countBy(queue, request => _.get(request, ["args", "role"], _.get(request, "role", "unknown")))
			},
			construction: {
				sites: construction.length,
				byType: _.countBy(construction, site => _.get(site, "structureType", "unknown")),
				outstandingEnergy: _.sum(_.map(construction, site => Math.max(0, _.get(site, "progressTotal", 0) - _.get(site, "progress", 0))))
			},
			defense: {
				towers: towers.length,
				towerEnergy: _.sum(_.map(towers, tower => this._resource(tower, "energy"))),
				ramparts: this._hitSummary(ramparts),
				walls: this._hitSummary(walls),
				hostileCreeps: hostiles.length || _.size(_.get(Memory, ["rooms", room.name, "defense", "hostiles"], [])),
				hostileStructures: hostileStructures.length,
				recentHostileEvents: recentHostiles.length,
				lastHostileSightingTick: _.get(Memory, ["ai", "intelligence", "rooms", room.name, "lastHostileSightingTick"], null)
			},
			population: this._populationSummary(room.name, room.name, expected)
		};
	},

	_structureSummary: function (structures, level) {
		let result = {};
		_.each(this.STRUCTURE_TYPES, type => {
			result[type] = {
				count: _.filter(structures, structure => structure.structureType === type && _.get(structure, "my", true) !== false).length,
				allowed: this._allowed(type, level)
			};
		});
		return result;
	},

	_allowed: function (type, level) {
		if (typeof CONTROLLER_STRUCTURES === "undefined")
			return 0;
		return _.get(CONTROLLER_STRUCTURES, [type, level], 0) || 0;
	},

	_hitSummary: function (structures) {
		let hits = _.sortBy(_.map(structures, structure => _.get(structure, "hits", 0)));
		if (hits.length === 0)
			return { count: 0, min: null, median: null, max: null };
		let middle = Math.floor(hits.length / 2);
		let median = hits.length % 2 === 1 ? hits[middle] : Math.round((hits[middle - 1] + hits[middle]) / 2);
		return { count: hits.length, min: hits[0], median: median, max: hits[hits.length - 1] };
	},

	_spawnQueue: function (roomName) {
		let queues = [];
		queues = queues.concat(_.get(Memory, ["hive", "spawn_requests"], []));
		queues = queues.concat(_.get(Memory, ["shard", "spawn_requests"], []));
		return _.filter(queues, request => request && (_.get(request, "room") === roomName
			|| _.includes(_.get(request, "listRooms", []), roomName)));
	},

	_populationSummary: function (roomName, colonyName, expected) {
		if (!this._populationCache)
			this._buildPopulationCache();
		let key = `${colonyName}|${roomName}`;
		let actual = _.get(this._populationCache, key, {});
		let metric = _.get(Memory, ["ai", "metrics", "population", roomName === colonyName ? "colonies" : "remotes", roomName], {});
		let queued = _.cloneDeep(_.get(metric, "requested", {}));
		_.each(this._spawnQueue(colonyName), request => {
			let args = _.get(request, "args", {});
			if (_.get(args, "room") !== roomName)
				return;
			let role = _.get(args, "role", _.get(request, "role", "unknown"));
			queued[role] = Math.max(_.get(queued, role, 0), 1);
		});
		let roles = {};
		let names = _.uniq(_.keys(expected || {}).concat(_.keys(actual), _.keys(queued)));
		_.each(names, role => {
			let state = _.get(actual, role, { alive: 0, spawning: 0, dyingSoon: 0 });
			let wait = _.get(Memory, ["shard", "spawn_wait", `${colonyName}|${roomName}|${role}|`]);
			let waitingTicks = wait ? Math.max(0, Game.time - _.get(wait, "firstSeenTick", Game.time)) : 0;
			let desired = _.get(expected, role, 0);
			let available = state.alive + state.spawning;
			let roleState = desired <= 0
				? (available > 0 ? "NOT_REQUIRED" : "INTENTIONALLY_DISABLED")
				: (available >= desired
					? ((state.dyingSoon > 0 && _.get(queued, role, 0) > 0) ? "REPLACEMENT_PENDING" : "SATISFIED")
					: (_.get(queued, role, 0) > 0 || state.spawning > 0 ? "REPLACEMENT_PENDING" : "UNDERSTAFFED"));
			roles[role] = {
				expected: desired,
				desired: desired,
				alive: state.alive,
				spawning: state.spawning,
				queued: _.get(queued, role, 0),
				dyingSoon: state.dyingSoon,
				waitingTicks: waitingTicks,
				lastSpawnResult: _.get(wait, "lastResult", null),
				state: roleState
			};
		});
		let expectedTotal = _.sum(_.map(roles, role => role.expected));
		let staffed = _.sum(_.map(roles, role => Math.min(role.expected, role.alive + role.spawning)));
		let demandedRoles = _.filter(_.values(roles), role => role.expected > 0);
		let overallState = expectedTotal === 0 ? "NOT_REQUIRED"
			: (_.some(demandedRoles, role => role.state === "UNDERSTAFFED") ? "UNDERSTAFFED"
				: (_.some(demandedRoles, role => role.state === "REPLACEMENT_PENDING") ? "REPLACEMENT_PENDING" : "SATISFIED"));
		return {
			roles: roles,
			source: _.get(metric, "source", "AZC_ACTIVE_TARGET"),
			state: overallState,
			expectedTotal: expectedTotal,
			desiredTotal: expectedTotal,
			aliveTotal: _.sum(_.map(demandedRoles, role => role.alive)),
			assignedTotal: _.sum(_.map(roles, role => role.alive)),
			spawningTotal: _.sum(_.map(demandedRoles, role => role.spawning)),
			queuedTotal: _.sum(_.map(demandedRoles, role => role.queued)),
			dyingSoonTotal: _.sum(_.map(demandedRoles, role => role.dyingSoon)),
			lastDemandTick: _.get(metric, "updatedTick", null),
			oldestWaitingTicks: _.max(_.map(demandedRoles, role => role.waitingTicks)) || 0,
			demandSatisfaction: expectedTotal > 0 ? Math.round(staffed * 10000 / expectedTotal) / 100 : null
		};
	},

	_buildPopulationCache: function () {
		let cache = {};
		_.each(_.get(Game, "creeps", {}), creep => {
			let room = _.get(creep, ["memory", "room"], _.get(creep, ["room", "name"]));
			let colony = _.get(creep, ["memory", "colony"], room);
			let role = _.get(creep, ["memory", "role"], "unknown");
			if (!room || !colony)
				return;
			let key = `${colony}|${room}`;
			if (!cache[key])
				cache[key] = {};
			if (!cache[key][role])
				cache[key][role] = { alive: 0, spawning: 0, dyingSoon: 0 };
			if (_.get(creep, "spawning", false))
				cache[key][role].spawning++;
			else
				cache[key][role].alive++;
			if (_.isNumber(_.get(creep, "ticksToLive")) && creep.ticksToLive <= 100)
				cache[key][role].dyingSoon++;
		});
		this._populationCache = cache;
	},

	_colonizations: function () {
		let result = [];
		_.each(_.get(Memory, ["sites", "colonization"], {}), (site, id) => {
			if (site)
				result.push({ id: id, from: _.get(site, "from", null), target: _.get(site, "target", id) });
		});
		return result;
	},

	_remoteMining: function () {
		let result = [];
		_.each(_.get(Memory, ["sites", "mining"], {}), (site, roomName) => {
			if (!site || _.get(site, "colony") === roomName)
				return;
			let colony = _.get(site, "colony", null);
			let room = _.get(Game, ["rooms", roomName]);
			let visible = room != null;
			let sources = visible ? (room.findSources ? room.findSources() : this._find(room, typeof FIND_SOURCES !== "undefined" ? FIND_SOURCES : null)) : [];
			let structures = visible ? this._find(room, typeof FIND_STRUCTURES !== "undefined" ? FIND_STRUCTURES : null) : [];
			let containers = _.filter(structures, structure => structure.structureType === "container");
			let construction = visible ? this._find(room, typeof FIND_MY_CONSTRUCTION_SITES !== "undefined" ? FIND_MY_CONSTRUCTION_SITES : null) : [];
			let containerSites = _.filter(construction, site => site.structureType === "container");
			let dropped = visible ? this._find(room, typeof FIND_DROPPED_RESOURCES !== "undefined" ? FIND_DROPPED_RESOURCES : null) : [];
			let expected = _.get(Memory, ["ai", "metrics", "population", "remotes", roomName, "expected"], {});
			let metrics = _.get(Memory, ["ai", "metrics", "remotes", roomName], {});
			let intel = _.get(Memory, ["ai", "intelligence", "rooms", roomName], {});
			let reservation = _.get(room, ["controller", "reservation"], null);
			let hostileCount = _.size(_.get(site, ["defense", "hostiles"], []));
			let route = _.isArray(_.get(site, "list_route")) ? site.list_route.slice(0, 12) : [];
			let routeStatus = _.get(site, "route_failure", false) === true
				? "FAILED"
				: (route.length > 0 ? "CONFIGURED" : (_.get(intel, "routeStatus") === "no_path" ? "FAILED" : "DIRECT"));
			let population = this._populationSummary(roomName, colony, expected);

			let remote = {
				room: roomName,
				colony: colony,
				configured: true,
				active: _.get(site, "can_mine", false) === true,
				hasKeepers: _.get(site, "has_keepers", false) === true,
				visible: visible,
				lastSeenTick: _.get(intel, "lastSeenTick", null),
				intelAgeTicks: _.has(intel, "lastSeenTick") ? Math.max(0, Game.time - intel.lastSeenTick) : null,
				sourceCount: visible ? sources.length : _.get(site, ["survey", "source_amount"], null),
				route: {
					length: route.length > 0 ? route.length - 1 : _.get(intel, "routeLength", null),
					rooms: route,
					status: routeStatus
				},
				reservation: {
					username: _.get(reservation, "username", null),
					relation: this._relation(_.get(reservation, "username", null)),
					ticksToEnd: _.get(reservation, "ticksToEnd", null),
					warningTicks: _.get(Memory, ["ai", "policy", "reservationWarningTicks"], 2000),
					reserverPresent: _.get(population, ["roles", "reserver", "alive"], 0),
					reserverSpawning: _.get(population, ["roles", "reserver", "spawning"], 0),
					reserverQueued: _.get(population, ["roles", "reserver", "queued"], 0)
				},
				population: population,
				mining: {
					visibleSources: sources.length,
					sourceEnergy: _.sum(_.map(sources, source => _.get(source, "energy", 0))),
					minimumRegenerationTicks: sources.length > 0 ? _.min(_.map(sources, source => _.get(source, "ticksToRegeneration", 0))) : null,
					containers: containers.length,
					containerSites: containerSites.length,
					expectedSourceContainers: visible ? sources.length : _.get(site, ["survey", "source_amount"], null),
					containerEnergy: visible ? _.sum(_.map(containers, container => this._resource(container, "energy"))) : _.get(site, "store_total", 0),
					containerHits: this._hitSummary(containers),
					droppedEnergy: _.sum(_.map(dropped, resource => _.get(resource, "resourceType") === "energy" ? _.get(resource, "amount", 0) : 0)),
					energyWaiting: (visible ? _.sum(_.map(containers, container => this._resource(container, "energy"))) : _.get(site, "store_total", 0))
						+ _.sum(_.map(dropped, resource => _.get(resource, "resourceType") === "energy" ? _.get(resource, "amount", 0) : 0))
				},
				delivery: {
					energyDeliveredTotal: _.get(metrics, "energyDeliveredTotal", 0),
					lastDeliveryTick: _.get(metrics, "lastDeliveryTick", null)
				},
				losses: {
					creepLossesTotal: _.get(metrics, "creepLossesTotal", 0),
					lastCreepLossTick: _.get(metrics, "lastCreepLossTick", null),
					hostileInterruptionsTotal: _.get(metrics, "hostileInterruptionsTotal", 0),
					lastInterruptionTick: _.get(metrics, "lastInterruptionTick", null)
				},
				security: {
					isSafe: _.get(site, ["defense", "is_safe"], false) === true,
					hostileCreeps: hostileCount,
					lastHostileSightingTick: _.get(intel, "lastHostileSightingTick", null)
				},
				objectives: _.keys(_.get(Memory, ["ai", "remoteObjectives", roomName], {}))
			};
			let assessment = this._remoteHealth(remote);
			remote.health = assessment.health;
			remote.reasons = assessment.reasons;
			remote.diagnostics = assessment.diagnostics;
			result.push(remote);
		});
		return result;
	},

	_remoteHealth: function (remote) {
		let diagnostics = [];
		let add = (code, severity, evidence) => diagnostics.push({ diagnostic: code, severity: severity, evidence: evidence || {} });
		let staleLimit = _.get(Memory, ["ai", "policy", "intelStaleTicks"], 10000);
		if (!remote.visible && remote.intelAgeTicks == null)
			add("STALE_INTEL", "HIGH", { intelAgeTicks: null, staleAfterTicks: staleLimit });
		else if (!remote.visible && remote.intelAgeTicks > staleLimit)
			add("STALE_INTEL", "MEDIUM", { intelAgeTicks: remote.intelAgeTicks, staleAfterTicks: staleLimit });
		if (remote.route.status === "FAILED")
			add("ROUTE_FAILURE", "HIGH", { route: remote.route.rooms, status: remote.route.status });
		if (!remote.security.isSafe || remote.security.hostileCreeps > 0)
			add("HOSTILE_INTERRUPTION", "HIGH", { hostileCreeps: remote.security.hostileCreeps });
		if (remote.visible && remote.mining.expectedSourceContainers > 0
			&& remote.mining.containers + remote.mining.containerSites < remote.mining.expectedSourceContainers)
			add("NO_CONTAINER", "HIGH", {
				containers: remote.mining.containers,
				containerSites: remote.mining.containerSites,
				expectedSourceContainers: remote.mining.expectedSourceContainers
			});
		if (remote.mining.containerHits.min != null && remote.mining.containerHits.min < 50000)
			add("CONTAINER_DAMAGED", "MEDIUM", { minimumHits: remote.mining.containerHits.min });
		if (remote.mining.energyWaiting >= 2000)
			add("ENERGY_BACKLOG", remote.mining.energyWaiting >= 4000 ? "HIGH" : "MEDIUM", { energyWaiting: remote.mining.energyWaiting });
		let roles = remote.population.roles;
		let miners = ["burrower", "miner"];
		let minerDesired = _.sum(_.map(miners, role => _.get(roles, [role, "desired"], 0)));
		let minerAvailable = _.sum(_.map(miners, role => _.get(roles, [role, "alive"], 0) + _.get(roles, [role, "spawning"], 0)));
		if (minerAvailable < minerDesired)
			add("MINER_SHORTAGE", "HIGH", { desired: minerDesired, available: minerAvailable });
		let carrierDesired = _.get(roles, ["carrier", "desired"], 0);
		let carrierAvailable = _.get(roles, ["carrier", "alive"], 0) + _.get(roles, ["carrier", "spawning"], 0);
		if (carrierAvailable < carrierDesired)
			add("HAULER_SHORTAGE", remote.mining.energyWaiting >= 2000 ? "HIGH" : "MEDIUM", { desired: carrierDesired, available: carrierAvailable });
		let reserverDesired = _.get(roles, ["reserver", "desired"], 0);
		let reserverAvailable = remote.reservation.reserverPresent + remote.reservation.reserverSpawning + remote.reservation.reserverQueued;
		if (reserverDesired > 0 && reserverAvailable < 1 && remote.reservation.relation !== "SELF")
			add("RESERVER_SHORTAGE", "MEDIUM", { desired: reserverDesired, available: reserverAvailable });
		if (remote.reservation.relation === "SELF" && remote.reservation.ticksToEnd != null
			&& remote.reservation.ticksToEnd < remote.reservation.warningTicks)
			add("RESERVATION_EXPIRING", "MEDIUM", { ticksToEnd: remote.reservation.ticksToEnd, warningTicks: remote.reservation.warningTicks });
		if (remote.losses.creepLossesTotal >= 5 && remote.losses.lastCreepLossTick != null
			&& Game.time - remote.losses.lastCreepLossTick <= 5000)
			add("HIGH_CREEP_LOSSES", "MEDIUM", { total: remote.losses.creepLossesTotal, lastLossAge: Game.time - remote.losses.lastCreepLossTick });
		if (remote.active && remote.delivery.lastDeliveryTick != null && Game.time - remote.delivery.lastDeliveryTick > 1500)
			add("LOW_DELIVERY", "MEDIUM", { ticksSinceDelivery: Game.time - remote.delivery.lastDeliveryTick });
		let reasons = _.map(diagnostics, diagnostic => diagnostic.diagnostic);
		let high = _.filter(diagnostics, diagnostic => diagnostic.severity === "HIGH").length;
		let health = "HEALTHY";
		if (!remote.visible && remote.intelAgeTicks == null)
			health = "UNKNOWN";
		else if (_.includes(reasons, "STALE_INTEL"))
			health = "STALE_INTEL";
		else if (_.includes(reasons, "HOSTILE_INTERRUPTION"))
			health = "UNSAFE";
		else if (!remote.active && remote.visible)
			health = "PAUSED";
		else if (high >= 2 || _.includes(reasons, "MINER_SHORTAGE"))
			health = "FAILING";
		else if (diagnostics.length > 0)
			health = "DEGRADED";
		return { health: health, reasons: reasons, diagnostics: diagnostics };
	},

	_combat: function () {
		let result = [];
		_.each(_.get(Memory, ["sites", "combat"], {}), (site, id) => {
			if (site)
				result.push({ id: id, colony: _.get(site, "colony", null), target: _.get(site, "target_room", null), tactic: _.get(site, ["tactic", "type"], null) });
		});
		return result;
	},

	_scouting: function () {
		let result = [];
		_.each(_.get(Memory, "rooms", {}), (roomMemory, origin) => {
			_.each(_.get(roomMemory, "scout_requests", []), request => {
				if (!request || request.ai_managed !== true)
					return;
				result.push({
					id: request.id,
					orderId: _.get(request, "ai_order_id", null),
					origin: origin,
					room: _.get(request, ["dest_pos", "roomName"], null),
					status: _.get(request, "status", "QUEUED"),
					createdTick: _.get(request, "created", null),
					requestedTick: _.get(request, "requested_tick", _.get(request, "created", null)),
					observedTick: _.get(request, "observed_tick", null),
					completedTick: _.get(request, "completed_tick", null),
					intelLastSeenTick: _.get(request, "intel_last_seen_tick", null),
					scoutCreep: _.get(request, "scout_creep", _.head(_.get(request, "creeps", [])) || null),
					activeScouts: _.get(request, "active", 0),
					failureReason: _.get(request, "failure_reason", null)
				});
			});
		});
		_.each(_.get(Memory, ["ai", "scoutHistory"], []), item => {
			if (!_.some(result, current => current.orderId === item.orderId)) {
				result.push({
					id: item.missionId,
					orderId: item.orderId,
					origin: item.origin,
					room: item.targetRoom,
					status: item.status,
					createdTick: item.requestedTick,
					requestedTick: item.requestedTick,
					observedTick: item.observedTick,
					completedTick: item.completedTick,
					intelLastSeenTick: item.intelLastSeenTick,
					scoutCreep: item.scoutCreep,
					activeScouts: 0,
					failureReason: item.failureReason
				});
			}
		});
		return result;
	},

	_refreshVisibleIntelligence: function (ownedNames) {
		let intelRooms = _.get(Memory, ["ai", "intelligence", "rooms"], {});
		let hostileEvents = _.get(Memory, ["ai", "intelligence", "hostileEvents"], []);
		_.each(_.get(Game, "rooms", {}), room => {
			if (!room || !room.name)
				return;
			let previous = _.get(intelRooms, room.name, {});
			let structures = this._find(room, typeof FIND_STRUCTURES !== "undefined" ? FIND_STRUCTURES : null);
			let hostiles = this._find(room, typeof FIND_HOSTILE_CREEPS !== "undefined" ? FIND_HOSTILE_CREEPS : null);
			hostiles = _.filter(hostiles, creep => _.get(creep, ["owner", "username"]) !== "Source Keeper");
			let hostileStructures = this._find(room, typeof FIND_HOSTILE_STRUCTURES !== "undefined" ? FIND_HOSTILE_STRUCTURES : null);
			hostileStructures = _.filter(hostileStructures, structure =>
				!_.includes(["controller", "keeperLair", "portal", "road", "container"], structure.structureType));
			let sources = room.findSources ? room.findSources() : this._find(room, typeof FIND_SOURCES !== "undefined" ? FIND_SOURCES : null);
			let minerals = this._find(room, typeof FIND_MINERALS !== "undefined" ? FIND_MINERALS : null);
			let controller = _.get(room, "controller", null);
			let nearest = this._nearestColony(room.name, ownedNames);
			let terrainSwampPercent = _.get(previous, "terrainSwampPercent", null);
			if (terrainSwampPercent == null)
				terrainSwampPercent = this._swampPercent(room);
			// Room-to-room routes are stable enough for strategic telemetry. Cache
			// the first result instead of paying pathfinder CPU on every snapshot.
			let routeLength = _.has(previous, "routeLength") ? previous.routeLength : null;
			let routeStatus = _.get(previous, "routeStatus", nearest ? "unknown" : "unavailable");
			if (nearest && routeStatus === "unknown" && _.isFunction(_.get(Game, ["map", "findRoute"]))) {
				let route = Game.map.findRoute(nearest.room, room.name);
				if (_.isArray(route)) {
					routeLength = route.length;
					routeStatus = "available";
				} else {
					routeStatus = "no_path";
				}
			}
			let usernames = _.uniq(_.map(hostiles, creep => _.get(creep, ["owner", "username"], "unknown"))).slice(0, 8);
			let current = {
				room: room.name,
				lastSeenTick: Game.time,
				classification: this._roomClassification(room.name),
				sourceCount: sources.length,
				mineralType: _.get(_.head(minerals), "mineralType", null),
				terrainSwampPercent: terrainSwampPercent,
				controller: {
					status: !controller ? "none" : (_.get(controller, "my", false) ? "owned" : (_.get(controller, ["owner", "username"]) ? "owned_other" : (_.get(controller, ["reservation", "username"]) ? "reserved" : "neutral"))),
					owner: _.get(controller, ["owner", "username"], null),
					ownerRelation: this._relation(_.get(controller, ["owner", "username"], null)),
					reservation: _.get(controller, ["reservation", "username"], null),
					reservationRelation: this._relation(_.get(controller, ["reservation", "username"], null)),
					reservationTicks: _.get(controller, ["reservation", "ticksToEnd"], null),
					rcl: _.get(controller, "level", 0),
					safeMode: _.get(controller, "safeMode", null)
				},
				structures: {
					spawns: _.filter(structures, structure => structure.structureType === "spawn").length,
					towers: _.filter(structures, structure => structure.structureType === "tower").length,
					storage: _.filter(structures, structure => structure.structureType === "storage").length,
					terminal: _.filter(structures, structure => structure.structureType === "terminal").length,
					hostile: hostileStructures.length,
					fortifications: this._hitSummary(_.filter(structures, structure => _.includes(["rampart", "constructedWall"], structure.structureType)))
				},
				hostileCreeps: hostiles.length,
				hostilePlayers: usernames,
				playerRelations: _.map(usernames, username => ({ username: username, relation: this._relation(username) })),
				lastHostileSightingTick: hostiles.length > 0 ? Game.time : _.get(previous, "lastHostileSightingTick", null),
				hostileSightingsTotal: _.get(previous, "hostileSightingsTotal", 0) + ((hostiles.length > 0 && _.get(previous, "hostileCreeps", 0) === 0) ? 1 : 0),
				nearestColony: nearest ? nearest.room : null,
				distanceFromColony: nearest ? nearest.distance : null,
				routeLength: routeLength,
				routeStatus: routeStatus
			};
			if (hostiles.length > 0 && _.get(previous, "hostileCreeps", 0) === 0) {
				hostileEvents.push({ tick: Game.time, room: room.name, players: usernames, count: hostiles.length });
				if (hostileEvents.length > this.MAX_HOSTILE_EVENTS)
					hostileEvents.splice(0, hostileEvents.length - this.MAX_HOSTILE_EVENTS);
			}
			intelRooms[room.name] = current;
			this._markScoutObserved(room.name);
		});

		let intelNames = _.keys(intelRooms);
		if (intelNames.length > this.MAX_INTEL_ROOMS) {
			let oldest = _.sortBy(intelNames, name => _.get(intelRooms, [name, "lastSeenTick"], 0));
			_.each(oldest.slice(0, intelNames.length - this.MAX_INTEL_ROOMS), name => delete intelRooms[name]);
		}
		if (hostileEvents.length > this.MAX_HOSTILE_EVENTS)
			hostileEvents.splice(0, hostileEvents.length - this.MAX_HOSTILE_EVENTS);
		_.set(Memory, ["ai", "intelligence", "rooms"], intelRooms);
		_.set(Memory, ["ai", "intelligence", "hostileEvents"], hostileEvents);
	},

	_markScoutObserved: function (roomName) {
		_.each(_.get(Memory, "rooms", {}), roomMemory => {
			_.each(_.get(roomMemory, "scout_requests", []), request => {
				if (request && request.ai_managed === true && _.get(request, ["dest_pos", "roomName"]) === roomName) {
					request.status = "OBSERVED";
					request.observed_tick = Game.time;
					request.intel_last_seen_tick = Game.time;
				}
			});
		});
	},

	_territory: function (ownedNames) {
		let radius = _.get(Memory, ["ai", "policy", "intelligenceRadius"], 2);
		let staleTicks = _.get(Memory, ["ai", "policy", "intelStaleTicks"], 10000);
		let nearby = this._nearbyRooms(ownedNames, radius);
		let intelRooms = _.get(Memory, ["ai", "intelligence", "rooms"], {});
		let known = [];
		let unknown = [];
		let stale = [];
		let candidates = [];
		_.each(nearby, name => {
			let intel = _.get(intelRooms, name);
			if (!intel) {
				unknown.push(name);
				return;
			}
			let copy = _.cloneDeep(intel);
			copy.intelAgeTicks = Math.max(0, Game.time - copy.lastSeenTick);
			copy.stale = copy.intelAgeTicks > staleTicks;
			known.push(copy);
			if (copy.stale)
				stale.push(name);
			let score = this._candidateScore(copy, ownedNames);
			if (score)
				candidates.push(score);
		});
		candidates = _.sortBy(candidates, candidate => -candidate.score).slice(0, 20);
		return {
			intelligence: {
				radius: radius,
				staleAfterTicks: staleTicks,
				knownRooms: known,
				unknownRooms: _.sortBy(unknown),
				staleRooms: _.sortBy(stale),
				hostileEvents: _.get(Memory, ["ai", "intelligence", "hostileEvents"], []).slice(-20)
			},
			candidates: candidates
		};
	},

	_nearbyRooms: function (ownedNames, radius) {
		let seen = {};
		let frontier = [];
		_.each(ownedNames, name => { seen[name] = 0; frontier.push(name); });
		if (!_.isFunction(_.get(Game, ["map", "describeExits"])))
			return _.keys(seen);
		while (frontier.length > 0) {
			let current = frontier.shift();
			let depth = seen[current];
			if (depth >= radius)
				continue;
			let exits = Game.map.describeExits(current) || {};
			_.each(exits, neighbor => {
				if (_.isString(neighbor) && !_.has(seen, neighbor)) {
					seen[neighbor] = depth + 1;
					frontier.push(neighbor);
				}
			});
		}
		return _.keys(seen);
	},

	_candidateScore: function (intel, ownedNames) {
		if (_.includes(ownedNames, intel.room))
			return null;
		let reasons = [];
		let disqualified = false;
		let status = _.get(intel, ["controller", "status"]);
		if (status === "owned_other") {
			disqualified = true;
			reasons.push("owned_by_another_player");
		}
		if (_.includes(["highway", "source_keeper", "sector_center"], intel.classification) || status === "none") {
			disqualified = true;
			reasons.push("not_a_claimable_normal_room");
		}
		let factors = {
			sources: Math.min(30, _.get(intel, "sourceCount", 0) * 15),
			distance: Math.max(0, 20 - Math.max(0, _.get(intel, "distanceFromColony", 1) - 1) * 4),
			terrain: Math.max(0, 15 - Math.round(_.get(intel, "terrainSwampPercent", 50) * 0.3)),
			mineral: _.get(intel, "mineralType") ? 10 : 0,
			security: (_.get(intel, "hostileCreeps", 0) === 0 && _.get(intel, ["structures", "towers"], 0) === 0) ? 20 : 0
		};
		let score = _.sum(_.values(factors));
		if (_.get(intel, "stale", false))
			reasons.push("intelligence_stale");
		if (_.get(intel, "sourceCount", 0) < 2)
			reasons.push("fewer_than_two_sources");
		return {
			room: intel.room,
			score: score,
			factors: factors,
			intelAgeTicks: intel.intelAgeTicks,
			disqualified: disqualified,
			disqualifiers: reasons,
			currentOperationalRole: this._operationalRole(intel),
			claimCandidateStatus: disqualified ? "DISQUALIFIED" : (_.get(intel, "stale", false) ? "NEEDS_FRESH_INTEL" : "ELIGIBLE")
		};
	},

	_operationalRole: function (intel) {
		let room = _.get(intel, "room");
		if (_.has(Memory, ["sites", "mining", room])
			&& _.get(Memory, ["sites", "mining", room, "colony"]) !== room)
			return "OUR_REMOTE";
		if (_.get(intel, ["controller", "ownerRelation"]) === "SELF")
			return "OUR_COLONY";
		if (_.get(intel, "classification") === "source_keeper" || _.get(intel, "classification") === "sector_center")
			return "SOURCE_KEEPER";
		if (_.get(intel, "classification") === "highway")
			return "HIGHWAY";
		let owner = _.get(intel, ["controller", "ownerRelation"]);
		let reservation = _.get(intel, ["controller", "reservationRelation"]);
		if (owner === "ALLY") return "ALLY_OWNED";
		if (owner === "HOSTILE") return "HOSTILE_OWNED";
		if (reservation === "SELF") return "SELF_RESERVED";
		if (reservation === "ALLY") return "ALLY_RESERVED";
		if (reservation === "HOSTILE") return "FOREIGN_RESERVED";
		return "NEUTRAL_SCOUTED";
	},

	_playerName: function () {
		let room = _.find(_.get(Game, "rooms", {}), candidate => {
			return _.get(candidate, ["controller", "my"], false) === true
				&& _.isString(_.get(candidate, ["controller", "owner", "username"]));
		});
		if (room)
			return room.controller.owner.username;
		let object = _.find({
			..._.get(Game, "spawns", {}),
			..._.get(Game, "structures", {}),
			..._.get(Game, "creeps", {})
		}, candidate => _.isString(_.get(candidate, ["owner", "username"])));
		return _.get(object, ["owner", "username"], null);
	},

	_relation: function (username) {
		if (!_.isString(username) || username.length === 0)
			return "NEUTRAL";
		let player = this._player === undefined ? this._playerName() : this._player;
		if (player && username === player)
			return "SELF";
		if (_.includes(_.get(Memory, ["hive", "allies"], []), username))
			return "ALLY";
		if (username === "Invader" || username === "Source Keeper")
			return "HOSTILE";
		return player ? "HOSTILE" : "UNKNOWN";
	},

	_nearestColony: function (roomName, ownedNames) {
		if (ownedNames.length === 0)
			return null;
		let best = null;
		_.each(ownedNames, colony => {
			let distance = colony === roomName ? 0 : (_.isFunction(_.get(Game, ["map", "getRoomLinearDistance"])) ? Game.map.getRoomLinearDistance(colony, roomName) : null);
			if (distance != null && (!best || distance < best.distance))
				best = { room: colony, distance: distance };
		});
		return best;
	},

	_roomClassification: function (roomName) {
		let match = /^([WE])(\d+)([NS])(\d+)$/.exec(roomName);
		if (!match)
			return "unknown";
		let x = parseInt(match[2], 10) % 10;
		let y = parseInt(match[4], 10) % 10;
		if (x === 0 || y === 0)
			return "highway";
		if (x === 5 && y === 5)
			return "sector_center";
		if (x >= 4 && x <= 6 && y >= 4 && y <= 6)
			return "source_keeper";
		return "normal";
	},

	_swampPercent: function (room) {
		if (!room || !_.isFunction(_.get(room, "getTerrain")))
			return null;
		let terrain = room.getTerrain();
		let swamps = 0;
		let swampMask = typeof TERRAIN_MASK_SWAMP !== "undefined" ? TERRAIN_MASK_SWAMP : 2;
		for (let x = 0; x < 50; x++)
			for (let y = 0; y < 50; y++)
				if (terrain.get(x, y) === swampMask)
					swamps++;
		return Math.round(swamps * 10000 / 2500) / 100;
	},

	_find: function (room, constant) {
		if (!room || constant == null || !_.isFunction(_.get(room, "find")))
			return [];
		let result = room.find(constant);
		return _.isArray(result) ? result : [];
	},

	_resource: function (object, resource) {
		if (!object)
			return 0;
		if (_.get(object, ["store", resource]) != null)
			return _.get(object, ["store", resource], 0);
		if (resource === "energy")
			return _.get(object, "energy", 0);
		return 0;
	},

	_capacity: function (object, resource) {
		if (!object)
			return 0;
		if (_.isFunction(_.get(object, ["store", "getCapacity"])))
			return object.store.getCapacity(resource) || 0;
		if (_.get(object, "storeCapacity") != null)
			return object.storeCapacity;
		if (resource === "energy")
			return _.get(object, "energyCapacity", 0);
		return 0;
	}
};
