/* ***********************************************************
 *	[sec01f] OVERLOADS: ROOM
 * *********************************************************** */

 Room.prototype.store = function store(resource) {
	let amount = (_.get(this, ["storage", "my"], false) ? _.get(this, ["storage", "store", resource], 0) : 0)
		+ (_.get(this, ["terminal", "my"], false) ? _.get(this, ["terminal", "store", resource], 0) : 0);
	
	// Also include factory resources in the total
	let factories = _.filter(this.find(FIND_MY_STRUCTURES), s => s.structureType == "factory");
	for (let factory of factories) {
		amount += _.get(factory, ["store", resource], 0);
	}
	
	return amount;
};
/* ***********************************************************
 *	[sec01f] OVERLOADS: ROOM
 * *********************************************************** */

 Room.prototype.store = function store(resource) {
	let amount = (_.get(this, ["storage", "my"], false) ? _.get(this, ["storage", "store", resource], 0) : 0)
		+ (_.get(this, ["terminal", "my"], false) ? _.get(this, ["terminal", "store", resource], 0) : 0);
	
	// Also include factory resources in the total
	let factories = _.filter(this.find(FIND_MY_STRUCTURES), s => s.structureType == "factory");
	for (let factory of factories) {
		amount += _.get(factory, ["store", resource], 0);
	}
	
	return amount;
};


Room.prototype.getLevel = function getLevel() {
	if (this.energyCapacityAvailable == 0)
		return 0;
	else if (this.energyCapacityAvailable < 550)      // lvl 1, 300 energy
		return 1;
	else if (this.energyCapacityAvailable < 800)      // lvl 2, 550 energy
		return 2;
	else if (this.energyCapacityAvailable < 1300)     // lvl 3, 800 energy
		return 3;
	else if (this.energyCapacityAvailable < 1800)     // lvl 4, 1300 energy
		return 4;
	else if (this.energyCapacityAvailable < 2300)     // lvl 5, 1800 energy
		return 5;
	else if (this.energyCapacityAvailable < 5600)     // lvl 6, 2300 energy
		return 6;
	else if (this.energyCapacityAvailable < 12900)    // lvl 7, 5600 energy
		return 7;
	else											  // lvl 8, 12900 energy
		return 8;
},

	Room.prototype.getLevel_Available = function getLevel() {
		if (this.energyAvailable < 550)
			return 1;
		else if (this.energyAvailable < 800)
			return 2;
		else if (this.energyAvailable < 1300)
			return 3;
		else if (this.energyAvailable < 1800)
			return 4;
		else if (this.energyAvailable < 2300)
			return 5;
		else if (this.energyAvailable < 5600)
			return 6;
		else if (this.energyAvailable < 12900)
			return 7;
		else
			return 8;
	},

	Room.prototype.getWallTarget = function getWallTarget() {
		let level = this.getLevel();
		let t = [0,
			10000,
			25000,
			50000,
			100000,
			500000,
			1000000,
			2500000,
			5000000];
		return t[level];
	},

	Room.prototype.getLowEnergy = function getLowEnergy() {
		let level = this.getLevel();
		let energy = [0,
			0,
			0,
			0,
			20000,
			60000,
			100000,
			150000,
			200000];
		return energy[level];
	},

	Room.prototype.getCriticalEnergy = function getCriticalEnergy() {
		return this.getLowEnergy() / 2;
	},

	Room.prototype.getExcessEnergy = function getExcessEnergy() {
		return this.getLowEnergy() * 2;
	},

	Room.prototype.findRepair_Critical = function findRepair_Critical() {
		return this.find(FIND_STRUCTURES, {
			filter: (s) => {
				return (s.structureType == "rampart" && s.my
					&& s.hits < _.get(Memory, ["rooms", this.name, "defense", "wall_hp_target"], this.getWallTarget()) * 0.1)
					|| (s.structureType == "constructedWall" && s.hits < s.hitsMax
						&& s.hits < _.get(Memory, ["rooms", this.name, "defense", "wall_hp_target"], this.getWallTarget()) * 0.1)
					|| (s.structureType == "container" && s.hits < s.hitsMax * 0.1)
					|| (s.structureType == "road" && s.hits < s.hitsMax * 0.1);
			}
		}).sort((a, b) => { return a.hits - b.hits });
	},

	Room.prototype.findRepair_Maintenance = function findRepair_Maintenance() {
		return this.find(FIND_STRUCTURES, {
			filter: (s) => {
				return (s.structureType == "rampart" && s.my
					&& s.hits < _.get(Memory, ["rooms", this.name, "defense", "wall_hp_target"], this.getWallTarget()))
					|| (s.structureType == "constructedWall" && s.hits < s.hitsMax
						&& s.hits < _.get(Memory, ["rooms", this.name, "defense", "wall_hp_target"], this.getWallTarget()))
					|| (s.structureType == "container" && s.hits < s.hitsMax * 0.8)
					|| (s.structureType == "road" && s.hits < s.hitsMax * 0.8)
					|| ((s.structureType == "spawn" || s.structureType == "extension" || s.structureType == "link" || s.structureType == "storage"
						|| s.structureType == "tower" || s.structureType == "observer" || s.structureType == "extractor" || s.structureType == "lab"
						|| s.structureType == "terminal" || s.structureType == "nuker" || s.structureType == "powerSpawn")
						&& s.hits < s.hitsMax && s.my);
			}
		}).sort((a, b) => { return a.hits - b.hits });
	}

	Room.prototype.findSources = function findSources(checkEnergy = false) {
		return _.filter(this.find(FIND_SOURCES),
			s => { return !s.pos.isAvoided() && (checkEnergy == true ? s.energy > 0 : true) });
	}
