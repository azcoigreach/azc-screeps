# Multi-Shard Migration Guide

## Overview

This guide helps you migrate your existing AZC-Screeps bot from single-shard to multi-shard operation. The migration involves memory structure changes, new module integration, and testing procedures.

**Target Audience**: Bot administrators and developers  
**Estimated Time**: 1-2 hours for migration + testing  
**Risk Level**: Medium (memory structure changes)

---

## Pre-Migration Checklist

Before starting the migration, ensure:

- [ ] **Backup Current Memory**: Use `JSON.stringify(Memory)` and save to file
- [ ] **Backup Current Code**: Commit all changes to git
- [ ] **CPU Headroom**: Ensure CPU usage < 70% (migration adds overhead)
- [ ] **Bucket Level**: Bucket should be > 5000 (for testing tolerance)
- [ ] **Test Environment**: Have access to PTR for testing
- [ ] **Documentation Access**: Read multi-shard-overview.md first

---

## Migration Steps

### Step 1: Update Code Files

#### 1.1 Add New Module Files

Add these new files to your codebase:

```
definitions_portals.js               [sec11a] Portals
definitions_shard_coordinator.js     [sec12a] Shard Coordinator  
definitions_intershard_memory.js     [sec13a] InterShardMemory Manager
```

Copy these files from the repository or create them from the templates in the implementation plan.

#### 1.2 Update main.js

Update the table of contents:

```javascript
/* ***********************************************************
 * 
 * Table of Contents:
 *
 * : [sec01a] General Overloads
 * : ... (existing sections)
 * : [sec10a] Grafana Statistics
 *
 * : [sec11a] Portals                    // NEW
 * : [sec12a] Shard Coordinator           // NEW
 * : [sec13a] InterShardMemory Manager    // NEW
 *
 * *********************************************************** */
```

Add requires after existing definitions:

```javascript
require("definitions_grafana_statistics");
require("definitions_portals");              // NEW
require("definitions_shard_coordinator");    // NEW
require("definitions_intershard_memory");    // NEW
```

Update the main loop to include shard coordination:

```javascript
module.exports.loop = function () {
    Stats_CPU.Init();

    if (Control.refillBucket()) {
        return;
    }

    Control.clearDeadMemory();
    Control.initMemory();
    Control.initLabs();
    Control.initVisuals();
    
    // NEW: Initialize shard coordination
    if (hasCPU() && isPulse_Mid()) {
        ShardCoordinator.publishShardStatus();
    }
    
    // NEW: Process portal arrivals
    if (hasCPU() && isPulse_Short()) {
        Portals.processArrivals();
    }

    FlagController.run();
    
    Control.runColonies();
    Control.runColonizations();
    Control.runCombat();
    Control.runHighwayMining();

    Control.processSpawnRequests();
    Control.processSpawnRenewing();

    if (hasCPU()) {
        Control.sellExcessResources();
        Control.moveExcessEnergy();
    }

    if (hasCPU()) {
        Blueprint.Init();
    }

    if (hasCPU()) {
        factories.maintenance();
    }
    
    // NEW: Scan for portals
    if (hasCPU() && isPulse_Long()) {
        Portals.scanPortals();
    }
    
    // NEW: Monitor cross-shard operations
    if (hasCPU() && isPulse_Mid()) {
        ShardCoordinator.monitorOperations();
    }

    Control.endMemory();
    Stats_Grafana.Run();
    Control.generatePixels();
    Stats_CPU.Finish();
};
```

### Step 2: Run Memory Migration

#### 2.1 Migration Function

Run this function **once** in the console on each shard:

```javascript
// Copy-paste this entire function into console
function migrateToMultiShard() {
    console.log("[Migration] Starting multi-shard memory migration...");
    
    // Detect current shard
    let shardName = Game.shard ? Game.shard.name : "shard0";
    console.log(`[Migration] Detected shard: ${shardName}`);
    
    // Backup old Memory.hive
    let oldHive = _.cloneDeep(Memory.hive || {});
    
    // Create new Memory.hive (global settings only)
    Memory.hive = {
        shard_name: shardName,
        master_shard: shardName, // First shard becomes master
        allies: oldHive.allies || [],
        global_pause: oldHive.pause?.global || false,
    };
    
    // Create new Memory.shard (shard-specific settings)
    Memory.shard = {
        pulses: oldHive.pulses || {},
        pause: {
            bucket: oldHive.pause?.bucket || false,
            manual: oldHive.pause?.manual || false,
        },
        spawn_queue: [],
        portals: {},
        operations: {},
        ism_last_update: 0,
    };
    
    console.log("[Migration] Memory structure updated:");
    console.log(`  - Memory.hive: ${JSON.stringify(Memory.hive).length} bytes`);
    console.log(`  - Memory.shard: ${JSON.stringify(Memory.shard).length} bytes`);
    
    console.log("[Migration] ✅ Migration complete!");
    console.log("[Migration] Old Memory.hive data preserved in Memory.shard");
    console.log("[Migration] Please verify bot functionality with system_status()");
    
    return "Migration successful";
}

// Run migration
migrateToMultiShard();
```

#### 2.2 Verify Migration

After running migration, verify with:

```javascript
// Check memory structure
console.log("Shard:", Memory.hive.shard_name);
console.log("Pulses:", Object.keys(Memory.shard.pulses));
console.log("Pause state:", Memory.shard.pause);

// Run system status
system_status();
```

Expected output:
- No errors in console
- `system_status()` shows normal operations
- Bot continues spawning/operating normally

### Step 3: Update Console Commands

#### 3.1 Add Shard Commands

The new shard commands should be automatically available from `definitions_console_commands.js`. Test them:

```javascript
// Basic status commands
shard.status();       // Should show current shard info
shard.portals();      // Should show "No portals detected yet" (until scanned)

// If these commands don't exist, you need to update definitions_console_commands.js
```

### Step 4: Test Single-Shard Operation

Before attempting multi-shard, verify single-shard still works:

#### 4.1 Test Core Functions

```javascript
// Test spawning
system_status();
// Verify creeps are spawning

// Test memory access
console.log(Memory.hive.shard_name);
console.log(Object.keys(Memory.shard.pulses).length);

// Test profiler
profiler.run(100);
// After 100 ticks:
profiler.analyze();
// Verify CPU usage hasn't increased significantly
```

#### 4.2 Monitor for Errors

Watch the console for any errors for at least 100 ticks. Common issues:

**"Cannot read property of undefined"**
- Usually means a memory path wasn't migrated correctly
- Check the specific line in the error
- May need to add fallback: `_.get(Memory, ["shard", "field"], default)`

**"Memory.hive.pulses is undefined"**
- Old code is still referencing old memory structure
- Find and replace `Memory.hive.pulses` → `Memory.shard.pulses`

**CPU spike**
- New modules may be running every tick instead of on pulses
- Verify pulse checks: `if (isPulse_Mid()) { ... }`

### Step 5: Enable Multi-Shard Features

Once single-shard operation is stable:

#### 5.1 Test InterShardMemory

```javascript
// Write to ISM
InterShardMemory.setLocal(JSON.stringify({
    test: "Hello from " + Game.shard.name,
    tick: Game.time
}));

// Read from ISM (same shard)
let data = JSON.parse(InterShardMemory.getLocal());
console.log("ISM data:", data);
```

Expected: Should see your test data

#### 5.2 Deploy to Additional Shards

If you have access to multiple shards:

1. **Deploy code to second shard**
   ```bash
   # Using MCP tools
   mcp_screeps_upload_code({
       mainJsPath: "/home/azcoigreach/repos/azc-screeps",
       branch: "shard1"  # Or whatever your second shard branch is
   });
   ```

2. **Run migration on second shard**
   - Open console on second shard
   - Run `migrateToMultiShard()` function again
   - Verify with `system_status()`

3. **Test cross-shard visibility**
   ```javascript
   // On shard0
   shard.status();
   // Should now show data from both shard0 and shard1
   ```

#### 5.3 Test Portal Detection

```javascript
// Wait for long pulse (99-400 ticks)
// Then check:
shard.portals();

// If you have vision on highway rooms with portals,
// they should appear in the list
```

---

## Rollback Procedure

If something goes wrong, you can rollback:

### Option 1: Restore Memory

```javascript
// If you saved your backup:
Memory.hive = /* paste your backup JSON here */;
delete Memory.shard;

// Then restart (wait for next tick)
```

### Option 2: Revert Code

```bash
# Revert to previous git commit
git revert HEAD
git push

# Re-upload old code
mcp_screeps_upload_code({
    mainJsPath: "/home/azcoigreach/repos/azc-screeps"
});
```

### Option 3: Emergency Pause

```javascript
// Stop bot completely
Memory.hive.global_pause = true;

// Or pause just current shard
Memory.shard.pause.manual = true;
```

---

## Common Issues & Solutions

### Issue: "Cannot read property 'pulses' of undefined"

**Cause**: Code is trying to access `Memory.shard.pulses` before migration

**Solution**:
```javascript
// Add safe access with default
let pulses = _.get(Memory, ["shard", "pulses"], {});

// Or initialize immediately:
if (!Memory.shard) {
    Memory.shard = { pulses: {}, pause: {}, spawn_queue: [] };
}
```

### Issue: CPU increased by 15%+

**Cause**: New modules running too frequently or not using pulses

**Solution**:
```javascript
// Verify pulse checks are in place
if (isPulse_Mid()) {
    ShardCoordinator.publishShardStatus(); // Should only run every 39-180 ticks
}

// Check profiler to find culprit
profiler.run(100);
profiler.analyze();
```

### Issue: "InterShardMemory.setLocal is not a function"

**Cause**: Running on private server without ISM support, or very old Screeps version

**Solution**:
```javascript
// Add safety check in definitions_intershard_memory.js
if (typeof InterShardMemory === 'undefined') {
    console.log("[ISM] InterShardMemory not available (private server or old version)");
    global.InterShardMemory = {
        setLocal: function() {},
        getLocal: function() { return "{}"; },
        getRemote: function() { return "{}"; }
    };
}
```

### Issue: Creeps stopped spawning after migration

**Cause**: Spawn queue or population system not finding new memory location

**Solution**:
```javascript
// Check spawn queue location
console.log("Spawn queue:", Memory.shard.spawn_queue);

// Verify population system
let room = Game.rooms["W1N1"];
colony.runPopulation(room.name, /* ... */);
```

### Issue: InterShardMemory shows old data

**Cause**: ISM updates are cached for ~100 ticks

**Solution**:
```javascript
// Force ISM update
ShardCoordinator.publishShardStatus();

// Wait 1-2 ticks, then check
shard.status();
```

---

## Performance Validation

After migration, measure performance impact:

### CPU Benchmarking

```javascript
// Before migration (from your notes)
let cpuBefore = /* your baseline CPU */;

// After migration
profiler.run(100);
// Wait 100 ticks...
profiler.analyze();

// Compare results
// Expected increase: 5-10% for multi-shard features
// If increase > 15%, investigate with profiler
```

### Memory Usage

```javascript
// Check memory size
console.log("Memory size:", JSON.stringify(Memory).length, "bytes");
console.log("ISM size:", InterShardMemory.getLocal().length, "bytes / 102400 max");

// Should be:
// Memory: similar to before (maybe +10KB for shard data)
// ISM: initially very small (<1KB)
```

### Bucket Monitoring

```javascript
// Check bucket over time
console.log("Bucket:", Game.cpu.bucket);

// Should not decrease significantly
// If bucket dropping fast, CPU usage too high
```

---

## Phase 1 Validation Checklist

After migration to multi-shard-aware code (Phase 1), verify:

### ✅ Core Functionality
- [ ] Bot runs without errors
- [ ] Creeps spawn normally
- [ ] Buildings operate normally
- [ ] Towers defend properly
- [ ] Labs run reactions
- [ ] Factories produce commodities
- [ ] Remote mining works
- [ ] Console commands work

### ✅ New Memory Structure
- [ ] `Memory.hive.shard_name` is set correctly
- [ ] `Memory.shard.pulses` exists and updates
- [ ] Old `Memory.hive` data migrated to `Memory.shard`
- [ ] No "undefined" errors in console

### ✅ New Features (Basic)
- [ ] `shard.status()` command works
- [ ] `shard.portals()` command works
- [ ] InterShardMemory can be written
- [ ] InterShardMemory can be read

### ✅ Performance
- [ ] CPU increase < 10%
- [ ] No bucket drain
- [ ] Memory size similar to before
- [ ] No tick timeout errors

### ✅ Documentation
- [ ] Migration steps documented in this guide
- [ ] Any custom changes noted
- [ ] Rollback tested (optional but recommended)

---

## Next Steps

After successful migration to Phase 1:

1. **Monitor for 24 hours**: Watch for any edge case errors
2. **Document any issues**: Update this guide with solutions
3. **Plan Phase 2**: Once stable, start Phase 2 (Cross-Shard Visibility)
4. **Update documentation**: Note any deployment-specific changes

---

## Support

If you encounter issues:

1. **Check console errors**: Note exact error messages
2. **Check profiler**: Identify CPU-heavy operations
3. **Check Memory**: Verify structure with `JSON.stringify(Memory.shard)`
4. **Check ISM**: Debug with `shard.debug_ism()`
5. **Review code**: Compare with original implementation plan
6. **Test on PTR**: Replicate issue in test environment
7. **Rollback if critical**: Use rollback procedure above

---

## Migration Checklist Summary

Use this checklist for each shard:

```
Shard: _______________

Pre-Migration:
[ ] Backed up Memory
[ ] Committed code to git
[ ] CPU < 70%
[ ] Bucket > 5000

Migration:
[ ] Added new module files
[ ] Updated main.js
[ ] Ran migrateToMultiShard()
[ ] Verified system_status()

Testing:
[ ] No console errors for 100 ticks
[ ] Creeps spawning normally
[ ] shard.status() works
[ ] shard.portals() works
[ ] CPU increase acceptable

Validation:
[ ] 24-hour monitoring complete
[ ] Performance metrics acceptable
[ ] Documentation updated
[ ] Ready for Phase 2

Notes:
_________________________________
_________________________________
_________________________________
```

---

**Version**: 1.0  
**Phase**: 1 (Foundation)

