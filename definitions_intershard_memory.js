/* ***********************************************************
 *	[sec11a] DEFINITIONS: INTERSHARD MEMORY
 * *********************************************************** */

global.ISM = {
	
	/**
	 * Check if InterShardMemory is available
	 */
	isAvailable: function() {
		return typeof InterShardMemory !== 'undefined';
	},

	/**
	 * Publish current shard status to InterShardMemory
	 * Should be called on pulse (mid/long) to avoid CPU waste
	 */
	publishStatus: function() {
		if (!this.isAvailable()) {
			return;
		}

		try {
			let shardName = _.get(Game, ["shard", "name"], "sim");
			
			// Build colony status
			let colonies = {};
			_.each(Game.rooms, room => {
				if (room.controller && room.controller.my) {
					colonies[room.name] = {
						rcl: room.controller.level,
						energy: (room.storage ? room.storage.store.energy : 0) + 
						        (room.terminal ? room.terminal.store.energy : 0),
						spawns_available: room.find(FIND_MY_SPAWNS).filter(s => !s.spawning).length,
						spawns_total: room.find(FIND_MY_SPAWNS).length,
						// Portal detection will add portal_rooms later
						portal_rooms: []
					};
				}
			});

			// Build resource summary
			let resources = {
				energy: 0,
				minerals: {},
				commodities: {}
			};

			_.each(Game.rooms, room => {
				if (room.controller && room.controller.my) {
					if (room.storage) {
						resources.energy += room.storage.store.energy || 0;
						_.each(RESOURCES_ALL, res => {
							if (room.storage.store[res]) {
								if (MINERALS.includes(res)) {
									resources.minerals[res] = (resources.minerals[res] || 0) + room.storage.store[res];
								} else if (COMMODITIES[res]) {
									resources.commodities[res] = (resources.commodities[res] || 0) + room.storage.store[res];
								}
							}
						});
					}
					if (room.terminal) {
						resources.energy += room.terminal.store.energy || 0;
						_.each(RESOURCES_ALL, res => {
							if (room.terminal.store[res]) {
								if (MINERALS.includes(res)) {
									resources.minerals[res] = (resources.minerals[res] || 0) + room.terminal.store[res];
								} else if (COMMODITIES[res]) {
									resources.commodities[res] = (resources.commodities[res] || 0) + room.terminal.store[res];
								}
							}
						});
					}
				}
			});

			// Build ISM data structure
			let ismData = {
				shard_name: shardName,
				tick: Game.time,
				colonies: colonies,
				resources: resources,
				operations: {
					colonizations: _.get(Memory, ["shard", "operations", "colonizations"], []),
					creep_transfers: _.get(Memory, ["shard", "operations", "creep_transfers"], [])
				},
				cpu: {
					bucket: Game.cpu.bucket,
					used: _.get(Memory, ["stats", "cpu", "used"], 0),
					limit: Game.cpu.limit
				}
			};

			// Write to InterShardMemory
			InterShardMemory.setLocal(JSON.stringify(ismData));
			
			// Update last publish time
			_.set(Memory, ["shard", "ism_last_update"], Game.time);
			
			// Monitor ISM size
			let ismSize = JSON.stringify(ismData).length;
			_.set(Memory, ["shard", "ism_size"], ismSize);
			
			if (ismSize > 90000) {
				console.log(`<font color="#FF0000">[ISM]</font> WARNING: ISM size ${ismSize} bytes approaching 100KB limit!`);
			}
			
		} catch (err) {
			console.log(`<font color="#FF0000">[ISM]</font> Error publishing status: ${err.message}`);
		}
	},

	/**
	 * Read status from another shard
	 * @param {string} shardName - Name of shard to read from
	 * @returns {object|null} - Parsed ISM data or null if unavailable
	 */
	getShardStatus: function(shardName) {
		if (!this.isAvailable()) {
			return null;
		}

		try {
			let data = InterShardMemory.getRemote(shardName);
			if (!data || data === "") {
				return null;
			}
			return JSON.parse(data);
		} catch (err) {
			console.log(`<font color="#FF0000">[ISM]</font> Error reading shard ${shardName}: ${err.message}`);
			return null;
		}
	},

	/**
	 * Get status from all shards
	 * @returns {object} - Map of shardName -> status data
	 */
	getAllShardStatuses: function() {
		if (!this.isAvailable()) {
			return {};
		}

		let statuses = {};
		let currentShard = _.get(Game, ["shard", "name"], "sim");
		
		// Add current shard (read local)
		try {
			let localData = InterShardMemory.getLocal();
			if (localData && localData !== "") {
				statuses[currentShard] = JSON.parse(localData);
			}
		} catch (err) {
			console.log(`<font color="#FF0000">[ISM]</font> Error reading local ISM: ${err.message}`);
		}

		// Try to read from other known shards
		let knownShards = ["shard0", "shard1", "shard2", "shard3"];
		_.each(knownShards, shardName => {
			if (shardName !== currentShard) {
				let status = this.getShardStatus(shardName);
				if (status) {
					statuses[shardName] = status;
				}
			}
		});

		return statuses;
	},

	/**
	 * Get total ISM size for current shard
	 * @returns {number} - Size in bytes
	 */
	getLocalSize: function() {
		if (!this.isAvailable()) {
			return 0;
		}

		try {
			let data = InterShardMemory.getLocal();
			return data ? data.length : 0;
		} catch (err) {
			return 0;
		}
	},

	/**
	 * Debug: Display ISM contents
	 */
	debug: function() {
		if (!this.isAvailable()) {
			console.log("<font color='#FF0000'>[ISM]</font> InterShardMemory not available");
			return;
		}

		try {
			let localData = InterShardMemory.getLocal();
			let size = localData ? localData.length : 0;
			console.log(`<font color='#00FFFF'>[ISM]</font> Local ISM Size: ${size} / 102400 bytes (${(size/1024).toFixed(2)} KB)`);
			
			if (localData && localData !== "") {
				let parsed = JSON.parse(localData);
				console.log(`<font color='#00FFFF'>[ISM]</font> Shard: ${parsed.shard_name}, Tick: ${parsed.tick}`);
				console.log(`<font color='#00FFFF'>[ISM]</font> Colonies: ${Object.keys(parsed.colonies || {}).length}`);
				console.log(`<font color='#00FFFF'>[ISM]</font> Energy: ${(_.get(parsed, ["resources", "energy"], 0)).toLocaleString()}`);
				console.log(`<font color='#00FFFF'>[ISM]</font> Operations: ${(_.get(parsed, ["operations", "colonizations", "length"], 0))} colonizations, ${(_.get(parsed, ["operations", "creep_transfers", "length"], 0))} transfers`);
			}
			
			// Try to read other shards
			let knownShards = ["shard0", "shard1", "shard2", "shard3"];
			let currentShard = _.get(Game, ["shard", "name"], "sim");
			
			console.log(`<font color='#00FFFF'>[ISM]</font> --- Other Shards ---`);
			_.each(knownShards, shardName => {
				if (shardName !== currentShard) {
					let status = this.getShardStatus(shardName);
					if (status) {
						console.log(`<font color='#00FFFF'>[ISM]</font> ${shardName}: ${Object.keys(status.colonies || {}).length} colonies, ${(_.get(status, ["resources", "energy"], 0)).toLocaleString()} energy`);
					} else {
						console.log(`<font color='#00FFFF'>[ISM]</font> ${shardName}: No data`);
					}
				}
			});
			
		} catch (err) {
			console.log(`<font color="#FF0000">[ISM]</font> Error in debug: ${err.message}`);
		}
	}
};

// Constants for resource types
const MINERALS = [
	RESOURCE_HYDROGEN, RESOURCE_OXYGEN, RESOURCE_UTRIUM, RESOURCE_LEMERGIUM,
	RESOURCE_KEANIUM, RESOURCE_ZYNTHIUM, RESOURCE_CATALYST, RESOURCE_GHODIUM
];

// All resources including base minerals and reactions
const RESOURCES_ALL = [
	RESOURCE_ENERGY,
	RESOURCE_POWER,
	RESOURCE_HYDROGEN, RESOURCE_OXYGEN, RESOURCE_UTRIUM, RESOURCE_LEMERGIUM,
	RESOURCE_KEANIUM, RESOURCE_ZYNTHIUM, RESOURCE_CATALYST, RESOURCE_GHODIUM,
	RESOURCE_HYDROXIDE, RESOURCE_ZYNTHIUM_KEANITE, RESOURCE_UTRIUM_LEMERGITE,
	RESOURCE_UTRIUM_HYDRIDE, RESOURCE_UTRIUM_OXIDE, RESOURCE_KEANIUM_HYDRIDE,
	RESOURCE_KEANIUM_OXIDE, RESOURCE_LEMERGIUM_HYDRIDE, RESOURCE_LEMERGIUM_OXIDE,
	RESOURCE_ZYNTHIUM_HYDRIDE, RESOURCE_ZYNTHIUM_OXIDE, RESOURCE_GHODIUM_HYDRIDE,
	RESOURCE_GHODIUM_OXIDE, RESOURCE_UTRIUM_ACID, RESOURCE_UTRIUM_ALKALIDE,
	RESOURCE_KEANIUM_ACID, RESOURCE_KEANIUM_ALKALIDE, RESOURCE_LEMERGIUM_ACID,
	RESOURCE_LEMERGIUM_ALKALIDE, RESOURCE_ZYNTHIUM_ACID, RESOURCE_ZYNTHIUM_ALKALIDE,
	RESOURCE_GHODIUM_ACID, RESOURCE_GHODIUM_ALKALIDE, RESOURCE_CATALYZED_UTRIUM_ACID,
	RESOURCE_CATALYZED_UTRIUM_ALKALIDE, RESOURCE_CATALYZED_KEANIUM_ACID,
	RESOURCE_CATALYZED_KEANIUM_ALKALIDE, RESOURCE_CATALYZED_LEMERGIUM_ACID,
	RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE, RESOURCE_CATALYZED_ZYNTHIUM_ACID,
	RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE, RESOURCE_CATALYZED_GHODIUM_ACID,
	RESOURCE_CATALYZED_GHODIUM_ALKALIDE
];

// Map of commodities (excluding base minerals/reactions)
const COMMODITIES = {
	[RESOURCE_UTRIUM_BAR]: true,
	[RESOURCE_LEMERGIUM_BAR]: true,
	[RESOURCE_ZYNTHIUM_BAR]: true,
	[RESOURCE_KEANIUM_BAR]: true,
	[RESOURCE_GHODIUM_MELT]: true,
	[RESOURCE_OXIDANT]: true,
	[RESOURCE_REDUCTANT]: true,
	[RESOURCE_PURIFIER]: true,
	[RESOURCE_BATTERY]: true,
	[RESOURCE_COMPOSITE]: true,
	[RESOURCE_CRYSTAL]: true,
	[RESOURCE_LIQUID]: true,
	[RESOURCE_WIRE]: true,
	[RESOURCE_SWITCH]: true,
	[RESOURCE_TRANSISTOR]: true,
	[RESOURCE_MICROCHIP]: true,
	[RESOURCE_CIRCUIT]: true,
	[RESOURCE_DEVICE]: true,
	[RESOURCE_CELL]: true,
	[RESOURCE_PHLEGM]: true,
	[RESOURCE_TISSUE]: true,
	[RESOURCE_MUSCLE]: true,
	[RESOURCE_ORGANOID]: true,
	[RESOURCE_ORGANISM]: true,
	[RESOURCE_ALLOY]: true,
	[RESOURCE_TUBE]: true,
	[RESOURCE_FIXTURES]: true,
	[RESOURCE_FRAME]: true,
	[RESOURCE_HYDRAULICS]: true,
	[RESOURCE_MACHINE]: true,
	[RESOURCE_CONDENSATE]: true,
	[RESOURCE_CONCENTRATE]: true,
	[RESOURCE_EXTRACT]: true,
	[RESOURCE_SPIRIT]: true,
	[RESOURCE_EMANATION]: true,
	[RESOURCE_ESSENCE]: true
};

