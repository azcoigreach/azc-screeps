/* ***********************************************************
 *  DEFINITIONS: AI COMMANDER DETERMINISTIC STRATEGY
 * *********************************************************** */

// Pure helpers shared by remote population management and strategic telemetry.
// The LLM may interpret these results, but never supplies the underlying maths.
global.AIRemoteStrategy = {
	ROOM_TRAVEL_TICKS: 50,
	REMOTE_SCORE_MINIMUM: 65,
	CLAIM_SCORE_MINIMUM: 70,
	ROLE_SAFETY_MARGIN: { reserver: 150, burrower: 100, miner: 100, carrier: 75 },
	PROTECTION_RULES: {
		novice: {
			temporaryBoundary: true, claimLimitType: "NOVICE_THREE_ROOM",
			nukersAllowed: false, reachable: true, reservationsUnlimited: true,
			outsidePlayersExcluded: true, residentConflictPossible: true, safeModeSeparate: true
		},
		respawn: {
			temporaryBoundary: true, claimLimitType: "NORMAL_GCL",
			nukersAllowed: false, reachable: true, reservationsUnlimited: true,
			outsidePlayersExcluded: true, residentConflictPossible: true, safeModeSeparate: true
		},
		normal: {
			temporaryBoundary: false, claimLimitType: "NORMAL_GCL",
			nukersAllowed: true, reachable: true, reservationsUnlimited: true,
			outsidePlayersExcluded: false, residentConflictPossible: true, safeModeSeparate: true
		},
		closed: {
			temporaryBoundary: false, claimLimitType: "NOT_CLAIMABLE",
			nukersAllowed: false, reachable: false, reservationsUnlimited: false,
			outsidePlayersExcluded: true, residentConflictPossible: false, safeModeSeparate: true
		},
		unknown: {
			temporaryBoundary: false, claimLimitType: "UNKNOWN",
			nukersAllowed: false, reachable: false, reservationsUnlimited: false,
			outsidePlayersExcluded: false, residentConflictPossible: false, safeModeSeparate: true
		}
	},

	protectionRules: function (status) {
		let key = _.includes(["novice", "respawn", "normal", "closed"], status) ? status : "unknown";
		return Object.assign({ status: key }, this.PROTECTION_RULES[key]);
	},

	roomStatus: function (roomName) {
		if (!_.isString(roomName) || !_.isFunction(_.get(Game, ["map", "getRoomStatus"])))
			return { status: "unknown", expirationTimestamp: null, remainingProtectionMs: null, protected: false, regionKey: null };
		let raw;
		try {
			raw = Game.map.getRoomStatus(roomName);
		} catch (err) {
			return { status: "unknown", expirationTimestamp: null, remainingProtectionMs: null, protected: false, regionKey: null };
		}
		let status = _.get(raw, "status", "unknown");
		if (!_.includes(["normal", "closed", "novice", "respawn"], status)) status = "unknown";
		let timestamp = _.isNumber(_.get(raw, "timestamp")) ? raw.timestamp : null;
		let rules = this.protectionRules(status);
		let protectedRoom = rules.temporaryBoundary;
		return {
			status: status,
			expirationTimestamp: timestamp,
			remainingProtectionMs: protectedRoom && timestamp != null ? Math.max(0, timestamp - Date.now()) : null,
			protected: protectedRoom,
			regionKey: protectedRoom && timestamp != null ? `${status}:${timestamp}` : null,
			rules: rules
		};
	},

	accessibility: function (origin, target, checkRoute) {
		let from = this.roomStatus(origin), to = this.roomStatus(target);
		let result = {
			originStatus: from.status,
			targetStatus: to.status,
			accessibility: "UNKNOWN",
			sharesProtectedRegion: from.protected && to.protected && from.regionKey != null && from.regionKey === to.regionKey,
			reachableNow: false,
			reachableAfterTimestamp: null,
			targetExpirationTimestamp: to.expirationTimestamp,
			routeRooms: [],
			routeLength: null
		};
		if (from.status === "closed" || to.status === "closed") {
			result.accessibility = "CLOSED";
			return result;
		}
		if (from.status === "unknown" || to.status === "unknown") return result;
		if ((from.protected || to.protected) && !result.sharesProtectedRegion) {
			result.accessibility = "BLOCKED_BY_PROTECTED_BOUNDARY";
			let expirations = _.filter([from.expirationTimestamp, to.expirationTimestamp], _.isNumber);
			result.reachableAfterTimestamp = expirations.length > 0 ? _.max(expirations) : null;
			if (result.reachableAfterTimestamp == null) result.accessibility = "UNKNOWN";
			return result;
		}
		result.accessibility = "REACHABLE_NOW";
		result.reachableNow = true;
		if (checkRoute === false || !_.isFunction(_.get(Game, ["map", "findRoute"]))) return result;
		let cacheKey = `${origin}>${target}`;
		let signature = `${from.status}:${from.expirationTimestamp}|${to.status}:${to.expirationTimestamp}`;
		let cached = typeof Memory !== "undefined" ? _.get(Memory, ["ai", "protection", "routeCache", cacheKey]) : null;
		if (cached && cached.signature === signature && Game.time - _.get(cached, "checkedTick", 0) < 1000 && _.isObject(cached.result)) return _.cloneDeep(cached.result);
		let route = Game.map.findRoute(origin, target, {
			routeCallback: roomName => {
				let status = this.roomStatus(roomName);
				if (_.includes(["closed", "unknown"], status.status)) return Infinity;
				if (from.protected && status.regionKey !== from.regionKey) return Infinity;
				if (!from.protected && status.protected) return Infinity;
				return 1;
			}
		});
		if (!_.isArray(route)) {
			result.sharesProtectedRegion = false;
			let expirations = _.filter([from.expirationTimestamp, to.expirationTimestamp], _.isNumber);
			result.accessibility = (from.protected || to.protected) && expirations.length > 0
				? "REACHABLE_AFTER_PROTECTION" : "UNKNOWN";
			result.reachableAfterTimestamp = expirations.length > 0 ? _.max(expirations) : null;
			result.reachableNow = false;
			if (typeof Memory !== "undefined") _.set(Memory, ["ai", "protection", "routeCache", cacheKey], { signature: signature, checkedTick: Game.time, result: _.cloneDeep(result) });
			return result;
		}
		result.routeRooms = [origin].concat(_.map(route, step => step.room));
		if (_.last(result.routeRooms) !== target) result.routeRooms.push(target);
		result.routeRooms = _.uniq(result.routeRooms);
		result.routeLength = route.length;
		if (typeof Memory !== "undefined") {
			_.set(Memory, ["ai", "protection", "routeCache", cacheKey], { signature: signature, checkedTick: Game.time, result: _.cloneDeep(result) });
			let keys = _.keys(_.get(Memory, ["ai", "protection", "routeCache"], {}));
			if (keys.length > 200) _.each(keys.slice(0, keys.length - 200), key => delete Memory.ai.protection.routeCache[key]);
		}
		return result;
	},

	travelTicks: function (site, origin, target) {
		let measured = _.get(site, ["survey", "travel_ticks"]);
		if (_.isNumber(measured) && measured > 0) return Math.ceil(measured);
		let route = _.get(site, "list_route");
		let rooms = _.isArray(route) && route.length > 0 ? _.uniq(route).length : null;
		if (rooms == null && _.isFunction(_.get(Game, ["map", "findRoute"]))) {
			let found = Game.map.findRoute(origin, target);
			if (_.isArray(found)) rooms = found.length;
		}
		return Math.max(1, rooms == null ? 1 : rooms) * this.ROOM_TRAVEL_TICKS;
	},

	spawnTicks: function (bodyName, level) {
		if (typeof Creep_Body === "undefined" || !_.isFunction(_.get(Creep_Body, "getBody"))) return 30;
		let body = Creep_Body.getBody(bodyName, level);
		return _.isArray(body) ? body.length * 3 : 30;
	},

	replacementLeadTicks: function (role, settings, site, origin, target) {
		let level = _.get(settings, "level", 1);
		let body = _.get(settings, "body", role === "miner" ? "worker" : role);
		let travel = this.travelTicks(site, origin, target);
		let spawn = this.spawnTicks(body, level);
		let safety = _.get(this.ROLE_SAFETY_MARGIN, role, 75);
		return { travelTicks: travel, spawnTicks: spawn, safetyMargin: safety, leadTicks: travel + spawn + safety };
	},

	rolePlan: function (role, settings, creeps, site, origin, target, queued) {
		let timing = this.replacementLeadTicks(role, settings, site, origin, target);
		let assigned = _.filter(creeps || [], creep => _.get(creep, ["memory", "role"]) === role);
		let viable = _.filter(assigned, creep => {
			let ttl = _.get(creep, "ticksToLive");
			return ttl == null || ttl > timing.leadTicks;
		}).length;
		let targetAmount = Math.max(0, _.get(settings, "amount", 0));
		let pending = Math.max(0, queued || 0);
		return Object.assign(timing, {
			role: role,
			target: targetAmount,
			assigned: assigned.length,
			viable: viable,
			spawning: _.filter(assigned, creep => _.get(creep, "spawning") === true || _.get(creep, "ticksToLive") == null).length,
			queued: pending,
			replacementNeeded: Math.max(0, targetAmount - viable - pending)
		});
	},

	reservationPlan: function (settings, creeps, site, origin, target, reservation, queued) {
		let plan = this.rolePlan("reserver", settings, creeps, site, origin, target, queued);
		let ticks = _.get(reservation, "ticksToEnd", 0) || 0;
		let username = typeof getUsername === "function" ? getUsername() : null;
		let relation = _.get(reservation, "username") == null ? "UNRESERVED"
			: (_.get(reservation, "username") === username ? "SELF" : "FOREIGN");
		plan.reservationTicks = ticks;
		plan.reservationRelation = relation;
		plan.continuityAtRisk = relation !== "SELF" || ticks < plan.leadTicks;
		return plan;
	},

	remoteCandidate: function (intel, context) {
		context = context || {};
		let disqualifiers = [];
		let owner = _.get(intel, ["controller", "ownerRelation"], "NEUTRAL");
		let reservation = _.get(intel, ["controller", "reservationRelation"], "NEUTRAL");
		if (_.includes(context.existingRemotes || [], intel.room)) disqualifiers.push("already_configured");
		if (_.get(intel, ["controller", "status"]) === "owned" || owner === "SELF") disqualifiers.push("already_owned");
		if (_.get(intel, ["controller", "status"]) === "owned_other") disqualifiers.push("foreign_owned");
		if (_.get(intel, "stale", false)) disqualifiers.push("stale_intel");
		if (_.get(intel, "classification") !== "normal") disqualifiers.push("unsupported_room_classification");
		if (_.get(intel, "sourceCount", 0) < 1) disqualifiers.push("no_sources");
		if (owner !== "NEUTRAL" && owner !== "SELF") disqualifiers.push("foreign_owner");
		if (reservation !== "NEUTRAL" && reservation !== "SELF") disqualifiers.push("foreign_reservation");
		if (_.get(intel, "routeStatus") === "no_path") disqualifiers.push("no_route");
		let accessibility = _.get(intel, ["protection", "accessibility"], "UNKNOWN");
		if (_.includes(["REACHABLE_AFTER_PROTECTION", "BLOCKED_BY_PROTECTED_BOUNDARY"], accessibility))
			disqualifiers.push("post_protection_only");
		if (accessibility === "CLOSED") disqualifiers.push("room_closed");
		if (_.has(intel, "protection") && accessibility === "UNKNOWN") disqualifiers.push("protection_accessibility_unknown");
		if (_.includes(context.excludedRooms || [], intel.room)) disqualifiers.push("human_policy_exclusion");
		let distance = _.get(intel, "routeLength", _.get(intel, "distanceFromColony", 5));
		let factors = {
			sources: Math.min(40, _.get(intel, "sourceCount", 0) * 20),
			distance: Math.max(0, 20 - Math.max(0, distance - 1) * 5),
			route: _.get(intel, "routeStatus") === "available" ? Math.max(0, 15 - Math.max(0, distance - 1) * 3) : 0,
			terrain: Math.max(0, 10 - Math.round((_.get(intel, "terrainSwampPercent", 50) || 0) / 10)),
			security: (_.get(intel, "hostileCreeps", 0) === 0 && _.get(intel, ["structures", "hostile"], 0) === 0) ? 15 : 0
		};
		let score = _.sum(_.values(factors)) + (_.includes(context.prioritizedRooms || [], intel.room) ? 5 : 0);
		let minimum = _.get(context, "minimumScore", this.REMOTE_SCORE_MINIMUM);
		if (score < minimum) disqualifiers.push("score_below_minimum");
		return {
			room: intel.room,
			origin: _.get(intel, "nearestColony", null),
			score: score,
			factors: factors,
			eligible: disqualifiers.length === 0,
			disqualifiers: disqualifiers,
			predictedEconomics: this.predictEconomics(_.get(intel, "sourceCount", 0), distance),
			confidence: _.get(intel, "stale", false) ? 0.35 : (distance == null ? 0.55 : 0.8),
			accessibility: accessibility,
			availabilitySet: _.includes(["REACHABLE_AFTER_PROTECTION", "BLOCKED_BY_PROTECTED_BOUNDARY"], accessibility)
				? "POST_PROTECTION" : (accessibility === "REACHABLE_NOW" ? "CURRENTLY_REACHABLE" : "UNAVAILABLE")
		};
	},

	predictEconomics: function (sources, routeRooms) {
		let distance = Math.max(1, routeRooms || 1);
		let gross = sources * 10000;
		let miner = Math.round(sources * 800 * 1000 / 1500);
		let hauler = Math.round(sources * (500 + distance * 150) * 1000 / 1500);
		let reserver = Math.round(1300 * 1000 / 4500);
		let net = gross - miner - hauler - reserver;
		let quality = net >= 12000 ? "EXCELLENT" : (net >= 7000 ? "GOOD" : (net >= 2500 ? "MARGINAL" : (net >= 0 ? "POOR" : "LOSING")));
		return {
			grossEnergyPer1000: { value: gross, provenance: "ESTIMATED" },
			minerCostPer1000: { value: miner, provenance: "ESTIMATED" },
			haulerCostPer1000: { value: hauler, provenance: "ESTIMATED" },
			reservationCostPer1000: { value: reserver, provenance: "ESTIMATED" },
			estimatedNetValuePer1000: { value: net, provenance: "ESTIMATED" },
			quality: quality
		};
	},

	claimCandidate: function (intel, context) {
		context = context || {};
		let disqualifiers = [];
		let owner = _.get(intel, ["controller", "ownerRelation"], "NEUTRAL");
		let reservation = _.get(intel, ["controller", "reservationRelation"], "NEUTRAL");
		if (_.get(intel, "stale", false)) disqualifiers.push("stale_intel");
		if (_.get(intel, "classification") !== "normal") disqualifiers.push("not_claimable_normal_room");
		if (_.get(intel, ["controller", "status"]) === "owned" || owner === "SELF") disqualifiers.push("already_owned");
		if (_.get(intel, ["controller", "status"]) === "owned_other") disqualifiers.push("foreign_owned");
		if (owner !== "NEUTRAL" && owner !== "SELF") disqualifiers.push("foreign_owned");
		if (_.get(intel, ["controller", "reservation"]) != null && reservation !== "SELF") disqualifiers.push("foreign_reserved");
		if (_.includes(context.excludedRooms || [], intel.room)) disqualifiers.push("human_policy_exclusion");
		let accessibility = _.get(intel, ["protection", "accessibility"], "UNKNOWN");
		if (_.includes(["REACHABLE_AFTER_PROTECTION", "BLOCKED_BY_PROTECTED_BOUNDARY"], accessibility))
			disqualifiers.push("post_protection_only");
		if (accessibility === "CLOSED") disqualifiers.push("room_closed");
		if (_.has(intel, "protection") && accessibility === "UNKNOWN") disqualifiers.push("protection_accessibility_unknown");
		let distance = _.get(intel, "routeLength", _.get(intel, "distanceFromColony", 5));
		let layouts = _.get(intel, "layoutAnalysis", { valid: [], best: null });
		let existingRemote = _.get(context, "currentOperationalRole") === "OUR_REMOTE";
		let measuredDelivery = _.get(context, ["remoteEconomics", "measuredDeliveryPer1000"], null);
		let adjacentPotential = _.get(context, "adjacentRemotePotential", 0);
		let routeLength = Math.max(1, distance || 1);
		let bootstrapEnergy = 15000 + 1300 + (25000 + routeLength * 5000);
		let candidateFailure = _.get(context, "candidateFailure", null);
		let factors = {
			sources: Math.min(30, _.get(intel, "sourceCount", 0) * 15),
			terrain: Math.max(0, 15 - Math.round((_.get(intel, "terrainSwampPercent", 50) || 0) * 0.2)),
			distance: Math.max(0, 20 - Math.max(0, distance - 1) * 4),
			mineralDiversity: _.get(intel, "mineralType") ? 8 : 0,
			security: (_.get(intel, "hostileCreeps", 0) === 0 && _.get(intel, ["structures", "towers"], 0) === 0) ? 12 : 0,
			layout: _.get(layouts, "best") ? 10 : 0,
			remotePotential: Math.min(10, adjacentPotential * 2),
			defensibility: Math.max(0, 8 - Math.max(0, _.get(context, "exitCount", 4) - 2) * 2),
			corridorValue: Math.min(6, _.get(context, "corridorValue", 0)),
			knownInfrastructure: existingRemote ? 6 : 0,
			economicConversion: existingRemote && _.isNumber(measuredDelivery)
				? -Math.min(8, Math.round(measuredDelivery / 2000)) : 0,
			priorFailure: candidateFailure ? -Math.min(10, _.get(candidateFailure, "count", 1) * 3) : 0
		};
		let rawScore = _.sum(_.values(factors));
		let score = Math.max(0, Math.min(100, rawScore));
		let minimum = _.get(context, "minimumScore", this.CLAIM_SCORE_MINIMUM);
		if (_.get(layouts, "best") == null) disqualifiers.push("no_feasible_layout");
		if (candidateFailure && _.get(candidateFailure, "retryAfterTick", 0) > _.get(Game, "time", 0))
			disqualifiers.push("retry_cooldown_after_failure");
		if (score < minimum) disqualifiers.push("score_below_minimum");
		return {
			room: intel.room, origin: _.get(context, "origin", _.get(intel, "nearestColony", null)), score: score, rawScore: rawScore, factors: factors,
			eligible: disqualifiers.length === 0,
			disqualifiers: disqualifiers, layout: _.get(layouts, "best", null),
			currentOperationalRole: _.get(context, "currentOperationalRole", "NEUTRAL_SCOUTED"),
			validLayouts: _.get(layouts, "valid", []),
			economicConversion: {
				isExistingRemote: existingRemote,
				measuredDeliveryPer1000: measuredDelivery,
				cumulativeDelivered: _.get(context, ["remoteEconomics", "cumulativeDelivered"], null),
				remoteHealth: _.get(context, ["remoteEconomics", "health"], null),
				temporaryIncomeLossPer1000: existingRemote ? measuredDelivery : 0,
				provenance: _.isNumber(measuredDelivery) ? "MEASURED" : "UNKNOWN"
			},
			bootstrap: {
				estimatedEnergy: bootstrapEnergy,
				spawnAssistRequired: true,
				burden: routeLength <= 1 ? "MODERATE" : (routeLength <= 2 ? "HIGH" : "VERY_HIGH"),
				routeLength: distance,
				originAssessment: _.get(context, "originAssessment", null)
			},
			strategy: {
				adjacentRemotePotential: adjacentPotential,
				corridorValue: _.get(context, "corridorValue", 0),
				neighboringPlayers: _.get(context, "neighboringPlayers", []),
				exitCount: _.get(context, "exitCount", null)
			},
			sourceCount: _.get(intel, "sourceCount", 0),
			mineralType: _.get(intel, "mineralType", null),
			terrainSwampPercent: _.get(intel, "terrainSwampPercent", null),
			route: {
				status: _.get(intel, "routeStatus", "unknown"), length: distance,
				rooms: _.get(intel, "routeRooms", [])
			},
			security: {
				hostileCreeps: _.get(intel, "hostileCreeps", 0),
				hostileStructures: _.get(intel, ["structures", "hostile"], 0),
				lastHostileSightingTick: _.get(intel, "lastHostileSightingTick", null)
			},
			accessibility: accessibility,
			availabilitySet: _.includes(["REACHABLE_AFTER_PROTECTION", "BLOCKED_BY_PROTECTED_BOUNDARY"], accessibility)
				? "POST_PROTECTION" : (accessibility === "REACHABLE_NOW" ? "CURRENTLY_REACHABLE" : "UNAVAILABLE")
		};
	},

	analyzeLayouts: function (room) {
		if (!room || !_.isFunction(_.get(room, "getTerrain"))) return { version: 2, valid: [], best: null, analyzedTick: _.get(Game, "time", 0) };
		let definitions = [
			{ name: "def_hor", value: typeof Blueprint__Default_Horizontal === "undefined" ? null : Blueprint__Default_Horizontal },
			{ name: "def_vert", value: typeof Blueprint__Default_Vertical === "undefined" ? null : Blueprint__Default_Vertical },
			{ name: "def_comp", value: typeof Blueprint__Default_Compact === "undefined" ? null : Blueprint__Default_Compact }
		];
		let terrain = room.getTerrain();
		let wall = typeof TERRAIN_MASK_WALL === "undefined" ? 1 : TERRAIN_MASK_WALL;
		let protectedObjects = (room.findSources ? room.findSources() : []).concat(room.controller ? [room.controller] : []);
		let valid = [];
		_.each(definitions, definition => {
			if (!definition.value) return;
			let offsets = [];
			_.each(definition.value, (positions, structureType) => {
				if (_.isArray(positions) && !_.includes(["road", "rampart", "constructedWall"], structureType))
					offsets = offsets.concat(positions);
			});
			for (let x = 5; x <= 43; x += 2) for (let y = 5; y <= 43; y += 2) {
				let blocked = 0, swamps = 0;
				let occupied = {};
				_.each(offsets, offset => {
					let px = x + _.get(offset, "x", 0), py = y + _.get(offset, "y", 0);
					let key = `${px}:${py}`;
					if (occupied[key]) return;
					occupied[key] = true;
					if (px < 3 || px > 46 || py < 3 || py > 46 || terrain.get(px, py) === wall) blocked++;
					else if (terrain.get(px, py) === 2) swamps++;
					if (_.some(protectedObjects, object => object.pos.x === px && object.pos.y === py)) blocked++;
				});
				if (blocked === 0) {
					let controllerDistance = room.controller ? Math.max(Math.abs(room.controller.pos.x - x), Math.abs(room.controller.pos.y - y)) : 25;
					let score = Math.max(0, 100 - swamps - Math.max(0, controllerDistance - 12));
					valid.push({
						name: definition.name, origin: { x: x, y: y }, score: score,
						swampTiles: swamps, controllerRange: controllerDistance,
						validation: "AZC_SUPPORTED_BLUEPRINT_TERRAIN_FOOTPRINT"
					});
				}
			}
		});
		valid = _.sortBy(valid, option => -option.score).slice(0, 5);
		return { version: 2, valid: valid, best: _.head(valid) || null, analyzedTick: _.get(Game, "time", 0) };
	}
};
