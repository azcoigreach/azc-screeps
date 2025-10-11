# Command Reference

**Summary**: Alphabetical reference of all console commands with parameters, examples, and expected behavior.

**When you need this**: Quick lookup for command syntax, discovering available commands, or verifying parameters.

**Prerequisites**: None – this is a reference guide.

---

## How to Use This Reference

- **Alphabetical Order**: Commands listed A-Z by namespace
- **Copy-Paste Ready**: All examples can be copied directly to console
- **Parameters**: Required parameters in `angle brackets`, optional in `[square brackets]`
- **Quick Search**: Use Ctrl+F / Cmd+F to find specific commands

---

## A

### allies.add(playerName)

**Purpose**: Add a player to your ally list (won't be attacked by towers).

**Parameters**:
- `playerName` (string): Exact player name (case-sensitive)

**Example**:
```javascript
allies.add("FriendlyPlayer");
```

**Output**:
```
[Console] Player FriendlyPlayer added to ally list.
```

---

### allies.add_list([playerNames])

**Purpose**: Add multiple players to ally list at once.

**Parameters**:
- `playerNames` (array): Array of player name strings

**Example**:
```javascript
allies.add_list(["Ally1", "Ally2", "Ally3"]);
```

**Output**:
```
[Console] Players added to ally list.
```

---

### allies.remove(playerName)

**Purpose**: Remove a player from ally list.

**Parameters**:
- `playerName` (string): Player name to remove

**Example**:
```javascript
allies.remove("ExAlly");
```

**Output**:
```
[Console] Player ExAlly removed from ally list.
```

---

### allies.clear()

**Purpose**: Remove all players from ally list.

**Parameters**: None

**Example**:
```javascript
allies.clear();
```

**Output**:
```
[Console] Ally list cleared.
```

---

## B

### blueprint.set_layout(roomName, originX, originY, layoutName)

**Purpose**: Set base layout for automatic construction.

**Parameters**:
- `roomName` (string): Room name (e.g., "W1N1")
- `originX` (integer): Top-left spawn X coordinate
- `originY` (integer): Top-left spawn Y coordinate
- `layoutName` (string): "default_horizontal", "default_vertical", or "default_compact"

**Example**:
```javascript
blueprint.set_layout("W1N1", 25, 25, "default_horizontal");
```

**Output**:
```
[Console] Blueprint layout set for W1N1.
```

---

### blueprint.block(roomName, x, y)

**Purpose**: Block a single coordinate from construction.

**Parameters**:
- `roomName` (string): Room name
- `x` (integer): X coordinate
- `y` (integer): Y coordinate

**Example**:
```javascript
blueprint.block("W1N1", 15, 20);
```

**Output**:
```
[Console] Blueprint position blocked for W1N1 at (15, 20).
```

---

### blueprint.block_area(roomName, startX, startY, endX, endY)

**Purpose**: Block a rectangular area from construction.

**Parameters**:
- `roomName` (string): Room name
- `startX`, `startY` (integer): Top-left corner
- `endX`, `endY` (integer): Bottom-right corner

**Example**:
```javascript
blueprint.block_area("W1N1", 10, 10, 15, 15);
```

**Output**:
```
[Console] Blueprint area blocked for W1N1 from (10, 10) to (15, 15).
```

---

### blueprint.request(roomName)

**Purpose**: Force blueprint to run immediately for a specific room.

**Parameters**:
- `roomName` (string): Room name

**Example**:
```javascript
blueprint.request("W1N1");
```

**Output**:
```
[Console] Setting Blueprint() request for W1N1; Blueprint() will run this request next tick.
```

---

### blueprint.reset()

**Purpose**: Reset blueprint cycle timings (forces blueprint to run next tick).

**Parameters**: None

**Example**:
```javascript
blueprint.reset();
```

**Output**:
```
[Console] Resetting Blueprint() cycles; Blueprint() will initiate next tick.
```

---

### blueprint.toggle_walls(roomName)

**Purpose**: Enable/disable wall and rampart construction for a room.

**Parameters**:
- `roomName` (string): Room name

**Example**:
```javascript
blueprint.toggle_walls("W1N1");
```

**Output**:
```
[Console] Blueprint placing defensive walls and ramparts: true
```

---

### blueprint.redefine_links()

**Purpose**: Force re-calculation of link assignments for all rooms.

**Parameters**: None

**Example**:
```javascript
blueprint.redefine_links();
```

**Output**:
```
[Console] Resetting all link definitions; will redefine next tick.
```

---

## E

### empire.colonize(roomFrom, roomTarget, layout, [listRoute])

**Purpose**: Send a colonizer to claim a new room.

**Parameters**:
- `roomFrom` (string): Colony sending the colonizer
- `roomTarget` (string): Room to claim
- `layout` (object): `{origin: {x, y}, name: "layoutName"}`
- `listRoute` (array, optional): Path to follow (e.g., ["W1N1", "W2N1", "W3N1"])

**Example**:
```javascript
empire.colonize("W1N1", "W3N3", {origin: {x: 25, y: 25}, name: "default_horizontal"});
```

**With Routing**:
```javascript
empire.colonize("W1N1", "W5N5", 
    {origin: {x: 25, y: 25}, name: "default_horizontal"},
    ["W1N1", "W2N2", "W3N3", "W4N4", "W5N5"]
);
```

**Output**:
```
[Console] Colonization request added for W3N3 from W1N1.
```

---

### empire.remote_mining(colonyRoom, targetRoom, [hasKeepers], [listRoute], [spawnAssistRooms], [customPopulation])

**Purpose**: Start a remote mining operation.

**Parameters**:
- `colonyRoom` (string): Home colony
- `targetRoom` (string): Room to mine
- `hasKeepers` (boolean, optional): True if SK room (default false)
- `listRoute` (array, optional): Path to follow
- `spawnAssistRooms` (array, optional): Rooms helping with spawning
- `customPopulation` (object, optional): Custom creep population

**Example** (basic):
```javascript
empire.remote_mining("W1N1", "W2N1");
```

**Example** (with SK and routing):
```javascript
empire.remote_mining("W1N1", "W7N7", true, ["W1N1", "W3N3", "W5N5", "W7N7"]);
```

**Output**:
```
[Console] Remote mining added for W2N1 (colony: W1N1).
```

---

### empire.spawn_assist(roomToAssist, [listRooms], [listRoute])

**Purpose**: Configure spawn assistance for a room.

**Parameters**:
- `roomToAssist` (string): Room receiving help
- `listRooms` (array): Rooms that will help spawn
- `listRoute` (array): Path for spawned creeps

**Example**:
```javascript
empire.spawn_assist("W2N1", ["W1N1"], ["W1N1", "W2N1"]);
```

**Output**:
```
[Console] Spawn assistance configured for W2N1.
```

---

### empire.wall_target(hitpoints)

**Purpose**: Set HP target for all walls and ramparts (empire-wide).

**Parameters**:
- `hitpoints` (integer): Target HP (e.g., 1000000 = 1M)

**Example**:
```javascript
empire.wall_target(5000000);  // 5M HP
```

**Output**:
```
[Console] Wall HP target set to 5,000,000.
```

---

### empire.combat_trickle(roomFrom, roomTarget, armyType)

**Purpose**: Attack a room with creeps trickling in one by one.

**Parameters**:
- `roomFrom` (string): Colony sending attackers
- `roomTarget` (string): Room to attack
- `armyType` (string): Army composition (e.g., "standard_army")

**Example**:
```javascript
empire.combat_trickle("W1N1", "W5N5", "standard_army");
```

**Output**:
```
[Console] Trickle attack initiated from W1N1 to W5N5.
```

---

### empire.combat_wave(roomFrom, roomTarget, rallyPoint, armyType)

**Purpose**: Attack with a coordinated wave (creeps rally first, then attack together).

**Parameters**:
- `roomFrom` (string): Colony sending attackers
- `roomTarget` (string): Room to attack
- `rallyPoint` (string): Room to rally in
- `armyType` (string): Army composition

**Example**:
```javascript
empire.combat_wave("W1N1", "W5N5", "W3N3", "standard_army");
```

---

### empire.combat_occupy(roomFrom, roomTarget, armyType)

**Purpose**: Maintain an occupation force in a room.

**Parameters**:
- `roomFrom` (string): Colony sending occupiers
- `roomTarget` (string): Room to occupy
- `armyType` (string): Army composition

**Example**:
```javascript
empire.combat_occupy("W1N1", "W5N5", "occupation_force");
```

---

### empire.combat_tower_drain(roomFrom, roomTarget)

**Purpose**: Drain enemy towers by tanking and healing.

**Parameters**:
- `roomFrom` (string): Colony sending tanks/healers
- `roomTarget` (string): Enemy room

**Example**:
```javascript
empire.combat_tower_drain("W1N1", "W5N5");
```

---

### empire.combat_dismantle(roomFrom, roomTarget)

**Purpose**: Send dismantlers to remove structures.

**Parameters**:
- `roomFrom` (string): Colony sending dismantlers
- `roomTarget` (string): Room to dismantle

**Example**:
```javascript
empire.combat_dismantle("W1N1", "W5N5");
```

---

### empire.combat_controller(roomFrom, roomTarget)

**Purpose**: Attack enemy controller to speed up downgrade.

**Parameters**:
- `roomFrom` (string): Colony sending attackers
- `roomTarget` (string): Room to attack

**Example**:
```javascript
empire.combat_controller("W1N1", "W5N5");
```

---

## F

### factories.set_production(commodity, amount, priority)

**Purpose**: Set a production target for factories.

**Parameters**:
- `commodity` (string): Commodity name (e.g., "battery", "wire")
- `amount` (integer): Target quantity
- `priority` (integer): 1-100 (lower = higher priority)

**Example**:
```javascript
factories.set_production("battery", 1000, 30);
```

**Output**:
```
[Console] battery production target set to 1000 (priority 30).
```

---

### factories.clear_production(commodity)

**Purpose**: Remove a production target.

**Parameters**:
- `commodity` (string): Commodity to stop producing

**Example**:
```javascript
factories.clear_production("battery");
```

**Output**:
```
[Console] battery production target cleared.
```

---

### factories.clear_all()

**Purpose**: Remove all production targets.

**Parameters**: None

**Example**:
```javascript
factories.clear_all();
```

**Output**:
```
[Console] All factory production targets cleared.
```

---

### factories.status()

**Purpose**: Show factory production status.

**Parameters**: None

**Example**:
```javascript
factories.status();
```

**Output**: (See [Driving the Bot](driving-the-bot.md) for example output)

---

### factory_status()

**Purpose**: Alias for `factories.status()`.

**Parameters**: None

**Example**:
```javascript
factory_status();
```

---

## H

### help([category])

**Purpose**: Show available commands and categories.

**Parameters**:
- `category` (string, optional): Specific help category (e.g., "log", "empire", "factories")

**Example**:
```javascript
help();           // Show all categories
help("log");      // Show logging commands
help("factories"); // Show factory commands
```

**Output**:
```
List of help() arguments:
- "allies"     Manage ally list
- "blueprint"  Settings for automatic base building
- "empire"     Miscellaneous empire and colony management
...
```

---

## L

### log.population()

**Purpose**: List all creeps by room and role.

**Parameters**: None

**Example**:
```javascript
log.population();
```

**Output**:
```
=== POPULATION REPORT ===
W1N1: 28 creeps
  - Worker: 8
  - Miner: 4
  - Carrier: 6
...
```

---

### log.resources()

**Purpose**: Show energy and minerals in each room.

**Parameters**: None

**Example**:
```javascript
log.resources();
```

**Output**:
```
=== RESOURCES ===
W1N1 (Colony):
  Energy: 245,000 / 300,000
  Minerals: U: 12,000, L: 8,500
...
```

---

### log.can_build()

**Purpose**: Show available structures to build by room.

**Parameters**: None

**Example**:
```javascript
log.can_build();
```

**Output**:
```
=== AVAILABLE STRUCTURES ===
W1N1 [RCL 6]:
  Extensions: 40 / 40 (max)
  Towers: 3 / 3 (max)
  Labs: 2 / 6 (4 more available)
...
```

---

### log.construction()

**Purpose**: List all active construction sites.

**Parameters**: None

**Example**:
```javascript
log.construction();
```

**Output**:
```
=== CONSTRUCTION SITES ===
W1N1:
  - Extension at (25, 30): 50% complete
  - Tower at (20, 20): 10% complete
...
```

---

## M

### market_status()

**Purpose**: Show market operations and energy status.

**Parameters**: None

**Example**:
```javascript
market_status();
```

**Output**:
```
=== MARKET STATUS ===
Credits: 125,430
Energy Threshold: 50,000

Room: W1N1
  Energy: 245,000 ✅
  Minerals: U: 12,000 (selling excess)
...
```

---

## P

### profiler.run(cycles)

**Purpose**: Start CPU profiling for specified number of ticks.

**Parameters**:
- `cycles` (integer): Number of ticks to profile

**Example**:
```javascript
profiler.run(100);
```

**Output**:
```
[Profiler] Started profiling for 100 ticks.
```

---

### profiler.stop()

**Purpose**: Stop profiling early.

**Parameters**: None

**Example**:
```javascript
profiler.stop();
```

**Output**:
```
[Profiler] Profiling stopped.
```

---

### profiler.analyze()

**Purpose**: Analyze profiling data and show results.

**Parameters**: None

**Example**:
```javascript
profiler.analyze();
```

**Output**: (See [Performance and CPU](performance-and-cpu.md) for example output)

---

## R

### resources.lab_target(mineral, amount, priority)

**Purpose**: Set a lab reaction target.

**Parameters**:
- `mineral` (string): Compound to produce (e.g., "GH2O", "XGH2O")
- `amount` (integer): Target quantity
- `priority` (integer): 1-100 (lower = higher priority)

**Example**:
```javascript
resources.lab_target("XGH2O", 5000, 10);
```

**Output**:
```
[Console] Lab target set for XGH2O: 5000 (priority 10).
```

---

### resources.send(orderName, roomFrom, roomTo, resource, amount)

**Purpose**: Send resources between rooms (or to allies).

**Parameters**:
- `orderName` (string): Unique order identifier
- `roomFrom` (string): Source room
- `roomTo` (string): Destination room
- `resource` (string): Resource type (e.g., "energy", "U")
- `amount` (integer): Quantity to send

**Example**:
```javascript
resources.send("energy_transfer", "W1N1", "W2N2", "energy", 50000);
```

**Output**:
```
[Console] Terminal order added: energy_transfer.
```

---

### resources.market_cap(resource, capAmount)

**Purpose**: Auto-sell resource when it exceeds cap.

**Parameters**:
- `resource` (string): Resource type
- `capAmount` (integer): Sell when above this amount

**Example**:
```javascript
resources.market_cap("U", 10000);
```

**Output**:
```
[Console] Market cap set for U: 10,000.
```

---

### resources.market_buy(orderName, marketOrderId, roomTo, amount)

**Purpose**: Buy resources from market.

**Parameters**:
- `orderName` (string): Your order identifier
- `marketOrderId` (string): Market order ID (from Screeps market)
- `roomTo` (string): Destination room
- `amount` (integer): Quantity to buy

**Example**:
```javascript
resources.market_buy("buy_energy", "order_id_12345", "W1N1", 10000);
```

---

### resources.market_sell(orderName, marketOrderId, roomFrom, amount)

**Purpose**: Sell resources on market.

**Parameters**:
- `orderName` (string): Your order identifier
- `marketOrderId` (string): Market order ID
- `roomFrom` (string): Source room
- `amount` (integer): Quantity to sell

**Example**:
```javascript
resources.market_sell("sell_u", "order_id_67890", "W1N1", 5000);
```

---

### resources.overflow_cap(capAmount)

**Purpose**: Set energy overflow threshold (auto-balance between rooms).

**Parameters**:
- `capAmount` (integer): Overflow energy above this amount

**Example**:
```javascript
resources.overflow_cap(400000);
```

**Output**:
```
[Console] Energy overflow cap set to 400,000.
```

---

### resources.set_energy_threshold(amount)

**Purpose**: Set emergency energy buy threshold.

**Parameters**:
- `amount` (integer): Buy energy if room drops below this

**Example**:
```javascript
resources.set_energy_threshold(50000);
```

**Output**:
```
[Console] Emergency energy threshold set to 50,000.
```

---

### resources.credits()

**Purpose**: Show current market credits.

**Parameters**: None

**Example**:
```javascript
resources.credits();
```

**Output**:
```
[Console] Market Credits: 125,430
```

---

### resources.market_status()

**Purpose**: Alias for `market_status()`.

**Parameters**: None

**Example**:
```javascript
resources.market_status();
```

---

## S

### system_status()

**Purpose**: Show overall system health (CPU, bucket, rooms, creeps).

**Parameters**: None

**Example**:
```javascript
system_status();
```

**Output**:
```
=== SYSTEM STATUS ===
Game Time: 12345678
CPU Used: 18.5 / 100 (18.5%)
CPU Bucket: 9850 / 10000
Memory Usage: 3.2 MB

=== ROOMS ===
W1N1 [RCL 6]
  Energy: 245000 / 300000 (82%)
  Creeps: 28 / 30 (93%)
...
```

---

## V

### visuals.set_performance(ticks)

**Purpose**: Set visual update frequency.

**Parameters**:
- `ticks` (integer): Update interval (e.g., 5, 10, 20)

**Example**:
```javascript
visuals.set_performance(10);
```

**Output**:
```
[Console] Visual performance set to update every 10 ticks.
```

---

### visuals.get_performance()

**Purpose**: Show current visual performance setting.

**Parameters**: None

**Example**:
```javascript
visuals.get_performance();
```

**Output**:
```
[Console] Visuals update every 10 ticks.
```

---

### visuals.clear_cache()

**Purpose**: Clear cached visual data (forces refresh).

**Parameters**: None

**Example**:
```javascript
visuals.clear_cache();
```

**Output**:
```
[Console] Visual cache cleared.
```

---

## Quick Command Categories

### Discovery
- `help()`
- `help("category")`

### Status Dashboards
- `system_status()`
- `factory_status()`
- `market_status()`

### Logging
- `log.population()`
- `log.resources()`
- `log.can_build()`
- `log.construction()`

### Base Building
- `blueprint.set_layout(...)`
- `blueprint.block_area(...)`
- `blueprint.toggle_walls(...)`

### Expansion
- `empire.colonize(...)`
- `empire.remote_mining(...)`
- `empire.spawn_assist(...)`

### Economy
- `factories.set_production(...)`
- `factories.clear_all()`
- `resources.lab_target(...)`
- `resources.market_cap(...)`

### Performance
- `profiler.run(...)`
- `profiler.analyze()`
- `visuals.set_performance(...)`

### Defense
- `allies.add(...)`
- `empire.wall_target(...)`
- `empire.combat_*(...)`

---

## Next Steps

- **Learn Core Commands**: [Driving the Bot](driving-the-bot.md)
- **Troubleshoot**: [Maintenance and Debugging](maintenance-and-debug.md)
- **Advanced Config**: [Configuration](configuration.md)

---

**Command reference complete!** 📖

