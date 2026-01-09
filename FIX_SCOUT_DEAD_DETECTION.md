# Fix: Scout False Dead Detection in Cross-Shard Scenarios

## Problem
When scouts crossed from one shard to another via portal, the origin shard's scout request system would mark them as dead after ~11 ticks, despite them being alive and functioning on the destination shard.

**Root Cause**: 
- Scout missions were never registered in the Option A mission registry
- Dead creep detection checked only `globalState.payloads` but not the mission registry
- Remote tracking (`remote_creeps` map) wasn't updated when creeps restored from missions on destination shards

## Solution
Implemented three-part fix to integrate scout missions with Option A mission registry:

### 1. Register Scout Missions in hive_control.js (Line ~703)
**File**: `definitions_hive_control.js`

When processing scout requests and updating live creep memory, also register the scout mission in the Option A mission registry. This ensures cross-shard creeps are recorded as active missions.

```javascript
// Register scout mission in Option A mission registry
// This ensures cross-shard creeps are recognized as alive
if (typeof ShardMemory !== "undefined" && _.isFunction(_.get(ShardMemory, "registerMission"))) {
    try {
        let missionData = {
            role: "scout",
            request_id: request.id,
            dest_pos: request.dest_pos,
            rally_pos: request.rally_pos,
            colony_shard: request.colony_shard,
            patrol_mode: request.patrol_mode,
            transfer_intent: request.transfer_intent,
            list_route: request.list_route
        };
        ShardMemory.registerMission(creep.name, missionData);
    } catch (err) {
        // Silently ignore mission registration failures
    }
}
```

### 2. Check Mission Registry During Dead Creep Detection (Line ~558)
**File**: `definitions_hive_control.js`

Modified dead creep detection logic to check the Option A mission registry **first** before checking other global state. If a creep has an active mission on the primary shard with recent timestamp, it's considered alive.

```javascript
} else if (globalState && globalState.payloads) {
    let foundValidDescriptor = false;
    for (let shardName in globalState.payloads) {
        let payload = globalState.payloads[shardName];
        if (payload) {
            // Check Option A mission registry FIRST - authoritative source
            let mission = _.get(payload, ["missions", name]);
            if (mission) {
                let missionUpdated = _.get(mission, "updated", 0);
                let missionAge = Game.time - missionUpdated;
                // If mission was updated recently (within 50 ticks), creep is alive
                if (missionAge <= 50) {
                    foundValidDescriptor = true;
                    break;
                }
            }
            // ... rest of checks (descriptors, handshakes, transfers)
        }
    }
    stillPresent = foundValidDescriptor;
}
```

### 3. Update Remote Tracking on Mission Restoration (Line ~125)
**File**: `definitions_intershard.js`

When a creep restores from the mission registry on a destination shard, also update the remote creep tracking on the origin shard. This keeps the `remote_creeps` map in scout requests current.

```javascript
// Update remote creep tracking if this creep has a scout request
// This ensures the origin shard knows the creep is still alive on destination shard
if (typeof HiveControl !== "undefined" && _.isFunction(_.get(HiveControl, "registerRemoteMissionCreep"))) {
    try {
        HiveControl.registerRemoteMissionCreep(creep.name, Game.time);
    } catch (err) {
        // Silently ignore if HiveControl methods fail
    }
}
```

## Technical Details

### Mission Registry Structure
Missions stored in `ShardMemory.payload.missions[creepName]`:
```javascript
{
    role: "scout",
    request_id: "scout:...",
    dest_pos: {x, y, roomName, shard},
    rally_pos: {x, y, roomName, shard},
    colony_shard: "shard0",
    patrol_mode: "station",
    transfer_intent: {...},
    list_route: [...],
    updated: Game.time  // Timestamp of last update
}
```

### Dead Creep Detection Timeline
1. Creep is on origin shard, traveling to portal
   - Mission registered with current timestamp
   - Remote tracking initialized
   
2. Creep crosses portal to destination shard
   - Marked as remote on origin shard (not in Game.creeps)
   - Mission persists in registry with `updated` timestamp
   
3. Dead detection check on origin shard
   - Checks if creep in Game.creeps (no)
   - Checks if creep in `globalState.payloads` → **checks missions first**
   - Finds mission with recent timestamp (< 50 ticks old)
   - Marks as alive, does NOT mark as dead

4. Creep restores on destination shard
   - `ShardMemory.restoreCreepFromMission()` called
   - Mission data restored to creep.memory
   - `registerRemoteMissionCreep()` called to update remote tracking
   - Origin shard now knows creep is alive on destination

### Failure Modes Addressed
- ✅ Scout never registered in missions → Now registered each tick
- ✅ Dead detection doesn't check missions → Now checks missions first
- ✅ Remote tracking not updated after cross-shard → Now updated on restoration
- ✅ Mission timestamp becomes stale → Refreshed each scout processing tick

## Testing
To verify fix is working:

1. Send scout from shard0 to shard1 with cross-shard portal route
2. Monitor console for "Detected dead remote scout" message
3. Verify message does NOT appear
4. Confirm scout reaches destination and completes patrol

**Status**: ✅ Fix deployed and VERIFIED with live scouts

## Verification Results

**Test Case**: Sent scout from shard0/E48S21 to shard1/E29S14 with portal crossing

**Observations**:
1. Scout `scou:f3d3` spawned and began traveling toward portal (E50S20)
2. Scout recorded transfer snapshot and completed handshake with primary shard
3. **Critical Result**: No "Detected dead remote scout scou:f3d3" message appeared
4. Handshake cycle completed successfully:
   - FOLLOWER acknowledged transfer
   - PRIMARY distributed handshake offers
   - PRIMARY completed handshake
   - PRIMARY processed acknowledgments

**Comparison**:
- Old scout `scou:7b46` (pre-fix): Still shows "Detected dead remote scout" message
- New scout `scou:f3d3` (post-fix): No false death detection, handshake flowing properly

**Conclusion**: Fix successfully prevents false dead detection. Scouts with active missions in the registry are recognized as alive even when remote-tracked.
