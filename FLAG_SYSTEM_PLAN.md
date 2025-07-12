# Flag Management System - Technical Implementation Plan

## 🎯 System Overview

The Flag Management System will be a modular component that integrates with the existing `Control` system to provide user-directed automation capabilities. It will follow the established patterns in the codebase for memory management, CPU optimization, and modular design.

## 🏗️ Architecture Integration

### Integration Points with Existing Systems

1. **Main Loop Integration** (`main.js`)
   - Add `FlagManager.run()` after `Control.initMemory()` and before `Control.runColonies()`
   - Follow the existing pattern of CPU checks with `hasCPU()`

2. **Memory Management** (`definitions_hive_control.js`)
   - Initialize `Memory.flags` in `Control.initMemory()`
   - Add flag cleanup in `Control.clearDeadMemory()`

3. **Pulse System Integration**
   - Use existing pulse system for flag processing frequency
   - Leverage `isPulse_Short()` for flag detection
   - Use `isPulse_Spawn()` for directive execution

4. **Console Commands** (`definitions_console_commands.js`)
   - Add flag management commands to existing console system
   - Follow existing command patterns and styling

## 📋 Core Components

### 1. FlagManager Module (`definitions_flag_manager.js`)

```javascript
global.FlagManager = {
    // Main entry point - called from main loop
    run: function() {
        if (!isPulse_Short()) return;
        
        Stats_CPU.Start("Hive", "FlagManager-run");
        this.detectNewFlags();
        this.processActiveDirectives();
        this.cleanupCompletedDirectives();
        Stats_CPU.End("Hive", "FlagManager-run");
    },

    // Detect and parse new flags
    detectNewFlags: function() {
        // Implementation details below
    },

    // Process active directives
    processActiveDirectives: function() {
        // Implementation details below
    },

    // Cleanup completed/failed directives
    cleanupCompletedDirectives: function() {
        // Implementation details below
    }
};
```

### 2. Directive Handlers

Each handler will follow a consistent interface:

```javascript
// Base handler interface
class DirectiveHandler {
    canHandle(flagName) { return false; }
    parseDirective(flagName) { return null; }
    execute(directive) { return false; }
    cleanup(directive) { return true; }
}

// Specific handlers
global.ColonizeHandler = {
    canHandle: function(flagName) {
        return flagName.startsWith('colonize_');
    },
    
    parseDirective: function(flagName) {
        let targetRoom = flagName.replace('colonize_', '');
        return {
            type: 'colonize',
            targetRoom: targetRoom,
            priority: 1,
            requiredCreeps: ['claimer', 'worker', 'carrier']
        };
    },
    
    execute: function(directive) {
        // Implementation details below
    }
};
```

## 🔧 Implementation Details

### 1. Flag Detection & Parsing

```javascript
detectNewFlags: function() {
    // Get all flags in the game
    let gameFlags = Object.keys(Game.flags);
    let memoryFlags = Object.keys(Memory.flags || {});
    
    // Find new flags
    let newFlags = gameFlags.filter(flagName => 
        !memoryFlags.includes(flagName)
    );
    
    // Process each new flag
    _.each(newFlags, flagName => {
        this.processNewFlag(flagName);
    });
},

processNewFlag: function(flagName) {
    // Try each handler
    let handlers = [
        ColonizeHandler,
        RemoteMiningHandler, 
        AttackHandler,
        BoostHandler,
        TradeHandler
    ];
    
    for (let handler of handlers) {
        if (handler.canHandle(flagName)) {
            let directive = handler.parseDirective(flagName);
            if (directive) {
                this.createDirective(flagName, directive);
                console.log(`<font color="#FF6B6B">[Flag]</font> New directive: ${flagName} -> ${directive.type}`);
                return;
            }
        }
    }
    
    console.log(`<font color="#FF6B6B">[Flag]</font> Unknown flag format: ${flagName}`);
}
```

### 2. Memory Structure

```javascript
// Initialize in Control.initMemory()
if (_.get(Memory, ["flags"]) == null) 
    _.set(Memory, ["flags"], new Object());

// Memory structure for each directive
Memory.flags[flagName] = {
    directive: {
        type: 'colonize|remote|attack|boost|trade',
        targetRoom: 'E54S29',
        priority: 1,
        requiredCreeps: ['claimer', 'worker'],
        parameters: {} // Additional parameters per directive type
    },
    status: 'pending|in_progress|completed|failed',
    assignedCreeps: [],
    createdAt: Game.time,
    startedAt: null,
    completedAt: null,
    lastUpdate: Game.time
};
```

### 3. Directive Execution

```javascript
processActiveDirectives: function() {
    let activeDirectives = _.filter(Memory.flags, directive => 
        directive.status === 'pending' || directive.status === 'in_progress'
    );
    
    // Sort by priority and creation time
    let sortedDirectives = _.sortBy(activeDirectives, ['directive.priority', 'createdAt']);
    
    _.each(sortedDirectives, (directive, flagName) => {
        if (this.shouldExecuteDirective(directive)) {
            this.executeDirective(flagName, directive);
        }
    });
},

executeDirective: function(flagName, directive) {
    let handler = this.getHandlerForType(directive.directive.type);
    if (!handler) return;
    
    // Update status
    if (directive.status === 'pending') {
        directive.status = 'in_progress';
        directive.startedAt = Game.time;
    }
    
    // Execute the directive
    let success = handler.execute(directive);
    
    // Update last update time
    directive.lastUpdate = Game.time;
    
    if (success && directive.status === 'completed') {
        this.completeDirective(flagName, directive);
    }
}
```

### 4. Integration with Existing Systems

#### Spawn Request Integration

```javascript
// In ColonizeHandler.execute()
execute: function(directive) {
    let targetRoom = directive.directive.targetRoom;
    
    // Check if we already own the room
    if (Game.rooms[targetRoom] && Game.rooms[targetRoom].controller && 
        Game.rooms[targetRoom].controller.my) {
        directive.status = 'completed';
        return true;
    }
    
    // Create spawn requests for required creeps
    let spawnRequests = this.createSpawnRequests(directive);
    
    // Add to existing spawn request system
    _.each(spawnRequests, request => {
        Memory.hive.spawn_requests.push(request);
    });
    
    return true;
}
```

#### Site Management Integration

```javascript
// For remote mining directives
execute: function(directive) {
    let targetRoom = directive.directive.targetRoom;
    let sourceRoom = directive.directive.sourceRoom || this.findNearestColony(targetRoom);
    
    // Use existing Sites.Mining system
    if (!Memory.sites.mining[targetRoom]) {
        Memory.sites.mining[targetRoom] = {
            colony: sourceRoom,
            has_keepers: directive.directive.hasKeepers || false
        };
    }
    
    directive.status = 'completed';
    return true;
}
```

### 5. Console Commands Integration

```javascript
// Add to definitions_console_commands.js
empire.flag_status = function() {
    let flags = Memory.flags || {};
    let activeCount = _.filter(flags, f => f.status === 'in_progress').length;
    let pendingCount = _.filter(flags, f => f.status === 'pending').length;
    let completedCount = _.filter(flags, f => f.status === 'completed').length;
    
    console.log(`<font color="#FF6B6B">[Flag Status]</font> Active: ${activeCount}, Pending: ${pendingCount}, Completed: ${completedCount}`);
    
    _.each(flags, (directive, flagName) => {
        let statusIcon = directive.status === 'completed' ? '✅' : 
                        directive.status === 'in_progress' ? '🔄' : '⏳';
        console.log(`  ${statusIcon} ${flagName}: ${directive.directive.type} -> ${directive.directive.targetRoom}`);
    });
};

empire.clear_flags = function() {
    Memory.flags = {};
    console.log(`<font color="#FF6B6B">[Flag]</font> All flag directives cleared`);
};
```

## 🚀 Implementation Phases

### Phase 1: Core Flag Detection (Week 1)
- [ ] Create `definitions_flag_manager.js`
- [ ] Implement basic flag detection and parsing
- [ ] Add memory initialization in `Control.initMemory()`
- [ ] Integrate into main loop
- [ ] Add basic console commands

### Phase 2: Colonize Handler (Week 1-2)
- [ ] Implement `ColonizeHandler`
- [ ] Integrate with existing spawn request system
- [ ] Add creep assignment tracking
- [ ] Test with simple colonize flags

### Phase 3: Remote Mining Handler (Week 2)
- [ ] Implement `RemoteMiningHandler`
- [ ] Integrate with existing `Sites.Mining` system
- [ ] Add route calculation and creep management
- [ ] Test remote mining operations

### Phase 4: Advanced Handlers (Week 2-3)
- [ ] Implement `AttackHandler` with combat tactics
- [ ] Implement `BoostHandler` for combat boosts
- [ ] Implement `TradeHandler` for market operations
- [ ] Add comprehensive error handling

### Phase 5: Optimization & Polish (Week 3)
- [ ] Add CPU profiling for flag operations
- [ ] Implement cleanup and memory management
- [ ] Add comprehensive logging and debugging
- [ ] Performance optimization

## 🔍 Testing Strategy

### Unit Testing
1. **Flag Detection**: Test various flag name formats
2. **Directive Parsing**: Verify correct parameter extraction
3. **Handler Selection**: Ensure proper handler assignment
4. **Memory Management**: Test cleanup and persistence

### Integration Testing
1. **Spawn Integration**: Verify spawn requests are created correctly
2. **Site Integration**: Test remote mining site creation
3. **Console Commands**: Verify status reporting works
4. **CPU Impact**: Monitor performance impact

### End-to-End Testing
1. **Colonize Flow**: Place flag → spawn creeps → claim room → cleanup
2. **Remote Mining Flow**: Place flag → create site → spawn creeps → mine
3. **Error Handling**: Test invalid flags, failed operations
4. **Performance**: Monitor CPU usage during heavy operations

## 📊 Success Metrics

### Performance Metrics
- **Flag Detection**: < 0.1 CPU per tick
- **Directive Processing**: < 0.5 CPU per tick
- **Memory Usage**: < 1KB per active directive
- **Response Time**: < 1 tick for flag detection

### Functionality Metrics
- **Detection Accuracy**: > 95% correct flag parsing
- **Execution Success**: > 90% successful directive completion
- **Memory Cleanup**: 100% cleanup of completed directives
- **Error Recovery**: Graceful handling of all error conditions

## 🔧 Configuration Options

```javascript
// Add to Memory.hive for configuration
Memory.hive.flag_config = {
    enabled: true,
    maxActiveDirectives: 10,
    cleanupInterval: 1000, // ticks
    logLevel: 'info', // debug, info, warn, error
    cpuLimit: 0.5, // max CPU per tick for flag operations
    priorities: {
        colonize: 1,
        remote: 2,
        attack: 3,
        boost: 4,
        trade: 5
    }
};
```

## 🚨 Safety & Error Handling

### Safety Checks
- **Resource Limits**: Check available energy before spawning
- **Room Validation**: Verify target rooms exist and are accessible
- **Creep Limits**: Respect global creep limits
- **CPU Protection**: Skip operations if CPU is high

### Error Recovery
- **Failed Spawns**: Retry with different spawn locations
- **Invalid Rooms**: Mark directive as failed with reason
- **Memory Corruption**: Reset directive state
- **Handler Errors**: Log error and mark directive as failed

### User Override
- **Emergency Stop**: `empire.emergency_stop_flags()`
- **Force Cleanup**: `empire.force_cleanup_flags()`
- **Debug Mode**: `empire.debug_flags(true/false)`
- **Manual Override**: Direct memory manipulation commands

---

**Next Steps**: 
1. Create the `definitions_flag_manager.js` file
2. Implement basic flag detection
3. Add memory initialization to `Control.initMemory()`
4. Integrate into main loop
5. Test with simple flag placement

This plan provides a solid foundation for the flag management system that integrates seamlessly with your existing architecture while maintaining the performance and reliability standards you've established. 