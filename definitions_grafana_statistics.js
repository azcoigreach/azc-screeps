/* ***********************************************************
 *	[sec10a] DEFINITIONS: GRAFANA STATISTICS
 * *********************************************************** */

 global.Stats_Grafana = {

	Run: function () {
		// Periodically reset to remove unused keys or interval data
		if (Game.time % 100 == 0) {
			_.each(_.filter(Game.rooms,
				room => { return room.controller != null && room.controller.my; }),
				room => { _.set(Memory, ["stats", "colonies", room.name, "population"], new Object()); });
		}

		if (Game.time % 500 == 0)
			_.set(Memory, "stats", new Object());


		_.set(Memory, ["stats", "cpu", "tick"], Game.time);
		_.set(Memory, ["stats", "cpu", "bucket"], Game.cpu.bucket);
		_.set(Memory, ["stats", "cpu", "used"], Game.cpu.getUsed());
		
		// Multi-shard statistics
		if (Game.shard) {
			_.set(Memory, ["stats", "shard", "name"], Game.shard.name);
			
			// Collect multi-shard data every 50 ticks
			if (Game.time % 50 == 0) {
				this.collectShardStats();
			}
		}

		if (Game.time % 5 == 0) {
			_.set(Memory, ["stats", "gcl", "level"], Game.gcl.level);
			_.set(Memory, ["stats", "gcl", "progress"], Game.gcl.progress);
			_.set(Memory, ["stats", "gcl", "progress_total"], Game.gcl.progressTotal);
			_.set(Memory, ["stats", "gcl", "progress_percent"], (Game.gcl.progress / Game.gcl.progressTotal * 100));

			_.set(Memory, ["stats", "creeps", "total"], _.keys(Game.creeps).length);

			// Track market credits
			_.set(Memory, ["stats", "market", "credits"], Game.market.credits || 0);

			_.each(_.get(Game, "spawns"), s => {
				_.set(Memory, ["stats", "colonies", s.room.name, "spawns", s.name],
					s.spawning == null ? 0 : 1);
			});
		}

		if (Game.time % 50 == 0) {
			let colonies = _.filter(Game.rooms, room => { return room.controller != null && room.controller.my; });
			let remote_mining = _.get(Memory, ["sites", "mining"]);

			_.set(Memory, ["stats", "resources"], new Object());
			_.set(Memory, ["stats", "gcl", "colonies"], (colonies == null ? 0 : colonies.length));

			// Iterate all colonies for statistics
			_.each(colonies,
				room => {
					// Report colony levels
					_.set(Memory, ["stats", "colonies", room.name, "rcl", "level"], room.controller.level);
					_.set(Memory, ["stats", "colonies", room.name, "rcl", "progress"], room.controller.progress);
					_.set(Memory, ["stats", "colonies", room.name, "rcl", "progress_total"], room.controller.progressTotal);
					_.set(Memory, ["stats", "colonies", room.name, "rcl", "progress_percent"], (room.controller.progress / room.controller.progressTotal * 100));

					// Report colony population stats
					_.set(Memory, ["stats", "colonies", room.name, "population"], new Object());

					// Tally resources for individual colony
					let storage = _.get(Game, ["rooms", room.name, "storage"]);
					let terminal = _.get(Game, ["rooms", room.name, "terminal"]);
					_.set(Memory, ["stats", "colonies", room.name, "storage", "store"], _.get(storage, "store"));
					_.set(Memory, ["stats", "colonies", room.name, "terminal", "store"], _.get(terminal, "store"));

					// Tally resources for entire country
					for (let res in _.get(storage, "store"))
						_.set(Memory, ["stats", "resources", res],
							_.get(Memory, ["stats", "resources", res], 0)
							+ _.get(storage, ["store", res], 0)
							+ _.get(terminal, ["store", res], 0));

					// Tally remote mining sites active
					let source_total = 0;
					let remote_list = _.filter(Object.keys(remote_mining), rem => { return rem != room.name && _.get(remote_mining[rem], "colony") == room.name; });
					_.set(Memory, ["stats", "colonies", room.name, "remote_mining", "rooms"], remote_list.length);

					_.each(remote_list, rem => { source_total = source_total + _.get(Memory, ["sites", "mining", room.name, "survey", "source_amount"], 0); });
					_.set(Memory, ["stats", "colonies", room.name, "remote_mining", "sources"], source_total);
					_.set(Memory, ["stats", "colonies", room.name, "mining_sources"], source_total + _.get(Memory, ["rooms", room.name, "survey", "source_amount"], 0));

					// Set alerts (e.g. spawn_assist active)
					if (_.get(Memory, ["rooms", room.name, "spawn_assist", "rooms"], null) != null)
						_.set(Memory, ["stats", "colonies", room.name, "alerts"], "spawn_assist active!;");
			});

			// Iterate mining sites for statistics
			_.each(_.filter(_.keys(_.get(Memory, ["sites", "mining"])),
				rmName => { return _.get(Game, ["rooms", rmName], null) != null; }),
				rmName => {
					_.set(Memory, ["stats", "mining", rmName, "store_percent"],
						_.get(Memory, ["sites", "mining", rmName, "store_percent"], 0));
			});
		}
	},

	populationTally: function (room_name, pop_target, pop_actual) {
		// Deprecated function!! Comment 'return;' if you would still like to use.
		return;

		for (let i in pop_target) {
			_.set(Memory, ["stats", "colonies", room_name, "population", "target", i],
				_.get(pop_target, [i, "amount"]) + _.get(Memory, ["stats", "colonies", room_name, "population", "target", i], 0));
			_.set(Memory, ["stats", "colonies", room_name, "population", "actual", i],
				_.get(pop_actual, [i]) + _.get(Memory, ["stats", "colonies", room_name, "population", "actual", i], 0));

			_.set(Memory, ["stats", "colonies", room_name, "population", "percent", i],
				_.get(Memory, ["stats", "colonies", room_name, "population", "actual", i], 0)
				/ _.get(Memory, ["stats", "colonies", room_name, "population", "target", i], 1))
		}
	},
	
	/**
	 * Collect multi-shard statistics
	 * Aggregates data from all known shards for Grafana dashboards
	 */
	collectShardStats: function() {
		if (!Game.shard) {
			return;
		}
		
		// Get all shard statuses from InterShardMemory
		let allStatuses = ISM.getAllShardStatuses();
		
		// Track ISM size
		let ismSize = ISM.getLocalSize();
		_.set(Memory, ["stats", "shard", "ism_size"], ismSize);
		_.set(Memory, ["stats", "shard", "ism_size_percent"], (ismSize / 102400) * 100);
		
		// Initialize shards stats structure
		if (!_.get(Memory, ["stats", "shards"])) {
			_.set(Memory, ["stats", "shards"], {});
		}
		
		// Collect stats for each shard
		_.each(Object.keys(allStatuses), shardName => {
			let status = allStatuses[shardName];
			let shardStats = {};
			
			// Basic info
			shardStats.tick = status.tick || 0;
			shardStats.tick_age = Game.time - (status.tick || Game.time);
			
			// Colony stats
			shardStats.colonies_count = Object.keys(status.colonies || {}).length;
			shardStats.colonies_total_rcl = 0;
			shardStats.spawns_total = 0;
			shardStats.spawns_available = 0;
			
			_.each(status.colonies || {}, colony => {
				shardStats.colonies_total_rcl += (colony.rcl || 0);
				shardStats.spawns_total += (colony.spawns_total || 0);
				shardStats.spawns_available += (colony.spawns_available || 0);
			});
			
			// Resource stats
			shardStats.energy = _.get(status, ["resources", "energy"], 0);
			shardStats.minerals_count = Object.keys(_.get(status, ["resources", "minerals"], {})).length;
			shardStats.commodities_count = Object.keys(_.get(status, ["resources", "commodities"], {})).length;
			
			// CPU stats
			shardStats.cpu_used = _.get(status, ["cpu", "used"], 0);
			shardStats.cpu_bucket = _.get(status, ["cpu", "bucket"], 0);
			shardStats.cpu_limit = _.get(status, ["cpu", "limit"], 0);
			
			// Portal stats
			shardStats.portal_rooms = 0;
			_.each(status.colonies || {}, colony => {
				if (colony.portal_rooms && colony.portal_rooms.length > 0) {
					shardStats.portal_rooms += colony.portal_rooms.length;
				}
			});
			
			// Store in Memory.stats.shards
			_.set(Memory, ["stats", "shards", shardName], shardStats);
		});
		
		// Operation stats
		let colonizations = _.get(Memory, ["shard", "operations", "colonizations"], []);
		let transfers = _.get(Memory, ["shard", "operations", "creep_transfers"], []);
		
		_.set(Memory, ["stats", "shard", "operations", "colonizations"], colonizations.length);
		_.set(Memory, ["stats", "shard", "operations", "creep_transfers"], transfers.length);
		
		// Portal stats for current shard
		let portals = Portals.getAll();
		_.set(Memory, ["stats", "shard", "portals", "total"], portals.length);
		
		// Group portals by destination shard
		let portalsByShard = {};
		_.each(portals, portal => {
			let destShard = portal.destination.shard;
			if (!portalsByShard[destShard]) {
				portalsByShard[destShard] = 0;
			}
			portalsByShard[destShard]++;
		});
		_.set(Memory, ["stats", "shard", "portals", "by_destination"], portalsByShard);
	}
};