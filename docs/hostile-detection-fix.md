# Hostile Detection Fix - Root Cause Solution

## Problem

Workers and other non-combat creeps were stopping work when **any** hostile creep entered the room, regardless of whether the hostile creep had attack capabilities. This caused unnecessary work stoppage when harmless hostile creeps (like scouts, carriers, or miners) entered the room.

**Issues caused**:
1. Workers stopped building, repairing, and upgrading when harmless hostile creeps entered
2. Miners stopped mining when non-threatening hostiles were present  
3. Extractors stopped working when any hostile entered
4. Upgraders stopped upgrading controller when harmless hostiles were nearby
5. General productivity loss during routine hostile activity

**Root Cause**: The hostile detection logic was too broad at **two levels**:
1. Individual creep roles detected any `c.isHostile()` creep
2. Room safety assessment (`is_safe` flag) was set based on **any** hostile presence

## Solution

Fixed the root cause by modifying the room safety assessment to only consider hostile creeps that have attack capabilities (attack or ranged_attack parts) as actual threats.

### Changes Made

**File**: `definitions_sites.js` - Room Safety Assessment (Root Cause Fix)

##### Colony Room Survey (lines 69-75)

**Before**:
```javascript
let hostiles = !visible ? new Array()
    : _.filter(Game.rooms[rmColony].find(FIND_HOSTILE_CREEPS), c => { return c.isHostile(); });
_.set(Memory, ["rooms", rmColony, "defense", "hostiles"], hostiles);

let is_safe = visible && hostiles.length == 0;
_.set(Memory, ["rooms", rmColony, "defense", "is_safe"], is_safe);
```

**After**:
```javascript
let hostiles = !visible ? new Array()
    : _.filter(Game.rooms[rmColony].find(FIND_HOSTILE_CREEPS), c => { return c.isHostile(); });
_.set(Memory, ["rooms", rmColony, "defense", "hostiles"], hostiles);

// Only consider hostiles with attack capabilities as threats for safety assessment
let dangerous_hostiles = !visible ? new Array()
    : _.filter(Game.rooms[rmColony].find(FIND_HOSTILE_CREEPS), c => { 
        return c.isHostile() && (c.hasPart("attack") || c.hasPart("ranged_attack")); 
    });
let is_safe = visible && dangerous_hostiles.length == 0;
_.set(Memory, ["rooms", rmColony, "defense", "is_safe"], is_safe);
```

##### Mining Site Survey (lines 651-659)

**Before**:
```javascript
let is_safe = visible && hostiles.length == 0 && invaderCore == null;
_.set(Memory, ["rooms", rmHarvest, "defense", "is_safe"], is_safe);
_.set(Memory, ["sites", "mining", rmHarvest, "defense", "is_safe"], is_safe);
_.set(Memory, ["sites", "mining", rmHarvest, "defense", "hostiles"], hostiles);
```

**After**:
```javascript
// Only consider hostiles with attack capabilities as threats for safety assessment
let dangerous_hostiles = !visible ? new Array()
    : _.filter(Game.rooms[rmHarvest].find(FIND_HOSTILE_CREEPS), c => { 
        return c.isHostile() && (c.hasPart("attack") || c.hasPart("ranged_attack")); 
    });
let is_safe = visible && dangerous_hostiles.length == 0 && invaderCore == null;
_.set(Memory, ["rooms", rmHarvest, "defense", "is_safe"], is_safe);
_.set(Memory, ["sites", "mining", rmHarvest, "defense", "is_safe"], is_safe);
_.set(Memory, ["sites", "mining", rmHarvest, "defense", "hostiles"], hostiles);
```

### What Changed

**New Filter Logic**:
```javascript
c => { return c.isHostile() && (c.hasPart("attack") || c.hasPart("ranged_attack")); }
```

**What this means**:
- `c.isHostile()`: Still checks if the creep is hostile (not allied)
- `c.hasPart("attack")`: Checks if the creep has ATTACK parts
- `c.hasPart("ranged_attack")`: Checks if the creep has RANGED_ATTACK parts
- **Combined**: Only considers hostile creeps that can actually deal damage as threats

### Range Detection

The detection ranges remain the same:
- **Worker**: 5 tiles (close range, immediate threat)
- **Mining**: 6 tiles (slightly longer for miners in exposed positions)
- **Extractor**: 6 tiles (mineral extractors need more warning)
- **Upgrader**: 5 tiles (close range for controller area)

## What Hostile Creeps Are Still Avoided?

✅ **Hostile creeps WITH attack parts**:
- Soldiers (ATTACK)
- Rangers (RANGED_ATTACK)
- Paladins (ATTACK + HEAL)
- Archers (RANGED_ATTACK + MOVE)
- Any boosted combat creeps with attack capabilities

## What Hostile Creeps Are Now Ignored?

✅ **Hostile creeps WITHOUT attack parts**:
- Scouts (MOVE + CLAIM)
- Carriers (CARRY + MOVE)
- Workers (WORK + CARRY)
- Miners (WORK + CARRY)
- Upgraders (WORK + CARRY)
- Healers (HEAL only, no attack)
- Builders (WORK only, no attack)

## Behavior Changes

### Before Fix
- Hostile scout enters → `is_safe` becomes `false` → All workers stop working, run away
- Hostile carrier enters → `is_safe` becomes `false` → All miners stop mining, run away  
- Hostile worker enters → `is_safe` becomes `false` → All upgraders stop upgrading, run away
- **Result**: Constant work stoppage for harmless hostiles

### After Fix
- Hostile scout enters → `is_safe` stays `true` → Workers continue working normally
- Hostile carrier enters → `is_safe` stays `true` → Miners continue mining normally
- Hostile worker enters → `is_safe` stays `true` → Upgraders continue upgrading normally
- Hostile soldier enters → `is_safe` becomes `false` → All creeps avoid them (correct behavior)
- **Result**: Only stops work when actually threatened

## Combat System Unchanged

**Important**: The combat system remains unchanged:
- **Soldiers** still target any hostile creep (as they should)
- **Towers** still attack any hostile creep in range
- **Defense acquisition** still considers all hostiles for targeting
- Only **non-combat creep avoidance** was refined

## Testing

### How to Test

1. **Deploy a harmless hostile**:
   ```javascript
   // Spawn a hostile worker/scout in your room
   // Your workers should continue working normally
   ```

2. **Deploy a dangerous hostile**:
   ```javascript
   // Spawn a hostile soldier/ranger in your room
   // Your workers should stop working and avoid them
   ```

3. **Monitor creep behavior**:
   - Watch worker creeps continue building/repairing when harmless hostiles enter
   - Verify they still avoid dangerous hostiles with attack parts
   - Check that miners continue mining when non-threatening hostiles are present

### Expected Behavior

✅ **Workers continue working** when harmless hostile creeps enter  
✅ **Workers avoid dangerous** hostile creeps with attack parts  
✅ **Miners continue mining** when non-threatening hostiles are present  
✅ **Upgraders continue upgrading** when harmless hostiles are nearby  

## Performance Impact

**Positive Impact**:
- Reduced unnecessary movement and task switching
- Improved productivity during routine hostile activity
- Less CPU usage from constant avoidance behavior
- More efficient resource gathering and construction

**No Negative Impact**:
- Combat effectiveness unchanged
- Defense systems unchanged
- Still avoids actual threats appropriately

## Related Systems

### Combat Roles
- **Soldier/Archer roles**: Unchanged, still target all hostiles
- **Defense acquisition**: Unchanged, still considers all hostiles
- **Tower targeting**: Unchanged, still attacks all hostiles

### Safety Systems
- **Room safety status**: Now based on dangerous hostiles only
- **Spawn assistance**: Unchanged, still responds to all hostiles
- **Emergency protocols**: Unchanged, still triggered by any hostiles

## Edge Cases Handled

### Boosted Creeps
- Boosted combat creeps still have attack parts, so they're still avoided
- Boosted workers without attack parts are now ignored (correct)

### Mixed Creeps
- Creeps with both work and attack parts are avoided (correct - they're dangerous)
- Creeps with only work/carry parts are ignored (correct - they're harmless)

### Healers
- Hostile healers without attack parts are ignored
- Hostile healers with attack parts are avoided
- This prevents unnecessary avoidance of support creeps

## Technical Details

### Two-Level Fix

1. **Individual Creep Level**: Each creep role now filters hostiles by attack capabilities
2. **Room Safety Level**: The `is_safe` flag is now based only on dangerous hostiles

### Memory Structure

The fix maintains the existing memory structure:
- `Memory.rooms[roomName].defense.hostiles`: Still contains all hostiles (for combat systems)
- `Memory.rooms[roomName].defense.is_safe`: Now based on dangerous hostiles only
- `Memory.sites.mining[siteName].defense.is_safe`: Now based on dangerous hostiles only

### Backward Compatibility

- All existing memory structures preserved
- Combat systems unchanged
- Defense acquisition unchanged
- Only non-combat avoidance behavior modified

## Version Info

**Date**: October 13, 2025  
**Files Modified**:
- `definitions_creep_roles.js` (4 roles: Worker, Mining, Extractor, Upgrader)
- `definitions_sites.js` (2 functions: Colony.surveyRoom, Mining.surveyRoom)

**Logic Change**:
- Added attack part detection to hostile avoidance filter (individual level)
- Added attack part detection to room safety assessment (system level)
- Range detection unchanged
- Combat systems unchanged

---

## Summary

This comprehensive fix prevents non-combat creeps from unnecessarily stopping work when harmless hostile creeps enter the room, while maintaining appropriate avoidance of actual threats. The solution addresses both the individual creep level and the room-level safety assessment, ensuring that creeps only avoid hostiles that pose real danger. The result is significantly improved productivity and efficiency during routine hostile activity, without compromising safety against dangerous hostiles.