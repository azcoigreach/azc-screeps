# Target Commitment System

## Overview
The Target Commitment System prevents creeps from constantly switching between energy sources, containers, and dropped resources - a behavior known as "bouncing" that wastes CPU and movement ticks.

## Problem Description
Previously, creeps would re-evaluate their energy collection targets every tick when their task completed or expired. This caused:
- Workers bouncing between sources based on which had more energy at that moment
- Miners switching direction mid-journey when another container filled up
- Wasted CPU calculating paths repeatedly
- Inefficient movement patterns
- Lower overall energy collection rates

This was especially problematic at RCL 1-3 where:
- Sources deplete and regenerate frequently
- Containers aren't always present or may be empty
- Energy availability fluctuates rapidly
- Creeps don't have enough capacity to make trips worthwhile

## Solution: Target Commitment
When a creep selects a target (source/container/dropped resource), it "commits" to that target for a duration. The commitment is stored in creep memory:

```javascript
creep.memory.committed_target = {
    source: "source_id",      // For mining tasks
    container: "container_id", // For withdraw tasks  
    pickup: "resource_id",     // For pickup tasks
    until: Game.time + duration // Commitment expiration tick
};
```

### Commitment Logic
1. **Check for existing commitment**: If `Game.time < committed_target.until`, try to use the committed target
2. **Validate commitment**: Verify target still exists and has resources
3. **Clear if invalid**: If target is gone/empty, delete the commitment
4. **Select new target**: If no valid commitment, find a new target using normal logic
5. **Commit to new target**: Store target ID and expiration tick

### Commitment Durations

| Task Type | Early Game (RCL ≤3) | Late Game (RCL >3) | Reason |
|-----------|---------------------|-------------------|--------|
| Mining (source) | 50 ticks | 100 ticks | Sources regenerate every 300 ticks; shorter for early flexibility |
| Withdraw (container) | 30 ticks | 60 ticks | Container levels fluctuate; shorter for responsiveness |
| Pickup (dropped) | 20 ticks | 20 ticks | Dropped resources decay quickly |

## Implementation

### Modified Functions

#### 1. `getTask_Mine()` (overloads_creep_tasks.js)
**Location**: Lines 922-1007

**Changes**:
- Added commitment check for non-burrower creeps
- Stores `committed_target.source` and `committed_target.until`
- Uses committed source if still valid and has energy
- Commits to new source for 50-100 ticks when selecting

**Code**:
```javascript
// Check for committed source
let committedSourceId = _.get(this.memory, ["committed_target", "source"]);
let committedUntil = _.get(this.memory, ["committed_target", "until"], 0);

if (committedSourceId && Game.time < committedUntil) {
    let committedSource = Game.getObjectById(committedSourceId);
    if (committedSource && committedSource.energy > 0) {
        source = committedSource;
    } else {
        delete this.memory.committed_target;
    }
}

// If selecting new source, commit to it
if (source && !committedSourceId) {
    let commitDuration = roomLevel <= 3 ? 50 : 100;
    _.set(this.memory, ["committed_target", "source"], source.id);
    _.set(this.memory, ["committed_target", "until"], Game.time + commitDuration);
}
```

**Note**: Burrowers use permanent source assignments via `Memory.rooms[room].sources[source.id].burrower` and don't need commitment system.

#### 2. `getTask_Withdraw_Container()` (overloads_creep_tasks.js)
**Location**: Lines 495-565

**Changes**:
- Added commitment check for energy containers
- Stores `committed_target.container` and `committed_target.until`
- Uses committed container if still has sufficient energy
- Commits to new container for 30-60 ticks when selecting

**Code**:
```javascript
// Check for committed container
let committedContainerId = _.get(this.memory, ["committed_target", "container"]);
let committedUntil = _.get(this.memory, ["committed_target", "until"], 0);

if (committedContainerId && Game.time < committedUntil) {
    let committedContainer = Game.getObjectById(committedContainerId);
    if (committedContainer && _.get(committedContainer, ["store", "energy"], 0) > carry_amount) {
        cont = committedContainer;
    } else {
        delete this.memory.committed_target;
    }
}

// If selecting new container, commit to it
if (cont && !committedContainerId) {
    let commitDuration = room_level <= 3 ? 30 : 60;
    _.set(this.memory, ["committed_target", "container"], cont.id);
    _.set(this.memory, ["committed_target", "until"], Game.time + commitDuration);
}
```

#### 3. `getTask_Pickup()` (overloads_creep_tasks.js)
**Location**: Lines 728-804

**Changes**:
- Added commitment check for dropped resources
- Stores `committed_target.pickup` and `committed_target.until`
- Uses committed pile if still exists and matches resource type
- Commits to new pile for 20 ticks when selecting

**Code**:
```javascript
// Check for committed pickup target
let committedPickupId = _.get(this.memory, ["committed_target", "pickup"]);
let committedUntil = _.get(this.memory, ["committed_target", "until"], 0);

if (committedPickupId && Game.time < committedUntil) {
    let committedPile = Game.getObjectById(committedPickupId);
    if (committedPile && committedPile.amount > 0) {
        if (!resource || committedPile.resourceType === resource) {
            return {type: "pickup", resource: committedPile.resourceType, id: committedPile.id, timer: 30};
        }
    }
    delete this.memory.committed_target;
}

// If selecting new pile, commit to it
if (targetPile) {
    _.set(this.memory, ["committed_target", "pickup"], targetPile.id);
    _.set(this.memory, ["committed_target", "until"], Game.time + 20);
}
```

## Memory Structure

### Per-Creep Memory
```javascript
creep.memory.committed_target = {
    source: "sourceId",        // ID of committed source (optional)
    container: "containerId",  // ID of committed container (optional)
    pickup: "resourceId",      // ID of committed pickup (optional)
    until: 65630450           // Game tick when commitment expires (required)
};
```

**Notes**:
- Only one commitment type is active at a time (source/container/pickup)
- Commitments automatically clear when invalid or expired
- Memory overhead: ~50-80 bytes per creep with active commitment
- Commitments are automatically cleaned when creep dies (standard memory cleanup)

## Benefits

### Performance
- **Reduced pathfinding**: Fewer `findClosestByPath()` calls
- **Lower CPU usage**: Less target re-evaluation each tick
- **Stable movement**: Creeps follow more direct paths

### Efficiency
- **Higher energy collection**: Less time wasted changing direction
- **Better distribution**: Creeps naturally spread across sources
- **Smoother operation**: More predictable behavior at all RCL levels

### Flexibility
- **Adaptive durations**: Shorter commitments in early game for flexibility
- **Graceful degradation**: Invalid targets trigger immediate re-evaluation
- **Resource-aware**: Different durations for different resource types

## Testing & Validation

### Upload & Deployment
```javascript
// Upload entire directory (includes all changes)
mcp_screeps_upload_code({
    mainJsPath: "/home/azcoigreach/repos/azc-screeps",
    branch: "default"
});
```

### Monitoring Commands
```javascript
// Check creep commitments
Object.values(Game.creeps)
    .filter(c => c.room.name == 'W21N11')
    .map(c => ({
        name: c.name,
        role: c.memory.role,
        task: c.memory.task?.type,
        committed: c.memory.committed_target
    }));

// Verify no bouncing behavior
// Watch creeps in game - they should commit to a source and stay with it
```

### Expected Behavior
1. **Early Game (RCL 1-3)**:
   - Workers select closest source with energy
   - Commit to source for 50 ticks (~100 seconds real-time)
   - Only switch if source depletes or commitment expires
   - Shorter container commitments (30 ticks) for responsiveness

2. **Late Game (RCL 4+)**:
   - Longer commitments (100 ticks for sources, 60 for containers)
   - More stable patterns as burrowers take over mining
   - Carriers commit to containers near their assigned sources

## Tuning Parameters

To adjust commitment durations, modify these lines:

### Mining Commitments
```javascript
// In getTask_Mine(), line ~1002
let commitDuration = roomLevel <= 3 ? 50 : 100;
```

### Container Commitments
```javascript
// In getTask_Withdraw_Container(), line ~549
let commitDuration = room_level <= 3 ? 30 : 60;
```

### Pickup Commitments
```javascript
// In getTask_Pickup(), line ~795
_.set(this.memory, ["committed_target", "until"], Game.time + 20);
```

**Recommendations**:
- Increase for more stable behavior (less switching)
- Decrease for more responsive adaptation (quicker switching)
- Balance based on room dynamics and creep travel times

## Troubleshooting

### Issue: Creeps still bouncing
**Cause**: Commitment duration too short for travel time
**Solution**: Increase commitment duration for that task type

### Issue: Creeps ignoring better targets
**Cause**: Commitment duration too long, target selection poor
**Solution**: Decrease commitment duration or improve initial selection logic

### Issue: Creeps stuck at empty sources
**Cause**: Commitment not clearing properly when invalid
**Solution**: Verify validation logic checks `source.energy > 0`

### Issue: High memory usage
**Cause**: Too many creeps with commitments
**Solution**: This is normal; commitments add ~50 bytes per creep

## Related Systems

### Burrower Assignment System
- Burrowers use permanent source assignments (not commitments)
- Stored in `Memory.rooms[room].sources[source.id].burrower`
- One burrower per source, persists until death
- Target commitment system explicitly skips burrowers

### Task System
- Commitments work alongside task timers
- Task timers (30-60 ticks) control task execution
- Commitments (20-100 ticks) control target selection
- Both systems cooperate to prevent bouncing

### State Machine
- Creeps still use "refueling" and "working" states
- Commitments only affect target selection, not state transitions
- State changes clear tasks but preserve commitments

## Future Enhancements

### Possible Improvements
1. **Dynamic duration**: Adjust based on room energy levels
2. **Source prediction**: Factor in regeneration timers
3. **Crowding awareness**: Break commitment if target becomes too crowded
4. **Distance-based**: Longer commitments for distant targets
5. **Performance metrics**: Track efficiency gains from commitments

### Compatibility
- Works with existing role behaviors (Worker, Mining, Courier)
- Compatible with all RCL levels (1-8)
- No changes needed to spawn logic or population templates
- Safe to deploy without migration

## Change Log

### Version 1.0 (2025-01-11)
- Initial implementation of target commitment system
- Added commitment logic to `getTask_Mine()`
- Added commitment logic to `getTask_Withdraw_Container()`
- Added commitment logic to `getTask_Pickup()`
- Implemented adaptive durations based on RCL
- Tested and deployed to W21N11 (Shard1)

## Authors
- Implementation: AI Assistant
- Testing: azcoigreach
- Room: W21N11, Shard1, RCL 2

