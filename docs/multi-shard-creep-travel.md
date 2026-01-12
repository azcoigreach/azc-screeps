# Multi-Shard Creep Travel Guide

**Version**: 1.0  
**Phase**: 3 (Portal Traversal)  
**Status**: ✅ Complete  
**Last Updated**: October 12, 2025

---

## Overview

Phase 3 of the multi-shard implementation enables creeps to travel between shards using inter-shard portals. This guide covers the travel system, API usage, and best practices for cross-shard creep movement.

---

## Core Concepts

### Portal Traversal

When a creep enters a portal:
1. The creep disappears from the source shard
2. The creep appears at the corresponding location on the destination shard
3. Body parts, resources, and TTL are preserved
4. Memory must be explicitly transferred via ISM

### Travel Workflow

```
1. Request portal route (cached for 1000 ticks)
2. Register expected arrival in ISM
3. Travel to portal room
4. Enter portal structure
5. Arrival detection on destination shard
6. Memory restoration
7. Task assignment
```

---

## API Reference

### Creep Methods

#### `creep.travelToShard(targetShard, targetRoom)`

Travel to a room on another shard via portal.

**Parameters**:
- `targetShard` (string): Destination shard name (e.g., `"shard2"`)
- `targetRoom` (string): Destination room name (e.g., `"W51N51"`)

**Returns**: `ERR_*` code or `OK`

**Example**:
```javascript
// Send creep from shard1 to W51N51 on shard2
let creep = Game.creeps["Worker_1"];
creep.travelToShard("shard2", "W51N51");
```

**Behavior**:
- If already on target shard, uses regular `travelToRoom()`
- Automatically finds optimal portal route
- Registers expected arrival in ISM
- Handles portal traversal automatically

---

#### `creep.isTransferringShards()`

Check if creep is currently traveling to another shard.

**Returns**: Transfer object or `null`

**Example**:
```javascript
let transfer = creep.isTransferringShards();
if (transfer) {
    console.log(`Creep transferring to ${transfer.dest_shard}`);
}
```

---

#### `creep.cancelShardTransfer()`

Cancel a pending shard transfer.

**Returns**: `boolean` - True if transfer was canceled

**Example**:
```javascript
if (creep.cancelShardTransfer()) {
    console.log("Transfer canceled");
}
```

---

### Portal System Methods

#### `Portals.getPortalRoute(sourceRoom, destShard, destRoom)`

Find optimal portal route from source room to destination shard.

**Parameters**:
- `sourceRoom` (string): Starting room name
- `destShard` (string): Destination shard name
- `destRoom` (string, optional): Destination room name

**Returns**: Route object or `null`

**Route Object**:
```javascript
{
    portal: {
        id: "E10N10_25_25",
        pos: {x: 25, y: 25, roomName: "E10N10"},
        destination: {shard: "shard2", room: "E10N10"},
        stable: true,
        ticksToDecay: null,
        lastSeen: 73975963
    },
    portalId: "E10N10_25_25",
    distance: 5,              // Room distance
    sourceRoom: "W21N11",
    destShard: "shard2",
    destRoom: "E10N10",
    estimatedTravelTime: 250, // Ticks (distance * 50)
    cached: false             // From cache or fresh calculation
}
```

**Features**:
- Route caching (1000 ticks)
- Stability checks (filters unstable portals < 500 ticks)
- Distance optimization
- Automatic cache invalidation

**Example**:
```javascript
let route = Portals.getPortalRoute("W21N11", "shard2", "W51N51");
if (route) {
    console.log(`Portal route found: ${route.distance} rooms away`);
    console.log(`ETA: ${route.estimatedTravelTime} ticks`);
}
```

---

#### `Portals.expectArrival(creepName, destShard, destRoom, expectedTick, memory)`

Record expected creep arrival via portal.

**Parameters**:
- `creepName` (string): Name of creep
- `destShard` (string): Destination shard
- `destRoom` (string): Destination room
- `expectedTick` (number): Expected arrival tick
- `memory` (object, optional): Creep memory to preserve

**Behavior**:
- Automatically called by `creep.travelToShard()`
- Stores transfer in `Memory.shard.operations.creep_transfers`
- Published to ISM on next pulse
- Preserves specified memory fields

**Preserved Memory**:
- `role` - Creep role
- `room` - Destination room
- `origin` - Origin room  
- `level` - Creep level
- `site` - Site ID

**Not Preserved** (cleared on arrival):
- `path` - Travel path
- `task` - Current task
- `list_route` - Route cache

---

#### `Portals.processArrivals()`

Process expected creep arrivals on current shard.

**Behavior**:
- Called automatically on short pulse
- Reads ISM from all shards
- Detects arrived creeps
- Restores creep memory
- Clears travel state
- Detects timeouts (500 tick grace period)
- Cleans up old transfers (1000 tick grace period)

**Console Output**:
```
[Portals] Creep Worker_1 arrived from shard1 to W51N51
[Portals] Arrival processing: 1 arrivals, 0 timeouts, 0 cleaned
```

---

## Usage Patterns

### Pattern 1: Simple Cross-Shard Travel

Send a creep to another shard:

```javascript
// In creep role behavior
if (creep.room.name !== "W51N51" || Game.shard.name !== "shard2") {
    creep.travelToShard("shard2", "W51N51");
} else {
    // Creep arrived, do work
    creep.harvest(source);
}
```

---

### Pattern 2: Conditional Cross-Shard Travel

Only travel if not already in transit:

```javascript
let transfer = creep.isTransferringShards();
if (transfer) {
    console.log(`Already transferring to ${transfer.dest_shard}`);
    return;
}

// Start new transfer
creep.travelToShard("shard2", "W51N51");
```

---

### Pattern 3: Cross-Shard Colonization

Send colonization creeps to another shard:

```javascript
// Colony manager spawns creeps
for (let i = 0; i < 3; i++) {
    let creepName = `Colonizer_${Game.time}_${i}`;
    spawn.spawnCreep([WORK, CARRY, MOVE], creepName, {
        memory: {
            role: "worker",
            room: "W51N51",
            site: "colony_shard2_W51N51"
        }
    });
}

// Creep behavior
if (creep.memory.room === "W51N51" && Game.shard.name !== "shard2") {
    creep.travelToShard("shard2", "W51N51");
} else {
    // Colonization logic
    buildSpawn();
}
```

---

### Pattern 4: Round-Trip Travel

Send creep to another shard and back:

```javascript
// Go to shard2
if (Game.shard.name === "shard1" && !creep.memory.visited_shard2) {
    creep.travelToShard("shard2", "W51N51");
}
// On shard2, do work
else if (Game.shard.name === "shard2" && !creep.memory.visited_shard2) {
    // Do work
    if (workComplete()) {
        creep.memory.visited_shard2 = true;
    }
}
// Return to shard1
else if (Game.shard.name === "shard2" && creep.memory.visited_shard2) {
    creep.travelToShard("shard1", "W21N11");
}
// Back on shard1
else {
    console.log("Round trip complete!");
}
```

---

## Memory Structures

### Transfer Record

Stored in `Memory.shard.operations.creep_transfers`:

```javascript
{
    id: "transfer_73975963_Worker_1",
    creep_name: "Worker_1",
    source_shard: "shard1",
    dest_shard: "shard2",
    dest_room: "W51N51",
    expected_arrival_tick: 73976213,
    status: "traveling",
    departure_tick: 73975963,
    memory: {
        role: "worker",
        room: "W51N51",
        origin: "W51N11",
        level: 2,
        site: "colony_W51N51"
    }
}
```

### Portal Route Cache

Stored in `Memory.shard.portal_routes`:

```javascript
{
    "W21N11_shard2": {
        portalId: "E10N10_25_25",
        distance: 5,
        tick: 73975963
    }
}
```

**Cache Duration**: 1000 ticks  
**Invalidation**: Automatic if portal becomes unstable

---

## Console Commands

### Testing Cross-Shard Travel

```javascript
// Get portal route
let route = Portals.getPortalRoute("W21N11", "shard2", "W51N51");
console.log(JSON.stringify(route, null, 2));

// Check current transfers
shard.operations();

// Check creep transfer status
let creep = Game.creeps["Worker_1"];
console.log(creep.isTransferringShards());

// Cancel transfer
creep.cancelShardTransfer();
```

---

## Best Practices

### 1. Check Portal Availability

Always verify portals exist before starting operations:

```javascript
// Check if portal route exists
let route = Portals.getPortalRoute(sourceRoom, targetShard, targetRoom);
if (!route) {
    console.log("No portal route available!");
    return ERR_NO_PATH;
}

// Check portal stability
if (!route.portal.stable && route.portal.ticksToDecay < 1000) {
    console.log("Warning: Portal may decay soon!");
}
```

---

### 2. Handle Arrival Delays

Expect variability in travel time:

```javascript
// Add grace period to expected arrival
let expectedTime = route.estimatedTravelTime;
let maxTime = expectedTime + 500; // 500 tick grace period

// Monitor for timeout
if (Game.time > transfer.expected_arrival_tick + 500) {
    console.log("Creep may be lost!");
}
```

---

### 3. Preserve Critical Memory

Only preserve essential memory fields:

```javascript
// Good: Minimal memory
Portals.expectArrival(creep.name, shard, room, tick, {
    role: creep.memory.role,
    room: targetRoom,
    level: creep.memory.level
});

// Bad: Excessive memory (increases ISM size)
Portals.expectArrival(creep.name, shard, room, tick, creep.memory);
```

---

### 4. Monitor ISM Size

Cross-shard transfers add to ISM size:

```javascript
// Check ISM size
shard.debug_ism();

// Limit concurrent transfers
let maxTransfers = 10;
let currentTransfers = Memory.shard.operations.creep_transfers.length;

if (currentTransfers >= maxTransfers) {
    console.log("Too many concurrent transfers!");
    return;
}
```

---

### 5. Clean Up Failed Transfers

Implement timeout detection:

```javascript
// In main loop or monitoring system
let transfers = Memory.shard.operations.creep_transfers;
_.each(transfers, transfer => {
    if (Game.time > transfer.expected_arrival_tick + 1000) {
        console.log(`Transfer ${transfer.id} timed out - cleaning up`);
        // Re-spawn creep or mark operation as failed
    }
});
```

---

## Error Handling

### Common Errors

#### `ERR_NO_PATH` - No Portal Route

**Cause**: No portal found to destination shard

**Solutions**:
1. Wait for portal scan (long pulse)
2. Check portal exists: `shard.portals()`
3. Verify shard name is correct
4. Explore more rooms to find portals

```javascript
let route = Portals.getPortalRoute(room, shard, target);
if (!route) {
    console.log("No portal route - exploring nearby rooms");
    // Scout highway rooms for portals
}
```

---

#### Creep Lost in Transit

**Cause**: Portal decayed, pathfinding failed, or creep died

**Detection**:
- Timeout after expected arrival + 500 ticks
- `processArrivals()` logs timeout

**Recovery**:
```javascript
// Monitor for timeouts
let transfers = Memory.shard.operations.creep_transfers;
_.each(transfers, transfer => {
    if (Game.time > transfer.expected_arrival_tick + 500) {
        console.log(`Creep ${transfer.creep_name} lost - re-spawning`);
        // Spawn replacement creep
        spawnReplacement(transfer.memory.role, transfer.memory.level);
    }
});
```

---

#### Portal Decay During Travel

**Cause**: Unstable portal decayed while creep was traveling

**Prevention**:
- Filter portals with < 500 ticks remaining
- Re-check portal stability before entry
- Have backup portals

```javascript
// Enhanced stability check
let route = Portals.getPortalRoute(room, shard, target);
if (route && !route.portal.stable) {
    if (route.portal.ticksToDecay < 500) {
        console.log("Portal unstable - finding alternative");
        // Try another route or wait
    }
}
```

---

#### Memory Restoration Failed

**Cause**: ISM data corrupted or memory not preserved

**Recovery**:
```javascript
// In processArrivals() or creep role
if (creep && !creep.memory.role) {
    console.log(`${creep.name} arrived with no role - assigning default`);
    creep.memory.role = "worker";
    creep.memory.room = transfer.dest_room;
}
```

---

## Performance Considerations

### CPU Impact

| Operation | CPU Cost | Frequency |
|-----------|----------|-----------|
| getPortalRoute (cached) | 0.1 CPU | Per creep call |
| getPortalRoute (fresh) | 1-2 CPU | Every 1000 ticks |
| expectArrival | 0.1 CPU | Per transfer start |
| processArrivals | 0.5-1 CPU | Short pulse |
| travelToShard | 0.2 CPU | Per creep/tick |

**Total Overhead**: ~0.5-1% with 5-10 concurrent transfers

---

### Memory Impact

| Component | Size | Type |
|-----------|------|------|
| Transfer record | ~200 bytes | Per transfer |
| Portal route cache | ~100 bytes | Per route |
| Portal data | ~150 bytes | Per portal |

**ISM Impact**: ~200 bytes per active transfer

---

### Optimization Tips

1. **Batch transfers**: Send multiple creeps together
2. **Use route cache**: Cache routes for 1000 ticks
3. **Limit concurrent transfers**: Max 10-20 per shard
4. **Clean up promptly**: Remove timed-out transfers
5. **Scout ahead**: Pre-scan portals before operations

---

## Troubleshooting

### Issue: Creep Not Moving to Portal

**Symptoms**:
- Creep stuck in place
- `travelToShard()` returns `ERR_NO_PATH`

**Diagnosis**:
```javascript
let creep = Game.creeps["Worker_1"];
let route = Portals.getPortalRoute(creep.room.name, "shard2", "W51N51");
console.log("Route:", JSON.stringify(route));

let transfer = creep.isTransferringShards();
console.log("Transfer:", JSON.stringify(transfer));
```

**Solutions**:
1. Verify portal exists and is reachable
2. Check if route is valid
3. Verify creep has path cleared
4. Try `creep.travelClear()` to reset path

---

### Issue: Creep Never Arrives

**Symptoms**:
- Transfer record exists
- Creep not on destination shard
- Timeout in logs

**Diagnosis**:
```javascript
// On source shard
shard.operations();

// On destination shard  
console.log("Expected creeps:", 
    _.filter(Memory.shard.operations.creep_transfers, 
        t => t.dest_shard === Game.shard.name)
);
```

**Solutions**:
1. Check if portal decayed
2. Verify creep reached portal
3. Check ISM sync (mid pulse)
4. Re-spawn replacement creep

---

### Issue: Memory Not Restored

**Symptoms**:
- Creep arrives but missing memory
- Role undefined
- Wrong room assignment

**Diagnosis**:
```javascript
// Check transfer record
let transfers = ISM.getShardStatus("shard1").operations.creep_transfers;
console.log(JSON.stringify(transfers, null, 2));
```

**Solutions**:
1. Verify `expectArrival()` includes memory
2. Check `processArrivals()` is running
3. Manually restore memory:
```javascript
if (!creep.memory.role) {
    creep.memory.role = "worker";
    creep.memory.room = "W51N51";
}
```

---

## Examples

### Example 1: Scout Another Shard

```javascript
// Spawn scout
spawn.spawnCreep([MOVE], "Scout_shard2", {
    memory: {role: "scout", room: "W51N51"}
});

// Scout behavior
let scout = Game.creeps["Scout_shard2"];
if (scout) {
    if (Game.shard.name === "shard1") {
        scout.travelToShard("shard2", "W51N51");
    } else if (Game.shard.name === "shard2") {
        // Scout completed
        console.log("Scout arrived on shard2!");
        // Report findings via ISM
    }
}
```

---

### Example 2: Resource Transfer

```javascript
// Spawn hauler with resources
spawn.spawnCreep([CARRY, MOVE], "Hauler_1", {
    memory: {role: "hauler", room: "W51N51"}
});

// Hauler picks up resources
let hauler = Game.creeps["Hauler_1"];
if (hauler) {
    if (hauler.store.getFreeCapacity() > 0) {
        // Fill with energy
        hauler.withdraw(storage, RESOURCE_ENERGY);
    } else if (Game.shard.name === "shard1") {
        // Transfer to shard2
        hauler.travelToShard("shard2", "W51N51");
    } else {
        // Deliver on shard2
        hauler.transfer(destination, RESOURCE_ENERGY);
    }
}
```

---

### Example 3: Coordinated Colonization

```javascript
// Colonization manager
function colonizeShard(targetShard, targetRoom) {
    // Check portal availability
    let route = Portals.getPortalRoute("W21N11", targetShard, targetRoom);
    if (!route) {
        console.log("No portal route available");
        return false;
    }
    
    // Spawn colonization team
    let roles = ["worker", "worker", "worker", "scout"];
    _.each(roles, role => {
        let name = `Colony_${targetRoom}_${role}_${Game.time}`;
        spawn.spawnCreep(
            getBodyForRole(role, 2),
            name,
            {memory: {role: role, room: targetRoom}}
        );
    });
    
    console.log(`Colonization started for ${targetShard}/${targetRoom}`);
    return true;
}

// Colonizer behavior
if (creep.memory.room !== creep.room.name || 
    Game.shard.name !== "shard2") {
    creep.travelToShard("shard2", creep.memory.room);
} else {
    // Colonization logic
    bootstrap Colony();
}
```

---

## Related Documentation

- [Multi-Shard Overview](multi-shard-overview.md) - Introduction to multi-shard
- [Multi-Shard Monitoring](multi-shard-monitoring.md) - Status and monitoring
- [Phase 3 Completion Summary](phase3-completion-summary.md) - Implementation details
- [Multi-Shard Roadmap](multi-shard-roadmap.md) - Overall project plan

---

## Next Phase

**Phase 4: Colonization** will build on portal traversal to enable:
- Automated colony establishment on other shards
- Cross-shard spawn coordination
- Resource supply lines
- Bootstrap sequences

See [Multi-Shard Roadmap](multi-shard-roadmap.md) for Phase 4 details.

---

**Version**: 1.0  
**Status**: Phase 3 Complete  
**Author**: AZC-Screeps Development Team


