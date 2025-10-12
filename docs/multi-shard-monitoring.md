# Multi-Shard Monitoring Guide

**Version**: 1.0  
**Phase**: 2 (Visibility)  
**Status**: ✅ Complete  
**Last Updated**: October 12, 2025

---

## Overview

Phase 2 of the multi-shard implementation provides comprehensive monitoring and visibility across all shards. This enables you to track colony status, resource availability, and operations from any shard in real-time.

---

## Console Commands

### Status Monitoring

#### `shard.status()`
Display status of all known shards.

```javascript
shard.status();
```

**Output**:
```
=== Multi-Shard Status ===
shard1 (current):
  Colonies: 1, Energy: 0
  CPU: 2.9, Bucket: 10000, Data age: 3 ticks
shard2:
  Colonies: 0, Energy: 0
  CPU: 0, Bucket: 10000, Data age: 156 ticks
```

#### `shard.status(shardName, detailed)`
Display detailed status for a specific shard.

**Parameters**:
- `shardName` (string): Shard to query (e.g., `"shard1"`)
- `detailed` (boolean, optional): Show detailed colony information

**Examples**:
```javascript
// Basic status
shard.status("shard1");

// Detailed status with colony breakdown
shard.status("shard1", true);
```

**Detailed Output**:
```
=== Shard: shard1 ===
Tick: 73975963 (age: 3 ticks)
Colonies: 1
Energy: 0
CPU: 2.9 / Bucket: 10000
  Colony W21N11:
    RCL: 2, Energy: 0
    Spawns: 0/1
Minerals:
  O: 1200
  H: 800
```

---

### Colony Monitoring

#### `shard.colonies(shardName)`
List all colonies on a specific shard with detailed information.

**Parameters**:
- `shardName` (string, optional): Target shard (defaults to current shard)

**Examples**:
```javascript
// Current shard
shard.colonies();

// Specific shard
shard.colonies("shard2");
```

**Output**:
```
=== Colonies on shard1 ===
W21N11 🌀:
  RCL: 2, Energy: 0
  Spawns: 0/1
  Portal rooms: W20N10
W25N15:
  RCL: 5, Energy: 150000
  Spawns: 2/3 (assist available)
```

**Indicators**:
- `🌀` - Colony has nearby portal rooms
- `(assist available)` - Colony can assist with spawning

---

### Resource Monitoring

#### `shard.resources(shardName)`
Show resource availability on a specific shard.

**Parameters**:
- `shardName` (string, optional): Target shard (defaults to current shard)

**Examples**:
```javascript
// Current shard
shard.resources();

// Specific shard
shard.resources("shard2");
```

**Output**:
```
=== Resources on shard1 ===
Energy: 150,000
Minerals:
  H: 10,000
  O: 15,000
  U: 5,000
  L: 8,000
  K: 12,000
  Z: 9,000
  X: 6,000
Commodities:
  battery: 500
  wire: 200
```

---

### Portal Monitoring

#### `shard.portals()`
Display all known portals on the current shard.

```javascript
shard.portals();
```

**Output**:
```
=== Portals on shard1 ===
Portal at W20N10 (25, 25):
  Destination: shard2 / W20N10
  Stable: Yes
  Last seen: 73975963
Portal at W20N20 (25, 25):
  Destination: shard3 / W20N20
  Stable: Yes
  Last seen: 73975950
```

---

### Operations Monitoring

#### `shard.operations()`
Display all active cross-shard operations.

```javascript
shard.operations();
```

**Output**:
```
=== Active Cross-Shard Operations ===
Colonizations (1):
  colonize_shard2_W51N51_73975800: shard2/W51N51 - spawning
Creep Transfers (0):
No active operations
```

**Operation Statuses**:
- `spawning` - Creeps are being spawned
- `traveling` - Creeps are moving to portal
- `establishing` - Colony is being established
- `complete` - Operation finished successfully
- `failed` - Operation failed (timeout or error)

---

### Debugging

#### `shard.debug_ism()`
Show InterShardMemory contents and size usage.

```javascript
shard.debug_ism();
```

**Output**:
```
=== InterShardMemory Debug ===
Local ISM Size: 1,234 / 102,400 bytes (1.2%)
Local ISM Content:
{
  "shard_name": "shard1",
  "tick": 73975963,
  "colonies": {...},
  "resources": {...}
}
```

#### `shard.clear_operations()`
Clear all stuck operations (use if operations aren't progressing).

```javascript
shard.clear_operations();
```

---

## Visual Indicators

### Shard Health Indicator

**Location**: Top-right corner of owned rooms  
**Always visible**: Yes (on multi-shard servers)

**Display**:
```
┌─────────┐
│ shard1  │ ← Shard name (cyan)
│ ⚡10000  │ ← Bucket level (color-coded)
│ 2.9     │ ← Current CPU usage
│ 🌀      │ ← Portal indicator (if nearby)
└─────────┘
```

**Color Coding**:
- 🟢 **Green** - Bucket > 8000 (healthy)
- 🟠 **Orange** - Bucket 5000-8000 (warning)
- 🔴 **Red** - Bucket < 5000 (critical)

**Control**:
```javascript
// Toggle shard health display
Memory.hive.visuals.show_shard_health = false; // Hide
Memory.hive.visuals.show_shard_health = true;  // Show (default)
```

---

### Portal Indicators

**Location**: Above each portal structure  
**Always visible**: Yes (when portals are detected)

**Display**:
```
    🌀→shard2
       ◯
```

**Components**:
- `🌀` - Portal icon
- `→shard2` - Destination shard
- Circle around portal structure

**Color Coding**:
- 🔵 **Cyan** - Stable portal (permanent)
- 🟠 **Orange** - Unstable portal (temporary)

**Control**:
```javascript
// Toggle portal indicators
Memory.hive.visuals.show_portal_indicators = false; // Hide
Memory.hive.visuals.show_portal_indicators = true;  // Show (default)
```

---

## Grafana Integration

### Memory.stats Structure

Multi-shard statistics are stored in `Memory.stats` for Grafana dashboards.

#### Current Shard Info
```javascript
Memory.stats.shard = {
    name: "shard1",
    ism_size: 1234,           // ISM size in bytes
    ism_size_percent: 1.2,    // ISM usage percentage
    operations: {
        colonizations: 1,      // Active colonizations
        creep_transfers: 0     // Active transfers
    },
    portals: {
        total: 2,              // Total portals on shard
        by_destination: {      // Portals grouped by dest
            "shard2": 1,
            "shard3": 1
        }
    }
}
```

#### All Shards Aggregated Data
```javascript
Memory.stats.shards = {
    "shard1": {
        tick: 73975963,
        tick_age: 3,           // Ticks since last update
        colonies_count: 1,     // Number of colonies
        colonies_total_rcl: 2, // Sum of all RCLs
        spawns_total: 1,
        spawns_available: 0,
        energy: 0,
        minerals_count: 2,     // Unique minerals
        commodities_count: 0,
        cpu_used: 2.9,
        cpu_bucket: 10000,
        cpu_limit: 250,
        portal_rooms: 1        // Rooms with portals
    },
    "shard2": {
        // ... same structure
    }
}
```

### Grafana Queries

#### Total Colonies Across All Shards
```javascript
// Sum of colonies_count for all shards
sum(Memory.stats.shards.*.colonies_count)
```

#### Energy Per Shard
```javascript
// Energy for each shard
Memory.stats.shards.*.energy
```

#### CPU Usage Per Shard
```javascript
// CPU usage for each shard
Memory.stats.shards.*.cpu_used
```

#### ISM Size Monitoring
```javascript
// Current ISM usage
Memory.stats.shard.ism_size_percent
```

#### Portal Count
```javascript
// Total portals on current shard
Memory.stats.shard.portals.total
```

---

## Data Update Frequency

### InterShardMemory
- **Update Interval**: Every 39-180 ticks (mid pulse)
- **Depends on**: CPU bucket level
- **Data Age**: Check with `shard.status()` - shows "Data age: X ticks"

### Statistics
- **Grafana Collection**: Every 50 ticks
- **Shard Stats**: Every 50 ticks (when ISM is available)

### Portals
- **Scan Interval**: Every 99-400 ticks (long pulse)
- **Detection**: Only in visible rooms

### Visuals
- **Update Interval**: Configurable, default 5 ticks
- **Control**: `Memory.hive.visuals.update_interval`

---

## Best Practices

### 1. Monitor Data Age
Always check the "Data age" when viewing shard status. Data older than 200 ticks may be stale.

```javascript
// Check freshness
shard.status("shard2");
// Look for "Data age: X ticks" - should be < 200
```

### 2. Regular ISM Size Checks
Keep ISM usage under 80% to leave headroom.

```javascript
// Monitor ISM size
shard.debug_ism();
// ISM Size should be < 80 KB (80%)
```

### 3. Portal Verification
Before sending creeps, verify portal status.

```javascript
// Check portals before operations
shard.portals();
// Verify "Stable: Yes" for critical paths
```

### 4. Resource Planning
Check resource availability before requesting transfers.

```javascript
// Check resources before transfer request
shard.resources("shard1");
// Verify energy > 100K before requesting help
```

---

## Troubleshooting

### Issue: "Data age" Too High

**Symptom**: Shard status shows "Data age: 500+ ticks"

**Causes**:
- Shard not publishing to ISM
- Shard offline or crashed
- ISM communication issue

**Solutions**:
1. Check if shard is online
2. Verify CPU bucket on that shard
3. Check for errors in console on that shard
4. Manually trigger ISM publish:
   ```javascript
   ShardCoordinator.publishShardStatus();
   ```

---

### Issue: No Portals Detected

**Symptom**: `shard.portals()` shows "No portals detected"

**Causes**:
- No portal rooms visible yet
- Long pulse hasn't triggered
- Portals in unexplored areas

**Solutions**:
1. Wait for long pulse (99-400 ticks)
2. Explore highway intersections
3. Manually trigger portal scan:
   ```javascript
   Portals.scanPortals();
   ```

---

### Issue: ISM Size Too Large

**Symptom**: ISM > 80 KB

**Causes**:
- Too many operations in queue
- Large colony data structures
- Inefficient data format

**Solutions**:
1. Clear old operations:
   ```javascript
   shard.clear_operations();
   ```
2. Reduce operation frequency
3. Review ISM structure:
   ```javascript
   shard.debug_ism();
   ```

---

### Issue: Visual Indicators Not Showing

**Symptom**: No shard health or portal indicators

**Causes**:
- Visuals disabled in Memory
- Not on multi-shard server
- Portals not detected yet

**Solutions**:
1. Enable visuals:
   ```javascript
   Memory.hive.visuals.show_shard_health = true;
   Memory.hive.visuals.show_portal_indicators = true;
   ```
2. Verify multi-shard:
   ```javascript
   console.log(Game.shard);
   // Should show { name: "shardX" }
   ```

---

## Performance Impact

### CPU Usage
- **ISM Operations**: ~0.5 CPU per update
- **Portal Scanning**: ~0.1 CPU per room
- **Grafana Stats**: ~0.2 CPU per collection
- **Visual Indicators**: ~0.1 CPU per room
- **Total Overhead**: 1-2% (well within target)

### Memory Impact
- **ISM Size**: 1-5 KB typical (depends on colonies)
- **Memory.stats.shards**: ~1 KB per shard
- **Portal Data**: ~0.1 KB per portal
- **Total**: 5-10 KB additional memory

---

## Example Workflows

### Workflow 1: Check Empire Status
```javascript
// 1. View all shards
shard.status();

// 2. Check specific shard details
shard.status("shard2", true);

// 3. View colonies on that shard
shard.colonies("shard2");

// 4. Check resources
shard.resources("shard2");
```

### Workflow 2: Monitor Operations
```javascript
// 1. View active operations
shard.operations();

// 2. Check portal routes
shard.portals();

// 3. Monitor ISM size
shard.debug_ism();

// 4. Check shard status
shard.status();
```

### Workflow 3: Portal Planning
```javascript
// 1. Find available portals
shard.portals();

// 2. Check destination shard
shard.status("shard2");

// 3. Verify resources available
shard.resources();

// 4. Plan colonization
shard.colonize("shard2", "W51N51");
```

---

## Related Documentation

- [Multi-Shard Overview](multi-shard-overview.md) - Introduction to multi-shard
- [Multi-Shard Implementation Plan](multi-shard-implementation-plan.md) - Technical details
- [Phase 1 Completion Summary](phase1-completion-summary.md) - Foundation phase
- [Getting Started](getting-started.md) - Bot setup

---

## Next Phase

**Phase 3: Portal Traversal** will enable:
- Creep cross-shard travel
- Automatic portal pathfinding
- Arrival tracking and task assignment
- Cross-shard creep coordination

See [Multi-Shard Roadmap](multi-shard-roadmap.md) for details.

---

**Version**: 1.0  
**Status**: Phase 2 Complete  
**Author**: AZC-Screeps Development Team

