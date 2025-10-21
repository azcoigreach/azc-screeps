# Multi-Shard Phase 4: Cross-Shard Colonization

**Version**: 1.1  
**Phase**: 4 (Cross-Shard Colonization)  
**Status**: ✅ Complete & Production Ready  
**Last Updated**: December 18, 2024

---

## Overview

Phase 4 of the multi-shard implementation enables establishing colonies on other shards through automated cross-shard colonization operations. This system allows spawning creeps on one shard that travel through portals to claim and bootstrap remote controllers on different shards.

**Production Status**: ✅ **LIVE** - System is fully operational and has been successfully tested with real colonization operations.

---

## Production Deployment Status

### Current Status: ✅ Production Ready

The cross-shard colonization system is fully deployed and operational with:

- **✅ Core Functionality**: All colonization operations working correctly
- **✅ Memory Management**: Cross-shard memory persistence validated
- **✅ Route Planning**: Custom route support tested and functional  
- **✅ Bootstrap System**: Cross-shard spawn assist operational
- **✅ Error Handling**: Robust error recovery and cleanup mechanisms
- **✅ Performance Optimized**: Debug code cleaned up for production use

### Recent Updates (v1.1)

- **Code Cleanup**: Removed verbose debug logging while preserving essential error handling
- **Performance Optimization**: Reduced console spam and improved operational visibility
- **Production Hardening**: System now runs cleanly in production environment
- **Tested Operations**: Successfully colonized `shard1/E29S14` using the complete workflow

---

## Core Concepts

### Cross-Shard Colonization Workflow

```
1. Issue colonization command (shard.colonize)
2. System plans portal route and operation
3. Spawn colonizer creeps with cross-shard memory
4. Creeps travel to portal and traverse to destination shard
5. Claim controller and establish colony on destination shard
6. Bootstrap system spawns additional creeps for colony development
```

### Colonization Operation States

| State | Description | Next Action |
|-------|-------------|-------------|
| `spawning` | Creating colonizer creeps | Wait for spawn completion |
| `traveling` | Creeps moving to portal | Monitor progress |
| `establishing` | Claiming controller on target shard | Build initial structures |
| `complete` | Colony successfully established | Normal operation |
| `failed` | Operation failed or timed out | Cleanup and retry |

---

## Console Commands

### `shard.colonize(targetShard, targetRoom, layout, focusDefense, listRoute, sourceRoom)`

Plan colonization on another shard.

**Parameters**:
- `targetShard` (string): Destination shard name (e.g., `"shard1"`)
- `targetRoom` (string): Destination room name (e.g., `"E29S14"`)
- `layout` (object): Blueprint layout configuration
  ```javascript
  {
    origin: {x: 3, y: 20},  // Spawn position coordinates
    name: "def_hor_w"       // Layout name from blueprint system
  }
  ```
- `focusDefense` (boolean): Prioritize defensive structures
- `listRoute` (array, optional): Custom pathfinding route
  ```javascript
  ["E52S20", "E51S20", "E50S20", "E30S10", "E30S11", "E30S12", "E30S13", "E30S14", "E29S14"]
  ```
- `sourceRoom` (string, optional): Source room for spawning (defaults to first available)

**Returns**: Success/failure message with operation ID

**Example**:
```javascript
// Colonize shard1/E29S14 with def_hor_w layout at (3, 20)
shard.colonize('shard1', 'E29S14', {
  origin: {x: 3, y: 20}, 
  name: 'def_hor_w'
}, false, [
  "E52S20", "E51S20", "E50S20", 
  "E30S10", "E30S11", "E30S12", 
  "E30S13", "E30S14", "E29S14"
], 'E52S21');
```

**Output**:
```
[Shard] Colonization operation colonize_shard1_E29S14_71062883 created for shard1/E29S14
```

### `shard.operations()`

Display all active cross-shard operations.

**Returns**: List of colonizations and creep transfers

**Example Output**:
```
[Shard] === Active Cross-Shard Operations ===
[Shard] Colonizations (1):
[Shard]   colonize_shard1_E29S14_71062883: shard1/E29S14 - establishing
```

---

## Implementation Details

### Colonization Planning System

The `ShardCoordinator.planColonization()` function handles the complete planning workflow:

1. **Validation**: Checks shard availability and prevents self-colonization
2. **Portal Route Discovery**: Uses `Portals.getPortalRoute()` to find optimal path
3. **Route Planning**: Splits custom routes into source-to-portal and portal-to-destination segments
4. **Operation Creation**: Establishes tracking operation with all necessary metadata

```javascript
// Operation structure stored in Memory.shard.operations.colonizations
{
  id: "colonize_shard1_E29S14_71062883",
  source_shard: "shard0",
  source_room: "E52S21", 
  dest_shard: "shard1",
  dest_room: "E29S14",
  status: "spawning",
  creeps: ["colonizer_shard1_E29S14_71063153"],
  portal_route: { /* portal routing data */ },
  start_tick: 71062883,
  layout: {origin: {x: 3, y: 20}, name: "def_hor_w"},
  focus_defense: false,
  list_route: ["E52S21", "E51S21", "E50S21", "E50S20"],
  portal_dest_room: "E30S10",
  dest_list_route: ["E30S10", "E30S11", "E30S12", "E30S13", "E30S14", "E29S14"]
}
```

### Colonizer Spawning System

The `processColonizationSpawning()` function manages colonizer creation:

1. **Level Determination**: Dynamically calculates appropriate colonizer level based on room energy capacity:
   - Level 6 (1,700 energy): 2x CLAIM, 10x MOVE
   - Level 4 (850 energy): 1x CLAIM, 5x MOVE  
   - Level 3 (750 energy): 1x CLAIM, 3x MOVE (minimum for claiming)

2. **Spawn Request Creation**: Generates high-priority spawn requests with cross-shard metadata

3. **Memory Configuration**: Colonizers receive comprehensive routing and operation data

```javascript
// Spawn request structure for cross-shard colonizers
{
  room: "E52S21",              // Spawn location
  priority: 15,                // High priority (cross-shard critical)
  level: 5,                    // Dynamically determined
  body: "reserver_at",         // Colonizer body type
  name: "colonizer_shard1_E29S14_71063153",
  args: {
    role: "colonizer",
    room: "E29S14",            // Target room
    colony: "E52S21",          // Source colony
    shard_operation: "colonize_shard1_E29S14_71062883",
    dest_shard: "shard1",
    layout: {origin: {x: 3, y: 20}, name: "def_hor_w"},
    focus_defense: false,
    list_route: ["E52S21", "E51S21", "E50S20"], // Source to portal
    portal_route: { /* portal data */ },
    portal_dest_room: "E30S10",
    dest_list_route: ["E30S10", "E30S11", "E30S12", "E30S13", "E30S14", "E29S14"] // Portal to target
  }
}
```

### Cross-Shard Creep Travel

Colonizers use enhanced travel system with two-phase routing:

1. **Source to Portal**: Uses `creep.memory.list_route` for pathfinding to portal room
2. **Portal to Destination**: Uses `creep.memory.dest_list_route` for intra-shard travel

Key travel enhancements:
- `creep.travelToRoom(portalRoom, true)` ensures route usage
- Memory restoration after portal traversal via `GlobalCreeps.runCreep()`
- Fallback route inference from operation data if memory is lost

### Cross-Shard Bootstrap System

The `runCrossShardBootstrap()` function implements spawn assist between shards:

1. **Room Detection**: Identifies cross-shard rooms with spawn assist configuration
2. **Source Room Validation**: Ensures spawn assist rooms exist on current shard
3. **Population Management**: Creates spawn requests for cross-shard rooms

```javascript
// Cross-shard bootstrap spawn request
{
  room: "E52S21",              // Spawn in source room
  priority: 22,                // Colony critical priority
  args: {
    role: "worker",
    room: "E29S14",            // Serve cross-shard room
    colony: "E52S21",          // Source colony
    list_route: spawnAssistRoute // Cross-shard travel route
  }
}
```

This system treats cross-shard bootstrap exactly like spawn assist - creeps spawn in one room but serve another, except the target room is on a different shard.

---

## Memory Structures

### Colonization Operation Record

Stored in `Memory.shard.operations.colonizations[]`:

```javascript
{
  id: "colonize_shard1_E29S14_71062883",
  source_shard: "shard0",
  source_room: "E52S21",
  dest_shard: "shard1", 
  dest_room: "E29S14",
  status: "establishing",           // Current operation state
  creeps: ["colonizer_shard1_E29S14_71063153"], // Active colonizers
  portal_route: {                  // Portal routing information
    portal: {
      id: "E50S20_45_24",
      pos: {x: 45, y: 24, roomName: "E50S20"},
      destination: {shard: "shard1", room: "E30S10"}
    },
    portalId: "E50S20_45_24",
    distance: 3,
    sourceRoom: "E52S21",
    destShard: "shard1",
    destRoom: "E29S14",
    estimatedTravelTime: 150
  },
  start_tick: 71062883,
  layout: {                        // Blueprint configuration
    origin: {x: 3, y: 20},
    name: "def_hor_w"
  },
  focus_defense: false,
  list_route: ["E52S21", "E51S21", "E50S21", "E50S20"], // Source to portal
  portal_dest_room: "E30S10",
  dest_list_route: ["E30S10", "E30S11", "E30S12", "E30S13", "E30S14", "E29S14"] // Portal to target
}
```

### Cross-Shard Creep Memory

Colonizers receive enhanced memory for cross-shard operations:

```javascript
creep.memory = {
  role: "colonizer",
  room: "E29S14",                  // Target room (different from spawn room)
  colony: "E52S21",                // Source colony
  shard_operation: "colonize_shard1_E29S14_71062883", // Operation ID
  dest_shard: "shard1",            // Destination shard
  layout: {origin: {x: 3, y: 20}, name: "def_hor_w"},
  focus_defense: false,
  list_route: ["E52S21", "E51S21", "E50S20"],        // Source to portal
  portal_route: { /* portal data */ },
  portal_dest_room: "E30S10",
  dest_list_route: ["E30S10", "E30S11", "E30S12", "E30S13", "E30S14", "E29S14"] // Portal to target
}
```

---

## Usage Patterns

### Pattern 1: Basic Cross-Shard Colonization

```javascript
// Simple colonization without custom route
shard.colonize('shard1', 'E29S14', {
  origin: {x: 3, y: 20}, 
  name: 'def_hor_w'
}, false);
```

### Pattern 2: Colonization with Custom Route

```javascript
// Colonization with explicit pathfinding route
let customRoute = [
  "E52S20", "E51S20", "E50S20",    // Source shard path to portal
  "E30S10", "E30S11", "E30S12",    // Destination shard path from portal
  "E30S13", "E30S14", "E29S14"     // Final destination
];

shard.colonize('shard1', 'E29S14', {
  origin: {x: 3, y: 20}, 
  name: 'def_hor_w'
}, false, customRoute, 'E52S21');
```

### Pattern 3: Monitoring Colonization Progress

```javascript
// Check active operations
shard.operations();

// Monitor specific operation status
let operations = Memory.shard.operations.colonizations || [];
let myOp = operations.find(op => op.dest_room === 'E29S14');
if (myOp) {
  console.log(`Status: ${myOp.status}, Creeps: ${myOp.creeps.length}`);
}
```

### Pattern 4: Bootstrap Configuration

```javascript
// Set up spawn assist for cross-shard room
empire.spawn_assist('E29S14', ['E52S21'], [
  // Route for cross-shard travel
]);
```

---

## Error Handling & Troubleshooting

### Common Issues

#### Colonization Command Errors

**Error**: `Error: targetShard, targetRoom, and layout required`
**Solution**: Ensure all required parameters are provided with correct format

**Error**: `Already on targetShard. Use regular empire.colonize()`
**Solution**: Use `empire.colonize()` for same-shard colonization

**Error**: `Failed to create colonization operation. Check if portal route exists`
**Solution**: Verify portal availability with `shard.portals()` or scout additional rooms

#### Spawn Issues

**Issue**: No colonizers spawning despite operation created
**Diagnosis**: Check spawn capacity and energy availability
```javascript
// Check spawn status
console.log(`Energy: ${Game.rooms['E52S21'].energyAvailable}/${Game.rooms['E52S21'].energyCapacityAvailable}`);
console.log(`Spawns: ${Game.spawns.length}, Available: ${_.filter(Game.spawns, s => !s.spawning).length}`);
```

**Issue**: Colonizer too expensive for room
**Solution**: System automatically uses appropriate level based on energy capacity

#### Travel Issues

**Issue**: Colonizers not moving to portal
**Diagnosis**: Check route validity and creep memory
```javascript
let creep = Game.creeps['colonizer_shard1_E29S14_71063153'];
console.log('Route:', creep.memory.list_route);
console.log('Portal route:', creep.memory.portal_route);
```

**Issue**: Colonizers die on destination shard
**Solution**: Verify `dest_list_route` is properly set and portal destination room is correct

#### Memory Issues

**Issue**: Colonizers arrive with `undefined` role
**Solution**: `GlobalCreeps.runCreep()` automatically restores memory from operation data

**Issue**: Missing route information after portal traversal
**Solution**: System includes fallback memory inference from creep name parsing

---

## Performance Considerations

### CPU Impact

| Operation | CPU Cost | Frequency |
|-----------|----------|-----------|
| planColonization | 1-2 CPU | Per operation |
| processColonizationSpawning | 0.3-0.5 CPU | Short pulse when spawning |
| Cross-shard bootstrap | 0.3-0.5 CPU | Spawn pulse |
| Operation monitoring | 0.2 CPU | Every pulse |

**Total Overhead**: ~1-2% with active colonization operations

### Debug Code Cleanup (v1.1)

The system has been optimized for production deployment with significant debug code cleanup:

- **Removed verbose logging** from spawn request processing that was generating hundreds of debug lines per tick
- **Streamlined colonizer role execution** by removing frequent debug messages during travel
- **Maintained essential error handling** while eliminating debug spam
- **Improved console readability** with only critical operational information displayed

This optimization reduces console noise while preserving all necessary error reporting and operational status updates.

### Memory Impact

| Component | Size | Notes |
|-----------|------|-------|
| Operation record | ~500 bytes | Per active operation |
| Enhanced creep memory | +200 bytes | Per colonizer |
| Route data | ~100 bytes | Per route segment |

**ISM Impact**: ~500 bytes per active colonization operation

---

## Integration Points

### Portal System Integration

- Uses `Portals.getPortalRoute()` for route planning
- Leverages portal caching and stability checks
- Integrates with `Portals.processArrivals()` for memory restoration

### Spawn System Integration

- Extends `Memory.shard.spawn_requests` with cross-shard metadata
- Uses priority system for colonizer precedence
- Integrates with existing spawn assist mechanisms

### Global Creeps Integration

- `GlobalCreeps.runCreep()` handles cross-shard creep management
- Provides memory restoration and role inference
- Manages creeps on shards without local colonies

### Blueprint System Integration

- Uses existing blueprint layouts for colony structure
- Integrates with `Sites.Colony` population management
- Supports spawn positioning via layout origin coordinates

---

## Success Metrics

### Verified Performance (Production Testing)

✅ **Successfully Tested**: Colonization of `shard1/E29S14` from `shard0/E52S21`

- **Claim Success Rate**: ✅ 100% - Controller successfully claimed and colony established
- **Bootstrap Success**: ✅ Achieved - Colony reached RCL 3 and initiated normal operations
- **Travel Efficiency**: ✅ Verified - Colonizers traversed portal and reached target room using custom routes
- **Memory Recovery**: ✅ Confirmed - Cross-shard memory restoration working correctly

### System Reliability (Validated)

- **Operation Timeout**: Operations timeout after 10,000 ticks if not completed ✅
- **Creep Recovery**: Automatic cleanup of missing/failed creeps ✅
- **Route Validation**: Portal route existence verified before operation start ✅
- **Memory Persistence**: Critical operation data preserved across shard transitions ✅
- **Cross-Shard Bootstrap**: Spawn assist between shards functioning properly ✅

---

## Future Enhancements

### Planned Improvements

1. **Multi-Colonizer Support**: Spawn multiple colonizers for faster establishment
2. **Defensive Colonization**: Enhanced support for `focusDefense` parameter
3. **Remote Mining Integration**: Automatic setup of remote mining after colonization
4. **Advanced Route Planning**: Dynamic route optimization based on portal stability
5. **Colony Monitoring**: Real-time status reporting of cross-shard colonies

### Extension Points

- **Custom Bootstrap Sequences**: Configurable post-claim initialization
- **Resource Supply Lines**: Automatic energy transfer to new colonies
- **Combat Integration**: Defensive creep deployment during colonization
- **Factory Coordination**: Advanced production setup in new colonies

---

## Related Documentation

- [Multi-Shard Creep Travel Guide](multi-shard-creep-travel.md) - Portal traversal mechanics
- [Multi-Shard Roadmap](multi-shard-roadmap.md) - Overall project plan
- [Multi-Shard Overview](multi-shard-overview.md) - System architecture

---

## Next Phase

**Phase 5: Resources** will build on colonization to enable:
- Automated resource trading between shards
- Supply line management for cross-shard colonies  
- Factory and lab coordination across shards
- Resource demand/supply balancing

See [Multi-Shard Roadmap](multi-shard-roadmap.md) for Phase 5 details.

---

**Version**: 1.1  
**Status**: Phase 4 Complete & Production Ready  
**Author**: AZC-Screeps Development Team  
**Last Production Update**: December 18, 2024 - Debug cleanup and performance optimization deployed
