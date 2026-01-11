# Cross-Shard Spawn Assist System

## Overview

The cross-shard spawn assist system enables rooms on any shard to request creeps from rooms on any other shard. The system uses a master-slave architecture with shard0 as the central broker, handling all inter-shard spawn request routing.

## Architecture

### Master Shard (shard0)
- Reads spawn requests from all slave shards via InterShardMemory
- Parses routes to determine which shard can fulfill each request
- Dispatches requests to appropriate shards via ISM
- Cleans up completed dispatches based on slave acknowledgements

### Slave Shards (shard1, shard2, shard3, etc.)
- Publish spawn requests to their local ISM
- Read dispatched requests from master shard0
- Add dispatched requests to local spawn queue
- Acknowledge receipt by setting `clear_dispatched` flag

## Route Format

Routes support both same-shard and cross-shard pathing using shard prefixes:

### Same-Shard Route
```javascript
["E48S21", "E49S21", "E50S21"]  // All rooms on current shard
```

### Cross-Shard Route
```javascript
[
  "E48S21",                 // Room on current shard
  "E49S21",                 // Portal room on current shard
  "shard1/E30S10",          // First room on shard1 (portal destination)
  "shard1/E30S11",          // Subsequent rooms on shard1
  "shard1/E29S14"           // Final destination on shard1
]
```

**Important**: The room before a shard transition must contain the portal. The system will detect the transition and automatically create transfer intent for the creep.

## How It Works

### 1. Spawn Request Creation

When a room needs a creep, it creates a spawn request in Memory with a `listRooms` array:

```javascript
Memory.hive.spawn_requests.push({
  room: "E48S21",                    // Requesting room
  listRooms: ["shard1/E29S14"],      // Rooms that can spawn (cross-shard)
  priority: 21,
  level: 6,
  scale: false,
  body: "colonizer",
  name: null,
  args: {
    role: "colonizer",
    room: "E29S14",                  // Normalized target room
    target_key: "shard1/E29S14",     // Full shard/room identifier
    list_route: [                    // Route with portal
      "E48S21",
      "E49S21",
      "shard1/E30S10",
      "shard1/E29S14"
    ]
  }
});
```

### 2. Master Shard Processing (shard0 only)

Every spawn pulse, master shard0:
1. Reads ISM from all slave shards
2. Extracts spawn requests from each shard
3. Parses `listRooms` to determine target shard
4. Dispatches requests to appropriate shards via ISM

```javascript
// shard0's ISM after dispatch:
{
  dispatched_spawn_requests: {
    shard1: [
      { room: "E48S21", listRooms: ["shard1/E29S14"], ... }
    ]
  }
}
```

### 3. Slave Shard Reception (shard1)

Slave shards read dispatched requests from master shard0:
1. Check master's ISM for dispatched requests
2. Add them to local spawn queue
3. Set `clear_dispatched` flag in local ISM
4. Master clears dispatches on next pulse

### 4. Creep Spawning with Transfer Intent

When a creep spawns with a cross-shard route:

1. **Route Parsing**: System calls `parseRoute()` to convert string route to structured format
2. **Transition Detection**: `detectShardTransitions()` finds shard changes
3. **Portal Lookup**: Finds portal structure in transition room
4. **Transfer Intent Creation**: Adds to creep memory:

```javascript
creep.memory.transfer_intent = {
  origin_shard: "shard0",
  origin_room: "E48S21",
  destination_shard: "shard1",
  destination_room: "E29S14",
  portal_pos: { x: 25, y: 10, roomName: "E49S21" }
};
creep.memory.shard_mission = "colonizer";
creep.memory.list_route = ["E48S21", "E49S21", "shard1/E30S10", "shard1/E29S14"];
```

### 5. Creep Movement and Transfer

The creep uses `travelToRoom()` which:
1. Parses `list_route` to find next step
2. Detects portal in current room matching next step's shard
3. Moves to portal position
4. Records transfer snapshot in ISM before stepping into portal
5. Portal transfers creep to destination shard
6. Destination shard restores memory from transfer snapshot

## Configuration

### Known Shards
Set in Memory to define which shards participate:

```javascript
Memory.hive.ism.known_shards = ["shard0", "shard1", "shard2", "shard3"];
```

### Spawn Assist Routes

For colonization, set spawn assist with cross-shard support:

```javascript
_.set(Memory, ["rooms", "E29S14", "spawn_assist", "rooms"], ["shard0/E48S21"]);
_.set(Memory, ["rooms", "E29S14", "spawn_assist", "list_route"], [
  "E29S14",
  "shard1/E30S10",
  "E49S21",
  "E48S21"
]);
```

## API Functions

### `Control.parseRoute(route, originShard)`
Parses a route array and returns structured route with shard transitions.
- **route**: Array of room names, optionally with shard prefixes
- **originShard**: Starting shard (defaults to current shard)
- **Returns**: Array of `{ shard, roomName }` objects

### `Control.detectShardTransitions(parsedRoute)`
Detects shard transitions in a parsed route.
- **parsedRoute**: Output from `parseRoute()`
- **Returns**: Array of transition objects with portal room info

### `Control.processCrossShardSpawnRequests()`
Master shard only - reads and dispatches spawn requests.

## Example: Cross-Shard Colonization

1. On shard0, create colonization request:
```javascript
empire.colonize(
  "E48S21",                    // From room (shard0)
  "shard1/E29S14",             // To room (shard1)
  {origin:{x:3,y:20}, name:"def_hor_w"},
  false,
  [                            // Route with portals
    "E48S21",
    "E49S21",                  // Portal room on shard0
    "shard1/E30S10",           // Portal destination on shard1
    "shard1/E29S14"            // Target room
  ]
);
```

2. System automatically:
   - Creates colonization site with shard-prefixed target
   - Spawns colonizer with transfer intent
   - Colonizer travels to portal and transfers to shard1
   - On shard1, colonizer claims controller
   - Sets spawn assist pointing back to shard0/E48S21

3. After claiming, workers spawn on shard0 and travel via portal to shard1 to build first spawn

## Benefits

- **Unified Empire**: Manage all shards from central shard0
- **Resource Sharing**: High-level rooms can spawn for low-level rooms across shards
- **Bootstrap New Shards**: Easily colonize new shards from established ones
- **Load Balancing**: Distribute spawn load across all available spawns empire-wide
- **Automatic Routing**: System handles portal pathing automatically

## Debugging

Enable cross-shard debug logging:
```javascript
Memory.hive.debug.crossshard = 1;  // Basic
Memory.hive.debug.crossshard = 2;  // Verbose
```

Check ISM state:
```javascript
// On master shard0
let ism = InterShardMemory.getLocal();
let data = JSON.parse(ism);
console.log(JSON.stringify(data.dispatched_spawn_requests));

// On slave shard
let master = InterShardMemory.getRemote("shard0");
let masterData = JSON.parse(master);
console.log(JSON.stringify(masterData.dispatched_spawn_requests[Game.shard.name]));
```

## Limitations

- Master shard0 must be active for cross-shard spawning
- Portals must be discovered and accessible
- Transfer has ~5 tick latency for ISM propagation
- Routes must include portal rooms explicitly

## Future Enhancements

- Automatic portal discovery and route generation
- Multi-hop portal routes (shard0 → shard1 → shard2)
- Dynamic shard selection based on CPU/bucket
- Spawn priority across shards
