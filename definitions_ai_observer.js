/* ***********************************************************
 *  DEFINITIONS: AI COMMANDER OBSERVER
 * *********************************************************** */

// Builds a compact, JSON-safe strategic view. Raw game objects and detailed
// per-creep state deliberately stay out of the commander protocol.
global.AIObserver = {

	SCHEMA_VERSION: 1,

	buildSnapshot: function () {
		let colonies = {};
		let alerts = [];
		let ownedRooms = _.filter(_.get(Game, "rooms", {}), room => {
			return _.get(room, ["controller", "my"], false) === true;
		});

		_.each(ownedRooms, room => {
			let hostileCount = _.size(_.get(Memory, ["rooms", room.name, "defense", "hostiles"], []));
			let spawnCount = _.filter(_.get(Game, "spawns", {}), spawn => {
				return _.get(spawn, ["room", "name"]) === room.name;
			}).length;

			colonies[room.name] = {
				rcl: _.get(room, ["controller", "level"], 0),
				energyAvailable: _.get(room, "energyAvailable", 0),
				energyCapacity: _.get(room, "energyCapacityAvailable", 0),
				storageEnergy: _.get(room, ["storage", "store", "energy"], 0),
				terminalEnergy: _.get(room, ["terminal", "store", "energy"], 0),
				spawns: spawnCount,
				hostiles: hostileCount
			};

			if (hostileCount > 0)
				alerts.push(`HOSTILES:${room.name}:${hostileCount}`);
			if (_.get(Memory, ["rooms", room.name, "survey", "downgrade_critical"], false))
				alerts.push(`CONTROLLER_DOWNGRADE:${room.name}`);
			if (_.get(Memory, ["rooms", room.name, "spawn_assist", "rooms"]) != null)
				alerts.push(`SPAWN_ASSIST:${room.name}`);
		});

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
				gcl: _.get(Game, ["gcl", "level"], 0),
				ownedRooms: ownedRooms.length,
				creeps: _.size(_.get(Game, "creeps", {})),
				credits: _.get(Game, ["market", "credits"], 0)
			},
			colonies: colonies,
			operations: {
				colonizations: this._colonizations(),
				remoteMining: this._remoteMining(),
				combat: this._combat()
			},
			alerts: alerts
		};
	},

	serialize: function (snapshot) {
		return JSON.stringify(snapshot == null ? this.buildSnapshot() : snapshot);
	},

	_colonizations: function () {
		let result = [];
		_.each(_.get(Memory, ["sites", "colonization"], {}), (site, id) => {
			if (!site)
				return;
			result.push({
				id: id,
				from: _.get(site, "from", null),
				target: _.get(site, "target", id)
			});
		});
		return result;
	},

	_remoteMining: function () {
		let result = [];
		_.each(_.get(Memory, ["sites", "mining"], {}), (site, roomName) => {
			if (!site || _.get(site, "colony") === roomName)
				return;
			result.push({
				room: roomName,
				colony: _.get(site, "colony", null),
				hasKeepers: _.get(site, "has_keepers", false) === true
			});
		});
		return result;
	},

	_combat: function () {
		let result = [];
		_.each(_.get(Memory, ["sites", "combat"], {}), (site, id) => {
			if (!site)
				return;
			result.push({
				id: id,
				colony: _.get(site, "colony", null),
				target: _.get(site, "target_room", null),
				tactic: _.get(site, ["tactic", "type"], null)
			});
		});
		return result;
	}
};
