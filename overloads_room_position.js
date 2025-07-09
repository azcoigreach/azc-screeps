/* ***********************************************************
 *	[sec01g] OVERLOADS: ROOMPOSITION
 * *********************************************************** */

 RoomPosition.prototype.isAvoided = function isAvoided() {
	return _.findIndex(_.get(Memory, ["hive", "paths", "avoid", "rooms", this.roomName], null),
		p => { return p.x == this.x && p.y == this.y && p.roomName == this.roomName; }) >= 0;
}

RoomPosition.prototype.isBuildable = function isBuildable() {
	if (!this.isValid())
		return false;

	let look = this.look();

	let terrain = _.head(_.filter(look, l => l.type == "terrain"))["terrain"];
	if (terrain == "wall")
		return false;

	let structures = _.filter(look, l => l.type == "structure");
	for (let s in structures) {
		if (structures[s].structure.structureType != "road"
			&& (structures[s].structure.structureType != "rampart" || !structures[s].structure.my))
			return false;
	}

	return true;
};

RoomPosition.prototype.isEdge = function isEdge() {
	return (this.x == 0 || this.x == 49 || this.y == 0 || this.y == 49);
};

RoomPosition.prototype.isValid = function isValid() {
	return !(this.x < 0 || this.x > 49 || this.y < 0 || this.y > 49);
}

RoomPosition.prototype.isWalkable = function isWalkable(creeps_block) {
	if (!this.isValid())
		return false;

	let look = this.look();
	let terrain = _.head(_.filter(look, l => l.type == "terrain"))["terrain"];
	let structures = _.filter(look, l => l.type == "structure");

	if (terrain == "wall") {
		for (let s in structures)
			if (structures[s].structure.structureType == "road")
				return true;

		return false;
	}


	for (let s in structures) {
		if (structures[s].structure.structureType != "container" && structures[s].structure.structureType != "road"
			&& (structures[s].structure.structureType != "rampart" || !structures[s].structure.my))
			return false;
	}

	if (creeps_block) {
		let creeps = _.filter(look, l => l.type == "creep");
		if (creeps.length > 0)
			return false;
	}

	return true;
};

RoomPosition.prototype.getTileInDirection = function getTileInDirection(dir) {
	let nX = this.x;
	let nY = this.y;

	switch (dir) {
		case 0: case "0":
			break;

		case 1: case "1":
			nY = nY - 1;
			break;

		case 2: case "2":
			nX = nX + 1;
			nY = nY - 1;
			break;

		case 3: case "3":
			nX = nX + 1;
			break;

		case 4: case "4":
			nX = nX + 1;
			nY = nY + 1;
			break;

		case 5: case "5":
			nY = nY + 1;
			break;

		case 6: case "6":
			nX = nX - 1;
			nY = nY + 1;
			break;

		case 7: case "7":
			nX = nX - 1;
			break;

		case 8: case "8":
			nX = nX - 1;
			nY = nY - 1;
			break;
	}

	if (nX < 0 || nX > 49 || nY < 0 || nY > 49)
		return null;
	else
		return new RoomPosition (nX, nY, this.roomName);

};

RoomPosition.prototype.inRangeToListTargets = function inRangeToListTargets(listTargets, range) {
	for (let i = 0; i < listTargets.length; i++) {
		if (this.getRangeTo(listTargets[i].pos.x, listTargets[i].pos.y) < range)
			return true;
	}

	return false;
};

RoomPosition.prototype.getAccessAmount = function getAccessAmount(creeps_block) {
	let access = 0;

	access += new RoomPosition(this.x - 1, this.y - 1, this.roomName).isWalkable(creeps_block) ? 1 : 0;
	access += new RoomPosition(this.x, this.y - 1, this.roomName).isWalkable(creeps_block) ? 1 : 0;
	access += new RoomPosition(this.x + 1, this.y - 1, this.roomName).isWalkable(creeps_block) ? 1 : 0;
	access += new RoomPosition(this.x - 1, this.y, this.roomName).isWalkable(creeps_block) ? 1 : 0;
	access += new RoomPosition(this.x + 1, this.y, this.roomName).isWalkable(creeps_block) ? 1 : 0;
	access += new RoomPosition(this.x - 1, this.y + 1, this.roomName).isWalkable(creeps_block) ? 1 : 0;
	access += new RoomPosition(this.x, this.y + 1, this.roomName).isWalkable(creeps_block) ? 1 : 0;
	access += new RoomPosition(this.x + 1, this.y + 1, this.roomName).isWalkable(creeps_block) ? 1 : 0;

	return access;
};

RoomPosition.prototype.getOpenTile_Adjacent = function getOpenTile_Adjacent(creeps_block) {
	return (this.getOpenTile_Range(1, creeps_block));
};

RoomPosition.prototype.getBuildableTile_Adjacent = function getBuildableTile_Adjacent() {
	return (this.getBuildableTile_Range(1));
};

RoomPosition.prototype.getOpenTile_Range = function getOpenTile_Range(range, creeps_block) {
	for (let x = -range; x <= range; x++) {
		for (let y = -range; y <= range; y++) {
			let newPos = new RoomPosition(this.x + x, this.y + y, this.roomName);

			if (!newPos.isValid())
				continue;

			if (newPos.isWalkable(creeps_block))
				return newPos;
		}
	}

	return null;
};

RoomPosition.prototype.getBuildableTile_Range = function getBuildableTile_Range(range) {
	for (let x = -range; x <= range; x++) {
		for (let y = -range; y <= range; y++) {
			let newPos = new RoomPosition(this.x + x, this.y + y, this.roomName);

			if (!newPos.isValid())
				continue;

			if (newPos.isBuildable())
				return newPos;
		}
	}

	return null;
};

RoomPosition.prototype.getOpenTile_Path = function getOpenTile_Path(range, creeps_block) {
	for (let x = -range; x <= range; x++) {
		for (let y = -range; y <= range; y++) {
			let newPos = new RoomPosition(this.x + x, this.y + y, this.roomName);

			if (!newPos.isValid())
				continue;

			if (newPos.isWalkable(creeps_block)) {
				let path = this.findPathTo(newPos.x, newPos.y, { maxOps: 200, ignoreCreeps: true, ignoreRoads: true });
				if (path.length <= 2)
					return newPos;
			}
		}
	}

	return null;
};