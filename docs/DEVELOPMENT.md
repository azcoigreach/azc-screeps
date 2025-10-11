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

