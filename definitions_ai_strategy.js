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
		if (_.get(intel, "stale", false)) disqualifiers.push("stale_intel");
		if (_.get(intel, "classification") !== "normal") disqualifiers.push("unsupported_room_classification");
		if (_.get(intel, "sourceCount", 0) < 1) disqualifiers.push("no_sources");
		if (owner !== "NEUTRAL" && owner !== "SELF") disqualifiers.push("foreign_owner");
		if (reservation !== "NEUTRAL" && reservation !== "SELF") disqualifiers.push("foreign_reservation");
		if (_.get(intel, "routeStatus") === "no_path") disqualifiers.push("no_route");
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
			confidence: _.get(intel, "stale", false) ? 0.35 : (distance == null ? 0.55 : 0.8)
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
		if (_.get(intel, "stale", false)) disqualifiers.push("stale_intel");
		if (_.get(intel, "classification") !== "normal") disqualifiers.push("not_claimable_normal_room");
		if (_.get(intel, ["controller", "status"]) === "owned" || owner === "SELF") disqualifiers.push("already_owned");
		if (owner !== "NEUTRAL" && owner !== "SELF") disqualifiers.push("foreign_owned");
		if (_.includes(context.excludedRooms || [], intel.room)) disqualifiers.push("human_policy_exclusion");
		let distance = _.get(intel, "routeLength", _.get(intel, "distanceFromColony", 5));
		let layouts = _.get(intel, "layoutAnalysis", { valid: [], best: null });
		let factors = {
			sources: Math.min(30, _.get(intel, "sourceCount", 0) * 15),
			terrain: Math.max(0, 15 - Math.round((_.get(intel, "terrainSwampPercent", 50) || 0) * 0.2)),
			distance: Math.max(0, 20 - Math.max(0, distance - 1) * 4),
			mineralDiversity: _.get(intel, "mineralType") ? 8 : 0,
			security: (_.get(intel, "hostileCreeps", 0) === 0 && _.get(intel, ["structures", "towers"], 0) === 0) ? 12 : 0,
			layout: _.get(layouts, "best") ? 10 : 0,
			remotePotential: Math.min(5, _.get(context, ["adjacentRemotePotential", intel.room], 0))
		};
		let score = _.sum(_.values(factors));
		let minimum = _.get(context, "minimumScore", this.CLAIM_SCORE_MINIMUM);
		if (_.get(layouts, "best") == null) disqualifiers.push("no_feasible_layout");
		if (score < minimum) disqualifiers.push("score_below_minimum");
		return {
			room: intel.room, origin: _.get(intel, "nearestColony", null), score: score, factors: factors,
			eligible: disqualifiers.length === 0,
			disqualifiers: disqualifiers, layout: _.get(layouts, "best", null),
			currentOperationalRole: _.get(context, "currentOperationalRole", "NEUTRAL_SCOUTED")
		};
	},

	analyzeLayouts: function (room) {
		if (!room || !_.isFunction(_.get(room, "getTerrain"))) return { valid: [], best: null, analyzedTick: _.get(Game, "time", 0) };
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
			_.each(definition.value, positions => { if (_.isArray(positions)) offsets = offsets.concat(positions); });
			for (let x = 8; x <= 40; x += 4) for (let y = 8; y <= 40; y += 4) {
				let blocked = 0, swamps = 0;
				_.each(offsets, offset => {
					let px = x + _.get(offset, "x", 0), py = y + _.get(offset, "y", 0);
					if (px < 2 || px > 47 || py < 2 || py > 47 || terrain.get(px, py) === wall) blocked++;
					else if (terrain.get(px, py) === 2) swamps++;
					if (_.some(protectedObjects, object => Math.max(Math.abs(object.pos.x - px), Math.abs(object.pos.y - py)) <= 2)) blocked++;
				});
				if (blocked === 0) valid.push({ name: definition.name, origin: { x: x, y: y }, score: Math.max(0, 100 - swamps) });
			}
		});
		valid = _.sortBy(valid, option => -option.score).slice(0, 5);
		return { valid: valid, best: _.head(valid) || null, analyzedTick: _.get(Game, "time", 0) };
	}
};
