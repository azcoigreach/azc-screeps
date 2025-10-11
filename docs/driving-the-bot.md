# Driving the Bot: Core Console Commands

**Summary**: This is your hands-on guide to the most important console commands and daily workflows. Think of this as your "driver's manual" for operating the azc-screeps bot.

**When you need this**: Daily gameplay, expanding your empire, managing resources, or learning the most commonly-used commands.

**Prerequisites**: You've completed [Getting Started](getting-started.md) and have at least one running colony.

---

## The Command Philosophy

The azc-screeps bot operates on a **"set it and forget it"** principle:

1. **You issue a command** (e.g., start remote mining, produce batteries)
2. **The bot stores your intent in Memory** (persistent across ticks)
3. **The bot executes continuously** until you change or cancel the command

**Result**: Commands are more like "strategic orders" than "one-time actions". You don't micromanage—you set goals.

---

## Essential Daily Commands

These are the commands you'll use almost every play session.

### Discovery & Status

```javascript
// === See what commands are available ===
help();                // List all command categories
help("log");           // Show logging commands
help("empire");        // Show empire management commands

// === Check your empire's health ===
system_status();       // Overall dashboard (CPU, bucket, rooms, creeps)
factory_status();      // Factory production status
market_status();       // Market trades and energy status
```

**When to use**:
- `help()`: When you forget a command or want to explore features
- `system_status()`: Every session to see overall health
- `factory_status()`: When managing production (RCL 7+)
- `market_status()`: Before making market decisions

**Example Output** (`system_status()`):
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
  Structures: 47 / 60 available

W2N2 [RCL 4]
  Energy: 45000 / 80000 (56%)
  Creeps: 15 / 18 (83%)
  Structures: 28 / 30 available
```

---

### Logging Commands

```javascript
// === Get detailed logs ===
log.population();      // List all creeps by room and role
log.resources();       // Show energy and minerals in each room
log.can_build();       // Show available structures to build
log.construction();    // List all active construction sites
```

**When to use**:
- `log.population()`: When creeps aren't spawning as expected
- `log.resources()`: Planning resource distribution or market sales
- `log.can_build()`: Before manually placing structures
- `log.construction()`: Checking build progress

**Example Output** (`log.population()`):
```
=== POPULATION REPORT ===
W1N1: 28 creeps
  - Worker: 8
  - Miner: 4
  - Carrier: 6
  - Upgrader: 5
  - Repairer: 3
  - Courier: 2

W2N2: 15 creeps
  - Worker: 5
  - Miner: 3
  - Carrier: 4
  - Upgrader: 3
```

---

## Blueprint & Base Building

The bot auto-builds structures based on layouts, but you need to set the layout origin first.

### Setting Up a Base Layout

```javascript
// Define where your base starts (top-left spawn position)
blueprint.set_layout("W1N1", 25, 25, "default_horizontal");
```

**Parameters**:
- `rmName`: Room name (e.g., "W1N1")
- `originX`, `originY`: Top-left spawn coordinates (excluding walls)
- `layoutName`: One of:
  - `"default_horizontal"` – Standard spread (most common)
  - `"default_vertical"` – Tall layout
  - `"default_compact"` – Tight, efficient layout

**What happens**: Every 200-500 ticks, up to 5 construction sites are automatically placed. Workers build them.

---

### Blocking Obstructed Areas

If terrain blocks part of your layout:

```javascript
blueprint.block_area("W1N1", 10, 10, 15, 15);
```

This prevents wasted construction attempts.

---

### Forcing a Blueprint Update

If you modify a layout and want it applied immediately:

```javascript
blueprint.request("W1N1");
```

**Use case**: After blocking an area or changing the layout, force a re-check.

---

### Toggling Wall Construction

By default, the bot builds walls and ramparts. To disable (e.g., to prioritize RCL upgrades):

```javascript
blueprint.toggle_walls("W1N1");
```

Run again to re-enable.

---

## Expansion & Colonization

### Colonizing a New Room

When you're ready to claim a new room:

```javascript
empire.colonize("W1N1", "W2N1", {origin: {x: 25, y: 25}, name: "default_horizontal"});
```

**What happens**:
1. A colonizer creep spawns in `W1N1`
2. Travels to `W2N1` and claims the controller
3. The bot auto-spawns creeps for `W2N2` (assisted by `W1N1`)
4. The layout is applied at coordinates (25, 25)

**With Routing** (for distant rooms or complex paths):

```javascript
empire.colonize("W1N1", "W5N5", 
    {origin: {x: 25, y: 25}, name: "default_horizontal"},
    ["W1N1", "W2N2", "W3N3", "W4N4", "W5N5"]  // Path to follow
);
```

---

### Spawn Assistance (Multi-Room Spawning)

If a new colony needs help spawning creeps:

```javascript
empire.spawn_assist("W2N1", ["W1N1"], ["W1N1", "W2N1"]);
```

**Parameters**:
- `rmToAssist`: Room receiving help
- `[listRooms]`: Rooms that will help spawn
- `[listRoute]`: Path creeps take to the target room

**Use case**: New colonies (RCL 1-3) often can't spawn enough creeps alone. Nearby established colonies can help.

---

## Remote Mining

One of the most powerful features! See [Remote Mining](remote-mining.md) for full details.

### Starting a Remote Mine

```javascript
empire.remote_mining("W1N1", "W2N1");
```

**What happens**:
- Miners and carriers spawn in `W1N1`
- Travel to `W2N1` and harvest both sources
- Return energy to `W1N1` storage
- Population auto-adjusts to source count

---

### Remote Mining with Source Keepers

For rooms with source keepers (SK rooms):

```javascript
empire.remote_mining("W1N1", "W5N5", true);  // true = has keepers
```

**What happens**:
- Soldier creeps spawn to kill source keepers
- Miners wait until soldiers clear the area
- Higher CPU and spawn burden

---

### Remote Mining with Routing

If the path crosses hostile or complex rooms:

```javascript
empire.remote_mining("W1N1", "W8N8", false, ["W1N1", "W2N3", "W5N5", "W8N8"]);
```

---

## Economy & Resource Management

### Factory Production

**Setting a Production Target** (RCL 7+):

```javascript
factories.set_production("battery", 1000, 30);
```

**Parameters**:
- `commodity`: What to produce (e.g., "battery", "wire", "transistor")
- `amount`: Target quantity
- `priority`: Lower = higher priority (1-100)

**What happens**:
- The bot assigns a factory to this commodity
- Couriers load components from storage
- Factory operators move produced items to storage
- Production continues until target is reached

**Example Session**:

```javascript
// Start producing basic components
factories.set_production("battery", 1000, 30);
factories.set_production("wire", 500, 40);

// Check progress
factory_status();

// Clear a target when done
factories.clear_production("battery");

// Clear everything
factories.clear_all();
```

---

### Lab Reactions

**Setting a Mineral Target**:

```javascript
resources.lab_target("XGH2O", 5000, 10);
```

**What happens**:
- Labs are assigned reactions to produce `XGH2O`
- Couriers ship reagents between rooms via terminals
- Reactions run automatically until 5000 units produced

---

### Market Automation

**Auto-Sell Excess Resources**:

```javascript
resources.market_cap("U", 10000);  // Sell U above 10,000 units
```

**Set Emergency Energy Threshold**:

```javascript
resources.set_energy_threshold(50000);
```

If any room drops below 50k energy, the bot buys energy from the market.

**Check Market Status**:

```javascript
market_status();
```

**Example Output**:
```
=== MARKET STATUS ===
Credits: 125,430
Energy Threshold: 50,000

Room: W1N1
  Energy: 245,000 ✅
  Minerals: U: 12,000 (selling excess)

Room: W2N1
  Energy: 38,000 ⚠️ (below threshold, buying energy)
```

---

### Manual Market Orders

**Buy Energy**:

```javascript
resources.market_buy("energy_purchase", "order_id_here", "W1N1", 10000);
```

**Sell Minerals**:

```javascript
resources.market_sell("mineral_sale", "order_id_here", "W1N1", 5000);
```

---

## Defense & Allies

### Managing Allies

Allies' creeps won't trigger tower defenses.

```javascript
// Add one ally
allies.add("PlayerName");

// Add multiple allies
allies.add_list(["Ally1", "Ally2", "Ally3"]);

// Remove an ally
allies.remove("ExAlly");

// Clear all allies
allies.clear();
```

**⚠️ Warning**: Only add players you trust! Allies can access your rooms.

---

### Setting Wall/Rampart Targets

```javascript
empire.wall_target(5000000);  // 5M HP target for all walls/ramparts
```

**Default Scaling** (if not set manually):
- RCL 1-2: 10k HP
- RCL 3-4: 100k HP
- RCL 5-6: 1M HP
- RCL 7-8: 5M HP

**Use case**: Prioritize energy for upgrades or production by lowering wall targets early.

---

## Performance Management

### CPU Profiling

**Start Profiling**:

```javascript
profiler.run(100);  // Profile for 100 ticks
```

**Analyze Results**:

```javascript
profiler.analyze();
```

**Example Output**:
```
=== PROFILER ANALYSIS ===
Total Cycles: 100
Average CPU: 22.3 / 100 (22.3%)
Peak CPU: 45.2

=== TOP CPU CONSUMERS ===
1. Control.runColonies: 5.2 avg, 520 total
2. Visuals: 4.1 avg, 410 total
3. Control.processSpawnRequests: 3.5 avg, 350 total
4. Blueprint.Init: 2.8 avg, 280 total

⚠️ Hotspots (>0.5 CPU avg):
  - Control.runColonies (5.2)
  - Visuals (4.1)
  - Control.processSpawnRequests (3.5)

💡 Recommendations:
  - Reduce visual update frequency
  - Limit remote mining operations
  - Check for pathfinding issues
```

**Stop Profiling Early**:

```javascript
profiler.stop();
```

---

### Visual Performance Controls

Visuals (room overlays) can be CPU-intensive. Control how often they update:

```javascript
// Update every 10 ticks (reduces CPU by ~50%)
visuals.set_performance(10);

// Check current setting
visuals.get_performance();

// Clear cached visuals (if they seem stale)
visuals.clear_cache();
```

**Recommended Settings**:
- **CPU < 60%**: 5 ticks (default)
- **CPU 60-80%**: 10 ticks
- **CPU > 80%**: 15-20 ticks

---

## Combat Operations

**Note**: Full combat details are in `help("empire")`. Here's a quick overview.

### Basic Attack

```javascript
empire.combat_trickle("W1N1", "W5N5", "standard_army");
```

**What happens**:
- Attack creeps spawn in `W1N1`
- They trickle into `W5N5` one by one as they spawn
- Continue until you cancel or enemy is defeated

---

### Occupying a Room

```javascript
empire.combat_occupy("W1N1", "W5N5", "occupation_force");
```

Maintains a continuous presence in the target room.

---

### Tower Drain Tactic

```javascript
empire.combat_tower_drain("W1N1", "W5N5");
```

**What happens**:
- Tanks and healers rally outside `W5N5`
- Tanks enter, absorb tower fire, retreat
- Healers restore them
- Drains enemy towers' energy

---

## Daily Workflows

### Morning Check-In (5 Minutes)

```javascript
// 1. System health
system_status();

// 2. Resource overview
log.resources();

// 3. Factory progress (if applicable)
factory_status();

// 4. CPU check
profiler.run(50);  // Run in background, check later
```

---

### Expanding to a New Room (10 Minutes)

```javascript
// 1. Scout the target room manually or with a scout creep
// 2. Decide on layout and origin (plan on paper or in-game)

// 3. Colonize
empire.colonize("W1N1", "W2N1", {origin: {x: 25, y: 25}, name: "default_horizontal"});

// 4. Set up remote mining to support the new colony
empire.remote_mining("W1N1", "W2N2");  // Adjacent room
empire.remote_mining("W1N1", "W3N1");  // Another adjacent room

// 5. Monitor spawn assistance
log.population();  // Check if creeps are spawning
```

---

### Setting Up Factory Production (5 Minutes)

```javascript
// 1. Check current factories
factory_status();

// 2. Set initial targets (start simple)
factories.set_production("battery", 1000, 10);
factories.set_production("wire", 500, 20);

// 3. Monitor progress over next 100-200 ticks
// 4. Add more targets as capacity allows
```

---

### Recovering from Low Energy (Emergency)

```javascript
// 1. Check which rooms are low
log.resources();

// 2. Set emergency threshold
resources.set_energy_threshold(50000);

// 3. Manually buy energy if needed
// (Find a buy order on the market, copy order ID)
resources.market_buy("emergency_energy", "order_id", "W1N1", 50000);

// 4. Temporarily pause non-critical operations
// (Reduce remote mining, pause factory production)
```

---

## Command Quick Reference

| Category | Command | Purpose |
|----------|---------|---------|
| **Discovery** | `help()` | List all commands |
| | `help("log")` | Show logging commands |
| **Status** | `system_status()` | Overall health dashboard |
| | `factory_status()` | Factory production status |
| | `market_status()` | Market and energy status |
| **Logging** | `log.population()` | List all creeps |
| | `log.resources()` | Show energy/minerals |
| | `log.construction()` | Active construction sites |
| **Blueprint** | `blueprint.set_layout(room, x, y, layout)` | Set base origin |
| | `blueprint.block_area(room, x1, y1, x2, y2)` | Block construction area |
| **Expansion** | `empire.colonize(from, to, layout, [route])` | Claim new room |
| | `empire.remote_mining(colony, target, [hasKeepers])` | Start remote mining |
| **Economy** | `factories.set_production(item, amt, pri)` | Produce commodity |
| | `resources.lab_target(mineral, amt, pri)` | Set lab reaction |
| | `resources.market_cap(resource, cap)` | Auto-sell excess |
| **Performance** | `profiler.run(cycles)` | Start CPU profiling |
| | `profiler.analyze()` | Analyze profiling data |
| | `visuals.set_performance(ticks)` | Set visual frequency |
| **Defense** | `allies.add(name)` | Add an ally |
| | `empire.wall_target(hp)` | Set wall HP target |

---

## Tips & Tricks

💡 **Use Tab Completion**: In the Screeps console, press `Tab` to auto-complete commands.

💡 **Bookmark Common Commands**: Keep a text file with your most-used commands for quick copy-paste.

💡 **Monitor CPU Bucket**: If it drops below 5000, reduce operations (pause remote mines, lower visual frequency).

💡 **Start Small**: Don't set up 5 remote mines at once. Add 1-2, monitor CPU, then expand.

💡 **Check `help()` Categories**: Explore `help("empire")`, `help("factories")`, etc. for specialized commands.

---

## Next Steps

- **Learn Remote Mining Details**: [Remote Mining](remote-mining.md)
- **Optimize Performance**: [Performance and CPU](performance-and-cpu.md)
- **Configure Advanced Settings**: [Configuration](configuration.md)
- **Troubleshoot Issues**: [Maintenance and Debugging](maintenance-and-debug.md)

---

**You're now ready to drive your empire!** 🎮

