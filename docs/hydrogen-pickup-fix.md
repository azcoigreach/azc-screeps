# Hydrogen Pickup Fix

## Problem

Workers and Couriers were automatically picking up **all non-energy dropped resources** from the ground, including hydrogen and other base resources (H, O, U, L, K, Z, X) that drop when boosted creeps die.

**Issues caused**:
1. Workers picking up hydrogen had nowhere to store it
2. Creeps would carry hydrogen around indefinitely, reducing their effective capacity
3. Hydrogen would jam up workers who couldn't complete their tasks
4. No automatic way to dispose of unwanted base resources

**Root Cause**: The automatic pickup logic at the start of Worker and Courier roles filtered only for `resourceType !== "energy"`, which included all minerals and base resources.

## Solution

Modified the automatic pickup logic to exclude base resources and added a minimum amount threshold to avoid picking up tiny piles.

### Changes Made

**File**: `definitions_creep_roles.js`

#### 1. Worker Role Pickup Filter (lines 235-257)

**Before**:
```javascript
if (_.sum(creep.carry) < creep.carryCapacity) {
    let dropped = creep.room.find(FIND_DROPPED_RESOURCES, {
        filter: r => r.resourceType !== "energy"
    });
    // ... pickup logic
}
```

**After**:
```javascript
// Always prioritize picking up dropped commodities if there is free carry capacity
// Exclude base resources (H, O, U, L, K, Z, X) and boosts that are typically used in labs
const excludedResources = ["energy", "H", "O", "U", "L", "K", "Z", "X"];

if (_.sum(creep.carry) < creep.carryCapacity) {
    let dropped = creep.room.find(FIND_DROPPED_RESOURCES, {
        filter: r => !excludedResources.includes(r.resourceType) && r.amount > 50
    });
    // ... pickup logic
}
```

#### 2. Courier Role Pickup Filter (lines 472-494)

Same change applied to Courier role for consistency.

### Excluded Resources

The following resources are now excluded from automatic pickup:
- **energy**: Handled separately by energy-specific tasks
- **H** (Hydrogen): Base resource for boost production
- **O** (Oxygen): Base resource for boost production
- **U** (Utrium): Base resource for boost production
- **L** (Lemergium): Base resource for boost production
- **K** (Keanium): Base resource for boost production
- **Z** (Zynthium): Base resource for boost production
- **X** (Catalyst): Base resource for boost production

### Minimum Amount Threshold

Added `r.amount > 50` filter to avoid picking up tiny resource piles that aren't worth the travel time.

### Additional Fix: Console Command

**File**: `definitions_console_commands.js` (lines 1131-1165)

Added new console command `resources.check_dropped()` to help identify and locate dropped resources.

**Command**: `resources.check_dropped()`

**Functionality**:
- Scans all owned rooms for dropped resources
- Shows resource type, amount, and position
- Provides summary by resource type
- Useful for finding hydrogen and other unwanted resources on the ground

**Example Output**:
```
[Dropped Resources] Scanning all owned rooms...
W51N51:
  - H: 300 at (25, 30)
  - O: 150 at (26, 31)
W52N50:
  - metal: 500 at (10, 15)

[Dropped Resources] Summary:
  H: 450 total
  O: 150 total
  metal: 500 total
```

## What Resources ARE Picked Up?

Workers and Couriers will still automatically pick up:
- **Commodities**: silicon, metal, biomass, mist, etc.
- **Minerals**: All minerals except base resources (H, O, U, L, K, Z, X)
- **Compounds**: T1, T2, T3 boost compounds (e.g., UH, UH2O, XUH2O)
- **Any valuable dropped resources** (> 50 amount)

## Deposit Behavior

Workers who are already carrying hydrogen or other resources (including excluded ones) can still deposit them:
- Workers have `getTask_Deposit_Storage("mineral")` which deposits any non-energy resources to storage
- This allows cleanup of any hydrogen that was picked up before the fix
- Terminal also accepts these resources

## Testing

### How to Test

1. **Check for existing dropped hydrogen**:
   ```javascript
   resources.check_dropped()
   ```

2. **Watch worker behavior**:
   - Workers should ignore hydrogen piles on the ground
   - Workers should pick up valuable commodities (metal, silicon, etc.)

3. **Verify with specific creep**:
   ```javascript
   // Check what a creep is carrying
   Game.creeps["work:xxxx"].carry
   ```

4. **Manual cleanup if needed**:
   - If hydrogen is already on the ground, it will decay naturally
   - Or manually pick it up with terminal send orders

### Expected Behavior

✅ **Workers ignore hydrogen on ground**  
✅ **Workers pick up valuable commodities**  
✅ **Workers can still deposit hydrogen if carrying it**  
✅ **Console command shows dropped resource locations**  
✅ **Minimum 50 amount threshold prevents tiny pile pickup**  

## Performance Impact

**Minimal Impact**:
- Same number of `find()` calls
- Slightly more complex filter logic (negligible CPU cost)
- Reduced unnecessary movement and pickup actions
- Freed up creep capacity for useful work

## Related Systems

### Lab System
- Base resources (H, O, U, L, K, Z, X) are managed by the lab system
- Labs automatically request and use these resources
- Dropped base resources should be managed through lab restocking, not creep pickup

### Boost System
- Boosted creeps carry base resources and compounds
- When they die, these resources drop
- This fix ensures workers don't pick up the base resources
- Compounds (UH, UH2O, etc.) are still picked up as they're valuable

### Terminal System
- Terminal can store base resources
- Use `resources.send()` to manually move base resources between rooms
- Terminal orders have priority system for important transfers

## Future Considerations

### Potential Enhancements

1. **Configurable Exclusion List**: Allow rooms to specify which resources to exclude via Memory
2. **Smart Lab Restocking**: Automatically pick up base resources only when near labs that need them
3. **Decay Management**: Automatically identify resources that will decay soon and prioritize pickup

### Known Limitations

- Base resources on the ground will decay naturally (300 ticks)
- No automatic cleanup of existing hydrogen piles
- Manual intervention needed to clear large amounts of dropped base resources

## Version Info

**Date**: October 13, 2025  
**Files Modified**:
- `definitions_creep_roles.js` (2 sections: Worker and Courier roles)
- `definitions_console_commands.js` (1 new command: `resources.check_dropped()`)

**Constants Used**:
- Excluded resources: H, O, U, L, K, Z, X
- Minimum pickup amount: 50

---

## Summary

This fix prevents workers from automatically picking up hydrogen and other base resources that have no storage destination, while still allowing them to pick up valuable commodities and compounds. A new console command helps identify any existing dropped resources that need manual attention.

