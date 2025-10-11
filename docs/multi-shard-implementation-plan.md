# Multi-Shard Implementation Plan

## Overview

This document outlines the plan for implementing multi-shard colony management in the AZC-Screeps bot. This is a major architectural upgrade that will enable the bot to establish and manage colonies across multiple shards using inter-shard portals.

**Status**: Planning Phase  
**Target**: Full multi-shard colony support with automated creep transitions  
**Estimated Complexity**: High - Will touch most core systems

---

## Key Screeps Multi-Shard Mechanics

### 1. InterShardMemory API
- **Storage**: Each shard can store up to 100 KB of string data
- **Access Pattern**: 
  - Write-only to own shard's data
  - Read-only access to other shards' data
- **Format**: JSON string (must serialize/deserialize)
- **Use Cases**: 
  - Coordinating expansion across shards
  - Sharing resource availability
  - Communicating creep arrivals/departures
  - Global strategic planning

### 2. Inter-Shard Portals
- **Location**: Highway intersections (crossroads)
- **Behavior**: When creep enters portal, it disappears from current shard and appears at corresponding position on destination shard
- **Pathfinding**: Must implement custom cross-shard pathfinding (PathFinder is single-shard only)
- **Portal Types**: 
  - Stable portals (permanent)
  - Unstable portals (appear/disappear)

### 3. Memory Isolation
- **Separate Memory Objects**: Each shard has its own isolated `Memory` object
- **No Shared State**: Cannot directly access Memory from other shards
- **Coordination**: Must use InterShardMemory for cross-shard communication

### 4. Game Object Isolation
- Each shard has its own `Game` object
- Cannot access rooms, creeps, or structures from other shards directly
- Must coordinate through InterShardMemory

---

## Current Architecture Analysis

### Memory Structure (Current)
```javascript
Memory = {
    hive: {
        // Global control data
        pulses: {},
        pause: {},
        allies: [],
        // ... other global settings
    },
    rooms: {
        [roomName]: {
            // Room-specific data
            colony: {},
            defense: {},
            survey: {},
            spawn_assist: {},
            // ... other room data
        }
    },
    sites: {
        [siteId]: {
            // Site management (colonies, mining, combat)
            type: "colony" | "mining" | "combat",
            rooms: [],
            // ... site-specific data
        }
    },
    creeps: {
        [creepName]: {
            // Creep-specific data (auto-cleaned)
            role: "",
            room: "",
            task: {},
            // ... creep data
        }
    }
}
```

### Key Systems That Need Updating

1. **Control System** (`definitions_hive_control.js`)
   - Main loop coordination
   - Colony management
   - Spawn requests
   - Resource management

2. **Sites System** (`definitions_sites.js`)
   - Colony operations
   - Mining operations
   - Combat operations

3. **Console Commands** (`definitions_console_commands.js`)
   - Empire management commands
   - Status reporting
   - Cross-shard controls

4. **Memory Management**
   - Dead memory cleanup
   - Memory initialization
   - Cross-shard data sync

5. **Creep Roles** (`definitions_creep_roles.js`, `definitions_creep_combat_roles.js`)
   - Travel behavior
   - Task completion
   - Portal traversal

6. **Population System** (`definitions_populations.js`)
   - Spawn demand calculation
   - Population distribution across shards

7. **Blueprint System** (`definitions_blueprint.js`)
   - Base layout management per shard

---

## Proposed Architecture Changes

### 1. Shard-Aware Memory Structure

```javascript
Memory = {
    hive: {
        // Global settings (same across all shards)
        shard_name: "shard0" | "shard1" | "shard2" | "shard3",
        master_shard: "shard0", // Primary coordination shard
        allies: [],
        global_pause: false,
        // ... other truly global settings
    },
    shard: {
        // Shard-specific control data (replaces most of old hive)
        pulses: {},
        pause: {},
        spawn_queue: [],
        // ... shard-specific hive data
    },
    rooms: {
        // Unchanged - already room-specific
    },
    sites: {
        // Unchanged - already site-specific
    },
    creeps: {
        // Unchanged - already creep-specific
    }
}
```

### 2. InterShardMemory Structure

```javascript
InterShardMemory.setLocal(JSON.stringify({
    shard_name: "shard0",
    tick: Game.time,
    
    // Colony status
    colonies: {
        [roomName]: {
            rcl: 8,
            energy: 500000,
            cpu_usage: 15.5,
            spawns_available: 3,
            can_assist: true,
            portal_rooms: ["E10N10", "E10N20"], // Rooms with portals
        }
    },
    
    // Resource availability
    resources: {
        energy: 5000000,
        minerals: {
            H: 10000,
            O: 15000,
            // ... other resources
        },
        commodities: {
            battery: 500,
            // ... other commodities
        }
    },
    
    // Cross-shard operations
    operations: {
        colonizations: [
            {
                id: "colonize_shard1_W1N1",
                source_shard: "shard0",
                source_room: "W5N5",
                dest_shard: "shard1",
                dest_room: "W1N1",
                status: "spawning" | "traveling" | "establishing" | "complete",
                creeps: ["Scout_123", "Worker_456"],
                portal_path: ["W5N5", "E10N10", "portal"],
            }
        ],
        
        creep_transfers: [
            {
                id: "transfer_123",
                creep_name: "Worker_123",
                source_shard: "shard0",
                dest_shard: "shard1",
                portal_room: "E10N10",
                dest_room: "W1N1",
                expected_arrival_tick: 12345,
                status: "traveling" | "arrived" | "assigned",
            }
        ]
    },
    
    // Strategic coordination
    strategy: {
        expansion_priority: ["shard1", "shard2", "shard3"],
        resource_sharing: {
            needs: {
                shard1: { energy: 100000, U: 5000 },
                shard2: { energy: 50000 }
            },
            offers: {
                shard0: { energy: 500000, L: 10000 }
            }
        }
    }
}));
```

### 3. Portal Management System

New module: `definitions_portals.js`

```javascript
global.Portals = {
    // Find all portals in controlled/visible rooms
    scanPortals: function() {
        // Returns array of portal objects with:
        // - position
        // - destination shard
        // - stability
        // - last_updated
    },
    
    // Get optimal portal route from room A to room B (cross-shard)
    getPortalRoute: function(sourceRoom, destShard, destRoom) {
        // Returns path array including portal traversal
    },
    
    // Track creeps expected to arrive via portal
    expectArrival: function(creepName, destShard, destRoom, expectedTick) {
        // Writes to InterShardMemory
    },
    
    // Process incoming creeps from other shards
    processArrivals: function() {
        // Reads InterShardMemory, assigns tasks to arrived creeps
    }
}
```

### 4. Cross-Shard Coordination System

New module: `definitions_shard_coordinator.js`

```javascript
global.ShardCoordinator = {
    // Sync data to InterShardMemory
    publishShardStatus: function() {
        // Update ISM with current shard status
    },
    
    // Read data from other shards
    getShardStatus: function(shardName) {
        // Parse ISM from specified shard
    },
    
    // Determine if this shard should spawn creeps for another shard
    shouldAssistShard: function(targetShard) {
        // Check resources, CPU, etc.
    },
    
    // Coordinate cross-shard colonization
    planColonization: function(targetShard, targetRoom) {
        // Create colonization operation in ISM
    },
    
    // Monitor cross-shard operations
    monitorOperations: function() {
        // Check status of ongoing cross-shard operations
    }
}
```

### 5. Modified Creep Behavior

Update `overloads_creep_travel.js` and `overloads_creep.js`:

```javascript
Creep.prototype.moveToRoom = function(targetRoom, targetShard) {
    // If same shard, use existing pathfinding
    // If different shard, use portal route
    
    if (targetShard && targetShard != Memory.hive.shard_name) {
        // Get portal route
        let route = Portals.getPortalRoute(this.room.name, targetShard, targetRoom);
        
        // Move along route, enter portal when reached
        if (this.pos.isNearTo(route.portal)) {
            this.moveTo(route.portal);
            
            // Record impending transfer in memory
            if (this.pos.isEqualTo(route.portal)) {
                Portals.expectArrival(this.name, targetShard, targetRoom, Game.time + route.travelTime);
            }
        }
    } else {
        // Existing single-shard travel logic
    }
}
```

---

## Implementation Phases

### Phase 1: Foundation
**Goal**: Establish multi-shard awareness and basic coordination

#### Tasks:
1. **Memory Refactoring**
   - [ ] Split `Memory.hive` into `Memory.hive` (global) and `Memory.shard` (local)
   - [ ] Add `Memory.hive.shard_name` initialization
   - [ ] Update all references from old `Memory.hive` to new structure
   - [ ] Test memory structure on single shard

2. **InterShardMemory Integration**
   - [ ] Create `definitions_intershard_memory.js`
   - [ ] Implement ISM write/read functions
   - [ ] Add ISM update to main loop (pulse-based)
   - [ ] Create ISM status display command

3. **Portal Detection**
   - [ ] Create `definitions_portals.js`
   - [ ] Implement portal scanning in visible rooms
   - [ ] Store portal data in `Memory.shard.portals`
   - [ ] Add console command to display portal info

4. **Documentation**
   - [ ] Create `docs/multi-shard-overview.md`
   - [ ] Update `docs/index.md` with multi-shard section
   - [ ] Document memory structure changes
   - [ ] Create migration guide

**Success Criteria**:
- Bot runs on single shard with new memory structure
- InterShardMemory correctly reads/writes
- Portals are detected and stored
- No performance regression

---

### Phase 2: Cross-Shard Visibility
**Goal**: Enable monitoring and status reporting across shards

#### Tasks:
1. **Shard Coordinator**
   - [ ] Create `definitions_shard_coordinator.js`
   - [ ] Implement `publishShardStatus()`
   - [ ] Implement `getShardStatus(shardName)`
   - [ ] Add coordinator update to main loop

2. **Status Commands**
   - [ ] Add `shard.status()` - Show all shard statuses
   - [ ] Add `shard.colonies(shardName)` - List colonies on shard
   - [ ] Add `shard.resources(shardName)` - Show resource availability
   - [ ] Add `shard.operations()` - Show cross-shard operations

3. **Monitoring System**
   - [ ] Add shard status to Grafana exports
   - [ ] Create visual indicators for shard health
   - [ ] Add alerts for shard issues

4. **Documentation**
   - [ ] Update `docs/reference-commands.md` with shard commands
   - [ ] Create `docs/multi-shard-monitoring.md`
   - [ ] Add troubleshooting section for multi-shard

**Success Criteria**:
- Can view status of all shards from any shard
- Console commands work correctly
- Monitoring provides useful insights
- No CPU impact > 5%

---

### Phase 3: Creep Portal Traversal
**Goal**: Enable creeps to move between shards

#### Tasks:
1. **Portal Routing**
   - [ ] Implement `Portals.getPortalRoute()`
   - [ ] Create cross-shard pathfinding algorithm
   - [ ] Handle portal stability checks
   - [ ] Add route caching

2. **Creep Travel Updates**
   - [ ] Update `Creep.prototype.moveToRoom()` for cross-shard
   - [ ] Add portal traversal logic to creep roles
   - [ ] Implement arrival tracking
   - [ ] Handle creep re-initialization on new shard

3. **Arrival Processing**
   - [ ] Implement `Portals.processArrivals()`
   - [ ] Assign tasks to arrived creeps
   - [ ] Handle memory transfer for arrived creeps
   - [ ] Add error handling for lost creeps

4. **Testing**
   - [ ] Test single creep portal traversal
   - [ ] Test multiple creeps simultaneously
   - [ ] Test error cases (portal disappears, etc.)
   - [ ] Verify memory cleanup

5. **Documentation**
   - [ ] Create `docs/multi-shard-creep-travel.md`
   - [ ] Document portal routing algorithm
   - [ ] Add examples of cross-shard creep usage
   - [ ] Update creep role documentation

**Success Criteria**:
- Creeps successfully traverse portals
- Creeps are properly assigned on arrival
- No memory leaks
- Robust error handling

---

### Phase 4: Cross-Shard Colonization
**Goal**: Enable establishing colonies on other shards

#### Tasks:
1. **Colonization Planning**
   - [ ] Create `empire.colonize_shard()` command
   - [ ] Implement colonization operation in ISM
   - [ ] Add spawn coordination for cross-shard
   - [ ] Handle creep spawn queue for other shards

2. **Colony Bootstrap**
   - [ ] Define initial creep composition for new shard colony
   - [ ] Implement phased creep deployment
   - [ ] Add supply line management (energy/resources)
   - [ ] Handle early colony failures

3. **Spawn Coordination**
   - [ ] Update spawn system to read ISM for cross-shard requests
   - [ ] Implement spawn assist for other shards
   - [ ] Add priority system for local vs. remote spawns
   - [ ] Track spawn debt/credits between shards

4. **Colony Management**
   - [ ] Update colony run logic to check shard isolation
   - [ ] Add cross-shard resource requests
   - [ ] Implement remote colony monitoring
   - [ ] Handle colony upgrades/downgrades

5. **Documentation**
   - [ ] Create `docs/multi-shard-colonization.md`
   - [ ] Add workflow guide for new shard expansion
   - [ ] Document spawn coordination system
   - [ ] Update empire commands documentation

**Success Criteria**:
- Can colonize room on different shard
- Colony successfully establishes and grows
- Spawn coordination works efficiently
- Resource supply lines are stable

---

### Phase 5: Resource Sharing
**Goal**: Enable resource trading between shards

#### Tasks:
1. **Resource Coordination**
   - [ ] Implement resource need/offer system in ISM
   - [ ] Create `shard.request_resource()` command
   - [ ] Create `shard.offer_resource()` command
   - [ ] Add automatic resource balancing

2. **Resource Transfer**
   - [ ] Implement creep-based resource transfer via portals
   - [ ] Add resource hauler role
   - [ ] Track resource transfers in progress
   - [ ] Handle transfer failures

3. **Factory Coordination**
   - [ ] Share factory production across shards
   - [ ] Coordinate commodity production
   - [ ] Implement cross-shard factory supply chains
   - [ ] Add factory efficiency metrics per shard

4. **Lab Coordination**
   - [ ] Share mineral availability across shards
   - [ ] Coordinate reaction production
   - [ ] Add lab boost supply to other shards

5. **Documentation**
   - [ ] Create `docs/multi-shard-resources.md`
   - [ ] Document resource sharing system
   - [ ] Add examples of resource coordination
   - [ ] Update economy documentation

**Success Criteria**:
- Resources can be requested/transferred between shards
- Automatic balancing works correctly
- Factory/lab coordination is efficient
- No resource duplication or loss

---

### Phase 6: Combat Coordination
**Goal**: Enable cross-shard combat operations

#### Tasks:
1. **Combat Planning**
   - [ ] Add cross-shard combat operation type
   - [ ] Implement combat force deployment via portals
   - [ ] Add combat supply lines
   - [ ] Track combat forces across shards

2. **Combat Commands**
   - [ ] Update `empire.combat_*` commands for multi-shard
   - [ ] Add `shard.deploy_force()` command
   - [ ] Add `shard.recall_force()` command
   - [ ] Implement combat retreat via portals

3. **Defense Coordination**
   - [ ] Share threat intel across shards
   - [ ] Request defense assistance from other shards
   - [ ] Coordinate safe mode usage
   - [ ] Add cross-shard ally verification

4. **Documentation**
   - [ ] Update `docs/defense-and-security.md` for multi-shard
   - [ ] Create `docs/multi-shard-combat.md`
   - [ ] Document combat coordination system
   - [ ] Add combat operation examples

**Success Criteria**:
- Can deploy combat forces to other shards
- Combat supply lines are stable
- Defense requests work correctly
- Combat forces can retreat via portals

---

### Phase 7: Optimization & Polish
**Goal**: Optimize performance and user experience

#### Tasks:
1. **Performance Optimization**
   - [ ] Profile ISM read/write costs
   - [ ] Optimize portal route caching
   - [ ] Reduce cross-shard coordination CPU
   - [ ] Add performance metrics for multi-shard

2. **Error Handling**
   - [ ] Add comprehensive error handling
   - [ ] Implement recovery from shard disconnection
   - [ ] Handle portal stability changes
   - [ ] Add alerting for critical failures

3. **User Experience**
   - [ ] Add visual indicators for cross-shard operations
   - [ ] Improve console command output
   - [ ] Add progress tracking for operations
   - [ ] Create quick-start guide

4. **Testing**
   - [ ] Comprehensive testing on PTR
   - [ ] Test all edge cases
   - [ ] Load testing with multiple shards
   - [ ] Verify no memory leaks

5. **Documentation**
   - [ ] Complete all documentation
   - [ ] Create video tutorials (optional)
   - [ ] Add FAQ section
   - [ ] Update main README with multi-shard info

**Success Criteria**:
- CPU overhead < 10% for multi-shard
- All edge cases handled
- Documentation complete
- User-friendly interface

---

## File Structure Changes

### New Files
```
/definitions_portals.js              [sec11a] Portals
/definitions_shard_coordinator.js     [sec12a] Shard Coordinator
/definitions_intershard_memory.js     [sec13a] InterShardMemory Manager

/docs/multi-shard-overview.md
/docs/multi-shard-monitoring.md
/docs/multi-shard-creep-travel.md
/docs/multi-shard-colonization.md
/docs/multi-shard-resources.md
/docs/multi-shard-combat.md
/docs/multi-shard-migration-guide.md
```

### Modified Files
```
/main.js                              - Add new module requires
/definitions_hive_control.js          - Memory structure refactor
/definitions_console_commands.js      - Add shard.* commands
/definitions_sites.js                 - Shard-aware colony management
/definitions_creep_roles.js           - Cross-shard travel
/definitions_populations.js           - Cross-shard spawn coordination
/overloads_creep.js                   - Portal traversal methods
/overloads_creep_travel.js            - Cross-shard pathfinding
/overloads_room.js                    - Portal detection

/docs/index.md                        - Add multi-shard section
/docs/getting-started.md              - Add multi-shard setup
/docs/reference-commands.md           - Add shard.* commands
/docs/configuration.md                - Add ISM configuration
/docs/development.md                  - Add multi-shard dev guide
```

---

## Memory Structure Migration

### Before (Single-Shard)
```javascript
Memory.hive = {
    pulses: {},
    pause: {},
    allies: [],
    spawn_queue: [],
    // ... everything mixed together
}
```

### After (Multi-Shard)
```javascript
// Global across all shards
Memory.hive = {
    shard_name: "shard0",
    master_shard: "shard0",
    allies: [],
    global_pause: false,
}

// Shard-specific (was part of Memory.hive)
Memory.shard = {
    pulses: {},
    pause: {},
    spawn_queue: [],
    portals: {},
    operations: {},
}
```

### Migration Function
```javascript
global.migrateToMultiShard = function() {
    // One-time migration function
    // Moves data from Memory.hive to Memory.shard
    // Sets Memory.hive.shard_name
    // Preserves existing behavior
}
```

---

## Console Command Structure

### New Command Category: `shard.*`
```javascript
// Status and monitoring
shard.status()                                    // Show all shard statuses
shard.colonies(shardName)                         // List colonies on shard
shard.resources(shardName)                        // Show resources on shard
shard.operations()                                // Show cross-shard operations
shard.portals()                                   // Show known portals

// Colonization
shard.colonize(shardName, roomName, options)      // Start colonization
shard.abandon_colony(shardName, roomName)         // Abandon colony on other shard

// Resource management
shard.request_resource(resource, amount, fromShard)   // Request resource from shard
shard.offer_resource(resource, amount, toShard)       // Offer resource to shard
shard.transfer_status()                               // Show resource transfers

// Combat
shard.deploy_force(shardName, roomName, forceType)    // Deploy combat force
shard.recall_force(operationId)                       // Recall combat force

// Configuration
shard.set_master(shardName)                       // Set master coordination shard
shard.set_priority(priorities)                    // Set expansion priority

// Debugging
shard.debug_ism()                                 // Show InterShardMemory contents
shard.clear_operations()                          // Clear stuck operations
```

---

## Testing Strategy

### Phase 1: Single Shard Testing
- Deploy refactored code to single shard
- Verify no functionality breaks
- Check memory structure
- Monitor CPU usage

### Phase 2: Two Shard Testing
- Deploy to two shards
- Test ISM communication
- Test portal detection
- Verify status commands

### Phase 3: Portal Traversal Testing
- Send test creeps through portals
- Verify arrival and task assignment
- Test error cases
- Monitor memory cleanup

### Phase 4: Colonization Testing
- Establish test colony on second shard
- Monitor spawn coordination
- Verify resource supply
- Test colony growth

### Phase 5: Full Integration Testing
- Test on PTR with all shards
- Load test with multiple colonies
- Verify resource sharing
- Test combat operations

### Phase 6: Production Deployment
- Gradual rollout to production shards
- Monitor performance metrics
- Gather user feedback
- Fix issues as they arise

---

## Risk Mitigation

### High Priority Risks

1. **Memory Structure Breaking Changes**
   - **Risk**: Refactoring Memory.hive could break existing functionality
   - **Mitigation**: 
     - Create migration function
     - Test thoroughly on PTR
     - Maintain backward compatibility layer
     - Create rollback plan

2. **InterShardMemory 100KB Limit**
   - **Risk**: ISM data could exceed 100KB with many colonies
   - **Mitigation**:
     - Implement data compression
     - Use efficient JSON structure
     - Prioritize critical data
     - Add monitoring for ISM size

3. **CPU Overhead**
   - **Risk**: Cross-shard coordination could significantly increase CPU
   - **Mitigation**:
     - Profile all ISM operations
     - Use pulse-based updates
     - Cache ISM reads
     - Optimize data structures

4. **Portal Instability**
   - **Risk**: Portals can disappear, trapping creeps
   - **Mitigation**:
     - Monitor portal stability
     - Implement fallback routes
     - Add creep recall mechanism
     - Track portal history

5. **Creep Loss During Transfer**
   - **Risk**: Creeps could be lost during portal traversal
   - **Mitigation**:
     - Track expected arrivals
     - Implement timeout detection
     - Re-spawn lost creeps
     - Add operation logging

### Medium Priority Risks

6. **Spawn Coordination Conflicts**
   - **Risk**: Multiple shards requesting spawns could conflict
   - **Mitigation**:
     - Implement priority system
     - Add spawn debt tracking
     - Use fair scheduling algorithm

7. **Resource Transfer Bottlenecks**
   - **Risk**: Portal-based transfer could be slow
   - **Mitigation**:
     - Batch resource transfers
     - Use dedicated hauler creeps
     - Implement transfer queue

8. **Documentation Drift**
   - **Risk**: Documentation could become outdated during development
   - **Mitigation**:
     - Update docs with each phase
     - Review docs at phase completion
     - Use changelog to track changes

---

## Success Metrics

### Performance Metrics
- **CPU Overhead**: < 10% increase for multi-shard operations
- **ISM Size**: < 80KB per shard (leave headroom)
- **Portal Traversal Time**: < 5 minutes average
- **Colonization Time**: New colony established within 24 hours

### Functionality Metrics
- **Shard Coverage**: All accessible shards monitored
- **Portal Detection**: 100% of visible portals detected
- **Creep Transfer Success**: > 95% successful traversals
- **Colony Survival**: > 90% new colonies reach RCL 3

### User Experience Metrics
- **Command Response**: < 0.1 CPU per command
- **Status Update Latency**: < 3 ticks for ISM updates
- **Error Recovery**: Automatic recovery from common failures
- **Documentation Coverage**: 100% of features documented

---

## Dependencies & Prerequisites

### Required Knowledge
- InterShardMemory API
- Portal mechanics
- Cross-shard pathfinding
- Serialization/deserialization

### Required Tools
- MCP Screeps tools for testing
- PTR access for multi-shard testing
- Profiling tools for performance monitoring

### Required Resources
- CPU headroom for additional logic
- Memory for ISM coordination
- At least 2 accessible shards for testing

---

## Open Questions & Decisions Needed

1. **Master Shard Selection**
   - Should we designate one shard as "master" for coordination?
   - Or use fully distributed coordination?
   - **Proposed**: Use master shard for simplicity in Phase 1

2. **Resource Transfer Priority**
   - How do we prioritize resource transfers vs. local needs?
   - **Proposed**: Local needs always first, then transfers

3. **Combat Force Size Limits**
   - Should we limit size of forces deployed via portals?
   - **Proposed**: Start with small forces, scale up after testing

4. **Portal Route Caching**
   - How long should we cache portal routes?
   - **Proposed**: Cache for 1000 ticks, revalidate on use

5. **ISM Update Frequency**
   - How often should we update InterShardMemory?
   - **Proposed**: Every 100-400 ticks (same as factory pulse)

6. **Colonization Threshold**
   - What conditions must be met before expanding to new shard?
   - **Proposed**: RCL 8 in at least one colony, energy > 1M, CPU < 80%

---

## Implementation Notes

### Critical Path Items
1. Memory refactoring (blocks everything)
2. ISM integration (blocks coordination)
3. Portal detection (blocks traversal)
4. Creep traversal (blocks colonization)

### Parallel Development Opportunities
- Documentation can be written alongside implementation
- Console commands can be developed in parallel with backend
- Visual elements can be added after functionality works
- Optimization can happen after basic functionality

### Integration Points
- Main loop must be updated for each phase
- Console commands must be updated incrementally
- Documentation must be updated continuously
- Testing must happen after each phase

---

## Phase Summary

| Phase | Key Deliverables |
|-------|------------------|
| Phase 1: Foundation | Memory refactor, ISM integration, portal detection |
| Phase 2: Visibility | Shard monitoring, status commands |
| Phase 3: Traversal | Creep portal movement, arrival processing |
| Phase 4: Colonization | Cross-shard colonies, spawn coordination |
| Phase 5: Resources | Resource sharing, factory/lab coordination |
| Phase 6: Combat | Combat operations, defense coordination |
| Phase 7: Polish | Optimization, testing, documentation |

**Total**: 7 phases

---

## Next Steps

1. **Review this plan** with stakeholders
2. **Create feature branch**: `feature/multi-shard`
3. **Set up testing environment** on PTR
4. **Begin Phase 1**: Memory refactoring
5. **Update CHANGELOG_DOCS.md** with plan

---

## References

- [Screeps API - InterShardMemory](https://docs.screeps.com/api/)
- [Screeps Docs - Global Objects](https://docs.screeps.com/global-objects.html)
- [Screeps PTR Documentation](https://docs.screeps.com/ptr.html)
- Current bot documentation: `/docs/index.md`

---

**Document Version**: 1.0  
**Status**: Planning Phase  
**Author**: AZC-Screeps Development Team

