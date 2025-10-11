/* ***********************************************************
 *	[sec01c] OVERLOADS: CREEP TASKS
 * *********************************************************** */

 Creep.prototype.runTask = function runTask() {
	if (this.memory.task == null) {
		return;
	} else if (this.memory.task["timer"] != null) {
		let task = this.memory.task;
		task["timer"] = task["timer"] - 1;
		if (task["timer"] <= 0) {
			delete this.memory.task;
			return;
		}
	}

	
	switch (this.memory.task["type"]) {
		case "wait":
			this.travelTask(null);
			return;

		case "travel":
			// Move toward the destination specified in the task
			this.travelTask(this.memory.task["destination"]);
			return;

		case "boost": {
			let lab = Game.getObjectById(this.memory.task["id"]);
			if (!this.pos.inRangeTo(lab, 1)) {
				Stats_Visual.CreepSay(this, 'upgrade');
				this.travelTask(lab);
				return;
			} else {    // Wait out timer- should be boosted by then.
				return;
			}
		}

		case "pickup": {
			let obj = Game.getObjectById(this.memory.task["id"]);
			if (this.pickup(obj) == ERR_NOT_IN_RANGE) {
				Stats_Visual.CreepSay(this, 'pickup');
				this.travelTask(obj);
				return;
			} else {    // Action takes one tick... task complete... delete task...
				delete this.memory.task;
				return;
			}
		}

		case "withdraw": {
			let obj = Game.getObjectById(this.memory.task["id"]);

			if (this.withdraw(obj, this.memory.task["resource"],
				(this.memory.task["amount"] > this.carryCapacity - _.sum(this.carry) ? null : this.memory.task["amount"]))
				== ERR_NOT_IN_RANGE) {
				Stats_Visual.CreepSay(this, 'withdraw');
				this.travelTask(obj);
				return;
			} else {    // Action takes one tick... task complete... delete task...
				delete this.memory.task;
				return;
			}
		}

		case "harvest": {
			let obj = Game.getObjectById(this.memory.task["id"]);

			// Special handling for highway burrowers harvesting deposits
			if (this.memory.role === "highway_burrower" && obj && obj.depositType) {
				let result = this.harvest(obj);
				if (result == OK) {
					// Successfully harvested from deposit, track it
					this.memory.hasHarvested = true;
					let highwayData = _.get(Memory, ["sites", "highway_mining", this.memory.highway_id]);
					if (highwayData) {
						highwayData.last_harvest = Game.time;
					}
					return;
				} else if (result == ERR_NOT_IN_RANGE) {
					this.travelTask(obj);
					return;
				} else if (result == ERR_BUSY) {
					// Deposit in cooldown, wait
					return;
				} else if (result == ERR_NOT_ENOUGH_RESOURCES) {
					// Deposit is depleted
					let highwayData = _.get(Memory, ["sites", "highway_mining", this.memory.highway_id]);
					if (highwayData) {
						highwayData.state = "completed";
						console.log(`<font color=\"#FFA500\">[Highway]</font> Deposit ${obj.id} depleted during harvest, marking operation as completed for ${this.memory.highway_id}`);
					}
					delete this.memory.task;
					return;
				} else {
					// Other error, delete task and let it be reassigned
					delete this.memory.task;
					return;
				}
			}

			// Regular harvest logic for energy sources
			let result = this.harvest(obj);
			if (result == OK) {
				let interval = 3;
				if (Game.time % interval == 0) {
					// Burrower fill adjacent link if possible; also fill adjacent container
					if (this.memory.role == "burrower" && this.carry["energy"] > 0) {

						let link_id = _.get(this.memory, ["task", "dump_link"]);
						if (link_id != "unavailable" || Game.time % (interval * 5) == 0) {
							let link = Game.getObjectById(link_id);
							if (link == null || this.pos.getRangeTo(link) > 1 || link.energy == link.energyCapacity)
								link = _.head(this.pos.findInRange(FIND_STRUCTURES, 1, { filter: (s) => { return s.structureType == "link"; } }));
							if (link != null) {
								_.set(this.memory, ["task", "dump_link"], _.get(link, "id"));
								this.transfer(link, "energy");
								Stats_Visual.CreepSay(this, 'transfer');
								return;
							} else {
								_.set(this.memory, ["task", "dump_link"], "unavailable");
							}
						}

						let container_id = _.get(this.memory, ["task", "dump_container"]);
						if (container_id != "unavailable" || Game.time % (interval * 5) == 0) {
							let container = Game.getObjectById(container_id);
							if (container == null || this.pos.getRangeTo(container) > 1 || _.sum(container.store) == container.storeCapacity)
								container = _.head(this.pos.findInRange(FIND_STRUCTURES, 1, { filter: (s) => { return s.structureType == "container"; } }));
							if (container != null) {
								_.set(this.memory, ["task", "dump_container"], _.get(container, "id"));
								this.transfer(container, "energy");
								Stats_Visual.CreepSay(this, 'transfer');
								return;
							} else {
								_.set(this.memory, ["task", "dump_container"], "unavailable");
							}
						}

					}
				}
				return;
			} else if (result == ERR_NOT_IN_RANGE) {
				if (this.memory.role == "burrower" && this.carry["energy"] > 0)
					this.drop("energy");
				if (this.travelTask(obj) == ERR_NO_PATH)
					delete this.memory.task;
				return;
			} else {
				delete this.memory.task;
				return;
			}
		}

		case "upgrade": {
			let controller = Game.getObjectById(this.memory.task["id"]);
			let result = this.upgradeController(controller);
			if (result == OK) {
				if (Game.time % 10 == 0)
					Stats_Visual.CreepSay(this, 'upgrade');
					this.travel(controller);
				return;
			} else if (result == ERR_NOT_IN_RANGE) {
				this.travelTask(controller);
				return;
			} else if (result != OK) {
				delete this.memory.task;
				return;
			} else { return; }
		}

		case "sign": {
			let controller = Game.getObjectById(this.memory.task["id"]);
			let message = this.memory.task["message"];
			let result = this.signController(controller, message);
			if (result == ERR_NOT_IN_RANGE) {
				this.travelTask(controller);
				return;
			} else if (result != OK) {
				delete this.memory.task;
				return;
			} else { return; }
		}

		case "repair": {
			let structure = Game.getObjectById(this.memory.task["id"]);
			let result = this.repair(structure);
			if (result == ERR_NOT_IN_RANGE) {
				Stats_Visual.CreepSay(this, 'repair');
				this.travelTask(structure);
				return;
			} else if (result != OK || structure.hits == structure.hitsMax) {
				delete this.memory.task;
				return;
			} else { return; }
		}

		case "build": {
			let structure = Game.getObjectById(this.memory.task["id"]);
			let result = this.build(structure);
			if (result == ERR_NOT_IN_RANGE) {
				Stats_Visual.CreepSay(this, 'build');
				this.travelTask(structure);
				return;
			} else if (result != OK) {
				delete this.memory.task;
				return;
			} else { 
				Stats_Visual.CreepSay(this, 'build');
				return; 
			}
		}

		case "attack": {
			let target = Game.getObjectById(this.memory.task["target"] || this.memory.task["id"]);
			if (!target) {
				delete this.memory.task;
				return;
			}
			let result = this.attack(target);
			if (result === OK) {
				// Optionally, delete the task if you want to attack only once per task
				// delete this.memory.task;
				return;
			} else if (result === ERR_NOT_IN_RANGE) {
				this.travelTask(target);
				return;
			} else {
				delete this.memory.task;
				return;
			}
		}

		case "deposit": {
			let target = Game.getObjectById(this.memory.task["id"]);
			switch (this.memory.task["resource"]) {
				case "energy":
					Stats_Visual.CreepSay(this, 'transfer');
					if (target != null && this.transfer(target, this.memory.task["resource"]) == ERR_NOT_IN_RANGE) {
						if (_.get(target, "energy") != null && _.get(target, "energy") == _.get(target, "energyCapacity")) {
							delete this.memory.task;
							return;
						}

						this.travelTask(target);
						return;
					} else {
						delete this.memory.task;
						return;
					}
					return;

				default:
				case "mineral":		// All except energy
					Stats_Visual.CreepSay(this, 'transfer');
					for (let r = Object.keys(this.carry).length; r > 0; r--) {
						let resourceType = Object.keys(this.carry)[r - 1];
						if (resourceType == "energy") {
							continue;
						} else if (target != null && this.transfer(target, resourceType) == ERR_NOT_IN_RANGE) {
							this.travelTask(target);
							return;
						} else {
							delete this.memory.task;
							return;
						}
					}
					return;
			}
		}

		case "factory_operate": {
			let factory = Game.getObjectById(this.memory.task["id"]);
			if (factory == null) {
				delete this.memory.task;
				return;
			}

			if (!this.pos.inRangeTo(factory, 1)) {
				Stats_Visual.CreepSay(this, 'transfer');
				this.travelTask(factory);
				return;
			}

			// Check if factory has produced something and needs to be emptied
			let producedCommodity = null;
			for (let resource in factory.store) {
				if (resource != "energy" && factory.store[resource] > 0) {
					producedCommodity = resource;
					break;
				}
			}

			if (producedCommodity != null) {
				// Try to transfer the produced commodity to storage
				let storage = factory.room.storage;
				if (storage != null) {
					let result = this.transfer(storage, producedCommodity);
					if (result == OK) {
						Stats_Visual.CreepSay(this, 'transfer');
					}
				}
			}

			// Also handle cleanup of unwanted materials
			let assignment = _.get(Memory, ["resources", "factories", "assignments", factory.id]);
			if (assignment != null) {
				let commodity = assignment.commodity;
				let components = assignment.components || {};
				let allowedResources = ["energy", commodity, ...Object.keys(components)];

				// Check for unwanted materials
				for (let resource in factory.store) {
					if (!allowedResources.includes(resource) && factory.store[resource] > 0) {
						// This is an unwanted material - clean it up
						let storage = factory.room.storage;
						if (storage != null) {
							let result = this.transfer(storage, resource);
							if (result == OK) {
								Stats_Visual.CreepSay(this, 'cleanup');
							}
						}
						break; // Handle one resource at a time
					}
				}

				// Check for excess allowed materials
				for (let resource in factory.store) {
					if (allowedResources.includes(resource) && resource !== "energy") {
						let currentAmount = factory.store[resource];
						let maxKeep = 0;
						
						if (resource === commodity) {
							maxKeep = 1000; // Keep max 1000 of output commodity
						} else if (components[resource]) {
							maxKeep = components[resource] * 1.5; // Keep 1.5x needed components
						}
						
						if (currentAmount > maxKeep) {
							let excess = currentAmount - maxKeep;
							let storage = factory.room.storage;
							if (storage != null) {
								let result = this.transfer(storage, resource);
								if (result == OK) {
									Stats_Visual.CreepSay(this, 'excess');
								}
							}
							break; // Handle one resource at a time
						}
					}
				}
			}

			// Task continues until manually cleared or factory is empty
			return;
		}

		case "factory_cleanup": {
			let factory = Game.getObjectById(this.memory.task["id"]);
			if (factory == null) {
				delete this.memory.task;
				return;
			}

			if (!this.pos.inRangeTo(factory, 1)) {
				Stats_Visual.CreepSay(this, 'cleanup');
				this.travelTask(factory);
				return;
			}

			// Check if we need to withdraw a specific resource for cleanup
			let resource = this.memory.task["resource"];
			if (resource && factory.store[resource] > 0) {
				let storage = factory.room.storage;
				if (storage != null) {
					let amount = this.memory.task["amount"] || factory.store[resource];
					let result = this.withdraw(factory, resource, amount);
					if (result == OK) {
						Stats_Visual.CreepSay(this, 'cleanup');
						
						// Deposit to storage
						this.memory.task = {
							type: "deposit",
							resource: resource,
							id: storage.id,
							timer: 60,
							priority: 4
						};
					}
				}
			}

			// Task continues until manually cleared
			return;
		}
	}
};


Creep.prototype.getTask_Boost = function getTask_Boost() {
	if (this.ticksToLive < 1350 || this.spawning)
		return null;

	let boosted = this.getBoosts();
	return _.head(_.filter(_.get(Memory, ["rooms", this.room.name, "industry", "boosts"]),
		t => {
			return t.active && t.role == this.memory.role
				&& (t.room == null ? true : t.room == this.memory.room)
				&& !boosted.includes(t.resource);
		}));
};

Creep.prototype.getTask_Withdraw_Link = function getTask_Withdraw_Link(distance) {
	if (!_.get(this.room, ["controller", "my"], false)
		|| !_.get(Memory, ["rooms", this.room.name, "defense", "is_safe"]))
		return;

	// If we have storage, only consider links near storage
	if (this.room.storage) {
		// Get all valid receive links with energy that are near storage (within 10 tiles)
		let validLinks = _.filter(this.room.find(FIND_MY_STRUCTURES), s => {
			return s.structureType == "link" && s.energy > 0 
				&& s.pos.getRangeTo(this.room.storage.pos) <= 10
				&& this.pos.getRangeTo(s.pos) <= distance
				&& _.some(_.get(Memory, ["rooms", this.room.name, "links"]),
					l => { return _.get(l, "id") == s.id && _.get(l, "dir") == "receive"; });
		});

		if (validLinks.length == 0) return;

		// Sort links by distance to storage (closest first)
		let sortedLinks = _.sortBy(validLinks, link => {
			return link.pos.getRangeTo(this.room.storage.pos);
		});
		
		let closestLink = sortedLinks[0];
		return {
			type: "withdraw",
			structure: "link",
			resource: "energy",
			id: closestLink.id,
			timer: 60
		};
	} else {
		// No storage, use the closest link to the courier (original behavior)
		let validLinks = _.filter(this.room.find(FIND_MY_STRUCTURES), s => {
			return s.structureType == "link" && s.energy > 0 && this.pos.getRangeTo(s.pos) <= distance
				&& _.some(_.get(Memory, ["rooms", this.room.name, "links"]),
					l => { return _.get(l, "id") == s.id && _.get(l, "dir") == "receive"; });
		});

		if (validLinks.length == 0) return;

		let closestLink = _.head(_.sortBy(validLinks, link => {
			return this.pos.getRangeTo(link.pos);
		}));
		
		return {
			type: "withdraw",
			structure: "link",
			resource: "energy",
			id: closestLink.id,
			timer: 60
		};
	}
};

Creep.prototype.getTask_Withdraw_Storage = function getTask_Withdraw_Storage(resource, is_critical) {
	if (!this.room.storage)
		return;

	resource = resource || "energy";
	is_critical = is_critical || false;

	if (resource != "energy" && _.get(this.room.storage, ["store", resource], 0) > 0) {
		return {
			type: "withdraw",
			resource: resource,
			id: this.room.storage.id,
			timer: 60
		};
	} else if (resource == "energy" && _.get(this.room.storage, ["store", "energy"], 0) > 0
		&& (_.get(Memory, ["rooms", this.room.name, "survey", "energy_level"]) != CRITICAL || is_critical)) {
		return {
			type: "withdraw",
			resource: resource,
			id: this.room.storage.id,
			timer: 60
		};
	} else {
		return;
	}
};

Creep.prototype.getTask_Withdraw_Container = function getTask_Withdraw_Container(resource, is_critical) {
	if (!_.get(Memory, ["rooms", this.room.name, "defense", "is_safe"], true))
		return;

	resource = resource || "energy";
	is_critical = is_critical || false;

	if (resource != "energy") {
		let cont = _.head(_.filter(this.room.find(FIND_STRUCTURES),
		s => { return s.structureType == STRUCTURE_CONTAINER && _.get(s, ["store", resource], 0) > 0; }));
		if (cont != null) {
			return {
				type: "withdraw",
				resource: resource,
				id: cont.id,
				timer: 60
			};
		}
	}

	if (resource == "energy"
		&& (_.get(Memory, ["rooms", this.room.name, "survey", "energy_level"]) != CRITICAL || is_critical)) {
		let am_owner = _.get(this.room, ["controller", "my"], false);
		let mining_colony = _.get(Memory, ["sites", "mining", this.room.name, "colony"]);
		let room_level = mining_colony == null || Game.rooms[mining_colony] == null
			? (am_owner ? this.room.getLevel() : 0)
			: Game.rooms[mining_colony].getLevel();
		let carry_amount = this.carryCapacity / 5;

		let cont = null;
		
		// TARGET COMMITMENT: Check if creep has a committed container that's still valid
		let committedContainerId = _.get(this.memory, ["committed_target", "container"]);
		let committedUntil = _.get(this.memory, ["committed_target", "until"], 0);
		
		if (committedContainerId && Game.time < committedUntil) {
			// Try to use the committed container if it still has sufficient energy
			let committedContainer = Game.getObjectById(committedContainerId);
			if (committedContainer && _.get(committedContainer, ["store", "energy"], 0) > carry_amount) {
				cont = committedContainer;
			} else {
				// Committed container is empty/invalid, clear the commitment
				delete this.memory.committed_target;
			}
		}
		
		// If no valid commitment, find a new container
		if (cont == null) {
			cont = _.head(_.sortBy(_.filter(this.room.find(FIND_STRUCTURES),
				s => { return s.structureType == STRUCTURE_CONTAINER && _.get(s, ["store", "energy"], 0) > carry_amount; }),
				s => { return this.pos.getRangeTo(s.pos); }));

			if (cont != null) {
				// COMMIT to this container: stay committed for 30-60 ticks
				let commitDuration = room_level <= 3 ? 30 : 60; // Shorter commitment for early game
				
				_.set(this.memory, ["committed_target", "container"], cont.id);
				_.set(this.memory, ["committed_target", "until"], Game.time + commitDuration);
			}
		}

		if (cont != null) {
			return {
				type: "withdraw",
				resource: "energy",
				id: cont.id,
				timer: 60
			};
		}
	}
};

Creep.prototype.getTask_Withdraw_Source_Container = function getTask_Withdraw_Source_Container() {
	if (this.store.getFreeCapacity() == 0)
		return;

	if (this.memory.role == "burrower") {
		let source = _.head(_.filter(this.room.findSources(false), s => {
			return _.get(Memory, ["rooms", this.room.name, "sources", s.id, "burrower"]) == this.id;
		}));

		if (source == null)
			return;

		let container = _.head(_.filter(source.pos.findInRange(FIND_STRUCTURES, 1),
			s => { return s.structureType == "container" && s.store.energy > 0; } ));

		if (container != null) {
			return {
				type: "withdraw",
				resource: "energy",
				id: container.id,
				timer: 60
			};
		}
	}
};

Creep.prototype.getTask_Deposit_Link = function getTask_Deposit_Link() {
	if (_.get(Memory, ["rooms", this.room.name, "survey", "energy_level"]) == CRITICAL)
		return;

	if (this.carry["energy"] == 0)
		return;

	let link = _.head(_.filter(this.room.find(FIND_MY_STRUCTURES), s => {
		return s.structureType == "link" && s.energy < (s.energyCapacity * 0.8) && this.pos.getRangeTo(s.pos) < 3
			&& _.some(_.get(Memory, ["rooms", this.room.name, "links"]),
				l => { return _.get(l, "id") == s.id && _.get(l, "dir") == "send"; });
	}));

	if (link != null) {
		return {
			type: "deposit",
			resource: "energy",
			id: link.id,
			timer: 60,
		};
	}
};

Creep.prototype.getTask_Deposit_Source_Link = function getTask_Deposit_Source_Link() {
	if (this.store["energy"] == 0)
		return;

	if (this.memory.role == "burrower") {
		let source = _.head(_.filter(this.room.findSources(false), s => {
			return _.get(Memory, ["rooms", this.room.name, "sources", s.id, "burrower"]) == this.id;
		}));

		if (source == null)
			return;

		let link = _.head(_.filter(source.pos.findInRange(FIND_STRUCTURES, 2), s => {
			return s.structureType == "link" && s.energy < s.energyCapacity
				&& _.some(_.get(Memory, ["rooms", this.room.name, "links"]),
					l => { return _.get(l, "id") == s.id && _.get(l, "dir") == "send"; });
				}));

		if (link != null) {
			return {
				type: "deposit",
				resource: "energy",
				id: link.id,
				timer: 60,
			};
		}
	}
};

Creep.prototype.getTask_Deposit_Storage = function getTask_Deposit_Storage(resource) {
	if (!this.room.storage || !_.get(this.room, ["controller", "my"], false))
		return;

	if (_.sum(this.room.storage.store) == this.room.storage.storeCapacity)
		return;

	if ((resource == null || resource != "energy") && _.sum(this.carry) - this.carry["energy"] > 0)
		resource = "mineral";
	else if ((resource == null || resource == "energy") && this.carry["energy"] > 0)
		resource = "energy";
	else
		return;

	return {
		type: "deposit",
		resource: resource,
		id: this.room.storage.id,
		timer: 60,
	};
};

Creep.prototype.getTask_Deposit_Container = function getTask_Deposit_Container(resource) {
	let cont = _.head(_.sortBy(_.filter(this.room.find(FIND_STRUCTURES),
		s => { return s.structureType == "container" && _.sum(s.store) < s.storeCapacity; }),
		s => { return this.pos.getRangeTo(s.pos); }));

	if ((resource == null || resource != "energy") && _.sum(this.carry) - this.carry["energy"] > 0)
		resource = "mineral";
	else if ((resource == null || resource == "energy") && this.carry["energy"] > 0)
		resource = "energy";
	else
		return;

	if (cont != null) {
		return {
			type: "deposit",
			resource: resource,
			id: cont.id,
			timer: 60,
		};
	}
};

Creep.prototype.getTask_Deposit_Towers = function getTask_Deposit_Towers() {
	if (!_.get(this.room, ["controller", "my"], false))
		return;

	let tower = _.head(_.sortBy(_.filter(this.room.find(FIND_MY_STRUCTURES),
		s => { return s.structureType == "tower" && s.energy < s.energyCapacity; }),
		s => { return s.energy; }));

	if (tower != null) {
		return {
			type: "deposit",
			structure: "tower",
			resource: "energy",
			id: tower.id,
			timer: 60
		};
	}
};

Creep.prototype.getTask_Deposit_Spawns = function getTask_Deposit_Spawns() {
	if (!_.get(this.room, ["controller", "my"], false))
		return;

	let spawn_ext = _.head(_.sortBy(_.filter(this.room.find(FIND_MY_STRUCTURES), s => {
		return (s.structureType == "spawn" && s.energy < s.energyCapacity * 0.85)
			|| (s.structureType == "extension" && s.energy < s.energyCapacity);
	}),
		s => { return this.pos.getRangeTo(s.pos); }));

	if (spawn_ext != null) {
		return {
			type: "deposit",
			resource: "energy",
			id: spawn_ext.id,
			timer: 60
		};
	}
};

Creep.prototype.getTask_Pickup = function getTask_Pickup(resource) {
    // Ensure the room is safe before picking up any resource.
    if (!_.get(Memory, ["rooms", this.room.name, "defense", "is_safe"])) {
        return;
    }
    
    let dropped = this.room.find(FIND_DROPPED_RESOURCES);
    let carryAmount = this.carryCapacity / 5;
    
    // TARGET COMMITMENT: Check if creep has a committed pickup target that's still valid
    let committedPickupId = _.get(this.memory, ["committed_target", "pickup"]);
    let committedUntil = _.get(this.memory, ["committed_target", "until"], 0);
    
    if (committedPickupId && Game.time < committedUntil) {
        // Try to use the committed pickup target if it still exists and has resources
        let committedPile = Game.getObjectById(committedPickupId);
        if (committedPile && committedPile.amount > 0) {
            // Verify it matches the requested resource type if specified
            if (!resource || committedPile.resourceType === resource) {
                return {
                    type: "pickup",
                    resource: committedPile.resourceType,
                    id: committedPile.id,
                    timer: 30
                };
            }
        }
        // Committed pickup is gone/invalid, clear the commitment
        delete this.memory.committed_target;
    }
    
    // No valid commitment, find a new pickup target
    let targetPile = null;
    
    // If a specific resource type is requested, look for that
    if (resource) {
        let resourcePile = _.head(_.sortBy(_.filter(dropped, r => 
            r.resourceType === resource && r.amount > carryAmount
        ), r => -r.amount));
        
        if (resourcePile) {
            targetPile = resourcePile;
        }
    } else {
        // Look for any dropped resources, prioritizing commodities over energy
        let commodityPiles = _.filter(dropped, r => 
            r.resourceType !== "energy" && r.amount > carryAmount
        );
        
        if (commodityPiles.length > 0) {
            // Prioritize commodities (silicon, metal, etc.)
            targetPile = _.head(_.sortBy(commodityPiles, r => -r.amount));
        } else {
            // Fallback to energy if no commodities found
            let energyPile = _.head(_.sortBy(_.filter(dropped, r => 
                r.resourceType === "energy" && r.amount > carryAmount
            ), r => -r.amount));
            
            if (energyPile) {
                targetPile = energyPile;
            }
        }
    }
    
    // If we found a target pile, commit to it
    if (targetPile) {
        // COMMIT to this pickup target: stay committed for 20 ticks
        _.set(this.memory, ["committed_target", "pickup"], targetPile.id);
        _.set(this.memory, ["committed_target", "until"], Game.time + 20);
        
        return {
            type: "pickup",
            resource: targetPile.resourceType,
            id: targetPile.id,
            timer: 30
        };
    }
    
    // Optionally, if you want your creeps to withdraw energy from tombstones or ruins:
    let tombstone = _.head(_.sortBy(_.filter(this.room.find(FIND_TOMBSTONES), t => 
        t.store && t.store["energy"] > carryAmount
    ), t => -this.pos.getRangeTo(t.pos)));
    
    if (tombstone) {
        return {
            type: "withdraw",
            resource: "energy",
            id: tombstone.id,
            timer: _.get(tombstone, "ticksToDecay", 50)
        };
    }
    
    let ruin = _.head(_.sortBy(_.filter(this.room.find(FIND_RUINS), r =>
        r.store && r.store["energy"] > carryAmount
    ), r => -this.pos.getRangeTo(r.pos)));
    
    if (ruin) {
        return {
            type: "withdraw",
            resource: "energy",
            id: ruin.id,
            timer: 50
        };
    }
    
    return null;
};


Creep.prototype.getTask_Upgrade = function getTask_Upgrade(only_critical) {
	if (!_.get(this.room, ["controller", "my"], false))
		return;

	// If only_critical is true, only upgrade when controller is in critical downgrade state
	if (only_critical === true && _.get(this.room, ["controller", "ticksToDowngrade"]) <= 3500) {
		return {
			type: "upgrade",
			id: this.room.controller.id,
			pos: this.room.controller.pos.getOpenTile_Range(2, true),
			timer: 60
		};
	}

	// If only_critical is false or null, always upgrade
	if (only_critical === false || only_critical == null) {
		return {
			type: "upgrade",
			id: this.room.controller.id,
			pos: this.room.controller.pos.getOpenTile_Range(2, true),
			timer: 60
		};
	}
};

Creep.prototype.getTask_Sign = function getTask_Sign() {
	if (!_.get(this.room, "controller", false))
		return;

	// Signs set by Screeps devs can't be changed- will report OK (0) but will fail to change
	if (_.get(this.room, ["controller", "sign", "username"]) == "Screeps")
		return;

	let sign_room = _.get(Memory, ["hive", "signs", this.room.name]);
	let sign_default = _.get(Memory, ["hive", "signs", "default"]);
	let is_safe = _.get(Memory, ["rooms", this.room.name, "defense", "is_safe"]);
	let room_sign = _.get(this.room, ["controller", "sign", "text"]);

	// Set for blank sign (empty string) and room sign is blank (undefined)
	if ((sign_room == null && sign_default == "" && room_sign == undefined)
		|| (sign_room == "" && room_sign == undefined))
		return;

	if (is_safe && sign_room != null && room_sign != sign_room) {
		return {
			type: "sign",
			message: sign_room,
			id: this.room.controller.id,
			timer: 60
		};
	} else if (is_safe && sign_room == null && sign_default != null && room_sign != sign_default) {
		return {
			type: "sign",
			message: sign_default,
			id: this.room.controller.id,
			timer: 60
		};
	}
};

Creep.prototype.getTask_Repair = function getTask_Repair(only_critical) {
	if (only_critical == null || only_critical == true) {
		let repair_critical = _.head(this.room.findRepair_Critical());
		if (repair_critical != null)
			return {
				type: "repair",
				id: repair_critical.id,
				timer: 60
			};
	}

	if (only_critical == null || only_critical == false) {
		let repair_maintenance = _.head(this.room.findRepair_Maintenance());
		if (repair_maintenance != null)
			return {
				type: "repair",
				id: repair_maintenance.id,
				timer: 60,
			};
	}
};

Creep.prototype.getTask_Build = function getTask_Build() {
	let room = this.room;
	let level = room.controller.level;
	
	let site = _.head(_.sortBy(_.filter(room.find(FIND_CONSTRUCTION_SITES),
		s => { return s.my; }),
		s => {
			let p = 0;
			
			// Early game urgency system - prioritize RCL progression structures
			if (level <= 4) {
				switch (s.structureType) {
					case "spawn": p = 1; break; // Highest priority
					case "extension": p = 2; break; // Critical for RCL progression
					case "tower": p = 3; break; // Defense and energy storage
					case "storage": p = 4; break; // Needed for RCL 5
					case "container": p = 5; break; // Energy management
					case "road": p = 6; break;
					default: p = 7; break;
				}
			} else {
				// Mid/late game: Standard priorities
				switch (s.structureType) {
					case "spawn": p = 2; break;
					case "tower": p = 3; break;
					case "extension": p = 4; break;
					case "storage": p = 5; break;
					case "road": p = 7; break;
					default: p = 6; break;
				}
			}

			// Boost priority for structures that are already being built
			if (s.progress > 0)
				p -= 1;

			// Additional urgency for critical RCL progression structures
			if (level <= 4) {
				if (s.structureType == "extension" && level < 3) p -= 2; // Urgent for RCL 2
				if (s.structureType == "tower" && level == 3) p -= 2; // Urgent for RCL 3
				if (s.structureType == "storage" && level == 4) p -= 2; // Urgent for RCL 4
			}

			return p;
		}));

	if (site != null)
		return {
			type: "build",
			id: site.id,
			timer: 60
		};
};

Creep.prototype.getTask_Mine = function getTask_Mine() {
	if (!_.get(Memory, ["rooms", this.room.name, "defense", "is_safe"], true))
		return;

	/* Expected behavior:
	 * Burrowers: 1 burrower per source, stick to source, stand on container, mine; when source is empty, move
	 *   energy to nearby link (as new task).
	 * Miners: Move to any source that's not avoided and that has energy, harvest, then get new task
	 * 
	 * Target Commitment: Creeps commit to a source for a duration to prevent bouncing between sources
	 */

	let source = null;

	if (this.memory.role == "burrower") {
		let sources = this.room.findSources(false);

		// Burrower already has an assignment? Follow the assignment.
		source = _.head(_.filter(sources, s => {
			return _.get(Memory, ["rooms", this.room.name, "sources", s.id, "burrower"]) == this.id;
		}));

		// No burrower assignment? Need to iterate sources and update assignments
		if (source == null) {
			// List of existing burrower creeps
			let burrowers = _.filter(this.room.find(FIND_MY_CREEPS),
				c => { return c.memory.role == "burrower"; });

			_.forEach(sources, s => {
				let burrower = _.get(Memory, ["rooms", this.room.name, "sources", s.id, "burrower"]);
				// If burrower is assigned but there is no existing creep by that id (creep died?)
				if (burrower != null && _.filter(burrowers, b => { return b.id == burrower; }).length == 0)
					_.set(Memory, ["rooms", this.room.name, "sources", s.id, "burrower"], null);
			});

			// Assign this creep the 1st unassigned source
			source = _.head(_.filter(sources,
				s => { return _.get(Memory, ["rooms", this.room.name, "sources", s.id, "burrower"]) == null; }));

			if (source != null) {
				_.set(Memory, ["rooms", this.room.name, "sources", source.id, "burrower"], this.id);
			}
		}

		if (source == null || source.energy == 0)
			return;

	} else {
		// TARGET COMMITMENT: Check if creep has a committed source that's still valid
		let committedSourceId = _.get(this.memory, ["committed_target", "source"]);
		let committedUntil = _.get(this.memory, ["committed_target", "until"], 0);
		
		if (committedSourceId && Game.time < committedUntil) {
			// Try to use the committed source if it still has energy
			let committedSource = Game.getObjectById(committedSourceId);
			if (committedSource && committedSource.energy > 0) {
				source = committedSource;
			} else {
				// Committed source is empty/invalid, clear the commitment
				delete this.memory.committed_target;
			}
		}
		
		// If no valid commitment, find a new source
		if (source == null) {
			// Find sources with energy, and that aren't marked as being avoided via path console functions
			source = _.head(_.sortBy(this.room.findSources(true),
			s => {
				if (this.memory.role == "burrower")
					return _.filter(s.pos.findInRange(FIND_MY_CREEPS, 1),
						c => { return c.memory.role == "burrower"; }).length;
				else // Sort by least crowded...
					return s.pos.findInRange(FIND_MY_CREEPS, 1).length > s.pos.getOpenTile_Adjacent(true);
			}));

			if (source == null)
				return;
			
			// COMMIT to this source: stay committed for 50 ticks (adjustable based on room level)
			let roomLevel = _.get(this.room, ["controller", "level"], 1);
			let commitDuration = roomLevel <= 3 ? 50 : 100; // Shorter commitment for early game
			
			_.set(this.memory, ["committed_target", "source"], source.id);
			_.set(this.memory, ["committed_target", "until"], Game.time + commitDuration);
		}
	}

	let container = _.get(Memory, ["rooms", this.room.name, "sources", source.id, "container"]);
	container = (container == null) ? null : Game.getObjectById(container);

	if (container == null) {
		container = _.head(source.pos.findInRange(FIND_STRUCTURES, 1, {
			filter:
				s => { return s.structureType == "container"; }
		}));
		_.set(Memory, ["rooms", this.room.name, "sources", source.id, "container"], _.get(container, "id"));
	}

	let position = source.pos.getOpenTile_Adjacent(true);
	position = position || source.pos.getOpenTile_Adjacent(false);
	position = position || source.pos;

	return {
		type: "harvest",
		resource: "energy",
		id: source.id,
		pos: position,
		timer: 9999,
		container: _.get(container, "id", null)
	};
};

Creep.prototype.getTask_Extract = function getTask_Extract() {
	if (!_.get(Memory, ["rooms", this.room.name, "defense", "is_safe"], true))
		return;

	let mineral = _.head(_.filter(this.room.find(FIND_MINERALS), m => {
		return m.mineralAmount > 0
			&& _.some(m.pos.lookFor("structure"), s => { return s.structureType == "extractor"; });
	}));

	if (mineral != null) {
		return {
			type: "harvest",
			resource: "mineral",
			id: mineral.id,
			timer: 9999
		};
	}
};

Creep.prototype.getTask_Industry_Withdraw = function getTask_Industry_Withdraw() {
	return _.head(_.sortBy(_.filter(_.get(Memory, ["rooms", this.room.name, "industry", "tasks"]),
		t => { return t.type == "withdraw"; }),
		t => { return t.priority; }));
};

Creep.prototype.getTask_Industry_Deposit = function getTask_Industry_Deposit() {
	let res = _.head(_.sortBy(Object.keys(this.carry), (c) => { return -this.carry[c]; }));
	return _.head(_.sortBy(_.filter(_.get(Memory, ["rooms", this.room.name, "industry", "tasks"]),
		t => { return t.type == "deposit" && t.resource == res; }),
		t => { return t.priority; }));

};

Creep.prototype.getTask_Wait = function getTask_Wait(ticks) {
	return {
		type: "wait",
		timer: ticks || 10
	};
};

Creep.prototype.getTask_Withdraw_Controller_Link = function getTask_Withdraw_Controller_Link() {
	if (!_.get(this.room, ["controller", "my"], false))
		return;

	// Find links near the controller that have energy
	let controllerLinks = _.filter(this.room.find(FIND_MY_STRUCTURES), s => {
		return s.structureType == "link" && s.energy > 0 
			&& s.pos.getRangeTo(this.room.controller.pos) <= 3
			&& _.some(_.get(Memory, ["rooms", this.room.name, "links"]),
				l => { return _.get(l, "id") == s.id && _.get(l, "dir") == "receive"; });
	});



	if (controllerLinks.length > 0) {
		let closestLink = _.head(_.sortBy(controllerLinks, link => {
			return link.pos.getRangeTo(this.room.controller.pos);
		}));
		
		return {
			type: "withdraw",
			structure: "link",
			resource: "energy",
			id: closestLink.id,
			timer: 60
		};
	}
};

Creep.prototype.getTask_Withdraw_Controller_Container = function getTask_Withdraw_Controller_Container() {
	if (!_.get(this.room, ["controller", "my"], false))
		return;

	// Find containers near the controller that have energy
	let controllerContainers = _.filter(this.room.find(FIND_STRUCTURES), s => {
		return s.structureType == "container" && s.store.energy > 0
			&& s.pos.getRangeTo(this.room.controller.pos) <= 3;
	});



	if (controllerContainers.length > 0) {
		let closestContainer = _.head(_.sortBy(controllerContainers, container => {
			return container.pos.getRangeTo(this.room.controller.pos);
		}));
		
		return {
			type: "withdraw",
			resource: "energy",
			id: closestContainer.id,
			timer: 60
		};
	}
};

Creep.prototype.getTask_Withdraw_Storage_Link = function getTask_Withdraw_Storage_Link() {
	if (!this.room.storage)
		return;

	// Only get energy from the link nearest to storage (within 3 tiles)
	let storageLinks = _.filter(this.room.find(FIND_MY_STRUCTURES), s => {
		return s.structureType == "link" && s.energy > 0 
			&& s.pos.getRangeTo(this.room.storage.pos) <= 3
			&& _.some(_.get(Memory, ["rooms", this.room.name, "links"]),
				l => { return _.get(l, "id") == s.id && _.get(l, "dir") == "receive"; });
	});

	if (storageLinks.length > 0) {
		let closestLink = _.head(_.sortBy(storageLinks, link => {
			return link.pos.getRangeTo(this.room.storage.pos);
		}));
		
		return {
			type: "withdraw",
			structure: "link",
			resource: "energy",
			id: closestLink.id,
			timer: 60
		};
	}
};

// Highway Mining Tasks


Creep.prototype.getTask_Highway_Attack_Power = function getTask_Highway_Attack_Power() {
	let highwayId = this.memory.highway_id;
	if (!highwayId) return;

	let highwayData = _.get(Memory, ["sites", "highway_mining", highwayId]);
	if (!highwayData) return;

	// If we're not in the target room, travel there immediately
	if (this.room.name !== highwayData.target_room) {
		return {
			type: "travel",
			destination: new RoomPosition(25, 25, highwayData.target_room),
			timer: 50
		};
	}

	// In target room - look for power bank
	let targetId = highwayData.resource_id;
	let target = null;
	
	if (targetId) {
		target = Game.getObjectById(targetId);
	}
	
	// If no target or target is invalid, search for power banks
	if (!target || target.structureType != STRUCTURE_POWER_BANK) {
		target = this.findValidPowerBank();
		
		if (target) {
			highwayData.resource_id = target.id;
			highwayData.last_discovery = Game.time;
			console.log(`<font color=\"#FFA500\">[Highway]</font> Attacker ${this.name} discovered power bank ${target.id} in ${this.room.name}`);
		} else {
			// No power banks found, mark as completed
			highwayData.state = "completed";
			console.log(`<font color=\"#FFA500\">[Highway]</font> No power banks found in ${this.room.name}, marking operation as completed for ${highwayId}`);
			return;
		}
	}

	// Check if power bank is depleted
	if (target.hits <= 0) {
		highwayData.state = "completed";
		console.log(`<font color=\"#FFA500\">[Highway]</font> Power bank ${target.id} depleted, marking operation as completed for ${highwayId}`);
		return;
	}

	// Attack the power bank
	if (this.pos.getRangeTo(target) > 1) {
		return {
			type: "travel",
			destination: target.pos,
			timer: 50
		};
	}

	return {
		type: "attack",
		target: target.id,
		timer: 10
	};
};

Creep.prototype.getTask_Highway_Harvest_Commodity = function getTask_Highway_Harvest_Commodity() {
	let highwayId = this.memory.highway_id;
	if (!highwayId) return;

	let highwayData = _.get(Memory, ["sites", "highway_mining", highwayId]);
	if (!highwayData) return;

	let targetId = highwayData.resource_id;
	
	// Improved resource discovery logic
	if (!targetId || this.shouldRediscoverResource(highwayData)) {
		// Only search if in the target room
		if (this.room.name === highwayData.target_room) {
			let deposit = this.findValidDeposit(highwayData.resource_type);
			if (deposit) {
				highwayData.resource_id = deposit.id;
				highwayData.last_discovery = Game.time;
				console.log(`<font color=\"#FFA500\">[Highway]</font> Burrower ${this.name} discovered deposit ${deposit.id} (${deposit.depositType}) in ${this.room.name}`);
				return this.getTask_Wait(1);
			} else {
				// Check if we should mark as completed due to no valid deposits
				if (this.shouldMarkCompleted(highwayData)) {
					highwayData.state = "completed";
					console.log(`<font color=\"#FFA500\">[Highway]</font> No valid deposits found in ${this.room.name}, marking operation as completed for ${highwayId}`);
					return;
				}
				console.log(`<font color=\"#FFA500\">[Highway]</font> Burrower ${this.name} could not find deposit of type ${highwayData.resource_type} in ${this.room.name}, waiting.`);
				return { type: "wait", ticks: 10 };
			}
		} else {
			// Not in target room, travel there
			return { type: "travel", destination: new RoomPosition(25, 25, highwayData.target_room), timer: 50 };
		}
	}

	let target = Game.getObjectById(targetId);
	if (!target || !target.depositType) {
		// Enhanced completion logic
		if (this.shouldMarkCompleted(highwayData)) {
			highwayData.state = "completed";
			console.log(`<font color=\"#FFA500\">[Highway]</font> Resource ${targetId} invalid or gone, marking operation as completed for ${highwayId}`);
		} else {
			console.log(`<font color=\"#FFA500\">[Highway]</font> Resource ${targetId} invalid or gone, but operation continues for ${highwayId}`);
		}
		return;
	}

	// Check if deposit is depleted
	if (target.ticksToDeposit <= 0) {
		highwayData.state = "completed";
		console.log(`<font color=\"#FFA500\">[Highway]</font> Deposit ${targetId} depleted, marking operation as completed for ${highwayId}`);
		return;
	}

	// Handle deposit cooldown
	if (target.cooldown > 0) {
		console.log(`<font color=\"#FFA500\">[Highway]</font> Deposit in cooldown (${target.cooldown} ticks), waiting`);
		return this.getTask_Wait(target.cooldown);
	}

		// --- Travel time tracking ---
	if (this.pos.getRangeTo(target) <= 1 && (!highwayData.travel_time || Game.time % 100 === 0)) {
		// Only recalculate every 100 ticks to avoid CPU spam
		let path = this.pos.findPathTo(new RoomPosition(25, 25, highwayData.colony), { ignoreCreeps: true });
		if (path && path.length > 0) {
			highwayData.travel_time = path.length;
			console.log(`<font color=\"#FFA500\">[Highway]</font> Travel time from deposit to colony: ${path.length} ticks`);
		}
	}

	if (this.pos.getRangeTo(target) > 1) {
		return {
			type: "travel",
			destination: target.pos,
			timer: 50
		};
	}

	// Track if this creep has ever harvested from the deposit
	if (!this.memory.hasHarvested) this.memory.hasHarvested = false;
	
	// If we're in range, return a harvest task
	if (this.pos.getRangeTo(target) <= 1) {
		return {
			type: "harvest",
			id: target.id,
			timer: 10
		};
	}
	
	// If we're not in range, travel to the target
	return {
		type: "travel",
		destination: target.pos,
		timer: 50
	};
};

// Helper function to determine if we should re-discover the resource
Creep.prototype.shouldRediscoverResource = function(highwayData) {
	// Re-discover if:
	// 1. No last discovery time (first time)
	// 2. Haven't discovered in the last 100 ticks
	// 3. Current target is invalid
	let lastDiscovery = highwayData.last_discovery || 0;
	let currentTarget = Game.getObjectById(highwayData.resource_id);
	
	let shouldRediscover = !lastDiscovery || 
		   (Game.time - lastDiscovery) > 100 || 
		   !currentTarget || 
		   !currentTarget.depositType; // Deposits have depositType, not structureType
	
	return shouldRediscover;
};

// Helper function to find a valid deposit
Creep.prototype.findValidDeposit = function(resourceType) {
    let deposits = this.room.find(FIND_DEPOSITS);
    if (deposits.length === 0) {
        console.log(`<font color=\"#FFA500\">[Highway]</font> No deposits found in ${this.room.name}`);
    } else {
        deposits.forEach(d => {
            console.log(`<font color=\"#FFA500\">[Highway]</font> Deposit ${d.id} type: ${d.depositType}, ticksToDecay: ${d.ticksToDecay}, cooldown: ${d.cooldown}`);
        });
    }
    let found = _.find(deposits, d => d.depositType === resourceType && d.ticksToDecay > 0);
    if (!found) {
        console.log(`<font color=\"#FFA500\">[Highway]</font> No deposit of type ${resourceType} found in ${this.room.name}`);
    }
    return found;
};

// Helper function to find a valid power bank
Creep.prototype.findValidPowerBank = function() {
    let powerBanks = this.room.find(FIND_STRUCTURES, {
        filter: s => s.structureType === STRUCTURE_POWER_BANK && s.hits > 0
    });
    
    if (powerBanks.length === 0) {
        console.log(`<font color=\"#FFA500\">[Highway]</font> No power banks found in ${this.room.name}`);
        return null;
    }
    
    // Return the power bank with the most hits (most valuable)
    let bestPowerBank = _.max(powerBanks, p => p.hits);
    console.log(`<font color=\"#FFA500\">[Highway]</font> Found power bank ${bestPowerBank.id} with ${bestPowerBank.hits} hits in ${this.room.name}`);
    return bestPowerBank;
};

// Helper function to determine if operation should be marked as completed
Creep.prototype.shouldMarkCompleted = function(highwayData) {
	// For highway mining, only mark as completed if:
	// 1. We've been trying for more than 1000 ticks without success (longer timeout)
	// 2. The resource was previously discovered but is now gone
	// 3. The deposit is truly depleted (handled elsewhere)
	
	// Do NOT use hasHarvested as a completion condition for highway mining
	// Highway mining should continue until the deposit is actually depleted
	
	let operationStart = highwayData.operation_start || Game.time;
	let timeElapsed = Game.time - operationStart;
	
	// Only mark as completed if we've been trying for a very long time without success
	// This prevents premature completion when creeps are just returning with resources
	return timeElapsed > 1000;
};

Creep.prototype.getTask_Highway_Carry_Resource = function getTask_Highway_Carry_Resource() {
	let highwayId = this.memory.highway_id;
	if (!highwayId) return;

	let highwayData = _.get(Memory, ["sites", "highway_mining", highwayId]);
	if (!highwayData) return;

	// If we have resources, return to colony 
	if (_.sum(this.carry) > 0) {
		console.log(`<font color=\"#FFA500\">[Highway]</font> Highway burrower ${this.name} carrying ${_.sum(this.carry)} resources, traveling to colony`);
		
		// Try to find storage first, then terminal
		let storage = Game.rooms[highwayData.colony] && Game.rooms[highwayData.colony].storage;
		let terminal = Game.rooms[highwayData.colony] && Game.rooms[highwayData.colony].terminal;
		
		if (storage && this.room.name === storage.pos.roomName && this.pos.isNearTo(storage)) {
			console.log(`<font color=\"#FFA500\">[Highway]</font> Highway burrower ${this.name} is adjacent to storage, depositing`);
			return {
				type: "deposit",
				resource: highwayData.resource_type,
				id: storage.id,
				timer: 60
			};
		} else if (terminal && this.room.name === terminal.pos.roomName && this.pos.isNearTo(terminal)) {
			console.log(`<font color=\"#FFA500\">[Highway]</font> Highway burrower ${this.name} is adjacent to terminal, depositing`);
			return {
				type: "deposit",
				resource: highwayData.resource_type,
				id: terminal.id,
				timer: 60
			};
		} else if (storage) {
			console.log(`<font color=\"#FFA500\">[Highway]</font> Highway burrower ${this.name} traveling directly to storage`);
			return {
				type: "travel",
				destination: storage.pos,
				timer: 100
			};
		} else if (terminal) {
			console.log(`<font color=\"#FFA500\">[Highway]</font> Highway burrower ${this.name} traveling directly to terminal`);
			return {
				type: "travel",
				destination: terminal.pos,
				timer: 100
			};
		} else {
			// Fallback to room center if no storage/terminal
			console.log(`<font color=\"#FFA500\">[Highway]</font> Highway burrower ${this.name} no storage/terminal found, traveling to room center`);
			return {
				type: "travel",
				destination: new RoomPosition(25, 25, highwayData.colony),
				timer: 100
			};
		}
	}

	// Find storage or terminal to deposit
	let storage = this.room.storage;
	if (storage) {
		console.log(`<font color=\"#FFA500\">[Highway]</font> Highway burrower ${this.name} depositing to storage`);
		return {
			type: "deposit",
			resource: highwayData.resource_type,
			id: storage.id,
			timer: 60
		};
	}
	let terminal = this.room.terminal;
	if (terminal) {
		console.log(`<font color=\"#FFA500\">[Highway]</font> Highway burrower ${this.name} depositing to terminal`);
		return {
			type: "deposit",
			resource: highwayData.resource_type,
			id: terminal.id,
			timer: 60
		};
	}

	// No valid deposit location for commodity
	console.log(`<font color=\"#FFA500\">[Highway]</font> Highway burrower ${this.name} no storage or terminal found for commodity, waiting`);
	return {
		type: "wait",
		ticks: 10
	};
};
