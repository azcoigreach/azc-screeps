# GitHub Copilot Instructions for Screeps Bot

## Project Context
This is an advanced Screeps AI bot with semi-automated colony management. The bot handles routine tasks automatically but requires console commands for strategic decisions like colonization, combat, and resource management.

## Code Architecture

### File Organization
The codebase is organized into three main categories:

1. **Overloads** (`overloads_*.js`): Prototype extensions for game objects
   - `overloads_general.js` - Utility functions and helpers
   - `overloads_creep.js` - Creep behavior extensions
   - `overloads_creep_tasks.js` - Task system (withdraw, build, repair, etc.)
   - `overloads_creep_travel.js` - Pathfinding and movement
   - `overloads_lab.js` - Lab automation
   - `overloads_room.js` - Room utilities (resource tracking, level calculation)
   - `overloads_room_position.js` - Position utilities

2. **Definitions** (`definitions_*.js`): Global systems and logic
   - `definitions_populations.js` - Population templates
   - `definitions_combat_populations.js` - Combat populations
   - `definitions_creep_body.js` - Body part configurations
   - `definitions_creep_roles.js` - Role behaviors (Worker, Scout, etc.)
   - `definitions_creep_combat_roles.js` - Combat roles
   - `definitions_sites.js` - Site management
   - `definitions_hive_control.js` - Central Control object
   - `definitions_blueprint.js` - Automated base building
   - `definitions_blueprint_layouts.js` - Base layout coordinates
   - `definitions_console_commands.js` - Console command interface
   - `definitions_flag_controller.js` - Flag-based controls
   - `definitions_visual_elements.js` - Visual overlays
   - `definitions_cpu_profiling.js` - CPU profiling system
   - `definitions_grafana_statistics.js` - Statistics export

3. **Main Entry** (`main.js`): Game loop and module loading

### Code Placement Guidelines

**Add prototype extensions to overloads files:**
```javascript
// In overloads_creep.js
Creep.prototype.myNewMethod = function() {
    return this.property;
};
```

**Add global systems to definitions files:**
```javascript
// In definitions_*.js
global.MySystem = {
    method: function() {
        // Implementation
    }
};
```

**Add console commands to definitions_console_commands.js:**
```javascript
global.myCommand = function(params) {
    console.log("Output");
};
```

## Coding Patterns

### Memory Access (ALWAYS use _.get())
```javascript
// CORRECT - Safe access with default
let value = _.get(Memory, ["rooms", roomName, "field"], defaultValue);
let controller = _.get(Game, ["rooms", roomName, "controller"]);

// INCORRECT - Can cause undefined errors
let value = Memory.rooms[roomName].field;
```

### Task System Pattern
```javascript
// Creating a task
creep.memory.task = {
    type: "withdraw",
    target: targetId,
    resource: "energy",
    timer: 30
};

// Getting a task (returns task or null)
creep.memory.task = creep.getTask_Withdraw_Storage("energy", false);
creep.memory.task = creep.memory.task || creep.getTask_Pickup();

// Running a task
creep.runTask(creep);
```

### CPU Management
```javascript
// Check before expensive operations
if (hasCPU()) {
    // Expensive operation
}

// Check pulse timing
if (isPulse_Short()) {
    // Frequent task
}

if (isPulse_Long()) {
    // Infrequent task
}
```

### Global Object Pattern
```javascript
// Standard pattern for all global systems
global.SystemName = {
    init: function() {
        // Initialization
    },
    
    processRoom: function(room) {
        // Room processing
    },
    
    helperMethod: function(param) {
        // Helper logic
    }
};
```

## Screeps MCP Integration

### Uploading Code (Multi-File Support)
```javascript
// Upload entire directory (PREFERRED)
mcp_screeps_upload_code({
    mainJsPath: "/home/azcoigreach/repos/azc-screeps",
    branch: "default"
});

// All .js files in the directory are uploaded as modules
// The Screeps server automatically handles require() statements
```

### Console & Debugging
```javascript
// Get console logs
mcp_screeps_get_console({ clearBuffer: false });

// Execute console commands
mcp_screeps_execute_command({ command: "help()" });
mcp_screeps_execute_command({ command: "Game.time" });

// Check for errors
mcp_screeps_check_for_errors({});

// Troubleshoot bot
mcp_screeps_troubleshoot_bot({});
```

### Memory Operations
```javascript
// Get memory
mcp_screeps_get_memory({ path: "" }); // Full memory
mcp_screeps_get_memory({ path: "rooms.W1N1" }); // Specific path

// Set memory
mcp_screeps_set_memory({ 
    path: "config.setting", 
    value: JSON.stringify(value) 
});
```

### Room & Game Info
```javascript
// Room terrain
mcp_screeps_get_room_terrain({ roomName: "W1N1", shard: "shard0" });

// Room status
mcp_screeps_get_room_status({ roomName: "W1N1", shard: "shard0" });

// Room objects (structures, creeps, etc.)
mcp_screeps_get_room_objects({ roomName: "W1N1" });

// User info
mcp_screeps_get_user_info({});

// Game time
mcp_screeps_get_game_time({ shard: "shard0" });

// Performance analysis
mcp_screeps_analyze_performance({});
```

## Console Command System

Commands are defined in `definitions_console_commands.js` and available in Screeps console.

### Main Command Categories
- `help()` - Show all commands
- `help("category")` - Show category-specific commands
- `empire.*` - Colony and empire management
- `blueprint.*` - Base layout and construction
- `resources.*` - Resource management (labs, terminals, market)
- `factories.*` - Factory production
- `allies.*` - Ally management
- `log.*` - Information and status logs
- `profiler.*` - CPU profiling
- `visuals.*` - Visual performance

### Adding Console Commands
```javascript
// In definitions_console_commands.js

// 1. Define the command
global.myCommand = function(param1, param2) {
    // Implementation
    console.log("Output");
};

// 2. Add to help system
global.help = function(category) {
    // ... existing code ...
    
    if (category === "my_category") {
        console.log("myCommand(param1, param2) - Description");
    }
};
```

## Development Workflow

### 1. Local Development
- Edit files in `/home/azcoigreach/repos/azc-screeps/`
- Follow file organization patterns
- Use appropriate coding patterns
- Add console commands as needed

### 2. Upload to Screeps
```javascript
mcp_screeps_upload_code({
    mainJsPath: "/home/azcoigreach/repos/azc-screeps"
});
```

### 3. Verify Upload
```javascript
// Check console for errors
mcp_screeps_get_console({ clearBuffer: false });

// Check for runtime errors
mcp_screeps_check_for_errors({});
```

### 4. Test Functionality
```javascript
// Execute test commands
mcp_screeps_execute_command({ command: "system_status()" });

// Test new commands
mcp_screeps_execute_command({ command: "myNewCommand()" });
```

### 5. Profile Performance
```javascript
// Analyze CPU usage
mcp_screeps_analyze_performance({});

// Or use built-in profiler
mcp_screeps_execute_command({ command: "profiler.run(100)" });
// Wait for completion
mcp_screeps_execute_command({ command: "profiler.analyze()" });
```

## Common Development Tasks

### Adding a New Creep Role
1. **Body Config** (`definitions_creep_body.js`):
```javascript
global.body_types.myRole = function(level) {
    // Return body parts array
};
```

2. **Role Behavior** (`definitions_creep_roles.js`):
```javascript
global.Creep_Roles.MyRole = function(creep) {
    // Role logic
};
```

3. **Population** (`definitions_populations.js`):
```javascript
{
    class: "myRole",
    body: "myRole",
    level: 5,
    count: 2
}
```

### Adding a New System
1. Create `definitions_my_system.js`
2. Define global object:
```javascript
global.MySystem = {
    init: function() {},
    run: function() {}
};
```
3. Add to `main.js` requires:
```javascript
require("definitions_my_system");
```
4. Call in game loop:
```javascript
MySystem.run();
```

### Modifying Base Layouts
1. Edit `base_layouts/base_layouts.xlsx`
2. Export to CSV
3. Update `definitions_blueprint_layouts.js`
4. Test with: `blueprint.set_layout(room, x, y, "layout")`

### Adding Factory Production
- Commodities auto-detected from `COMMODITIES` constant
- Set via console: `factories.set_production(commodity, amount, priority)`
- Logic in `definitions_hive_control.js`

## Performance Optimization

### CPU Optimization
- Use profiler: `profiler.run(cycles)` then `profiler.analyze()`
- Wrap expensive operations in `hasCPU()` checks
- Use pulse system for periodic tasks
- Cache expensive calculations

### Visual Optimization
- Control update frequency: `visuals.set_performance(ticks)`
- Default: 5 tick intervals
- Cache visual data when possible

### Memory Optimization
- Use `_.get()` for safe access
- Clean dead memory regularly
- Avoid deep nesting
- Use defaults instead of null checks

## Important Patterns

### Creep State Machine
```javascript
if (creep.memory.state == "refueling") {
    if (_.sum(creep.carry) == creep.carryCapacity) {
        creep.memory.state = "working";
        delete creep.memory.task;
        return;
    }
    // Get and run refueling tasks
}
```

### Room Processing
```javascript
for (let roomName in Memory.rooms) {
    let room = Game.rooms[roomName];
    if (!room) continue;
    
    // Process room
}
```

### Task Priority Chain
```javascript
// Tasks evaluated in order, first non-null wins
creep.memory.task = creep.memory.task || creep.getTask_Boost();
creep.memory.task = creep.memory.task || creep.getTask_Withdraw_Storage("energy");
creep.memory.task = creep.memory.task || creep.getTask_Pickup();
creep.memory.task = creep.memory.task || creep.getTask_Wait(10);
```

## Testing Checklist

### Before Upload
- [ ] No syntax errors
- [ ] Files in correct category (overloads/definitions)
- [ ] Global objects properly defined
- [ ] Memory access uses `_.get()`
- [ ] CPU checks for expensive operations
- [ ] Console commands added to help
- [ ] Required in main.js if new file

### After Upload
- [ ] Check console logs for errors
- [ ] Verify Game.time incrementing
- [ ] Test new console commands
- [ ] Run `system_status()`
- [ ] Profile CPU if significant changes

## Memory Structure Reference

```
Memory
├── hive                      # Central control
│   ├── visuals              # Visual settings
│   └── pulse                # Pulse timing
├── rooms[roomName]          # Room-specific data
│   ├── survey               # Room analysis
│   ├── spawn_assist         # Multi-room spawning
│   └── blueprint            # Base layout
├── sites[siteId]            # Site management
│   ├── type                 # "colony", "mining", "combat"
│   ├── rooms                # Involved rooms
│   └── population           # Creep population
└── creeps[creepName]        # Creep data (auto-cleaned)
    ├── role                 # Creep role
    ├── state                # Current state
    ├── task                 # Current task
    └── room                 # Target room
```

## Key Constants

### Creep States
- `"refueling"` - Getting energy
- `"working"` - Doing work
- `"traveling"` - Moving to destination

### Task Types
- `"withdraw"` - Withdraw from structure
- `"deposit"` - Deposit to structure
- `"pickup"` - Pick up dropped resource
- `"mine"` - Mine source
- `"build"` - Build construction site
- `"repair"` - Repair structure
- `"upgrade"` - Upgrade controller
- `"wait"` - Wait in place

### Site Types
- `"colony"` - Owned room
- `"mining"` - Remote mining
- `"highway"` - Highway mining
- `"combat"` - Combat operation
- `"colonizing"` - New colony in progress

## Documentation Standards

Always document:
- **What**: What was changed/added
- **Where**: File and section markers
- **Why**: Purpose and reasoning
- **How**: Usage examples
- **Dependencies**: Related systems

Use comments:
```javascript
/* ***********************************************************
 *  [sec##x] SECTION NAME
 * *********************************************************** */

// Subsection: Purpose
// This code does X because Y

// Example usage:
// global.myFunction(param);
```

## Error Handling

Always handle errors gracefully:
```javascript
// Check object exists
let controller = _.get(Game, ["rooms", roomName, "controller"]);
if (!controller) return;

// Validate parameters
if (!roomName || !resource) {
    console.log("Error: Missing parameters");
    return;
}

// Use try-catch for risky operations
try {
    // Risky operation
} catch (e) {
    console.log("Error:", e.message);
}
```

## Resources

- Main README: `/home/azcoigreach/repos/azc-screeps/readme.md`
- Base Layouts: `/home/azcoigreach/repos/azc-screeps/base_layouts/`
- Screeps API: https://docs.screeps.com/api/
- This codebase: Fork of tanjera/screeps with extensions

