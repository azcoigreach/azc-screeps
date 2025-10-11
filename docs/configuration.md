# Configuration: Memory Structure & Settings

**Summary**: This guide covers the bot's Memory structure, configuration keys, safe defaults, per-room overrides, and advanced tuning options for experienced players.

**When you need this**: Advanced customization, troubleshooting Memory issues, understanding how the bot stores persistent data, or implementing custom behaviors.

**Prerequisites**: Understanding of JavaScript objects, Screeps Memory API, and basic console usage.

---

## Memory Architecture Overview

The bot stores all persistent data in `Memory`, a JSON-serializable object that persists across ticks and server restarts.

**Top-Level Structure**:
```javascript
Memory = {
    hive: { /* Empire-wide settings */ },
    rooms: { /* Per-room data */ },
    sites: { /* Colony, mining, combat sites */ },
    resources: { /* Factories, labs, market */ },
    creeps: { /* Creep-specific data (auto-cleaned) */ },
    // ... other keys
}
```

---

## Empire-Wide Settings (Memory.hive)

`Memory.hive` stores configuration that applies to your entire empire.

### Key Fields

```javascript
Memory.hive = {
    allies: [],                  // List of ally player names
    pulses: {},                  // Pulse timing data (internal)
    pause: { bucket: false },    // Pause flags (internal)
    spawn_requests: [],          // Spawn queue (internal)
    visuals: {
        update_interval: 5       // Visual update frequency (ticks)
    }
};
```

---

### Allies List

**Path**: `Memory.hive.allies`

**Type**: Array of strings

**Example**:
```javascript
Memory.hive.allies = ["Ally1", "Ally2", "Ally3"];
```

**Console Commands**:
```javascript
allies.add("PlayerName");
allies.remove("PlayerName");
allies.clear();
```

**Use Case**: Players on this list won't trigger tower defenses.

---

### Visual Update Interval

**Path**: `Memory.hive.visuals.update_interval`

**Type**: Integer (ticks)

**Default**: 5 ticks

**Example**:
```javascript
Memory.hive.visuals.update_interval = 10;  // Update every 10 ticks
```

**Console Command**:
```javascript
visuals.set_performance(10);
```

**Use Case**: Reduce CPU by updating room visuals less frequently.

---

## Per-Room Settings (Memory.rooms)

`Memory.rooms[roomName]` stores configuration for individual rooms.

### Key Fields

```javascript
Memory.rooms["W1N1"] = {
    layout: {
        origin: { x: 25, y: 25 },        // Base layout origin (top-left spawn)
        name: "default_horizontal",      // Layout name
        place_defenses: true,            // Whether to build walls/ramparts
        blocked_areas: []                // Areas blocked from construction
    },
    wall_target: 1000000,                // HP target for walls/ramparts
    spawn_assist: {
        rooms: ["W2N1"],                 // Rooms that help spawn creeps
        list_route: ["W1N1", "W2N1"]     // Path for assisted creeps
    },
    links: {},                           // Link assignments (internal)
    population: null                     // Custom population (advanced)
};
```

---

### Base Layout Configuration

**Path**: `Memory.rooms[roomName].layout`

**Setting Layout via Console**:
```javascript
blueprint.set_layout("W1N1", 25, 25, "default_horizontal");
```

**Manual Memory Edit**:
```javascript
Memory.rooms["W1N1"].layout = {
    origin: { x: 25, y: 25 },
    name: "default_horizontal",
    place_defenses: true,
    blocked_areas: []
};
```

**Available Layouts**:
- `"default_horizontal"` – Standard horizontal spread
- `"default_vertical"` – Vertical layout
- `"default_compact"` – Compact design

---

### Blocking Construction Areas

**Path**: `Memory.rooms[roomName].layout.blocked_areas`

**Type**: Array of `{ start: {x, y}, end: {x, y} }` objects

**Console Command**:
```javascript
blueprint.block_area("W1N1", 10, 10, 15, 15);
```

**Manual Memory Edit**:
```javascript
Memory.rooms["W1N1"].layout.blocked_areas = [
    { start: { x: 10, y: 10 }, end: { x: 15, y: 15 } },
    { start: { x: 20, y: 20 }, end: { x: 25, y: 25 } }
];
```

**Use Case**: Prevent construction on terrain walls or pre-existing structures.

---

### Wall/Rampart HP Target

**Path**: `Memory.rooms[roomName].wall_target`

**Type**: Integer (HP)

**Default**: Scales with RCL (10k → 5M)

**Console Command** (empire-wide):
```javascript
empire.wall_target(5000000);
```

**Per-Room Override**:
```javascript
Memory.rooms["W1N1"].wall_target = 3000000;  // 3M HP for W1N1 only
```

**Use Case**: Prioritize different defense levels for different rooms (e.g., frontline vs. core rooms).

---

### Spawn Assistance

**Path**: `Memory.rooms[roomName].spawn_assist`

**Type**: Object with `rooms` (array) and `list_route` (array)

**Console Command**:
```javascript
empire.spawn_assist("W2N1", ["W1N1"], ["W1N1", "W2N1"]);
```

**Manual Memory Edit**:
```javascript
Memory.rooms["W2N1"].spawn_assist = {
    rooms: ["W1N1"],                     // W1N1 helps spawn creeps for W2N1
    list_route: ["W1N1", "W2N1"]         // Path creeps take from W1N1 to W2N1
};
```

**Use Case**: New colonies with insufficient spawn capacity can get help from established colonies.

---

### Custom Population (Advanced)

**Path**: `Memory.rooms[roomName].population`

**Type**: Object defining creep roles, counts, body types, and levels

**⚠️ Warning**: If you set a custom population, you **must** define ALL roles (workers, miners, carriers, etc.). Incomplete definitions will break spawning.

**Example**:
```javascript
Memory.rooms["W1N1"].population = {
    colony: {
        workers: { count: 5, body: "worker", level: 6 },
        repairers: { count: 2, body: "worker", level: 5 },
        upgraders: { count: 8, body: "worker", level: 6 }
    },
    mining: {
        burrowers: { count: 4, body: "burrower", level: 6 },
        carriers: { count: 6, body: "carrier", level: 6 }
    },
    industry: {
        couriers: { count: 2, body: "carrier", level: 6 },
        operators: { count: 1, body: "worker", level: 6 }
    }
};
```

**Default Behavior** (if `null`): Bot uses preset population templates from `definitions_populations.js`.

**Use Case**: Fine-tuning creep counts for specific strategies (e.g., all upgraders, no repairers).

---

## Sites Configuration (Memory.sites)

`Memory.sites` stores data for colonies, remote mining, and combat operations.

### Structure

```javascript
Memory.sites = {
    mining: {
        "W2N1": {
            colony: "W1N1",               // Colony that owns this mine
            has_keepers: false,           // Whether SK guards are present
            list_route: ["W1N1", "W2N1"], // Path to mining room
            spawn_assist: {               // Optional spawn assistance
                rooms: ["W1N1"],
                list_route: ["W1N1", "W2N1"]
            }
        }
    },
    colonization: {
        "W3N3": {
            from: "W1N1",                 // Colony sending colonizer
            target: "W3N3",               // Room to claim
            layout: {
                origin: { x: 25, y: 25 },
                name: "default_horizontal"
            },
            list_route: ["W1N1", "W2N2", "W3N3"]
        }
    },
    combat: {
        "W5N5_attack": {
            from: "W1N1",                 // Colony sending attackers
            target: "W5N5",               // Target room
            tactic: "trickle",            // Attack tactic
            population: {}                // Combat creep population
        }
    }
};
```

---

### Remote Mining Sites

**Path**: `Memory.sites.mining[roomName]`

**Console Command**:
```javascript
empire.remote_mining("W1N1", "W2N1");  // Basic
empire.remote_mining("W1N1", "W5N5", true, ["W1N1", "W2N2", "W5N5"]);  // With SK and routing
```

**Manual Edit** (to remove a remote mine):
```javascript
delete Memory.sites.mining["W2N1"];
```

**Use Case**: Add/remove remote mining operations.

---

### Colonization Requests

**Path**: `Memory.sites.colonization[roomName]`

**Console Command**:
```javascript
empire.colonize("W1N1", "W3N3", {origin: {x: 25, y: 25}, name: "default_horizontal"});
```

**Manual Edit** (to cancel colonization):
```javascript
delete Memory.sites.colonization["W3N3"];
```

**Auto-Cleanup**: Once the colonizer claims the controller, this entry is automatically deleted and the room becomes a colony.

---

### Combat Operations

**Path**: `Memory.sites.combat[operationName]`

**Console Commands**:
```javascript
empire.combat_trickle("W1N1", "W5N5", "standard_army");
empire.combat_occupy("W1N1", "W5N5", "occupation_force");
```

**Manual Edit** (to cancel combat):
```javascript
delete Memory.sites.combat["operation_name"];
```

**Use Case**: Manually cancel stuck or completed combat operations.

---

## Resource Management (Memory.resources)

`Memory.resources` stores configuration for factories, labs, terminals, and market trading.

### Structure

```javascript
Memory.resources = {
    factories: {
        targets: {
            "battery": { commodity: "battery", amount: 1000, priority: 30 },
            "wire": { commodity: "wire", amount: 500, priority: 40 }
        },
        assignments: {
            "W1N1": "battery",            // Which factory produces what
            "W2N2": "wire"
        }
    },
    labs: {
        targets: {
            "GH2O": { mineral: "GH2O", amount: 5000, priority: 10 }
        }
    },
    market_energy_threshold: 50000,       // Buy energy if below this
    overflow_cap: 400000,                 // Send excess energy above this
    market_caps: {
        "U": 10000,                       // Sell U above 10k
        "L": 10000
    },
    terminal_orders: []                   // Internal queue for terminal operations
};
```

---

### Factory Targets

**Path**: `Memory.resources.factories.targets`

**Console Commands**:
```javascript
factories.set_production("battery", 1000, 30);
factories.clear_production("battery");
factories.clear_all();
```

**Manual Edit**:
```javascript
Memory.resources.factories.targets = {
    "battery": { commodity: "battery", amount: 1000, priority: 30 },
    "wire": { commodity: "wire", amount: 500, priority: 40 }
};
```

**Use Case**: Bulk-set multiple factory targets at once.

---

### Lab Targets

**Path**: `Memory.resources.labs.targets`

**Console Command**:
```javascript
resources.lab_target("GH2O", 5000, 10);
```

**Manual Edit**:
```javascript
Memory.resources.labs.targets = {
    "GH2O": { mineral: "GH2O", amount: 5000, priority: 10 },
    "UH2O": { mineral: "UH2O", amount: 3000, priority: 20 }
};
```

**Use Case**: Bulk-set multiple lab reactions.

---

### Market Energy Threshold

**Path**: `Memory.resources.market_energy_threshold`

**Type**: Integer (energy amount)

**Console Command**:
```javascript
resources.set_energy_threshold(50000);
```

**Manual Edit**:
```javascript
Memory.resources.market_energy_threshold = 75000;
```

**Use Case**: Adjust emergency energy buying threshold.

---

### Energy Overflow Cap

**Path**: `Memory.resources.overflow_cap`

**Type**: Integer (energy amount)

**Console Command**:
```javascript
resources.overflow_cap(400000);
```

**Manual Edit**:
```javascript
Memory.resources.overflow_cap = 500000;
```

**Use Case**: Balance energy across rooms automatically when storage exceeds this amount.

---

### Market Caps (Auto-Sell)

**Path**: `Memory.resources.market_caps`

**Type**: Object mapping resource → cap amount

**Console Command**:
```javascript
resources.market_cap("U", 10000);
```

**Manual Edit**:
```javascript
Memory.resources.market_caps = {
    "U": 15000,
    "L": 15000,
    "K": 12000,
    "Z": 12000,
    "O": 20000,
    "H": 20000
};
```

**Use Case**: Bulk-configure auto-selling for all base minerals.

---

## Creep Memory (Memory.creeps)

`Memory.creeps[creepName]` is auto-managed by the bot. **You rarely need to edit this manually.**

### Auto-Cleanup

**Mechanism**: `Control.clearDeadMemory()` removes memory for dead creeps every tick.

**Result**: Creep memory doesn't accumulate indefinitely.

---

### Creep Memory Structure (Informational)

```javascript
Memory.creeps["Worker123"] = {
    role: "worker",               // Creep's role
    colony: "W1N1",               // Home colony
    level: 6,                     // Creep level (body size)
    task: {                       // Current task (temporary)
        type: "build",
        target: "constructionSiteId",
        timer: 50
    },
    spawning: true,               // Internal flag during spawn
    // ... other internal fields
};
```

**Note**: Tasks are ephemeral and expire after a set time (timer).

---

## Safe Memory Defaults

**If you're unsure, use these safe defaults**:

```javascript
// === EMPIRE-WIDE ===
Memory.hive.allies = [];                             // No allies by default
Memory.hive.visuals.update_interval = 10;            // 10 ticks (balanced CPU)

// === PER-ROOM ===
Memory.rooms["W1N1"].layout = {
    origin: { x: 25, y: 25 },
    name: "default_horizontal",
    place_defenses: true
};
Memory.rooms["W1N1"].wall_target = 1000000;          // 1M HP (balanced)

// === RESOURCES ===
Memory.resources.market_energy_threshold = 50000;    // Emergency buy at 50k
Memory.resources.overflow_cap = 400000;              // Overflow at 400k
Memory.resources.market_caps = {                     // Auto-sell excess minerals
    "U": 15000, "L": 15000, "K": 15000,
    "Z": 15000, "O": 15000, "H": 15000
};
```

---

## Advanced Configuration Techniques

### 1. Bulk-Set Multiple Rooms

**Example**: Set wall HP to 3M for all your colonies:

```javascript
_.each(Game.rooms, room => {
    if (room.controller && room.controller.my) {
        Memory.rooms[room.name].wall_target = 3000000;
    }
});
```

---

### 2. Export/Import Configuration

**Export** (backup your settings):
```javascript
copy(JSON.stringify(Memory.resources));  // Copy to clipboard
```

**Import** (restore settings):
```javascript
Memory.resources = JSON.parse('{ paste JSON here }');
```

**Use Case**: Share configurations with allies, backup before major changes.

---

### 3. Reset Specific Subsystems

**Reset Factory Targets**:
```javascript
Memory.resources.factories = { targets: {}, assignments: {} };
```

**Reset Lab Targets**:
```javascript
Memory.resources.labs = { targets: {} };
```

**Reset All Remote Mines**:
```javascript
Memory.sites.mining = {};
```

**Use Case**: Clean slate after testing or errors.

---

### 4. Conditional Configuration (Per-Room)

**Example**: Set different wall HP for frontline vs. core rooms:

```javascript
// Frontline rooms (close to enemies)
Memory.rooms["W5N5"].wall_target = 5000000;  // 5M HP
Memory.rooms["W6N6"].wall_target = 5000000;

// Core rooms (safe, far from enemies)
Memory.rooms["W1N1"].wall_target = 1000000;  // 1M HP
Memory.rooms["W2N2"].wall_target = 1000000;
```

---

## Configuration Playbooks

### Playbook: Reset Everything (Fresh Start)

**Use Case**: Major bugs, corrupted Memory, or starting over.

**⚠️ Warning**: This deletes all settings! Backup first.

```javascript
// 1. Backup current Memory
copy(JSON.stringify(Memory));  // Save to a text file

// 2. Reset Memory (DANGEROUS!)
Memory = {
    hive: { allies: [], pulses: {} },
    rooms: {},
    sites: { mining: {}, colonization: {}, combat: {} },
    resources: { factories: { targets: {} }, labs: { targets: {} } },
    creeps: {}
};

// 3. Bot will re-initialize on next tick
```

---

### Playbook: Migrate Settings to New Room

**Use Case**: You want to apply W1N1's settings to a new room W3N3.

```javascript
// Copy layout, wall target, and spawn assist from W1N1 to W3N3
Memory.rooms["W3N3"].layout = _.cloneDeep(Memory.rooms["W1N1"].layout);
Memory.rooms["W3N3"].wall_target = Memory.rooms["W1N1"].wall_target;

// Adjust origin for W3N3's terrain
Memory.rooms["W3N3"].layout.origin = { x: 28, y: 22 };  // Different coordinates
```

---

### Playbook: Debug Memory Issues

**Use Case**: Something isn't working, and you suspect Memory corruption.

**Steps**:

1. **View Relevant Memory Section**:
   ```javascript
   JSON.stringify(Memory.resources.factories);  // Check factory targets
   ```

2. **Look for Anomalies**:
   - Missing fields (e.g., `targets: undefined`)
   - Unexpected values (e.g., `amount: NaN`)
   - Duplicate entries

3. **Fix Manually**:
   ```javascript
   Memory.resources.factories.targets = {};  // Reset if corrupted
   ```

4. **Re-Apply Settings via Console**:
   ```javascript
   factories.set_production("battery", 1000, 30);
   ```

---

## Memory Quick Reference

```javascript
// === VIEW MEMORY ===
JSON.stringify(Memory.hive);                         // Empire-wide settings
JSON.stringify(Memory.rooms["W1N1"]);                // Per-room settings
JSON.stringify(Memory.sites.mining);                 // Remote mining sites
JSON.stringify(Memory.resources.factories.targets);  // Factory targets

// === SAFE EDITS ===
Memory.hive.allies = ["Ally1", "Ally2"];
Memory.rooms["W1N1"].wall_target = 3000000;
Memory.resources.market_energy_threshold = 75000;

// === RESET SUBSYSTEMS ===
Memory.resources.factories = { targets: {}, assignments: {} };
Memory.sites.mining = {};
```

---

## ⚠️ Warnings & Best Practices

### 1. Always Backup Before Major Changes

```javascript
copy(JSON.stringify(Memory));  // Save to clipboard/file
```

---

### 2. Avoid Editing Internal Fields

**Don't manually edit** unless you know what you're doing:
- `Memory.hive.pulses` (pulse timing)
- `Memory.hive.spawn_requests` (spawn queue)
- `Memory.rooms[room].links` (link assignments)
- `Memory.creeps[creep]` (creep memory)

**Why**: These are managed by the bot and editing them can cause crashes.

---

### 3. Use Console Commands When Possible

**Prefer**:
```javascript
factories.set_production("battery", 1000, 30);
```

**Over**:
```javascript
Memory.resources.factories.targets["battery"] = { commodity: "battery", amount: 1000, priority: 30 };
```

**Why**: Console commands validate inputs and handle edge cases.

---

### 4. Test Changes Incrementally

**Don't**:
- Change 10 settings at once

**Do**:
- Change one setting
- Wait 50-100 ticks
- Verify it works
- Move to next setting

---

## Next Steps

- **Troubleshoot Issues**: [Maintenance and Debugging](maintenance-and-debug.md)
- **Command Reference**: [Command Reference](reference-commands.md)
- **Contribute**: [Contributing](contributing.md)

---

**You're now a Memory configuration expert!** 🧠

