# Development Guide for AZC Screeps Bot

This document provides a comprehensive guide to developing and maintaining the AZC Screeps bot codebase.

## Quick Reference

- **Cursor Instructions**: `.cursorrules` (for Cursor AI)
- **Copilot Instructions**: `.github/copilot-instructions.md` (for GitHub Copilot)
- **Main README**: `readme.md` (user documentation)
- **This Guide**: `DEVELOPMENT.md` (developer documentation)

## Project Structure Overview

```
azc-screeps/
├── main.js                              # Entry point & game loop
├── overloads_*.js                       # Prototype extensions
├── definitions_*.js                     # Global systems & logic
├── base_layouts/                        # Base layout files
│   ├── base_layouts.xlsx               # Visual layouts
│   └── *.csv                           # CSV exports
└── .github/
    └── copilot-instructions.md         # GitHub Copilot instructions
```

## File Categories

### 1. Overloads (Prototype Extensions)
**Purpose**: Extend built-in Screeps prototypes

| File | Section | Purpose |
|------|---------|---------|
| `overloads_general.js` | [sec01a] | General utilities |
| `overloads_creep.js` | [sec01b] | Creep behaviors |
| `overloads_creep_tasks.js` | [sec01c] | Task system |
| `overloads_creep_travel.js` | [sec01d] | Pathfinding |
| `overloads_lab.js` | [sec01e] | Lab automation |
| `overloads_room.js` | [sec01f] | Room utilities |
| `overloads_room_position.js` | [sec01g] | Position utilities |

### 2. Definitions (Global Systems)
**Purpose**: Define global objects and systems

| File | Section | Purpose |
|------|---------|---------|
| `definitions_populations.js` | [sec02a] | Population templates |
| `definitions_combat_populations.js` | [sec02b] | Combat populations |
| `definitions_creep_body.js` | [sec03a] | Body configurations |
| `definitions_creep_roles.js` | [sec03b] | Role behaviors |
| `definitions_creep_combat_roles.js` | [sec03c] | Combat roles |
| `definitions_sites.js` | [sec04a] | Site management |
| `definitions_hive_control.js` | [sec05a] | Central Control |
| `definitions_blueprint.js` | [sec06a] | Base building |
| `definitions_blueprint_layouts.js` | [sec06b] | Base layouts |
| `definitions_console_commands.js` | [sec07a] | Console commands |
| `definitions_flag_controller.js` | - | Flag controls |
| `definitions_visual_elements.js` | [sec08a] | Visual overlays |
| `definitions_cpu_profiling.js` | [sec09a] | CPU profiling |
| `definitions_grafana_statistics.js` | [sec10a] | Statistics export |
| `definitions_ai_observer.js` | [sec15a] | Compact strategic telemetry for an external commander |
| `definitions_ai_interface.js` | [sec15b] | Safe segment transport, order validation, and acknowledgements |

## Screeps MCP Integration

This project uses Model Context Protocol (MCP) tools for direct Screeps server interaction.

### Quick Start with MCP

```javascript
// 1. Upload your code (entire directory)
mcp_screeps_upload_code({
    mainJsPath: "/home/azcoigreach/repos/azc-screeps"
});

// 2. Check console for errors
mcp_screeps_get_console({ clearBuffer: false });

// 3. Test your changes
mcp_screeps_execute_command({ command: "help()" });

// 4. Check for issues
mcp_screeps_check_for_errors({});
```

### Available MCP Tools

#### Code Upload
- **`mcp_screeps_upload_code`**: Upload code to Screeps server
  - Supports single file or entire directory
  - Directory upload includes all .js files as modules
  - Parameters: `mainJsPath`, `branch` (default: "default")

#### Console Operations
- **`mcp_screeps_get_console`**: Get console logs
  - Parameters: `clearBuffer` (boolean)
- **`mcp_screeps_execute_command`**: Execute console commands
  - Parameters: `command` (string)

#### Memory Management
- **`mcp_screeps_get_memory`**: Get bot memory
  - Parameters: `path` (e.g., "rooms.W1N1" or "" for full)
- **`mcp_screeps_set_memory`**: Set bot memory
  - Parameters: `path`, `value` (JSON string)

#### Game Information
- **`mcp_screeps_get_room_terrain`**: Get room terrain data
- **`mcp_screeps_get_room_status`**: Get room ownership/status
- **`mcp_screeps_get_room_objects`**: Get room structures/creeps
- **`mcp_screeps_get_user_info`**: Get user information
- **`mcp_screeps_get_game_time`**: Get current game tick

#### Troubleshooting
- **`mcp_screeps_analyze_performance`**: Analyze bot performance
- **`mcp_screeps_check_for_errors`**: Check console for errors
- **`mcp_screeps_troubleshoot_bot`**: Comprehensive health check

### Typical Development Workflow

```javascript
// Step 1: Make code changes locally
// ... edit files ...

// Step 2: Upload to Screeps
mcp_screeps_upload_code({
    mainJsPath: "/home/azcoigreach/repos/azc-screeps"
});

// Step 3: Verify upload
mcp_screeps_get_console({ clearBuffer: false });

// Step 4: Test functionality
mcp_screeps_execute_command({ command: "system_status()" });

// Step 5: Check performance
mcp_screeps_analyze_performance({});

// Step 6: Debug if needed
mcp_screeps_check_for_errors({});
mcp_screeps_troubleshoot_bot({});
```

## Coding Standards

### Memory Access Pattern
**ALWAYS use `_.get()` for safe memory access:**

```javascript
// CORRECT ✓
let value = _.get(Memory, ["rooms", roomName, "field"], defaultValue);
let controller = _.get(Game, ["rooms", roomName, "controller"]);

// INCORRECT ✗ - Can cause crashes
let value = Memory.rooms[roomName].field;
let controller = Game.rooms[roomName].controller;
```

### Global Object Pattern
**For all systems in definitions files:**

```javascript
global.SystemName = {
    init: function() {
        // Initialize system
    },
    
    processRoom: function(room) {
        // Process a room
    },
    
    helperMethod: function(param) {
        // Helper logic
    }
};
```

### Prototype Extension Pattern
**For overloads files:**

```javascript
Creep.prototype.myMethod = function() {
    // Use 'this' to access instance
    return this.property;
};

Room.prototype.customFunction = function(param) {
    // Implementation
};
```

### Task System Pattern
**For creep task management:**

```javascript
// Creating a task
creep.memory.task = {
    type: "withdraw",
    target: targetId,
    resource: "energy",
    timer: 30
};

// Getting tasks (priority chain)
creep.memory.task = creep.memory.task || creep.getTask_Withdraw_Storage("energy");
creep.memory.task = creep.memory.task || creep.getTask_Pickup();
creep.memory.task = creep.memory.task || creep.getTask_Wait(10);

// Running task
creep.runTask(creep);
```

### CPU Management Pattern
**For performance-sensitive code:**

```javascript
// Check CPU availability before expensive operations
if (hasCPU()) {
    // Expensive operation
}

// Use pulse system for periodic tasks
if (isPulse_Short()) {
    // Frequent task (every 4-12 ticks)
}

if (isPulse_Long()) {
    // Infrequent task (every 16-48 ticks)
}
```

## Adding New Features

### Adding a New Creep Role

**1. Define body configuration** (`definitions_creep_body.js`):
```javascript
global.body_types.myNewRole = function(level) {
    // Return array of body parts based on level
    let body = [];
    for (let i = 0; i < level; i++) {
        body.push(WORK, CARRY, MOVE);
    }
    return body;
};
```

**2. Add role behavior** (`definitions_creep_roles.js`):
```javascript
global.Creep_Roles.MyNewRole = function(creep) {
    // State machine for role
    if (creep.memory.state == "refueling") {
        // Get energy
    } else if (creep.memory.state == "working") {
        // Do work
    }
};
```

**3. Add to population** (`definitions_populations.js`):
```javascript
// In appropriate population template
{
    class: "myNewRole",
    body: "myNewRole",
    level: 5,
    count: 2,
    priority: 5
}
```

**4. Upload and test**:
```javascript
mcp_screeps_upload_code({
    mainJsPath: "/home/azcoigreach/repos/azc-screeps"
});
mcp_screeps_execute_command({ command: "log.creeps()" });
```

### Adding a Console Command

**1. Define command** (`definitions_console_commands.js`):
```javascript
global.myCommand = function(param1, param2) {
    // Validate parameters
    if (!param1) {
        console.log("Error: param1 required");
        return;
    }
    
    // Implementation
    console.log("Command executed with:", param1, param2);
};
```

**2. Add to help system**:
```javascript
global.help = function(category) {
    // ... existing code ...
    
    if (!category || category === "my_category") {
        console.log("=== My Category ===");
        console.log("myCommand(param1, param2) - Description of command");
    }
};
```

**3. Upload and test**:
```javascript
mcp_screeps_upload_code({
    mainJsPath: "/home/azcoigreach/repos/azc-screeps"
});
mcp_screeps_execute_command({ command: "myCommand('test', 123)" });
```

### Adding a New System

**1. Create new definitions file** (`definitions_my_system.js`):
```javascript
/* ***********************************************************
 *  [sec##x] DEFINITIONS: MY SYSTEM
 * *********************************************************** */

global.MySystem = {
    init: function() {
        // Initialize system
        if (!Memory.mySystem) {
            Memory.mySystem = {};
        }
    },
    
    run: function() {
        // Main system logic
        if (!hasCPU()) return;
        
        // Process each room
        for (let roomName in Memory.rooms) {
            let room = Game.rooms[roomName];
            if (!room) continue;
            
            this.processRoom(room);
        }
    },
    
    processRoom: function(room) {
        // Room-specific logic
    }
};
```

**2. Add to main.js requires**:
```javascript
// Add in appropriate section
require("definitions_my_system");
```

**3. Call in game loop** (in `main.js`):
```javascript
module.exports.loop = function() {
    // ... existing code ...
    
    if (hasCPU()) {
        MySystem.run();
    }
    
    // ... rest of loop ...
};
```

**4. Upload and test**:
```javascript
mcp_screeps_upload_code({
    mainJsPath: "/home/azcoigreach/repos/azc-screeps"
});
mcp_screeps_check_for_errors({});
```

### Modifying Base Layouts

**1. Edit layouts** (`base_layouts/base_layouts.xlsx`):
- Open Excel file
- Modify layout in appropriate sheet
- Use structure codes (e.g., "sp" for spawn, "ex" for extension)

**2. Export to CSV**:
- Save sheet as CSV in `base_layouts/` directory
- Name appropriately (e.g., `def_hor.csv`)

**3. Update coordinates** (`definitions_blueprint_layouts.js`):
```javascript
global.Blueprint_Layouts.myLayout = function() {
    return {
        name: "my_layout",
        structures: {
            spawn: [[0, 0], [5, 5]],
            extension: [[1, 0], [2, 0], /* ... */],
            // ... more structures
        }
    };
};
```

**4. Test layout**:
```javascript
mcp_screeps_upload_code({
    mainJsPath: "/home/azcoigreach/repos/azc-screeps"
});
mcp_screeps_execute_command({ 
    command: "blueprint.set_layout('W1N1', 25, 25, 'my_layout')" 
});
```

## Testing & Debugging

### Pre-Upload Checklist
- [ ] No syntax errors (check linter)
- [ ] Files in correct category (overloads/definitions)
- [ ] Global objects properly defined
- [ ] Memory access uses `_.get()`
- [ ] CPU checks for expensive operations
- [ ] Console commands added to help
- [ ] New files required in main.js
- [ ] Comments follow style guide

### Post-Upload Verification
```javascript
// 1. Check for runtime errors
mcp_screeps_get_console({ clearBuffer: false });
mcp_screeps_check_for_errors({});

// 2. Verify game is running
mcp_screeps_execute_command({ command: "Game.time" });

// 3. Test new functionality
mcp_screeps_execute_command({ command: "system_status()" });
mcp_screeps_execute_command({ command: "myNewCommand()" });

// 4. Profile CPU usage
mcp_screeps_analyze_performance({});
// Or use built-in profiler:
mcp_screeps_execute_command({ command: "profiler.run(100)" });
// Wait for 100 ticks, then:
mcp_screeps_execute_command({ command: "profiler.analyze()" });
```

### Debugging Tools

**Console Logs**:
```javascript
mcp_screeps_get_console({ clearBuffer: false });
```

**Error Checking**:
```javascript
mcp_screeps_check_for_errors({});
```

**Performance Analysis**:
```javascript
mcp_screeps_analyze_performance({});
```

**Comprehensive Health Check**:
```javascript
mcp_screeps_troubleshoot_bot({});
```

**Memory Inspection**:
```javascript
mcp_screeps_get_memory({ path: "" }); // Full memory
mcp_screeps_get_memory({ path: "rooms.W1N1" }); // Specific path
```

**Room Information**:
```javascript
mcp_screeps_get_room_objects({ roomName: "W1N1" });
mcp_screeps_get_room_status({ roomName: "W1N1", shard: "shard0" });
```

### Common Issues & Solutions

**Issue**: Code doesn't load after upload
```javascript
// Check console for syntax errors
mcp_screeps_get_console({ clearBuffer: false });
mcp_screeps_check_for_errors({});
```

**Issue**: High CPU usage
```javascript
// Profile to find bottlenecks
mcp_screeps_execute_command({ command: "profiler.run(100)" });
// Wait, then analyze
mcp_screeps_execute_command({ command: "profiler.analyze()" });

// Adjust visual performance
mcp_screeps_execute_command({ command: "visuals.set_performance(10)" });
```

**Issue**: Creeps not spawning
```javascript
// Check population and spawn status
mcp_screeps_execute_command({ command: "log.spawns()" });
mcp_screeps_execute_command({ command: "log.creeps()" });

// Check memory
mcp_screeps_get_memory({ path: "sites" });
```

**Issue**: Console commands not working
```javascript
// Verify command is defined
mcp_screeps_execute_command({ command: "help()" });

// Check if code uploaded correctly
mcp_screeps_get_console({ clearBuffer: false });
```

## Performance Optimization

### CPU Profiling
```javascript
// Run profiler for 100 ticks
mcp_screeps_execute_command({ command: "profiler.run(100)" });

// Wait for completion, then analyze
mcp_screeps_execute_command({ command: "profiler.analyze()" });

// Review hotspots (functions using >0.5 CPU avg)
// Optimize identified bottlenecks
// Re-profile to measure improvement
```

### Visual Performance
```javascript
// Check current performance
mcp_screeps_execute_command({ command: "visuals.get_performance()" });

// Adjust update interval (higher = less CPU)
mcp_screeps_execute_command({ command: "visuals.set_performance(10)" });

// Clear cache if needed
mcp_screeps_execute_command({ command: "visuals.clear_cache()" });
```

### Memory Optimization
- Use `_.get()` with defaults to avoid null checks
- Clean dead memory regularly (automated in `Control.clearDeadMemory()`)
- Avoid deep memory structures
- Cache expensive calculations

### Pulse System
- Adjust pulse frequencies in `definitions_hive_control.js`
- Tasks run at variable intervals based on CPU bucket
- Short pulse: 6-12 ticks (frequent tasks)
- Long pulse: 24-48 ticks (infrequent tasks)

## AI Commander Interface

The optional Phase 1 AI commander boundary uses Memory Segments 90 (telemetry), 91 (inbox), and 92 (status/results). It defaults to disabled observe mode and has no dependency path into existing colony execution. See [AI Commander Foundation](ai-commander.md) for the schemas, safety rules, console commands, and live verification procedure.

Run its lightweight local regression suite with:

```bash
node tests/ai_commander.test.js
```

## Pixel Generation

The bot includes an automated pixel generation system that intelligently generates pixels when CPU usage is low. See `PIXEL_GENERATION.md` for comprehensive documentation.

### Quick Start

**View status:**
```javascript
pixels.status()
```

**Enable/Disable:**
```javascript
pixels.enable()   // Enable automatic pixel generation (default)
pixels.disable()  // Disable temporarily for critical operations
```

**Adjust CPU threshold:**
```javascript
pixels.set_threshold(80)  // Only generate when CPU usage < 80% (default)
pixels.set_threshold(70)  // More conservative
pixels.set_threshold(90)  // More aggressive
```

### How It Works

**Generation Requirements (all must be met):**
1. Pixel generation enabled in memory (default: true)
2. CPU bucket at 10,000 (full)
3. Current CPU usage below threshold (default: 80%)

**When conditions met:**
- Spends 10,000 bucket CPU to generate 1 pixel
- Logs generation with statistics
- Tracks generation rate and history

### Console Commands

All pixel commands are accessible via `help(pixels)`:
- `pixels.status()` - View generation status and statistics
- `pixels.enable()` - Enable pixel generation
- `pixels.disable()` - Disable pixel generation
- `pixels.set_threshold(percent)` - Set CPU threshold (0-100)
- `pixels.reset_stats()` - Reset statistics tracking

### Memory Structure

```javascript
Memory.hive.pixels = {
    enabled: true,              // Enable/disable generation
    cpu_threshold: 0.8,         // CPU threshold (0.8 = 80%)
    stats: {
        total_generated: 0,     // Total pixels all-time
        last_generated: 0,      // Game tick of last pixel
        generation_history: []  // Last 10 generation times
    }
}
```

### Usage Tips

**Optimize threshold for your bot:**
- Start at 80% (default) and monitor for 24 hours
- Check generation rate: `pixels.status()`
- Increase if CPU consistently low, decrease if bucket struggles

**Temporary disable for critical operations:**
```javascript
pixels.disable()              // Before major combat/expansion
// ... run critical operation ...
pixels.enable()               // Re-enable when done
```

**Monitor performance:**
```javascript
pixels.status()               // Check generation rate
resources.system_status()     // Overall system health
```

### Implementation Details

- **Main loop**: `main.js` line 102
- **Generation logic**: `definitions_hive_control.js` line 498
- **Console commands**: `definitions_console_commands.js` line 1994
- **Documentation**: `PIXEL_GENERATION.md`

## Inter-Shard Coordination System

The multi-shard framework is responsible for synchronizing mission data, inter-shard requests, and global creep tracking across shards. The system is intentionally passive when disabled so that legacy single-shard behavior remains unchanged.

### Core Modules

- `definitions_intershard.js` — Provides the `ShardMemory` facade on top of the Screeps [`InterShardMemory`](https://docs.screeps.com/api/#InterShardMemory) API. Handles serialization, schema validation, request queues, directive routing, and payload trimming (≤95 KB).
- `definitions_shard_control.js` — Implements `ShardControl.run()`, invoked each tick from `main.js`. Coordinates pulses via `isPulse_InterShard()`, merges remote shard telemetry, and publishes directives.
- `overloads_creep.js` — Adds helpers for global creeps:
  - `creep.isGlobal()`, `creep.ensureGlobal()`, `creep.setGlobalMission()`, `creep.updateGlobalStatus()`, `creep.clearGlobal()`, `creep.getGlobalDescriptor()`.
- `definitions_console_commands.js` — Adds the `shards.*` console namespace for diagnostics and operator overrides.

### Inter-Shard Memory Schema

`ShardMemory` maintains a JSON payload with the following structure:

```javascript
{
    version: 1,
    shard: "shard0",
    primary: "shard0",
    heartbeat: Game.time,
    summary: {
        tick: Game.time,
        role: "primary" | "follower",
        global_local: 3,
        remote_shards: 2,
        remote_requests_total: 5,
        cpu_bucket: Game.cpu.bucket,
        cpu_used: Game.cpu.getUsed(),
        gcl: Game.gcl.level,
        gpl: Game.gpl.level
    },
    queues: {
        resource: [],
        creep: [],
        mission: []
    },
    global: {
        creeps: {
            "creepName": {
                status: "transferring",
                mission: "colonization",
                shard: "shard1",
                room: "W1N1",
                ttl: 123,
                target: { shard: "shard1", room: "W1N1" },
                portal: { roomName: "W0N0", x: 1, y: 48 },
                last_update: Game.time
            }
        },
        history: [{ type: "add" | "remove" | "status", creep: "creepName", tick: Game.time }]
    },
    directives: {
        shards: {
            shard1: {
                updated: Game.time,
                queues: { resource: 1, creep: 0, mission: 2 },
                summary: { /* remote shard summary snapshot */ }
            }
        },
        primary: { /* active directive for followers */ }
    },
    receipts: [{ tick: Game.time, message: "note" }],
    meta: { version: 1, serialized_length: 12345, last_write: Game.time }
}
```

Payloads are trimmed automatically if the serialized size approaches the 100 KB Screeps limit; history, receipts, and queue lengths are capped.

**Additional ISM Fields (not shown in schema above):**
- `creep_transfers`: Stores full creep memory snapshots for portal transfers (max 500 ticks retention for cross-shard transfers)
- `handshake.pending`: Pending transfer offers from the origin shard
- `handshake.acknowledgements`: Acknowledgments sent by destination shards
- `handshake.completions`: Completed transfers (moved from pending after ack received)
- `directives.shards[shardName].handshake`: Per-shard handshake data distributed by the primary

### Creep Transfer Handshake System

To ensure data integrity during inter-shard portal transfers, the system implements a three-phase handshake:

**Phase 1: Offer** (Origin Shard)
- Before entering a portal, the creep records its memory snapshot in `creep_transfers`
- A handshake offer is registered in `handshake.pending` with portal and destination details
- The creep waits one tile away from the portal for acknowledgment

**Phase 2: Acknowledgment** (Destination Shard)
- The follower shard reads pending offers from the primary shard's directives
- When it sees an offer destined for itself, it sends an acknowledgment via `handshake.acknowledgements`
- The acknowledgment includes the transfer data snapshot for restoration

**Phase 3: Completion** (Origin Shard)
- The primary shard receives acknowledgments from followers during its pulse cycle
- It moves the handshake from `pending` to `completions` and removes the pending entry
- The creep receives the "go" signal and moves through the portal

**Key Implementation Details:**
- **In-Memory Cache**: `global._localPayloadCache` ensures all `updateLocal()` calls within a single tick operate on the latest data, preventing stale reads
- **Atomic Updates**: `recordCreepTransfer()` updates the transfer snapshot, handshake offer, and global manifest in a single transaction
- **Pulse Frequency**: The intershard pulse runs every 3-10 ticks for responsive handshake coordination
- **Cleanup**: Completed handshakes are retained for 500 ticks, then automatically purged
- **Aggregation**: The primary shard only aggregates acknowledgments and completions from followers; pending offers originate only from the primary's local payload

**Debugging Handshakes:**
```javascript
// Check handshake state on any shard (ES5-compatible)
JSON.stringify((function(){
    var ism=InterShardMemory.getLocal();
    if(!ism)return{error:'No ISM'};
    var data=JSON.parse(ism);
    var pending=(data.handshake&&data.handshake.pending)||{};
    var acks=(data.handshake&&data.handshake.acknowledgements)||{};
    var completions=(data.handshake&&data.handshake.completions)||{};
    return{
        shard:Game.shard.name,
        tick:Game.time,
        pending:Object.keys(pending),
        acks:Object.keys(acks),
        completions:Object.keys(completions)
    };
})(),null,2);
```

### Shard Control Flow

- `Control.initMemory()` seeds a dedicated pulse (`intershard`) with a 3–10 tick cadence and ensures `Memory.hive.ism` exists.
- `ShardControl.run()` executes after `Control.initVisuals()` in `main.js`.
- On each pulse:
  1. Collects global creep descriptors and writes them into the local `ShardMemory` payload.
  2. If operating on the primary shard, fetches remote payloads, aggregates request queues, and stores a unified snapshot in `Memory.hive.ism.primary_snapshot`.
  3. Followers pull the primary payload and persist `Memory.hive.ism.follower_snapshot` for local automation.
- Outside of pulse ticks the controller still refreshes `Memory.hive.ism` counters without touching `InterShardMemory` to conserve CPU.

### Global Creep Manifest

- Any creep with `memory.global`, `memory.shard_mission`, `memory.transfer_intent`, or a `colo:`/`global:` prefix is treated as a *global creep*.
- `creep.ensureGlobal()` normalizes legacy fields onto the new structure, while `creep.updateGlobalStatus()` standardizes status transitions (`"active"`, `"transferring"`, `"restored"`, etc.).
- `ShardControl` publishes local manifests to inter-shard memory, merges remote manifests, and records removal/status changes for auditing.
- Colonizer transfer logic now calls the new helpers so cross-shard transfers automatically populate the manifest without altering existing mission flow.

### Shards Console Commands

`help("shards")` surfaces the new tooling:

- `shards.status(shardName?)` — Show local role, queue depth, heartbeat, and (if primary) remote shard summaries. Provide a shard name to inspect its raw payload.
- `shards.requests(type?)` — Inspect pending inter-shard requests. Primary shards see aggregated remote queues; followers review their outbound queues.
- `shards.global(creepName?)` — List known global creeps or inspect a single creep’s manifest entry.
- `shards.set_primary(shardName)` — Override the designated primary shard (default `shard0`).
- `shards.help()` — Quick reference.

### Empire Scout Missions

- `empire.scout(rmColony, rally_pos, dest_pos, options)` queues a persistent scout assignment for the specified colony. The console command persists its configuration under `Memory.rooms[rmColony].scout_requests`, allowing `Control.runScoutRequests()` to regenerate spawn requests every tick even after the per-tick queue reset.
- `options.count` defines how many scouts should gather at the rally point; `options.waitForFullRally` (default `true`) keeps the group at rally until all required creeps arrive. Set it to `false` to release scouts individually as they reach the rally point.
- `options.respawn` keeps the mission alive forever when `true` (default). Set to `false` to spawn the requested group once and retire the mission after they expire.
- `options.spawnRooms` overrides the default assist list with the exact spawns that may fulfill the request.
- `options.patrol_mode` controls post-rally behaviour: use `"station"` to hold the destination, or `"loop"` to patrol between rally and destination.
- Cross-shard travel is handled by `options.transfer_intent` plus the waypoint route:
  - `transfer_intent.portal_pos` (`{ x, y, roomName, shard? }`) marks the outbound portal.
  - `transfer_intent.return_portal` mirrors the structure for the return portal.
  - `transfer_intent.portals` accepts an explicit portal network array of `{ from: { shard, roomName, pos }, to: { shard, roomName? } }`.
  - Supply `options.rallyShard` / `options.destShard` when the provided positions lack shard metadata.
  - `options.listRoute` accepts `"room"` or `"shard/room"` entries and is traversed forward/backward automatically when using `"loop"`.
- Additional request tuning mirrors other spawn helpers: `priority`, `level`, `body`, `name`, and `global` descriptors for inter-shard manifest tracking.
- Example:
  ```javascript
  empire.scout(
      'E48S21',
      new RoomPosition(25, 20, 'E48S21'),
      new RoomPosition(45, 24, 'E50S20'),
      {
          count: 3,
          respawn: true,
          waitForFullRally: true,
          patrol_mode: 'loop',
          spawnRooms: ['E48S21'],
          priority: 18,
          listRoute: [
              'E48S21',
              'E49S21',
              'E49S20',
              'E50S20',
              'shard1/E30S10',
              'shard1/E30S14'
          ],
          transfer_intent: {
              destination_shard: 'shard1',
              destination_room: 'E30S14',
              portal_pos: { roomName: 'E50S20', shard: 'shard0', x: 45, y: 24 },
              return_portal: {
                  shard: 'shard1',
                  portal_pos: { roomName: 'E30S10', x: 13, y: 20 },
                  destination_shard: 'shard0',
                  destination_room: 'E50S20'
              },
              portals: [
                  {
                      from: { shard: 'shard0', roomName: 'E50S20', pos: { x: 45, y: 24, roomName: 'E50S20' } },
                      to: { shard: 'shard1', roomName: 'E30S10' }
                  },
                  {
                      from: { shard: 'shard1', roomName: 'E30S10', pos: { x: 13, y: 20, roomName: 'E30S10' } },
                      to: { shard: 'shard0', roomName: 'E50S20' }
                  }
              ]
          },
          global: {
              active: true,
              mission: 'portal_scout',
              origin: { shard: 'shard0', room: 'E48S21' },
              target: { shard: 'shard1', room: 'E30S14' }
          }
      }
  );
  ```
- Spawned scouts receive mission metadata (`scout_request_id`, `rally_release`, `patrol_mode`, etc.) each tick. `Creep_Roles.Scout` consumes these fields to coordinate rally staging, portal travel, and patrol behaviour without affecting legacy single-room scouting.

### Testing Checklist

Before deploying multi-shard changes:

1. **Local pulse check**
   - Run `shards.status()` to confirm heartbeat, queue sizes, and role detection.
   - Verify `Memory.hive.ism.global.local_manifest` mirrors `ShardMemory.getLocalPayload().global.creeps`.
2. **Global creep tracking**
   - Spawn or tag a creep with `creep.setGlobalMission("scout", { target: { shard: "shard1", room: "W1N1" } })`.
   - Confirm `shards.global()` lists the creep with accurate status/TTL.
3. **Request queues**
   - Enqueue test data via `ShardMemory.pushRequest("mission", { action: "scout", target: "W1N1" })`.
   - On the primary shard, inspect `shards.requests("mission")` for the entry.
4. **Follower synchronization**
   - On a follower shard, ensure `Memory.hive.ism.follower_snapshot` populates after the next pulse and `shards.status()` echoes primary heartbeat info.
5. **Inter-shard transfers**
   - For portal transfers, watch console output and confirm `creep.updateGlobalStatus("transferring")` triggers `shards.global(creep)` updates on both shards.
   - Verify handshake completion: creep should wait 1 tile from portal, then receive acknowledgment and proceed through
   - Check handshake state with the ES5 debug command (see "Debugging Handshakes" section above)
   - Confirm handshakes move from `pending` → `acknowledgements` → `completions`
6. **Handshake system health**
   - Verify intershard pulse is active: `Memory.hive.pulses.intershard.active` should be `true`
   - Check pulse frequency: should run every 3-10 ticks
   - Monitor console for handshake activity (only logs when transfers are active)
   - Confirm no stale pending handshakes (check with debug command)
7. **Regression**
   - Run `mcp_screeps_upload_code`, monitor `mcp_screeps_get_console`, and execute `shards.help()` to verify command registration.

## Memory Structure Reference

```javascript
Memory
├── hive                          // Central control
│   ├── visuals                   // Visual settings
│   │   └── update_interval       // Visual update frequency
│   ├── pixels                    // Pixel generation
│   │   ├── enabled               // Enable/disable generation
│   │   ├── cpu_threshold         // CPU threshold (0.0-1.0)
│   │   └── stats                 // Generation statistics
│   └── pulse                     // Pulse timing data
│
├── rooms[roomName]               // Room-specific data
│   ├── survey                    // Room analysis
│   │   ├── downgrade_critical    // Controller downgrade warning
│   │   └── low_energy            // Low energy warning
│   ├── spawn_assist              // Multi-room spawning
│   │   ├── rooms                 // Assisting rooms
│   │   └── list_route            // Creep routing
│   └── blueprint                 // Base layout
│       ├── origin                // Layout origin point
│       ├── layout                // Layout name
│       └── blocked_areas         // Construction blocked areas
│
├── sites[siteId]                 // Site management
│   ├── type                      // "colony", "mining", "combat"
│   ├── rooms                     // Involved rooms
│   ├── population                // Creep population template
│   └── priority                  // Spawning priority
│
├── resources                     // Resource management
│   ├── labs                      // Lab reactions
│   │   └── targets               // Reaction targets
│   ├── factories                 // Factory production
│   │   └── targets               // Production targets
│   ├── terminal                  // Terminal orders
│   └── market                    // Market settings
│
└── creeps[creepName]             // Creep data (auto-cleaned)
    ├── role                      // Creep role
    ├── state                     // Current state
    ├── task                      // Current task
    ├── room                      // Target room
    └── site                      // Assigned site
```

## Documentation Standards

### File Header Format
```javascript
/* ***********************************************************
 *  [sec##x] CATEGORY: SYSTEM NAME
 * *********************************************************** */
```

### Function Documentation
```javascript
/**
 * Brief description of function
 * @param {Type} paramName - Parameter description
 * @return {Type} Return value description
 */
functionName: function(paramName) {
    // Implementation
}
```

### Inline Comments
```javascript
// Subsection: Purpose
// Explain what this block does and why

// Example usage:
// global.myFunction(param);
```

### Section Markers
Use section markers from `main.js` table of contents:
- [sec01a-g]: Overloads
- [sec02a-b]: Populations
- [sec03a-c]: Creep bodies and roles
- [sec04a]: Sites
- [sec05a]: Hive Control
- [sec06a-b]: Blueprint
- [sec07a]: Console Commands
- [sec08a]: Visual Elements
- [sec09a]: CPU Profiling
- [sec10a]: Grafana Statistics

## Resources

- **Main Documentation**: `readme.md`
- **Cursor Instructions**: `.cursorrules`
- **Copilot Instructions**: `.github/copilot-instructions.md`
- **Base Layouts**: `base_layouts/base_layouts.xlsx`
- **Screeps API**: https://docs.screeps.com/api/
- **Original Fork**: https://github.com/tanjera/screeps

## Getting Help

1. **Check console**: `mcp_screeps_get_console()`
2. **Run diagnostics**: `mcp_screeps_troubleshoot_bot()`
3. **Check performance**: `mcp_screeps_analyze_performance()`
4. **Review logs**: Use `help("log")` for available log commands
5. **Profile CPU**: Use `profiler.run(cycles)` and `profiler.analyze()`

## Contributing

When making changes:
1. Follow coding standards and patterns
2. Document changes thoroughly
3. Test with MCP tools before committing
4. Update this guide if adding new patterns
5. Maintain section markers and table of contents

---

**Remember**: This user prefers thorough documentation for continuity across chat sessions. Always document what you changed, where, why, and how to test it.
