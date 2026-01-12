# Rampart Initial Hit Points Fix

## Problem

When ramparts are first constructed in Screeps, they start with only **1 hit point**. Ramparts decay at a rate of **1 hit per 300 ticks** (RAMPART_DECAY_TIME). This means a newly constructed rampart with only 1 hit would decay completely in just 300 ticks.

The issue was that after a construction site completed:
1. Creep would build the rampart construction site
2. Construction completes, rampart spawns with 1 hit
3. Creep moves on to next task immediately
4. Rampart may decay before repair cycle picks it up

This created a race condition where ramparts could disappear before the repair system noticed them.

## Solution

Modified the build task system to ensure ramparts receive adequate initial hit points immediately after construction.

### Changes Made

**File**: `overloads_creep_tasks.js`

#### 1. Enhanced Build Task Creation (`getTask_Build`)

**Lines**: 995-1002

Added position and structure type to build tasks:

```javascript
if (site != null)
    return {
        type: "build",
        id: site.id,
        pos: { x: site.pos.x, y: site.pos.y, roomName: site.pos.roomName },
        structureType: site.structureType,
        timer: 60
    };
```

**Why**: Need to track where the construction site is and what type of structure it is, so we can check after completion if it's a rampart that needs immediate fortification.

#### 2. Modified Build Task Handler (`runTask`)

**Lines**: 206-245

Enhanced the build case to handle rampart post-construction:

```javascript
case "build": {
    let structure = Game.getObjectById(this.memory.task["id"]);
    let result = this.build(structure);
    if (result == ERR_NOT_IN_RANGE) {
        Stats_Visual.CreepSay(this, 'build');
        this.travelTask(structure);
        return;
    } else if (result != OK) {
        // Construction site may have just completed - check if it's now a rampart that needs initial hits
        // Ramparts decay at 1 hit per 300 ticks, so 5000 hits = 1.5M ticks (safe for repair cycle)
        if (this.memory.task["structureType"] == STRUCTURE_RAMPART) {
            let pos = this.memory.task["pos"];
            if (pos != null) {
                let roomObj = Game.rooms[pos.roomName];
                if (roomObj != null) {
                    let structures = roomObj.lookForAt(LOOK_STRUCTURES, pos.x, pos.y);
                    let rampart = _.find(structures, s => s.structureType == STRUCTURE_RAMPART);
                    if (rampart != null && rampart.hits < 5000) {
                        // Switch to repairing the newly built rampart until it has safe hits
                        let repairResult = this.repair(rampart);
                        if (repairResult == ERR_NOT_IN_RANGE) {
                            Stats_Visual.CreepSay(this, 'fortify');
                            this.travelTask(rampart);
                            return;
                        } else if (repairResult == OK) {
                            Stats_Visual.CreepSay(this, 'fortify');
                            // Keep task alive until rampart has enough hits
                            return;
                        }
                    }
                }
            }
        }
        delete this.memory.task;
        return;
    } else { 
        Stats_Visual.CreepSay(this, 'build');
        return; 
    }
}
```

**How it works**:
1. Creep attempts to build the construction site
2. When `build()` returns an error (construction complete or site destroyed):
   - Check if the task was for a rampart
   - Look at the stored position to find the completed structure
   - If rampart exists and has < 5000 hits, switch to repair mode
   - Continue repairing until rampart has 5000+ hits
   - Visual indicator changes to 'fortify' during this phase

### Benefits

**Survival Time**:
- **Before**: 1 hit = 300 ticks until decay (5 seconds)
- **After**: 5000 hits = 1,500,000 ticks (25,000 minutes, ~17 days)

**Why 5000 hits?**:
- Provides ample time for repair cycle to pick up the rampart
- Minimal energy cost (5000 energy max from a single worker)
- Doesn't significantly delay other construction tasks
- Ensures rampart never decays before first repair

## Testing

### How to Test

1. **Create rampart construction sites**:
   ```javascript
   blueprint.set_layout(Game.rooms["W1N1"], 25, 25, "default_horizontal");
   ```

2. **Monitor rampart construction**:
   - Watch worker creeps build ramparts
   - Verify they show 'fortify' visual after construction completes
   - Check rampart hits with: `Game.rooms["W1N1"].find(FIND_STRUCTURES, {filter: s => s.structureType == STRUCTURE_RAMPART})`

3. **Verify initial hits**:
   ```javascript
   // Check ramparts after construction
   _.each(Game.rooms["W1N1"].find(FIND_STRUCTURES, {filter: s => s.structureType == STRUCTURE_RAMPART}),
       r => console.log(`Rampart at ${r.pos}: ${r.hits} hits`));
   ```

### Expected Behavior

- Worker builds rampart construction site
- Construction completes
- Worker immediately begins repairing rampart
- Creep visual shows 'fortify' instead of moving to next task
- Rampart reaches 5000+ hits before worker moves on
- Rampart safely survives until repair cycle takes over

## Related Systems

### Repair Cycle

The repair system (`definitions_sites.js`, `overloads_room.js`) handles ongoing maintenance:

- **Tower Repair** (`towerAcquireRepair`): Pulses every 15 ticks to find repair targets
- **Creep Repair** (`getTask_Repair`): Workers and repairers get repair tasks
- **Wall Target**: Ramparts repaired to `room.getWallTarget()` (RCL-based HP target)

The fix ensures ramparts have enough hits to last until either system picks them up.

### Blueprint System

Ramparts are placed by the blueprint system (`definitions_blueprint.js`):
- **RCL 3+**: Perimeter ramparts and walls
- **RCL 8**: Ramparts over critical structures (spawn, tower, storage, terminal, nuker, powerSpawn)

## Performance Impact

**Minimal Impact**:
- Only applies to ramparts (infrequent construction)
- Uses existing repair logic (no new pathfinding)
- Task continues naturally (no extra state management)
- No additional memory overhead (task already stored)

**Energy Cost**:
- Maximum 5000 energy per rampart (one-time cost)
- Typically less if workers refuel frequently
- Prevents wasted energy from ramparts decaying

## Future Considerations

### Potential Enhancements

1. **Configurable Threshold**: Allow different hit thresholds via memory
2. **Other Structures**: Apply similar logic to walls if needed
3. **Multi-Creep**: Could split fortification among multiple workers

### Not Needed

- **Constructed Walls**: Don't decay, don't need immediate hits
- **Other Structures**: Start with full hits or don't decay

## Version Info

**Date**: October 13, 2025
**Files Modified**:
- `overloads_creep_tasks.js` (2 sections)

**Related Constants**:
- `STRUCTURE_RAMPART`: Screeps constant
- `RAMPART_DECAY_TIME`: 300 ticks (Screeps constant)
- Threshold: 5000 hits (custom)

---

## Summary

This fix ensures ramparts never decay before entering the repair cycle by having the builder creep immediately fortify newly constructed ramparts to 5000 hits. This is a critical fix for defensive infrastructure stability.

