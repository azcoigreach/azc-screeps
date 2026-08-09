/* ***********************************************************
 *  DEFINITIONS: AI COMMANDER STRATEGIC OBSERVER
 * *********************************************************** */

// Builds a compact, JSON-safe strategic view. Expensive raw game objects,
// individual creep state, and long time-series histories stay out of segments.
global.AIObserver = {

	SCHEMA_VERSION: 7,
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
		let nearbyNames = this._nearbyRooms(ownedNames, _.get(Memory, ["ai", "policy", "intelligenceRadius"], 2));
		let protection = this._protectionSummary(ownedNames, nearbyNames);
		this._protectionByRoom = protection.rooms;
		if (_.get(protection, ["empire", "advisoryRequired"], false)) alerts.push("PROTECTION_STRATEGY_REASSESSMENT");
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

		let territory = this._territory(ownedNames, colonies);
		this._updateEstablishments();
		this._updateColonizations(colonies);
		let remoteMining = this._remoteMining();
		let empireLoad = this._empireLoad(colonies, remoteMining);
		_.set(Memory, ["ai", "strategy", "empireLoad"], _.cloneDeep(empireLoad));
		let readiness = this._expansionReadiness(territory.claimCandidates, colonies);
		_.set(Memory, ["ai", "strategy", "expansionReadiness"], _.cloneDeep(readiness));
		let militaryPreparation = this._militaryPreparation(ownedRooms, protection.empire);
		let combatAssessments = this._combatAssessments(territory.intelligence.knownRooms, militaryPreparation);
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
					availableClaimSlots: Math.max(0, gclLevel - ownedRooms.length),
					globalGclClaimSlots: Math.max(0, gclLevel - ownedRooms.length),
					currentProtectionClaimSlots: _.get(protection, ["empire", "currentProtectionClaimSlots"], Math.max(0, gclLevel - ownedRooms.length))
				},
				protection: protection.empire,
				militaryPreparation: militaryPreparation,
				creeps: _.size(_.get(Game, "creeps", {})),
				credits: _.get(Game, ["market", "credits"], 0)
			},
			colonies: colonies,
			operations: {
				colonizations: this._colonizations(),
				remoteMining: remoteMining,
				remoteEstablishments: _.values(_.get(Memory, ["ai", "establishments"], {})),
				combat: this._combat(),
				scouting: this._scouting()
			},
			intelligence: territory.intelligence,
			expansionCandidates: territory.claimCandidates,
			remoteCandidates: territory.remoteCandidates,
			claimCandidates: territory.claimCandidates,
			expansionReadiness: readiness,
			empireLoad: empireLoad,
			remoteDrawdownRanking: empireLoad.remoteRanking,
			playerHistory: this._playerHistory(),
			combatAssessments: combatAssessments,
			authority: {
				mode: _.get(Memory, ["ai", "mode"], "observe"),
				allowedActions: [
					"NOOP", "REQUEST_STATUS", "SET_EXPLANATION", "SET_OPERATIONAL_AUTHORITY", "SET_EXECUTION_MODE", "SCOUT_ROOM",
					"REASSESS_REMOTE", "ENSURE_REMOTE_RESERVATION",
					"ENSURE_REMOTE_INFRASTRUCTURE", "REBALANCE_REMOTE_LOGISTICS",
					"PAUSE_REMOTE_MINING", "RESUME_REMOTE_MINING",
					"START_REMOTE_MINING", "COLONIZE_ROOM"
				],
				execution: {
					scouting: _.get(Memory, ["ai", "policy", "allowScouting"], false) === true,
					autoScouting: _.get(Memory, ["ai", "policy", "autoScouting"], false) === true,
					expansion: _.get(Memory, ["ai", "policy", "allowColonization"], false) === true,
					remoteMaintenance: _.get(Memory, ["ai", "policy", "allowRemoteMaintenance"], false) === true,
					autoRemoteMaintenance: _.get(Memory, ["ai", "policy", "autoRemoteMaintenance"], false) === true,
					remotePausing: _.get(Memory, ["ai", "policy", "allowRemotePausing"], true) === true,
					autoRemotePausing: _.get(Memory, ["ai", "policy", "autoRemotePausing"], false) === true,
					remoteMiningChanges: _.get(Memory, ["ai", "policy", "allowNewRemotes"], false) === true,
					newRemotes: _.get(Memory, ["ai", "policy", "allowNewRemotes"], false) === true,
					autoNewRemotes: _.get(Memory, ["ai", "policy", "autoNewRemotes"], false) === true,
					colonization: _.get(Memory, ["ai", "policy", "allowColonization"], false) === true,
					autoColonization: _.get(Memory, ["ai", "policy", "autoColonization"], false) === true,
					remoteAbandonment: false,
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
					PAUSE_REMOTE_MINING: { allowed: _.get(Memory, ["ai", "policy", "allowRemotePausing"], true) === true, automatic: _.get(Memory, ["ai", "policy", "autoRemotePausing"], false) === true },
					RESUME_REMOTE_MINING: { allowed: _.get(Memory, ["ai", "policy", "allowRemotePausing"], true) === true, automatic: _.get(Memory, ["ai", "policy", "autoRemotePausing"], false) === true },
					START_REMOTE_MINING: { allowed: _.get(Memory, ["ai", "policy", "allowNewRemotes"], false) === true, automatic: _.get(Memory, ["ai", "policy", "autoNewRemotes"], false) === true },
					STOP_REMOTE_MINING: { allowed: false, automatic: false },
					COLONIZE_ROOM: { allowed: _.get(Memory, ["ai", "policy", "allowColonization"], false) === true, automatic: _.get(Memory, ["ai", "policy", "autoColonization"], false) === true },
					ATTACK_ROOM: { allowed: false, automatic: false }
				}
			},
			authorityAudit: _.get(Memory, ["ai", "authorityAudit"], []).slice(-20),
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
			protection: _.get(this._protectionByRoom, room.name, this._roomProtection(room.name, room.name)),
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
		let result = _.values(_.get(Memory, ["ai", "colonizations"], {}));
		_.each(_.get(Memory, ["sites", "colonization"], {}), (site, id) => {
			if (site && !_.some(result, operation => operation.target === _.get(site, "target", id)))
				result.push({
					id: `legacy:${id}`, orderId: null, from: _.get(site, "from", null),
					origin: _.get(site, "from", null), target: _.get(site, "target", id),
					state: "CLAIMER_REQUESTED", outcome: null, layout: _.get(site, "layout", null),
					createdTick: null, updatedTick: Game.time, failureReason: null
				});
		});
		return _.sortBy(result, operation => -_.get(operation, "updatedTick", 0)).slice(0, 20);
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
			let reserverCreeps = _.filter(_.get(Game, "creeps", {}), creep => {
				return _.get(creep, ["memory", "role"]) === "reserver"
					&& _.get(creep, ["memory", "room"]) === roomName
					&& _.get(creep, ["memory", "colony"]) === colony;
			});
			let reserverClaimParts = _.sum(_.map(reserverCreeps, creep => _.filter(_.get(creep, "body", []), part => {
				return _.get(part, "type") === (typeof CLAIM !== "undefined" ? CLAIM : "claim") && _.get(part, "hits", 100) > 0;
			}).length));

			let remote = {
				room: roomName,
				colony: colony,
				configured: true,
				active: _.get(site, "can_mine", false) === true && _.get(site, "ai_paused", false) !== true,
				paused: _.get(site, "ai_paused", false) === true,
				pause: _.cloneDeep(_.get(site, "ai_pause", null)),
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
					reserverQueued: _.get(population, ["roles", "reserver", "queued"], 0),
					continuity: _.get(site, ["continuity", "reserver"], null),
					lifecycle: {
						desired: _.get(population, ["roles", "reserver", "desired"], 0),
						requested: _.get(population, ["roles", "reserver", "queued"], 0),
						queued: _.get(population, ["roles", "reserver", "queued"], 0),
						spawned: reserverCreeps.length,
						spawning: _.filter(reserverCreeps, creep => _.get(creep, "spawning", false) === true).length,
						enRoute: _.filter(reserverCreeps, creep => _.get(creep, ["room", "name"]) !== roomName).length,
						arrived: _.filter(reserverCreeps, creep => _.get(creep, ["room", "name"]) === roomName).length,
						minimumTtl: reserverCreeps.length > 0 ? _.min(_.map(reserverCreeps, creep => _.get(creep, "ticksToLive", 0) || 0)) : null,
						activeClaimParts: reserverClaimParts,
						lastExecution: _.cloneDeep(_.get(site, ["continuity", "reserverExecution"], null))
					}
				},
				continuity: _.get(site, "continuity", {}),
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
			remote.stopLoss = this._stopLoss(remote);
			remote.lifecycleState = this._remoteLifecycle(remote, site);
			_.set(Memory, ["ai", "metrics", "remotes", roomName, "lastHealth"], remote.health);
			result.push(remote);
		});
		return result;
	},

	_remoteLifecycle: function (remote, site) {
		if (_.get(site, "ai_paused", false) === true) {
			let pause = _.get(site, "ai_pause", {});
			if (pause.pausedTick == null) {
				let establishment = _.find(_.values(_.get(Memory, ["ai", "establishments"], {})), operation => _.get(operation, "target") === remote.room);
				pause.state = "PAUSED";
				pause.pausedTick = _.get(establishment, "updatedTick", Game.time);
				pause.reason = _.get(establishment, "failureReason", "pre-Phase-6.5 remote pause migrated from existing Memory");
				pause.source = establishment ? "ESTABLISHMENT_STOP_LOSS" : "LEGACY_MEMORY_MIGRATION";
			}
			let minimum = _.get(Memory, ["ai", "policy", "remotePauseMinimumTicks"], 5000);
			let stableTicks = _.get(Memory, ["ai", "policy", "remoteRecoveryStableTicks"], 3000);
			let minimumPopulation = _.get(Memory, ["ai", "policy", "remoteRecoveryPopulationSatisfaction"], 85);
			let load = _.get(Memory, ["ai", "strategy", "empireLoad", "state"], "CRITICAL");
			let population = _.get(Memory, ["ai", "strategy", "empireLoad", "homePopulation", "satisfaction"], 0);
			let recovering = _.includes(["HEALTHY", "STRAINED"], load) && population >= minimumPopulation;
			if (recovering && pause.recoverySinceTick == null) pause.recoverySinceTick = Game.time;
			if (!recovering) pause.recoverySinceTick = null;
			site.ai_pause = pause;
			if (Game.time - _.get(pause, "pausedTick", Game.time) >= minimum && pause.recoverySinceTick != null
				&& Game.time - pause.recoverySinceTick >= stableTicks)
				return "RECOVERY_CANDIDATE";
			return "PAUSED";
		}
		if (_.get(site, ["ai_pause", "state"]) === "REACTIVATING") return "REACTIVATING";
		if (_.get(remote, ["stopLoss", "state"]) === "ABANDON_RECOMMENDED") return "ABANDON_RECOMMENDED";
		if (_.get(remote, ["stopLoss", "state"]) === "PAUSE_RECOMMENDED") return "PAUSE_RECOMMENDED";
		return remote.health === "FAILING" ? "FAILING" : (remote.health === "DEGRADED" ? "DEGRADED" : "ACTIVE");
	},

	_empireLoad: function (colonies, remotes) {
		let criticalNames = ["harvester", "miner", "burrower", "carrier", "hauler", "worker", "multirole", "upgrader"];
		let desired = 0, alive = 0, criticalDesired = 0, criticalAvailable = 0;
		let spawns = 0, busy = 0, queue = 0, oldest = 0;
		_.each(colonies, colony => {
			desired += _.get(colony, ["population", "desiredTotal"], 0);
			alive += _.get(colony, ["population", "aliveTotal"], 0);
			spawns += _.get(colony, ["spawning", "spawns"], 0);
			busy += _.get(colony, ["spawning", "busy"], 0);
			queue += _.get(colony, ["spawning", "queueDepth"], 0);
			oldest = Math.max(oldest, _.get(colony, ["population", "oldestWaitingTicks"], 0));
			_.each(_.get(colony, ["population", "roles"], {}), (role, name) => {
				if (_.includes(criticalNames, name)) {
					criticalDesired += _.get(role, "desired", 0);
					criticalAvailable += _.get(role, "alive", 0) + _.get(role, "spawning", 0);
				}
			});
		});
		let remoteDesired = _.sum(_.map(remotes, remote => remote.paused ? 0 : _.get(remote, ["population", "desiredTotal"], 0)));
		let remoteAvailable = _.sum(_.map(remotes, remote => remote.paused ? 0 : _.get(remote, ["population", "assignedTotal"], 0)));
		let reserverDemand = _.sum(_.map(remotes, remote => remote.paused ? 0 : Math.max(0,
			_.get(remote, ["population", "roles", "reserver", "desired"], 0)
			- _.get(remote, ["reservation", "reserverPresent"], 0)
			- _.get(remote, ["reservation", "reserverSpawning"], 0)
			- _.get(remote, ["reservation", "reserverQueued"], 0))));
		let satisfaction = desired > 0 ? alive / desired : 1;
		let criticalSatisfaction = criticalDesired > 0 ? criticalAvailable / criticalDesired : 1;
		let utilization = spawns > 0 ? busy / spawns : 1;
		let state = "HEALTHY";
		let reasons = [];
		if (satisfaction < 0.35 || criticalSatisfaction < 0.5 || (desired > 0 && alive <= Math.max(1, spawns * 3))) {
			state = "CRITICAL";
			reasons.push("HOME_POPULATION_CRITICAL");
		} else if (satisfaction < 0.65 || criticalSatisfaction < 0.75 || queue >= Math.max(4, spawns * 3)
			|| remoteDesired - remoteAvailable > Math.max(3, alive)) {
			state = "OVEREXTENDED";
			reasons.push("SPAWN_CAPACITY_OVEREXTENDED");
		} else if (satisfaction < 0.85 || criticalSatisfaction < 0.9 || queue > 0 || utilization >= 0.9) {
			state = "STRAINED";
			reasons.push("RECOVERY_IN_PROGRESS");
		}
		let establishments = {};
		_.each(_.values(_.get(Memory, ["ai", "establishments"], {})), operation => {
			if (_.isString(_.get(operation, "target"))) establishments[operation.target] = operation;
		});
		let ranking = _.map(remotes, remote => {
			let deficit = Math.max(0, _.get(remote, ["population", "desiredTotal"], 0) - _.get(remote, ["population", "assignedTotal"], 0));
			let establishmentFailed = _.get(establishments, [remote.room, "state"]) === "FAILED";
			let score = (remote.health === "FAILING" ? 35 : (remote.health === "DEGRADED" ? 15 : 0))
				+ (establishmentFailed ? 30 : 0) + deficit * 4
				+ Math.min(20, _.get(remote, ["losses", "creepLossesTotal"], 0) / 5)
				+ Math.min(10, _.get(remote, ["mining", "energyWaiting"], 0) / 500)
				+ Math.max(0, (_.get(remote, ["route", "length"], 1) || 1) - 1) * 2
				- Math.min(15, _.get(remote, ["delivery", "energyDeliveredTotal"], 0) / 20000);
			return {
				room: remote.room, score: Math.round(score * 100) / 100, health: remote.health,
				lifecycleState: remote.lifecycleState, establishmentFailed: establishmentFailed,
				spawnBurden: _.get(remote, ["population", "desiredTotal"], 0), staffingDeficit: deficit,
				reservationBurden: reserverDemand, losses: _.get(remote, ["losses", "creepLossesTotal"], 0),
				routeLength: _.get(remote, ["route", "length"], null), backlog: _.get(remote, ["mining", "energyWaiting"], 0),
				recommendation: _.includes(["OVEREXTENDED", "CRITICAL"], state) && !remote.paused ? "PAUSE" : (remote.paused ? "HOLD_PAUSED" : "RETAIN")
			};
		});
		ranking = _.sortBy(ranking, item => -item.score);
		return {
			state: state, reasons: reasons, evaluatedTick: Game.time,
			homePopulation: { desired: desired, alive: alive, satisfaction: Math.round(satisfaction * 10000) / 100,
				criticalDesired: criticalDesired, criticalAvailable: criticalAvailable,
				criticalSatisfaction: Math.round(criticalSatisfaction * 10000) / 100 },
			spawnPressure: { spawns: spawns, busy: busy, utilization: Math.round(utilization * 10000) / 100,
				queueDepth: queue, oldestHomeDemandTicks: oldest },
			remotePressure: { desired: remoteDesired, available: remoteAvailable,
				staffingDeficit: Math.max(0, remoteDesired - remoteAvailable), reservationReplacementDemand: reserverDemand },
			growthVeto: _.includes(["OVEREXTENDED", "CRITICAL"], state), remoteRanking: ranking
		};
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

	_stopLoss: function (remote) {
		let evidence = [];
		if (_.includes(remote.reasons, "ROUTE_FAILURE")) evidence.push("persistent_path_failure");
		if (_.includes(remote.reasons, "LOW_DELIVERY")) evidence.push("delivery_near_zero");
		if (_.includes(remote.reasons, "HIGH_CREEP_LOSSES")) evidence.push("high_creep_losses");
		if (_.includes(remote.reasons, "HOSTILE_INTERRUPTION")) evidence.push("hostile_interruption");
		if (_.get(_.find(_.values(_.get(Memory, ["ai", "establishments"], {})), item => _.get(item, "target") === remote.room), "state") === "FAILED")
			evidence.push("establishment_failed");
		let key = ["ai", "metrics", "remotes", remote.room, "stopLoss"];
		let previous = _.get(Memory, key, { badWindows: 0, state: "ACTIVE" });
		let bad = remote.health === "FAILING" || remote.health === "UNSAFE" || _.includes(remote.reasons, "ROUTE_FAILURE") || _.includes(evidence, "establishment_failed");
		let recovered = remote.health === "HEALTHY" && evidence.length === 0;
		let pulse = Game.time - _.get(previous, "evaluatedTick", 0) >= 1000;
		let badWindows = _.get(previous, "badWindows", 0);
		if (pulse) badWindows = bad ? badWindows + 1 : (recovered ? Math.max(0, badWindows - 1) : badWindows);
		let state = badWindows >= 3 ? "ABANDON_RECOMMENDED" : (badWindows >= 2 ? "PAUSE_RECOMMENDED" : (badWindows >= 1 ? "PROBATION" : (evidence.length ? "WATCH" : "ACTIVE")));
		let result = { state: state, badWindows: badWindows, evidence: evidence, evaluatedTick: pulse ? Game.time : _.get(previous, "evaluatedTick", Game.time) };
		_.set(Memory, key, result);
		return result;
	},

	_updateEstablishments: function () {
		_.each(_.get(Memory, ["ai", "establishments"], {}), operation => {
			let site = _.get(Memory, ["sites", "mining", operation.target]);
			let room = _.get(Game, ["rooms", operation.target]);
			let metrics = _.get(Memory, ["ai", "metrics", "remotes", operation.target], {});
			let intel = _.get(Memory, ["ai", "intelligence", "rooms", operation.target], {});
			let age = Game.time - _.get(operation, "createdTick", Game.time);
			if (!site) {
				operation.state = "FAILED";
				operation.failureReason = "remote configuration disappeared";
			} else if (_.get(site, "ai_paused", false) === true && operation.failureReason) {
				// A failed establishment cannot return to RESERVING merely because the
				// paused target is no longer visible. Preserve its terminal truth while
				// the reversible remote configuration remains suspended.
				operation.state = "FAILED";
			} else if (_.get(site, "route_failure", false)) {
				operation.state = "FAILED";
				operation.failureReason = "deterministic route failure";
				this._pauseFailedEstablishment(site, operation.failureReason);
			} else if (_.get(intel, ["controller", "ownerRelation"]) !== "NEUTRAL"
				&& _.get(intel, ["controller", "ownerRelation"]) !== "SELF") {
				operation.state = "FAILED";
				operation.failureReason = "target controller became foreign-owned";
				this._pauseFailedEstablishment(site, operation.failureReason);
			} else if (!room) operation.state = "RESERVING";
			else {
				let population = _.filter(_.get(Game, "creeps", {}), creep => _.get(creep, ["memory", "room"]) === operation.target);
				let hasMiner = _.some(population, creep => _.includes(["burrower", "miner"], _.get(creep, ["memory", "role"])));
				let delivered = _.get(metrics, "energyDeliveredTotal", 0) - _.get(operation, "firstDeliveryTotal", 0);
				if (delivered > 0 && hasMiner && age >= 5000) {
					let predicted = _.get(operation, ["prediction", "grossEnergyPer1000", "value"], 0) * age / 1000;
					operation.state = predicted <= 0 || delivered >= predicted * 0.5 ? "HEALTHY" : "DEGRADED";
				} else if (delivered > 0 && hasMiner) operation.state = "ACTIVE";
				else if (hasMiner) operation.state = "BOOTSTRAPPING";
				else if (age >= 7500) {
					operation.state = "FAILED";
					operation.failureReason = "delivery never began within the startup stop-loss window";
					this._pauseFailedEstablishment(site, operation.failureReason);
				} else operation.state = "RESERVING";
				operation.actualDelivered = Math.max(0, delivered);
			}
			operation.updatedTick = Game.time;
		});
	},

	_pauseFailedEstablishment: function (site, reason) {
		if (_.get(site, "ai_paused", false) !== true) {
			site.ai_paused = true;
			site.ai_pause = {
				state: "PAUSED", pausedTick: Game.time, reason: reason,
				source: "ESTABLISHMENT_STOP_LOSS", recoverySinceTick: null
			};
			return;
		}
		// A failed establishment remains failed on every observer pass. Preserve the
		// original pause identity so the durable journal records one transition, not
		// a new synthetic pause for every telemetry tick.
		let pause = _.get(site, "ai_pause", {});
		if (pause.pausedTick == null) pause.pausedTick = Game.time;
		if (pause.state == null) pause.state = "PAUSED";
		if (pause.reason == null) pause.reason = reason;
		if (pause.source == null) pause.source = "ESTABLISHMENT_STOP_LOSS";
		if (pause.recoverySinceTick === undefined) pause.recoverySinceTick = null;
		site.ai_pause = pause;
	},

	_updateColonizations: function () {
		let operations = _.get(Memory, ["ai", "colonizations"], {});
		_.each(_.get(Memory, ["sites", "colonization"], {}), (site, key) => {
			let target = _.get(site, "target", key);
			if (!operations[target]) {
				operations[target] = {
					id: `legacy:${target}:${Game.time}`, orderId: _.get(site, "ai_order_id", null),
					from: _.get(site, "from", null), origin: _.get(site, "from", null), target: target,
					layout: _.get(site, "layout", null), state: "AUTHORIZED", outcome: null,
					createdTick: Game.time, updatedTick: Game.time, claimTick: null,
					spawnSitePlacedTick: null, spawnOperationalTick: null, firstHarvestTick: null,
					firstIndependentSpawnTick: null, rclMilestones: {}, bootstrapEnergyDelivered: 0,
					bootstrapSupport: { required: true, activeSupportCreeps: 0 },
					failureReason: null, stateHistory: [{ state: "AUTHORIZED", tick: Game.time }]
				};
			}
		});

		_.each(operations, operation => {
			if (_.includes(["SUCCESS", "FAILED"], operation.state)) return;
			let previousState = operation.state;
			let target = operation.target;
			let origin = operation.origin || operation.from;
			let site = _.get(Memory, ["sites", "colonization", target], null);
			let room = _.get(Game, ["rooms", target], null);
			let controller = _.get(room, "controller", null);
			let owned = _.get(controller, "my", false) === true;
			let age = Game.time - _.get(operation, "createdTick", Game.time);
			let creeps = _.filter(_.get(Game, "creeps", {}), creep => {
				let creepTarget = _.get(creep, ["memory", "target_key"], _.get(creep, ["memory", "room"]));
				return creepTarget === target || _.get(creep, ["memory", "room"]) === target;
			});
			let colonizers = _.filter(creeps, creep => _.get(creep, ["memory", "role"]) === "colonizer"
				|| (_.isString(_.get(creep, "name")) && creep.name.indexOf("colo:") === 0));
			let queuedClaimer = _.some([].concat(
				_.get(Memory, ["shard", "spawn_requests"], []), _.get(Memory, ["hive", "spawn_requests"], [])
			), request => _.get(request, "role", _.get(request, ["args", "role"])) === "colonizer"
				&& _.get(request, ["args", "target_key"], _.get(request, ["args", "room"])) === target);
			let targetSpawns = _.filter(_.get(Game, "spawns", {}), spawn => _.get(spawn, ["room", "name"]) === target);
			let construction = room ? this._find(room, typeof FIND_MY_CONSTRUCTION_SITES !== "undefined" ? FIND_MY_CONSTRUCTION_SITES : null) : [];
			let spawnSites = _.filter(construction, item => _.get(item, "structureType") === "spawn");
			let localWorkers = _.filter(creeps, creep => _.get(creep, ["memory", "colony"]) === target
				&& _.includes(["burrower", "miner", "harvester", "worker"], _.get(creep, ["memory", "role"])));
			let originSupport = _.filter(creeps, creep => _.get(creep, ["memory", "colony"]) === origin
				&& _.get(creep, ["memory", "role"]) !== "colonizer");
			let population = _.get(Memory, ["ai", "metrics", "population", "colonies", target], {});
			let expected = _.sum(_.values(_.get(population, "expected", {})));
			let actual = _.sum(_.values(_.get(population, "actual", {})));
			let satisfaction = expected > 0 ? Math.min(100, actual * 100 / expected) : 0;

			operation.updatedTick = Game.time;
			operation.bootstrapSupport = {
				required: _.get(Memory, ["rooms", target, "spawn_assist", "rooms"], null) != null,
				activeSupportCreeps: originSupport.length
			};

			if (controller && _.get(controller, ["owner", "username"]) != null && !owned) {
				this._failColonization(operation, "target controller became foreign-owned", owned);
			} else if (!owned && (!_.get(Game, ["rooms", origin, "controller", "my"], false))) {
				this._failColonization(operation, "origin colony is no longer available", false);
			} else if (!owned && site && _.get(site, "route_failure", false)) {
				this._failColonization(operation, "authoritative colonization route failed", false);
			} else if (!owned && !site) {
				this._failColonization(operation, "AZC colonization mission disappeared before claim", false);
			} else if (!owned && age >= 15000) {
				this._failColonization(operation, "claimer did not secure the controller before the startup deadline", false);
			} else if (!owned) {
				operation.state = colonizers.length > 0 ? "CLAIMER_EN_ROUTE"
					: (queuedClaimer ? "CLAIMER_REQUESTED" : "CLAIMER_REQUESTED");
			} else {
				if (operation.claimTick == null) operation.claimTick = Game.time;
				let level = _.get(controller, "level", 0);
				for (let rcl = 1; rcl <= level; rcl++)
					if (_.get(operation, ["rclMilestones", rcl]) == null) _.set(operation, ["rclMilestones", rcl], Game.time);

				let remoteSite = _.get(Memory, ["sites", "mining", target]);
				if (remoteSite && _.get(remoteSite, "colony") !== target) {
					operation.remoteConversion = Object.assign({}, _.get(operation, "remoteConversion", {}), {
						convertedTick: Game.time, formerOrigin: _.get(remoteSite, "colony"),
						preservedMiningInfrastructure: true
					});
					remoteSite.colony = target;
					remoteSite.ai_converting_to_colony = false;
				}
				if (_.get(Memory, ["rooms", target, "layout"]) == null && operation.layout)
					_.set(Memory, ["rooms", target, "layout"], _.cloneDeep(operation.layout));
				if (_.get(Memory, ["rooms", target, "spawn_assist", "rooms"]) == null)
					_.set(Memory, ["rooms", target, "spawn_assist", "rooms"], [origin]);

				if (spawnSites.length > 0 && operation.spawnSitePlacedTick == null) operation.spawnSitePlacedTick = Game.time;
				if (targetSpawns.length > 0 && operation.spawnOperationalTick == null) operation.spawnOperationalTick = Game.time;
				if (localWorkers.length > 0 && operation.firstHarvestTick == null) operation.firstHarvestTick = Game.time;
				if (operation.firstIndependentSpawnTick == null && _.some(targetSpawns, spawn => {
					let spawningName = _.get(spawn, ["spawning", "name"]);
					return spawningName && _.get(Game, ["creeps", spawningName, "memory", "colony"]) === target;
				})) operation.firstIndependentSpawnTick = Game.time;

				let stableRcl = _.get(Memory, ["ai", "policy", "minimumStableColonyRcl"], 3);
				let stablePopulation = _.get(Memory, ["ai", "policy", "minimumStableColonyPopulationSatisfaction"], 75);
				let selfSustaining = targetSpawns.length > 0 && localWorkers.length > 0
					&& operation.firstIndependentSpawnTick != null && level >= stableRcl
					&& satisfaction >= stablePopulation;
				if (selfSustaining) {
					operation.state = "SUCCESS";
					operation.outcome = "SUCCESS";
					operation.successTick = Game.time;
					operation.bootstrapSupport.required = false;
				} else if (targetSpawns.length > 0 && localWorkers.length > 0) operation.state = "ECONOMY_BOOTSTRAPPING";
				else if (targetSpawns.length > 0) operation.state = "SPAWN_OPERATIONAL";
				else if (spawnSites.length > 0) operation.state = "SPAWN_BUILDING";
				else operation.state = "CLAIMED";
				if (targetSpawns.length === 0 && Game.time - operation.claimTick >= 20000)
					this._failColonization(operation, "claimed room failed to establish a spawn before the bootstrap deadline", true);
			}

			if (operation.state !== previousState) {
				let history = _.get(operation, "stateHistory", []);
				history.push({ state: operation.state, tick: Game.time, reason: operation.failureReason || null });
				if (history.length > 30) history.splice(0, history.length - 30);
				operation.stateHistory = history;
			}
		});
		_.set(Memory, ["ai", "colonizations"], operations);
	},

	_failColonization: function (operation, reason, claimed) {
		operation.state = "FAILED";
		operation.outcome = claimed ? "PARTIAL_SUCCESS" : "FAILED";
		operation.failureReason = reason;
		operation.failedTick = Game.time;
		operation.retryAfterTick = Game.time + _.get(Memory, ["ai", "policy", "colonizationCooldownTicks"], 50000);
		let site = _.get(Memory, ["sites", "colonization", operation.target]);
		if (site && _.get(site, "ai_managed", false) === true) delete Memory.sites.colonization[operation.target];
		let remoteSite = _.get(Memory, ["sites", "mining", operation.target]);
		if (remoteSite) remoteSite.ai_converting_to_colony = false;
		let failures = _.get(Memory, ["ai", "strategy", "candidateFailures", operation.target], { count: 0 });
		failures.count = _.get(failures, "count", 0) + 1;
		failures.lastFailureTick = Game.time;
		failures.reason = reason;
		failures.retryAfterTick = operation.retryAfterTick;
		_.set(Memory, ["ai", "strategy", "candidateFailures", operation.target], failures);
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
		_.each(_.get(Memory, ["ai", "protection", "deferredScouts"], {}), item => {
			if (item && !_.some(result, current => current.id === item.id))
				result.push(_.cloneDeep(item));
		});
		return result;
	},

	_refreshVisibleIntelligence: function (ownedNames) {
		let intelRooms = _.get(Memory, ["ai", "intelligence", "rooms"], {});
		let hostileEvents = _.get(Memory, ["ai", "intelligence", "hostileEvents"], []);
		let players = _.get(Memory, ["ai", "intelligence", "players"], {});
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
			let protection = this._roomProtection(nearest ? nearest.room : null, room.name, room);
			let terrainSwampPercent = _.get(previous, "terrainSwampPercent", null);
			if (terrainSwampPercent == null)
				terrainSwampPercent = this._swampPercent(room);
			// Room-to-room routes are stable enough for strategic telemetry. Cache
			// the first result instead of paying pathfinder CPU on every snapshot.
			let routeLength = _.has(previous, "routeLength") ? previous.routeLength : null;
			let routeRooms = _.get(previous, "routeRooms", []);
			let routeStatus = _.get(previous, "routeStatus", nearest ? "unknown" : "unavailable");
			if (routeStatus === "protected_boundary" && protection.accessibility === "REACHABLE_NOW")
				routeStatus = "unknown";
			if (nearest && _.includes(["REACHABLE_AFTER_PROTECTION", "BLOCKED_BY_PROTECTED_BOUNDARY"], protection.accessibility)) {
				routeStatus = "protected_boundary";
				routeLength = null;
				routeRooms = [];
			} else if (nearest && routeStatus === "unknown" && _.isFunction(_.get(Game, ["map", "findRoute"]))) {
				let routeInfo = typeof AIRemoteStrategy !== "undefined"
					? AIRemoteStrategy.accessibility(nearest.room, room.name, true) : null;
				if (routeInfo && routeInfo.accessibility === "REACHABLE_NOW") {
					routeLength = routeInfo.routeLength;
					routeRooms = routeInfo.routeRooms;
					routeStatus = "available";
				} else {
					routeStatus = "no_path";
				}
			}
			let usernames = _.uniq(_.map(hostiles, creep => _.get(creep, ["owner", "username"], "unknown"))).slice(0, 8);
			let encountered = _.uniq(usernames.concat([
				_.get(controller, ["owner", "username"]), _.get(controller, ["reservation", "username"])
			])).filter(username => _.isString(username));
			_.each(encountered, username => {
				let record = _.get(players, username, {
					username: username, firstSeenTick: Game.time, lastSeenTick: Game.time,
					ownedRooms: [], reservations: [], rcls: {}, hostileActionsObserved: 0,
					ourCreepsKilled: 0, theirCreepsKilled: 0, territorialProximity: null,
					lastConflictTick: null, currentRelationship: this._relation(username),
					manualRelationship: null
				});
				record.lastSeenTick = Game.time;
				record.currentRelationship = this._relation(username);
				record.manualRelationship = _.get(Memory, ["ai", "intelligence", "relationshipOverrides", username], null);
				if (!_.isObject(record.rcls)) record.rcls = {};
				if (_.get(controller, ["owner", "username"]) === username) {
					record.ownedRooms = _.uniq(record.ownedRooms.concat(room.name)).slice(-25);
					record.rcls[room.name] = _.get(controller, "level", 0);
				}
				if (_.get(controller, ["reservation", "username"]) === username) record.reservations = _.uniq(record.reservations.concat(room.name)).slice(-25);
				if (_.includes(usernames, username) && !_.includes(_.get(previous, "hostilePlayers", []), username)) {
					record.hostileActionsObserved++;
					record.lastConflictTick = Game.time;
				}
				record.territorialProximity = nearest ? nearest.distance : null;
				players[username] = record;
			});
			let layoutAnalysis = _.get(previous, "layoutAnalysis", null);
			if (_.get(controller, "my", false) !== true && (!layoutAnalysis || _.get(layoutAnalysis, "version") !== 2
				|| Game.time - _.get(layoutAnalysis, "analyzedTick", 0) > 50000)
				&& typeof AIRemoteStrategy !== "undefined") layoutAnalysis = AIRemoteStrategy.analyzeLayouts(room);
			let current = {
				room: room.name,
				protection: protection,
				lastSeenTick: Game.time,
				classification: this._roomClassification(room.name),
				sourceCount: sources.length,
				sourcePositions: _.filter(_.map(sources, source => _.get(source, "pos") ? ({ x: source.pos.x, y: source.pos.y }) : null)),
				mineralType: _.get(_.head(minerals), "mineralType", null),
				mineralPosition: _.get(_.head(minerals), "pos") ? { x: _.head(minerals).pos.x, y: _.head(minerals).pos.y } : null,
				terrainSwampPercent: terrainSwampPercent,
				layoutAnalysis: layoutAnalysis,
				controller: {
					status: !controller ? "none" : (_.get(controller, "my", false) ? "owned" : (_.get(controller, ["owner", "username"]) ? "owned_other" : (_.get(controller, ["reservation", "username"]) ? "reserved" : "neutral"))),
					owner: _.get(controller, ["owner", "username"], null),
					ownerRelation: this._relation(_.get(controller, ["owner", "username"], null)),
					reservation: _.get(controller, ["reservation", "username"], null),
					reservationRelation: this._relation(_.get(controller, ["reservation", "username"], null)),
					reservationTicks: _.get(controller, ["reservation", "ticksToEnd"], null),
					rcl: _.get(controller, "level", 0),
					safeMode: _.get(controller, "safeMode", null),
					safeModeAvailable: _.get(controller, "safeModeAvailable", null),
					safeModeCooldown: _.get(controller, "safeModeCooldown", null),
					position: _.get(controller, "pos") ? { x: controller.pos.x, y: controller.pos.y } : null
				},
				structures: {
					spawns: _.filter(structures, structure => structure.structureType === "spawn").length,
					extensions: _.filter(structures, structure => structure.structureType === "extension").length,
					towers: _.filter(structures, structure => structure.structureType === "tower").length,
					towerEnergy: _.sum(_.map(_.filter(structures, structure => structure.structureType === "tower"), tower => this._resource(tower, "energy"))),
					storage: _.filter(structures, structure => structure.structureType === "storage").length,
					terminal: _.filter(structures, structure => structure.structureType === "terminal").length,
					hostile: hostileStructures.length,
					fortifications: this._hitSummary(_.filter(structures, structure => _.includes(["rampart", "constructedWall"], structure.structureType))),
					ramparts: this._hitSummary(_.filter(structures, structure => structure.structureType === "rampart")),
					walls: this._hitSummary(_.filter(structures, structure => structure.structureType === "constructedWall"))
				},
				hostileCreeps: hostiles.length,
				hostilePlayers: usernames,
				hostileCombat: _.map(hostiles.slice(0, 10), creep => ({
					username: _.get(creep, ["owner", "username"], "unknown"),
					bodyParts: _.countBy(_.get(creep, "body", []), part => _.get(part, "type", "unknown")),
					boosts: _.uniq(_.filter(_.map(_.get(creep, "body", []), part => _.get(part, "boost", null))))
				})),
				combatSummary: this._hostileCombatSummary(hostiles),
				playerRelations: _.map(usernames, username => ({ username: username, relation: this._relation(username) })),
				lastHostileSightingTick: hostiles.length > 0 ? Game.time : _.get(previous, "lastHostileSightingTick", null),
				hostileSightingsTotal: _.get(previous, "hostileSightingsTotal", 0) + ((hostiles.length > 0 && _.get(previous, "hostileCreeps", 0) === 0) ? 1 : 0),
				nearestColony: nearest ? nearest.room : null,
				distanceFromColony: nearest ? nearest.distance : null,
				routeLength: routeLength,
				routeRooms: routeRooms,
				reinforcementRoutes: routeRooms.length > 0 ? [routeRooms] : [],
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
		_.set(Memory, ["ai", "intelligence", "players"], players);
	},

	_markScoutObserved: function (roomName) {
		_.each(_.get(Memory, "rooms", {}), roomMemory => {
			_.each(_.get(roomMemory, "scout_requests", []), request => {
				if (request && request.ai_managed === true
					&& !_.includes(["DEFERRED", "OBSERVED", "COMPLETED", "FAILED", "EXPIRED"], _.get(request, "status"))
					&& _.get(request, ["dest_pos", "roomName"]) === roomName) {
					request.status = "OBSERVED";
					request.observed_tick = Game.time;
					request.intel_last_seen_tick = Game.time;
				}
			});
		});
	},

	_territory: function (ownedNames, colonies) {
		let radius = _.get(Memory, ["ai", "policy", "intelligenceRadius"], 2);
		let staleTicks = _.get(Memory, ["ai", "policy", "intelStaleTicks"], 10000);
		let intelRooms = _.get(Memory, ["ai", "intelligence", "rooms"], {});
		let coreRooms = this._nearbyRooms(ownedNames, radius);
		let frontier = this._frontierRooms(ownedNames, coreRooms, intelRooms);
		let nearby = _.uniq(coreRooms.concat(frontier.all));
		_.each(nearby, name => {
			if (!_.has(this._protectionByRoom || {}, name)) {
				let nearest = this._nearestColony(name, ownedNames);
				this._protectionByRoom[name] = this._roomProtection(nearest ? nearest.room : null, name, _.get(Game, ["rooms", name]));
			}
		});
		let known = [];
		let unknown = [];
		let stale = [];
		let remoteCandidates = [];
		let claimCandidates = [];
		let overrides = _.get(Memory, ["ai", "policy", "roomOverrides"], {});
		let overrideRooms = _.keys(overrides);
		let excludedRooms = _.filter(overrideRooms, room => _.includes(["EXCLUDE", "NO_REMOTE"], overrides[room]));
		let excludedClaims = _.filter(overrideRooms, room => _.includes(["EXCLUDE", "NO_COLONY"], overrides[room]));
		let prioritizedRooms = _.filter(overrideRooms, room => overrides[room] === "PRIORITIZE");
		let existingRemotes = _.filter(_.keys(_.get(Memory, ["sites", "mining"], {})), room => _.get(Memory, ["sites", "mining", room, "colony"]) !== room);
		let strategicIntel = _.values(intelRooms);
		let adjacentPotential = {};
		let neighboringPlayers = {};
		_.each(nearby, roomName => {
			adjacentPotential[roomName] = _.filter(strategicIntel, intel => {
				if (_.get(intel, "room") === roomName || _.get(intel, "classification") !== "normal") return false;
				let distance = _.isFunction(_.get(Game, ["map", "getRoomLinearDistance"]))
					? Game.map.getRoomLinearDistance(roomName, intel.room) : null;
				return distance === 1 && _.get(intel, "sourceCount", 0) > 0
					&& _.get(intel, ["controller", "ownerRelation"], "NEUTRAL") === "NEUTRAL";
			}).length;
			neighboringPlayers[roomName] = _.uniq(_.filter(_.map(strategicIntel, intel => {
				let distance = _.isFunction(_.get(Game, ["map", "getRoomLinearDistance"]))
					? Game.map.getRoomLinearDistance(roomName, intel.room) : null;
				if (distance !== 1) return null;
				return _.get(intel, ["controller", "owner"], _.get(intel, ["controller", "reservation"], null));
			}), username => _.isString(username) && username !== this._player)).slice(0, 8);
		});
		_.each(nearby, name => {
			let intel = _.get(intelRooms, name);
			if (!intel) {
				unknown.push(name);
				return;
			}
			let copy = _.cloneDeep(intel);
			let originAssessment = this._bestExpansionOrigin(name, colonies || {});
			let nearest = originAssessment ? { room: originAssessment.room, distance: originAssessment.distance }
				: this._nearestColony(name, ownedNames);
			copy.protection = this._roomProtection(nearest ? nearest.room : null, name, _.get(Game, ["rooms", name]));
			copy.intelAgeTicks = Math.max(0, Game.time - copy.lastSeenTick);
			let roomStaleTicks = _.includes(existingRemotes, name)
				? _.get(Memory, ["ai", "policy", "activeRemoteIntelStaleTicks"], 2000)
				: (_.includes(prioritizedRooms, name)
					? _.get(Memory, ["ai", "policy", "expansionIntelStaleTicks"], 5000)
					: (_.get(copy, "hostilePlayers", []).length > 0
						? _.get(Memory, ["ai", "policy", "borderIntelStaleTicks"], 15000) : staleTicks));
			copy.staleAfterTicks = roomStaleTicks;
			copy.stale = copy.intelAgeTicks > roomStaleTicks;
			known.push(copy);
			let needsStrategicRefresh = copy.classification === "normal"
				&& _.get(copy, ["controller", "status"]) !== "owned"
				&& _.get(copy, "layoutAnalysis") == null;
			if (copy.stale || needsStrategicRefresh)
				stale.push(name);
			if (typeof AIRemoteStrategy !== "undefined") {
				let remote = AIRemoteStrategy.remoteCandidate(copy, {
					existingRemotes: existingRemotes, excludedRooms: excludedRooms,
					prioritizedRooms: prioritizedRooms,
					minimumScore: _.get(Memory, ["ai", "policy", "minimumRemoteScore"], 65)
				});
				remoteCandidates.push(remote);
				let role = this._operationalRole(copy);
				let exits = _.isFunction(_.get(Game, ["map", "describeExits"])) ? _.size(Game.map.describeExits(name) || {}) : 4;
				let remoteEconomics = role === "OUR_REMOTE" ? this._remoteDeliveryEconomics(name) : null;
				let claim = AIRemoteStrategy.claimCandidate(copy, {
					excludedRooms: excludedClaims,
					minimumScore: _.get(Memory, ["ai", "policy", "minimumClaimScore"], 70),
					currentOperationalRole: role,
					origin: nearest ? nearest.room : null,
					originAssessment: originAssessment,
					adjacentRemotePotential: _.get(adjacentPotential, name, 0),
					neighboringPlayers: _.get(neighboringPlayers, name, []),
					exitCount: exits,
					corridorValue: Math.max(0, _.get(adjacentPotential, name, 0) - _.get(neighboringPlayers, name, []).length),
					remoteEconomics: remoteEconomics,
					candidateFailure: _.get(Memory, ["ai", "strategy", "candidateFailures", name], null)
				});
				claim.intelAgeTicks = copy.intelAgeTicks;
				claim.disqualified = !claim.eligible;
				claim.claimCandidateStatus = claim.eligible ? "ELIGIBLE" : (_.includes(claim.disqualifiers, "stale_intel") ? "NEEDS_FRESH_INTEL" : "DISQUALIFIED");
				claim.currentOperationalRole = this._operationalRole(copy);
				claimCandidates.push(claim);
			}
		});
		remoteCandidates = _.sortBy(remoteCandidates, candidate => -candidate.score).slice(0, 20);
		claimCandidates = _.sortBy(claimCandidates, candidate => -candidate.score).slice(0, 20);
		_.set(Memory, ["ai", "strategy", "remoteCandidates"], remoteCandidates);
		_.set(Memory, ["ai", "strategy", "claimCandidates"], claimCandidates);
		let candidateSets = {
			CURRENTLY_REACHABLE: {
				remoteRooms: _.map(_.filter(remoteCandidates, candidate => candidate.availabilitySet === "CURRENTLY_REACHABLE"), "room"),
				claimRooms: _.map(_.filter(claimCandidates, candidate => candidate.availabilitySet === "CURRENTLY_REACHABLE"), "room")
			},
			POST_PROTECTION: {
				remoteRooms: _.map(_.filter(remoteCandidates, candidate => candidate.availabilitySet === "POST_PROTECTION"), "room"),
				claimRooms: _.map(_.filter(claimCandidates, candidate => candidate.availabilitySet === "POST_PROTECTION"), "room")
			}
		};
		let territoryGraph = {};
		_.each(ownedNames, colony => {
			territoryGraph[colony] = {
				remotes: _.sortBy(_.filter(existingRemotes, room => _.get(Memory, ["sites", "mining", room, "colony"]) === colony)),
				nearbyCandidates: _.map(_.filter(claimCandidates, candidate => candidate.origin === colony), "room"),
				neighboringPlayers: _.uniq(_.flatten(_.map(_.filter(claimCandidates, candidate => candidate.origin === colony), candidate => _.get(candidate, ["strategy", "neighboringPlayers"], [])))),
				protectedBoundaryRooms: _.map(_.filter(claimCandidates, candidate => candidate.availabilitySet === "POST_PROTECTION" && candidate.origin === colony), "room")
			};
		});
		return {
			intelligence: {
				radius: radius,
				staleAfterTicks: staleTicks,
				knownRooms: known,
				unknownRooms: _.sortBy(unknown),
				staleRooms: _.sortBy(stale),
				reachableFrontier: _.sortBy(frontier.reachable),
				blockedFrontier: _.sortBy(frontier.blocked),
				staleFrontier: _.sortBy(_.filter(stale, name => _.includes(frontier.all, name))),
				highValueFrontier: _.sortBy(frontier.highValue),
				protectionByRoom: _.pick(this._protectionByRoom || {}, nearby),
				candidateSets: candidateSets,
				territoryGraph: territoryGraph,
				hostileEvents: _.get(Memory, ["ai", "intelligence", "hostileEvents"], []).slice(-20)
			},
			remoteCandidates: remoteCandidates,
			claimCandidates: claimCandidates
		};
	},

	_frontierRooms: function (ownedNames, coreRooms, intelRooms) {
		let maximum = _.get(Memory, ["ai", "policy", "intelligenceFrontierMaxDistance"], 4);
		let seeds = _.uniq(coreRooms.concat(_.keys(intelRooms)));
		let activeRemotes = _.keys(_.get(Memory, ["sites", "mining"], {}));
		let all = [], reachable = [], blocked = [], highValue = [];
		if (!_.isFunction(_.get(Game, ["map", "describeExits"])))
			return { all: all, reachable: reachable, blocked: blocked, highValue: highValue };
		_.each(seeds, seed => {
			let nearest = this._nearestColony(seed, ownedNames);
			if (!nearest || nearest.distance > maximum) return;
			_.each(Game.map.describeExits(seed) || {}, roomName => {
				if (!_.isString(roomName) || _.includes(seeds, roomName) || _.includes(all, roomName)) return;
				let origin = this._nearestColony(roomName, ownedNames);
				if (!origin || origin.distance > maximum) return;
				all.push(roomName);
				let protection = this._roomProtection(origin.room, roomName, _.get(Game, ["rooms", roomName]));
				if (_.get(protection, "accessibility") === "REACHABLE_NOW") reachable.push(roomName);
				else if (_.includes(["BLOCKED_BY_PROTECTED_BOUNDARY", "REACHABLE_AFTER_PROTECTION"], _.get(protection, "accessibility"))) blocked.push(roomName);
				if (_.includes(activeRemotes, seed) || _.includes(coreRooms, seed)) highValue.push(roomName);
			});
		});
		return { all: _.uniq(all), reachable: _.uniq(reachable), blocked: _.uniq(blocked), highValue: _.uniq(highValue) };
	},

	_expansionReadiness: function (candidates, colonies) {
		let reasons = [];
		let owned = _.size(colonies);
		let globalSlots = Math.max(0, _.get(Game, ["gcl", "level"], 0) - owned);
		let protectionSlots = _.get(Memory, ["ai", "protection", "summary", "currentProtectionClaimSlots"], globalSlots);
		let candidate = _.find(candidates, item => item.eligible === true) || _.head(candidates) || null;
		let originName = _.get(candidate, "origin", null);
		let origin = _.get(colonies, originName, null);
		let minimumStorage = _.get(Memory, ["ai", "policy", "minimumOriginStorageEnergy"], 250000);
		let minimumPopulation = _.get(Memory, ["ai", "policy", "minimumOriginPopulationSatisfaction"], 90);
		let minimumCapacity = _.get(Memory, ["ai", "policy", "minimumOriginEnergyCapacity"], 800);
		let populationSatisfaction = _.get(origin, ["population", "demandSatisfaction"], 0) || 0;
		let storageEnergy = _.get(origin, ["energy", "storageEnergy"], 0);
		let energyCapacity = _.get(origin, ["energy", "capacity"], 0);
		let spawnCount = _.get(origin, ["spawning", "spawns"], 0);
		let hostileCount = _.get(origin, ["defense", "hostileCreeps"], 0);
		let activeColonizations = _.filter(_.values(_.get(Memory, ["ai", "colonizations"], {})), operation =>
			!_.includes(["SUCCESS", "FAILED"], _.get(operation, "state")));
		let maxConcurrent = _.get(Memory, ["ai", "policy", "maxConcurrentColonizations"], 1);
		let lastColonization = _.get(Memory, ["ai", "majorOperations", "lastColonizationTick"]);
		let cooldownTicks = _.get(Memory, ["ai", "policy", "colonizationCooldownTicks"], 50000);
		let cooldownRemaining = _.isNumber(lastColonization) ? Math.max(0, cooldownTicks - (Game.time - lastColonization)) : 0;

		if (globalSlots < 1) reasons.push("NO_GCL_CAPACITY");
		if (protectionSlots < 1 && globalSlots > 0) reasons.push("BLOCKED_BY_PROTECTION");
		if (!candidate) reasons.push("INSUFFICIENT_INTEL");
		else if (candidate.eligible !== true) {
			let disqualifiers = candidate.disqualifiers || [];
			if (_.includes(disqualifiers, "retry_cooldown_after_failure")) reasons.push("COLONIZATION_COOLDOWN");
			else if (_.some(disqualifiers, reason => _.includes(["stale_intel"], reason))) reasons.push("INSUFFICIENT_INTEL");
			else if (_.includes(disqualifiers, "no_feasible_layout")) reasons.push("BLOCKED_BY_LAYOUT");
			else if (_.some(disqualifiers, reason => _.includes(["no_route"], reason))) reasons.push("BLOCKED_BY_ROUTE");
			else if (_.some(disqualifiers, reason => _.includes(["post_protection_only", "room_closed", "protection_accessibility_unknown"], reason))) reasons.push("BLOCKED_BY_PROTECTION");
			else if (_.some(disqualifiers, reason => _.includes(["foreign_owned", "foreign_reserved"], reason))) reasons.push("BLOCKED_BY_THREAT");
			else reasons.push("INSUFFICIENT_INTEL");
		}
		if (!origin) reasons.push("BLOCKED_BY_ROUTE");
		else {
			if (populationSatisfaction < minimumPopulation) reasons.push("BLOCKED_BY_POPULATION");
			if (spawnCount < 1 || energyCapacity < minimumCapacity) reasons.push("BLOCKED_BY_SPAWN_CAPACITY");
			if (storageEnergy < minimumStorage) reasons.push("BLOCKED_BY_ECONOMY");
			if (hostileCount > 0) reasons.push("BLOCKED_BY_THREAT");
		}
		if (activeColonizations.length >= maxConcurrent) reasons.push("COLONIZATION_IN_PROGRESS");
		if (cooldownRemaining > 0) reasons.push("COLONIZATION_COOLDOWN");
		if (_.get(Memory, ["ai", "policy", "allowColonization"], false) !== true) reasons.push("AUTHORITY_DISABLED");
		let blocking = _.filter(reasons, reason => reason !== "AUTHORITY_DISABLED");
		let status = blocking.length === 0 ? "READY" : blocking[0];
		let operationalLimitReason = blocking.length === 0 ? null : blocking.join(",");
		return {
			status: status,
			reasons: reasons,
			recommendedRoom: candidate ? candidate.room : null,
			origin: originName,
			layout: _.get(candidate, "layout", null),
			candidateScore: _.get(candidate, "score", null),
			currentOperationalRole: _.get(candidate, "currentOperationalRole", null),
			bootstrap: _.get(candidate, "bootstrap", null),
			economicConversion: _.get(candidate, "economicConversion", null),
			claimSlots: Math.min(globalSlots, protectionSlots),
			globalGclClaimSlots: globalSlots,
			currentProtectionClaimSlots: protectionSlots,
			recommendedSimultaneousColonizations: blocking.length === 0 ? 1 : 0,
			operationalLimitReason: operationalLimitReason,
			spawnCapacity: spawnCount > 0 && energyCapacity >= minimumCapacity ? "ADEQUATE" : "CONSTRAINED",
			components: {
				legalCapacity: { global: globalSlots, protectedRegion: protectionSlots, available: Math.min(globalSlots, protectionSlots) },
				population: { value: populationSatisfaction, minimum: minimumPopulation, pass: populationSatisfaction >= minimumPopulation },
				spawnCapacity: { spawns: spawnCount, energyCapacity: energyCapacity, minimumEnergyCapacity: minimumCapacity, pass: spawnCount > 0 && energyCapacity >= minimumCapacity },
				economy: { storageEnergy: storageEnergy, minimumStorageEnergy: minimumStorage, pass: storageEnergy >= minimumStorage },
				threat: { hostileCreeps: hostileCount, pass: hostileCount === 0 },
				concurrency: { active: activeColonizations.length, maximum: maxConcurrent, pass: activeColonizations.length < maxConcurrent },
				cooldown: { remainingTicks: cooldownRemaining, pass: cooldownRemaining === 0 },
				authority: { allowed: _.get(Memory, ["ai", "policy", "allowColonization"], false) === true, automatic: _.get(Memory, ["ai", "policy", "autoColonization"], false) === true }
			}
		};
	},

	_remoteDeliveryEconomics: function (roomName) {
		let metrics = _.get(Memory, ["ai", "metrics", "remotes", roomName], {});
		let total = _.get(metrics, "energyDeliveredTotal", 0);
		let window = _.get(metrics, "deliveryRateWindow", null);
		if (!window || total < _.get(window, "baselineTotal", 0)) {
			window = { baselineTick: Game.time, baselineTotal: total, measuredDeliveryPer1000: null, measuredTick: null };
		} else if (Game.time - _.get(window, "baselineTick", Game.time) >= 1000) {
			let elapsed = Math.max(1, Game.time - window.baselineTick);
			window.measuredDeliveryPer1000 = Math.round((total - window.baselineTotal) * 100000 / elapsed) / 100;
			window.measuredTick = Game.time;
			window.baselineTick = Game.time;
			window.baselineTotal = total;
		}
		_.set(Memory, ["ai", "metrics", "remotes", roomName, "deliveryRateWindow"], window);
		return {
			measuredDeliveryPer1000: _.get(window, "measuredDeliveryPer1000", null),
			cumulativeDelivered: total,
			health: _.get(Memory, ["ai", "metrics", "remotes", roomName, "lastHealth"], null),
			measuredTick: _.get(window, "measuredTick", null)
		};
	},

	_bestExpansionOrigin: function (target, colonies) {
		let assessments = [];
		_.each(colonies || {}, (colony, room) => {
			let distance = room === target ? 0 : (_.isFunction(_.get(Game, ["map", "getRoomLinearDistance"])) ? Game.map.getRoomLinearDistance(room, target) : 10);
			let satisfaction = _.get(colony, ["population", "demandSatisfaction"], 0) || 0;
			let storage = _.get(colony, ["energy", "storageEnergy"], 0);
			let spawns = _.get(colony, ["spawning", "spawns"], 0);
			let hostiles = _.get(colony, ["defense", "hostileCreeps"], 0);
			let score = Math.round(Math.min(40, storage / 25000) + satisfaction / 5 + spawns * 12 - distance * 6 - hostiles * 30);
			assessments.push({
				room: room, distance: distance, score: score, storageEnergy: storage,
				populationSatisfaction: satisfaction, spawns: spawns,
				energyCapacity: _.get(colony, ["energy", "capacity"], 0), hostiles: hostiles
			});
		});
		return _.head(_.sortBy(assessments, assessment => -assessment.score)) || null;
	},

	_protectionSummary: function (ownedNames, strategicRooms) {
		let primary = _.find(ownedNames || [], roomName => {
			return typeof AIRemoteStrategy !== "undefined" && AIRemoteStrategy.roomStatus(roomName).protected;
		}) || _.head(ownedNames) || null;
		let rooms = {};
		_.each(_.uniq((strategicRooms || []).concat(ownedNames || [])), roomName => {
			rooms[roomName] = this._roomProtection(primary, roomName, _.get(Game, ["rooms", roomName]));
		});
		let primaryStatus = primary && typeof AIRemoteStrategy !== "undefined"
			? AIRemoteStrategy.roomStatus(primary)
			: { status: "unknown", protected: false, expirationTimestamp: null, remainingProtectionMs: null, regionKey: null };
		let rules = typeof AIRemoteStrategy !== "undefined"
			? AIRemoteStrategy.protectionRules(primaryStatus.status)
			: { status: "unknown", temporaryBoundary: false, claimLimitType: "UNKNOWN", nukersAllowed: false, reachable: false, reservationsUnlimited: false, outsidePlayersExcluded: false, residentConflictPossible: false, safeModeSeparate: true };
		let active = rules.temporaryBoundary === true;
		let globalSlots = Math.max(0, _.get(Game, ["gcl", "level"], 0) - (ownedNames || []).length);
		let protectedOwned = active ? _.filter(ownedNames, roomName => {
			let value = typeof AIRemoteStrategy !== "undefined" ? AIRemoteStrategy.roomStatus(roomName) : {};
			return primaryStatus.regionKey == null ? value.protected === true : value.regionKey === primaryStatus.regionKey;
		}).length : 0;
		let currentSlots = rules.claimLimitType === "NOVICE_THREE_ROOM"
			? Math.max(0, Math.min(globalSlots, 3 - protectedOwned))
			: (rules.claimLimitType === "NORMAL_GCL" ? globalSlots : 0);
		let band = this._protectionBand(primaryStatus.remainingProtectionMs, active);
		let previous = _.get(Memory, ["ai", "protection", "summary"], {});
		let events = _.get(Memory, ["ai", "protection", "events"], []);
		if (!_.isArray(events)) events = [];
		let addEvent = (type, message, details) => {
			let event = {
				id: `protection:${type}:${Game.time}`, type: type, tick: Game.time,
				timestamp: Date.now(), message: message, details: details || {}
			};
			if (!_.some(events, item => item.id === event.id)) events.push(event);
			if (events.length > 20) events.splice(0, events.length - 20);
			_.set(Memory, ["ai", "protection", "lastReassessmentTick"], Game.time);
		};
		let priorStatus = _.get(previous, "status", null);
		let priorBand = _.get(previous, "threshold", null);
		if (priorStatus == null && active)
			addEvent("PROTECTION_DETECTED", `Empire detected inside ${primaryStatus.status} protection`, { expirationTimestamp: primaryStatus.expirationTimestamp });
		else if (_.includes(["novice", "respawn"], priorStatus) && primaryStatus.status === "normal") {
			addEvent("PROTECTION_EXPIRED", "Protected-area boundary expired; routes and strategy require full recomputation", { previousStatus: priorStatus });
			_.set(Memory, ["ai", "protection", "blockedExits"], {});
			_.set(Memory, ["ai", "protection", "routeCache"], {});
			_.set(Memory, ["ai", "protection", "lastTransitionTick"], Game.time);
		} else if (active && priorBand != null && priorBand !== band)
			addEvent("COUNTDOWN_THRESHOLD", `Protection countdown entered ${band}`, { previousThreshold: priorBand, threshold: band, expirationTimestamp: primaryStatus.expirationTimestamp });

		let deferred = _.get(Memory, ["ai", "protection", "deferredScouts"], {});
		_.each(_.keys(deferred), roomName => {
			let route = typeof AIRemoteStrategy !== "undefined" && primary
				? AIRemoteStrategy.accessibility(primary, roomName, false) : null;
			if (route && route.accessibility === "REACHABLE_NOW") {
				deferred[roomName].accessibility = "REACHABLE_NOW";
				deferred[roomName].deferredUntilTimestamp = null;
			}
		});
		_.set(Memory, ["ai", "protection", "deferredScouts"], deferred);
		_.set(Memory, ["ai", "protection", "events"], events);
		let lastReassessment = _.get(Memory, ["ai", "protection", "lastReassessmentTick"], null);
		let empire = {
			active: active,
			status: primaryStatus.status,
			expirationTimestamp: primaryStatus.expirationTimestamp,
			remainingProtectionMs: primaryStatus.remainingProtectionMs,
			currentRegionKey: primaryStatus.regionKey,
			protectedOwnedRooms: protectedOwned,
			globalGclClaimSlots: globalSlots,
			currentProtectionClaimSlots: currentSlots,
			claimLimit: rules.claimLimitType === "NOVICE_THREE_ROOM" ? 3 : null,
			threshold: band,
			advisoryRequired: _.isNumber(lastReassessment) && Game.time - lastReassessment <= 500,
			lastTransitionTick: _.get(Memory, ["ai", "protection", "lastTransitionTick"], null),
			events: events.slice(-10),
			rules: rules
		};
		_.set(Memory, ["ai", "protection", "summary"], empire);
		return { empire: empire, rooms: rooms };
	},

	_protectionBand: function (remainingMs, active) {
		if (!active) return "INACTIVE";
		if (!_.isNumber(remainingMs)) return "EXPIRATION_UNKNOWN";
		let hours = remainingMs / 3600000;
		let thresholds = _.sortBy(_.filter(_.get(Memory, ["ai", "policy", "protectionThresholdHours"], [168, 72, 24, 6, 0]), _.isNumber), value => -value);
		let band = "ABOVE_CONFIGURED_THRESHOLDS";
		_.each(thresholds, threshold => {
			if (hours <= threshold) band = `AT_OR_BELOW_${threshold}_HOURS`;
		});
		return band;
	},

	_roomProtection: function (origin, target, visibleRoom) {
		let status = typeof AIRemoteStrategy !== "undefined"
			? AIRemoteStrategy.roomStatus(target)
			: { status: "unknown", protected: false, expirationTimestamp: null, remainingProtectionMs: null, regionKey: null };
		let route = origin && typeof AIRemoteStrategy !== "undefined"
			? AIRemoteStrategy.accessibility(origin, target, true)
			: { accessibility: status.status === "closed" ? "CLOSED" : "UNKNOWN", sharesProtectedRegion: false, reachableNow: false, reachableAfterTimestamp: null };
		let blockedExits = this._blockedBoundaryExits(target, visibleRoom, status);
		return {
			status: status.status,
			expirationTimestamp: status.expirationTimestamp,
			remainingProtectionMs: status.remainingProtectionMs,
			protected: status.protected,
			regionKey: status.regionKey,
			sharesCurrentProtectedRegion: route.sharesProtectedRegion,
			accessibility: route.accessibility,
			reachableNow: route.reachableNow,
			reachableAfterTimestamp: route.reachableAfterTimestamp,
			blockedExits: blockedExits
		};
	},

	_blockedBoundaryExits: function (roomName, visibleRoom, roomStatus) {
		let cached = _.get(Memory, ["ai", "protection", "blockedExits", roomName]);
		let signature = `${_.get(roomStatus, "status", "unknown")}:${_.get(roomStatus, "expirationTimestamp", "none")}`;
		if (cached && cached.signature === signature && Game.time - _.get(cached, "checkedTick", 0) < 1000)
			return _.get(cached, "exits", []);
		let blocked = [];
		let visibleWallDirections = {};
		if (visibleRoom) {
			let structures = this._find(visibleRoom, typeof FIND_STRUCTURES !== "undefined" ? FIND_STRUCTURES : null);
			_.each(structures, structure => {
				if (!_.includes(["constructedWall", "wall"], _.get(structure, "structureType")) || !_.get(structure, "pos")) return;
				if (structure.pos.y === 0) visibleWallDirections["1"] = true;
				if (structure.pos.x === 49) visibleWallDirections["3"] = true;
				if (structure.pos.y === 49) visibleWallDirections["5"] = true;
				if (structure.pos.x === 0) visibleWallDirections["7"] = true;
			});
		}
		let exits = _.isFunction(_.get(Game, ["map", "describeExits"])) ? (Game.map.describeExits(roomName) || {}) : {};
		_.each(exits, (neighbor, direction) => {
			let other = typeof AIRemoteStrategy !== "undefined" ? AIRemoteStrategy.roomStatus(neighbor) : {};
			let crosses = (_.get(roomStatus, "protected", false) || _.get(other, "protected", false))
				&& _.get(roomStatus, "regionKey", null) !== _.get(other, "regionKey", null);
			if (!crosses) return;
			let evidence = visibleWallDirections[String(direction)] ? "VISIBLE_BOUNDARY_WALL" : "STATUS_BOUNDARY";
			if (visibleRoom && _.isFunction(_.get(Game, ["map", "findExit"]))) {
				let exitResult;
				try { exitResult = Game.map.findExit(roomName, neighbor); } catch (err) { exitResult = null; }
				if ((typeof ERR_NO_PATH !== "undefined" && exitResult === ERR_NO_PATH) || exitResult === -2)
					evidence = "VISIBLE_MAP_NO_PATH";
			}
			blocked.push({ direction: String(direction), room: neighbor, reason: "PROTECTED_BOUNDARY", evidence: evidence });
		});
		_.set(Memory, ["ai", "protection", "blockedExits", roomName], { signature: signature, checkedTick: Game.time, exits: blocked });
		return blocked;
	},

	_hostileCombatSummary: function (creeps) {
		let result = {
			creeps: (creeps || []).length, meleeDps: 0, rangedDps: 0,
			healingPerTick: 0, dismantlePerTick: 0, activeBodyParts: {}, boosts: []
		};
		_.each(creeps || [], creep => {
			_.each(_.get(creep, "body", []), part => {
				if (_.get(part, "hits", 100) <= 0) return;
				let type = _.get(part, "type", part);
				let boost = _.get(part, "boost", null);
				result.activeBodyParts[type] = _.get(result.activeBodyParts, type, 0) + 1;
				if (boost) result.boosts.push(boost);
				let multiplier = action => {
					if (!boost || typeof BOOSTS === "undefined") return 1;
					return _.get(BOOSTS, [type, boost, action], 1);
				};
				if (type === "attack") result.meleeDps += 30 * multiplier("attack");
				if (type === "ranged_attack") result.rangedDps += 10 * multiplier("rangedAttack");
				if (type === "heal") result.healingPerTick += 12 * multiplier("heal");
				if (type === "work") result.dismantlePerTick += 50 * multiplier("dismantle");
			});
		});
		result.boosts = _.uniq(result.boosts);
		return result;
	},

	_bodyTemplateSummary: function (name, level) {
		if (typeof Creep_Body === "undefined" || !_.isFunction(_.get(Creep_Body, "getBody")))
			return { available: false, reason: "CREEP_BODY_LIBRARY_UNAVAILABLE" };
		let body = Creep_Body.getBody(name, level) || [];
		let costs = { move: 50, work: 100, carry: 50, attack: 80, ranged_attack: 150, heal: 250, claim: 600, tough: 10 };
		let combat = this._hostileCombatSummary([{ body: _.map(body, type => ({ type: type, hits: 100 })) }]);
		return {
			available: body.length > 0, level: level, parts: _.countBy(body), bodyParts: body.length,
			energyCost: _.sum(_.map(body, type => _.get(costs, type, 0))), spawnTicks: body.length * 3,
			meleeDps: combat.meleeDps, rangedDps: combat.rangedDps,
			healingPerTick: combat.healingPerTick, dismantlePerTick: combat.dismantlePerTick
		};
	},

	_towerPowerAtRange: function (basePower, distance, towers) {
		let optimal = typeof TOWER_OPTIMAL_RANGE !== "undefined" ? TOWER_OPTIMAL_RANGE : 5;
		let falloffRange = typeof TOWER_FALLOFF_RANGE !== "undefined" ? TOWER_FALLOFF_RANGE : 20;
		let falloff = typeof TOWER_FALLOFF !== "undefined" ? TOWER_FALLOFF : 0.75;
		let multiplier = distance <= optimal ? 1 : (distance >= falloffRange ? 1 - falloff
			: 1 - falloff * (distance - optimal) / (falloffRange - optimal));
		return Math.round(Math.max(0, towers) * basePower * multiplier);
	},

	_combatAssessments: function (rooms, capability) {
		let staleAfter = _.get(Memory, ["ai", "policy", "intelStaleTicks"], 10000);
		let templates = _.get(capability, "combatBodyTemplates", {});
		let soldier = _.get(templates, "soldier", {}), healer = _.get(templates, "healer", {}), dismantler = _.get(templates, "dismantler", {});
		let ourMelee = _.get(soldier, "available", false) ? _.get(soldier, "meleeDps", 0) * 2 : 0;
		let ourRanged = _.get(soldier, "available", false) ? _.get(soldier, "rangedDps", 0) * 2 : 0;
		let ourHealing = _.get(healer, "available", false) ? _.get(healer, "healingPerTick", 0) * 2 : 0;
		let ourDismantle = _.get(dismantler, "available", false) ? _.get(dismantler, "dismantlePerTick", 0) : 0;
		return _.map(_.filter(rooms || [], intel => {
			let relation = _.get(intel, ["controller", "ownerRelation"], "NEUTRAL");
			return (_.get(intel, ["controller", "owner"]) != null && !_.includes(["SELF", "ALLY"], relation))
				|| (relation !== "SELF" && _.get(intel, "hostileCreeps", 0) > 0);
		}), intel => {
			let age = _.get(intel, "intelAgeTicks", Math.max(0, Game.time - _.get(intel, "lastSeenTick", Game.time)));
			let stale = _.get(intel, "stale", age >= staleAfter);
			let towers = _.get(intel, ["structures", "towers"], 0);
			let towerEnergy = _.get(intel, ["structures", "towerEnergy"], 0);
			let activeTowers = towerEnergy > 0 ? Math.min(towers, Math.ceil(towerEnergy / 10)) : 0;
			let towerAttack = typeof TOWER_POWER_ATTACK !== "undefined" ? TOWER_POWER_ATTACK : 600;
			let towerHeal = typeof TOWER_POWER_HEAL !== "undefined" ? TOWER_POWER_HEAL : 400;
			let enemy = _.get(intel, "combatSummary", {});
			let towerDps10 = this._towerPowerAtRange(towerAttack, 10, activeTowers);
			let enemyPressure = towerDps10 + _.get(enemy, "meleeDps", 0) + _.get(enemy, "rangedDps", 0) + _.get(enemy, "healingPerTick", 0);
			let ourPressure = ourMelee + ourRanged + ourHealing;
			let advantage = enemyPressure > 0 ? ourPressure / enemyPressure : (ourPressure > 0 ? 5 : 0);
			let confidence = stale ? 0 : Math.max(0.1, Math.min(1, 1 - age / staleAfter));
			let safeMode = _.get(intel, ["controller", "safeMode"], null);
			let fortificationHits = _.max([
				_.get(intel, ["structures", "ramparts", "max"], 0) || 0,
				_.get(intel, ["structures", "walls", "max"], 0) || 0,
				_.get(intel, ["structures", "fortifications", "max"], 0) || 0
			]);
			let breachTicks = ourDismantle > 0 ? Math.ceil(fortificationHits / ourDismantle) : null;
			let routeStatus = _.get(intel, "routeStatus", "available");
			let routeBlocked = _.includes(["protected_boundary", "no_path", "unavailable", "unknown"], routeStatus);
			let travelTicks = (_.get(intel, "routeLength", 0) || 0) * 50;
			let travelLoss = Math.min(1, travelTicks / 1500);
			let success = (safeMode || routeBlocked) ? 0 : Math.max(0, Math.min(0.99,
				(advantage / (advantage + 1)) * confidence * (1 - travelLoss * 0.5)));
			let recommendation = stale ? "STALE_INTEL" : (safeMode ? "SAFE_MODE_ACTIVE"
				: (routeStatus === "protected_boundary" ? "PROTECTED_BOUNDARY"
					: (routeBlocked ? "NO_ROUTE"
				: (_.get(capability, ["spawnThroughput", "spawns"], 0) < 1 || ourPressure <= 0 ? "INSUFFICIENT_CAPABILITY"
					: (success >= 0.7 && (breachTicks == null || breachTicks <= 1500) ? "FEASIBLE" : "HIGH_RISK")))));
			return {
				target: intel.room, owner: _.get(intel, ["controller", "owner"], null), intelAgeTicks: age,
				intelConfidence: Math.round(confidence * 100) / 100,
				defense: {
					towers: towers, activeTowers: activeTowers, towerEnergy: towerEnergy,
					towerDpsByRange: { range5: this._towerPowerAtRange(towerAttack, 5, activeTowers), range10: towerDps10, range20: this._towerPowerAtRange(towerAttack, 20, activeTowers) },
					towerHealingByRange: { range5: this._towerPowerAtRange(towerHeal, 5, activeTowers), range10: this._towerPowerAtRange(towerHeal, 10, activeTowers), range20: this._towerPowerAtRange(towerHeal, 20, activeTowers) },
					defenders: _.get(enemy, "creeps", 0), meleeDps: _.get(enemy, "meleeDps", 0), rangedDps: _.get(enemy, "rangedDps", 0),
					healingPerTick: _.get(enemy, "healingPerTick", 0), rampartMax: _.get(intel, ["structures", "ramparts", "max"], null), wallMax: _.get(intel, ["structures", "walls", "max"], null)
				},
				ourCapability: {
					attackers: 2, healers: 2, dismantlers: _.get(dismantler, "available", false) ? 1 : 0,
					meleeDps: ourMelee, rangedDps: ourRanged, healingPerTick: ourHealing, dismantlePerTick: ourDismantle,
					spawnReplacementPartsPer1000: _.get(capability, ["spawnThroughput", "theoreticalBodyPartsPer1000Ticks"], 0)
				},
				constraints: {
					safeModeTicks: safeMode, safeModeAvailable: _.get(intel, ["controller", "safeModeAvailable"], null), breachTicks: breachTicks,
					routeStatus: routeStatus, routeLength: _.get(intel, "routeLength", null), travelTicks: travelTicks, travelLifetimeLoss: Math.round(travelLoss * 100) / 100,
					boostEffectsIncluded: _.get(enemy, "boosts", []).length > 0
				},
				estimatedForceAdvantage: Math.round(advantage * 100) / 100,
				estimatedSuccess: Math.round(success * 100) / 100,
				recommendation: recommendation, executionAuthorized: false
			};
		});
	},

	_militaryPreparation: function (ownedRooms, protection) {
		let structures = [];
		_.each(ownedRooms || [], room => {
			structures = structures.concat(this._find(room, typeof FIND_STRUCTURES !== "undefined" ? FIND_STRUCTURES : null));
		});
		let seenStructures = {};
		structures = _.filter(structures, structure => {
			let key = _.get(structure, "id", `${_.get(structure, ["pos", "roomName"], "unknown")}:${_.get(structure, "structureType", "unknown")}:${_.get(structure, ["pos", "x"], 0)}:${_.get(structure, ["pos", "y"], 0)}`);
			if (seenStructures[key]) return false;
			seenStructures[key] = true;
			return true;
		});
		let spawns = _.filter(structures, structure => structure.structureType === "spawn" && _.get(structure, "my", true) !== false);
		if (spawns.length === 0) spawns = _.values(_.get(Game, "spawns", {}));
		let resources = {};
		_.each(structures, structure => {
			if (_.get(structure, "my", true) === false || !_.get(structure, "store")) return;
			_.each(structure.store, (amount, resourceType) => {
				if (_.isNumber(amount) && amount > 0) resources[resourceType] = _.get(resources, resourceType, 0) + amount;
			});
		});
		let nukers = _.filter(structures, structure => structure.structureType === "nuker" && _.get(structure, "my", true) !== false).length;
		let terminals = _.filter(structures, structure => structure.structureType === "terminal" && _.get(structure, "my", true) !== false).length;
		let labs = _.filter(structures, structure => structure.structureType === "lab" && _.get(structure, "my", true) !== false).length;
		let maxRcl = _.max(_.map(ownedRooms || [], room => _.get(room, ["controller", "level"], 0))) || 0;
		let maxEnergyCapacity = _.max(_.map(ownedRooms || [], room => _.get(room, "energyCapacityAvailable", 0))) || 0;
		let templateLevel = Math.max(1, maxRcl);
		let combatBodyTemplates = {};
		_.each(["soldier", "ranger", "healer", "dismantler"], name => {
			let template = this._bodyTemplateSummary(name, templateLevel);
			if (_.get(template, "energyCost", 0) > maxEnergyCapacity) {
				template.available = false;
				template.reason = `ENERGY_CAPACITY_${maxEnergyCapacity}_BELOW_COST_${template.energyCost}`;
			}
			combatBodyTemplates[name] = template;
		});
		let boostResources = {};
		_.each(resources, (amount, resourceType) => {
			if (resourceType !== "energy") boostResources[resourceType] = amount;
		});
		return {
			spawnThroughput: {
				spawns: spawns.length,
				busy: _.filter(spawns, spawn => _.get(spawn, "spawning") != null).length,
				idle: _.filter(spawns, spawn => _.get(spawn, "spawning") == null).length,
				queueDepth: _.sum(_.map(ownedRooms || [], room => this._spawnQueue(room.name).length)),
				theoreticalBodyPartsPer1000Ticks: Math.floor(spawns.length * 1000 / 3)
			},
			availableCombatResources: resources,
			availableEnergy: _.get(resources, "energy", 0),
			terminalStructures: terminals,
			labStructures: labs,
			boostResources: boostResources,
			combatBodyTemplates: combatBodyTemplates,
			maximumRcl: maxRcl,
			maximumSpawnEnergyCapacity: maxEnergyCapacity,
			capabilityLimit: maxRcl < 6 ? "RCL_BELOW_LABS_AND_TERMINAL_FORCE_PROJECTION" : (labs < 1 ? "NO_LABS" : "FULLER_CAPABILITY_AVAILABLE"),
			nukerStructures: nukers,
			nukersOperational: _.get(protection, ["rules", "nukersAllowed"], false) && nukers > 0,
			offensiveCombatAuthorized: false
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
		if (_.get(intel, ["controller", "status"]) === "owned_other") return "FOREIGN_OWNED";
		if (reservation === "SELF") return "SELF_RESERVED";
		if (reservation === "ALLY") return "ALLY_RESERVED";
		if (reservation === "HOSTILE") return "FOREIGN_RESERVED";
		if (_.get(intel, ["controller", "reservation"]) != null) return "FOREIGN_RESERVED";
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
		let override = _.get(Memory, ["ai", "intelligence", "relationshipOverrides", username]);
		if (_.includes(["ALLY", "NEUTRAL", "SUSPICIOUS", "HOSTILE", "WAR"], override))
			return override;
		if (_.includes(_.get(Memory, ["hive", "allies"], []), username))
			return "ALLY";
		if (username === "Invader" || username === "Source Keeper")
			return "HOSTILE";
		if (_.includes(_.get(Memory, ["hive", "enemies"], []), username))
			return "HOSTILE";
		return player ? "NEUTRAL" : "UNKNOWN";
	},

	_playerHistory: function () {
		return _.map(_.values(_.get(Memory, ["ai", "intelligence", "players"], {})), record => {
			let copy = _.cloneDeep(record);
			let override = _.get(Memory, ["ai", "intelligence", "relationshipOverrides", copy.username], null);
			copy.manualRelationship = override;
			copy.currentRelationship = override || this._relation(copy.username);
			return copy;
		});
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
