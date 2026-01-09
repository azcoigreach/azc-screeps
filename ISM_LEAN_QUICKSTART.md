# Lean ISM Quick Reference

## Core Methods

### Request/Response Coordination (ISM - Real-time)

**Submit a request from Shard N:**
```javascript
ShardMemory.submitRequest("request_id", {
  type: "creep_transfer",
  data: "your data here"
});
```

**Shard0 reads pending requests:**
```javascript
let requests = ShardMemory.getRequests();
// Returns: { "request_id": {...}, "another_id": {...} }
```

**Shard0 sends response:**
```javascript
ShardMemory.respondToRequest("request_id", {
  status: "approved",
  decision: "proceed"
});
```

**Acknowledge (remove from ISM):**
```javascript
ShardMemory.acknowledgeRequest("request_id");
// Request removed from ISM queue
```

**Shard N reads response:**
```javascript
let response = ShardMemory.getResponse("request_id");
if (response) {
  console.log("Got response:", response.status);
}
```

---

### Persistent Storage (Memory - Unlimited)

**Register a global creep:**
```javascript
ShardMemory.registerGlobalCreep("creep_name", {
  role: "scout",
  level: 3,
  shard: "shard0",
  home_room: "W1N1"
});
```

**Get all global creeps:**
```javascript
let allCreeps = ShardMemory.getGlobalCreepRegistry();
// Returns: { "creep1": {...}, "creep2": {...}, ... }
```

**Get specific creep:**
```javascript
let descriptor = ShardMemory.getCreepDescriptor("creep_name");
```

**Update creep descriptor:**
```javascript
ShardMemory.registerGlobalCreep("creep_name", {
  ...oldDescriptor,
  status: "transferred"
});
```

**Delete creep from registry:**
```javascript
_.unset(Memory, ["hive", "ism", "global_creeps", "creep_name"]);
```

---

### Shard Information

**Check if primary shard:**
```javascript
if (ShardMemory.isPrimaryShard()) {
  // This is shard0
}
```

**Get primary shard name:**
```javascript
let primary = ShardMemory.getPrimaryShardName();
// Returns: "shard0"
```

**Get local ISM payload:**
```javascript
let payload = ShardMemory.getLocalPayload();
// Returns: {version, shard, heartbeat, summary, requests, ...}
```

**Get remote payloads:**
```javascript
let remotes = ShardMemory.readAllRemotes();
// Returns: { "shard1": {...}, "shard2": {...}, ... }
```

---

## Design Patterns

### Pattern 1: Shard0 as Authority (Recommended)

**Shard N (submits request):**
```javascript
ShardMemory.submitRequest("creep_transfer_" + creepName, {
  type: "transfer",
  creep: creepName,
  target_shard: "shard1",
  route: [portal1, portal2]
});
```

**Shard0 (processes):**
```javascript
let requests = ShardMemory.getRequests();
for (let requestId in requests) {
  let req = requests[requestId];
  if (req.type === "transfer") {
    let creep = ShardMemory.getCreepDescriptor(req.creep);
    if (creep && creep.can_travel) {
      ShardMemory.respondToRequest(requestId, { approved: true });
      ShardMemory.registerGlobalCreep(req.creep, {
        ...creep,
        location: req.target_shard,
        in_transit: true
      });
    } else {
      ShardMemory.respondToRequest(requestId, { approved: false });
    }
  }
  ShardMemory.acknowledgeRequest(requestId);
}
```

**Shard N (receives response):**
```javascript
let response = ShardMemory.getResponse("creep_transfer_" + creepName);
if (response && response.approved) {
  // Proceed with transfer via snapshot system
  initiateCreepTransfer(creepName);
}
```

### Pattern 2: Distributed Storage

**All shards update their own creeps in Memory:**
```javascript
// In each shard
ShardMemory.registerGlobalCreep(creep.name, {
  role: creep.memory.role,
  energy: creep.carry.energy,
  shard: Game.shard.name,
  room: creep.pos.roomName,
  update_tick: Game.time
});
```

**Any shard queries global creeps from Memory:**
```javascript
let allCreeps = ShardMemory.getGlobalCreepRegistry();
let scouts = _.filter(allCreeps, c => c.role === "scout");
```

### Pattern 3: Ephemeral Coordination

**Use ISM only for temporary coordination:**
```javascript
// Use ISM to request immediate action
ShardMemory.submitRequest("emergency_" + Game.time, {
  type: "urgent_help",
  shard: "shard1",
  threat: "invader"
});

// Use Memory for persistent state
ShardMemory.registerGlobalCreep(creep.name, {
  status: "helping_shard1"
});
```

---

## Common Tasks

### Task: Colonize a new shard

**Shard0 (initiates):**
```javascript
// Submit colonization request to shard1
ShardMemory.submitRequest("colonize_W1N1", {
  type: "colonize",
  room: "W1N1",
  shard: "shard1",
  spawn_count: 5,
  roles: ["worker", "builder", "upgrader"]
});

// Register creeps destined for shard1
ShardMemory.registerGlobalCreep("col:w1n1:1", {
  role: "worker",
  target_shard: "shard1",
  home_room: "W1N1"
});
```

**Shard1 (receives):**
```javascript
let response = ShardMemory.getResponse("colonize_W1N1");
if (response && response.approved) {
  // Wait for creeps to arrive
  let creeps = _.filter(Game.creeps, c => 
    c.memory.target_shard === "shard1"
  );
  if (creeps.length >= 5) {
    startColonization("W1N1");
  }
}
```

### Task: Load balance from shard0

**Shard0:**
```javascript
let remotes = ShardMemory.readAllRemotes();
for (let shardName in remotes) {
  let shard = remotes[shardName];
  if (shard.summary.creeps_total > 100) {
    // Request this shard to send creeps home
    ShardMemory.submitRequest("reduce_creeps_" + shardName, {
      type: "reduce_population",
      shard: shardName,
      excess: shard.summary.creeps_total - 100
    });
  }
}
```

### Task: Track all creeps across empire

**All shards (every tick):**
```javascript
for (let creepName in Game.creeps) {
  let creep = Game.creeps[creepName];
  ShardMemory.registerGlobalCreep(creepName, {
    role: creep.memory.role,
    room: creep.pos.roomName,
    shard: Game.shard.name,
    energy: creep.carry.energy,
    updated: Game.time
  });
}
```

**Any shard (query):**
```javascript
let registry = ShardMemory.getGlobalCreepRegistry();
console.log("Total creeps:", Object.keys(registry).length);
console.log("Creeps in W1N1:", 
  _.filter(registry, c => c.room === "W1N1").length
);
```

---

## Memory Structure Reference

```
Memory.hive.ism
├── global_creeps         // {name: {descriptor}} - All creeps across empire
│   ├── "scou:1a2b"       // Creep descriptor
│   ├── "work:3c4d"       // Creep descriptor
│   └── ...
├── routes                // [] - Portal routes between shards
│   ├── {from, to, portals}
│   └── ...
├── directives            // {} - Global directives/settings
│   ├── colonization
│   ├── combat
│   └── ...
├── last_run              // Game.time - When ISM last ran
├── primary               // "shard0" - Which shard is authority
└── primary_snapshot      // {} - Last aggregated data from shard0

InterShardMemory (ISM) - Per Shard
├── version               // SHARD_MEMORY_VERSION (2)
├── shard                 // Game.shard.name
├── heartbeat             // Game.time
├── summary               // {tick, cpu_bucket, creeps_total, rooms_owned}
├── requests              // {request_id: {data}} - Pending requests
├── acknowledgements      // {request_id: true} - Processed requests
├── responses             // {request_id: {response}} - Shard0 responses
└── meta                  // {created, version, updated}
```

---

## Constants

```javascript
SHARD_MEMORY_VERSION = 2      // ISM protocol version
KNOWN_SHARDS = ["shard0", "shard1", "shard2", "shard3"]
MAX_SERIALIZED_LENGTH = 95000 // ISM size limit (bytes)
MAX_REQUEST_QUEUE = 16        // Max requests in ISM
PRIMARY_SHARD = "shard0"      // Authority shard
```

---

## Troubleshooting

**"Cannot read property of undefined"**
- Always use `ShardMemory.getCreepDescriptor()` instead of accessing Memory directly
- Check `if (creep)` before using creep data

**ISM payload exceeding limit**
- This shouldn't happen with new lean architecture
- Check if requests are being acknowledged and cleaned up
- If still over 20KB, audit what's being stored in requests

**Creep transfer fails**
- Verify transfer snapshot system is working
- Check ISM response was received
- Ensure route is valid (both portals exist)

**"Primary shard not initialized"**
- Shard0 must run first to set the authority
- Initialize with: `ShardMemory.setPrimaryShardName("shard0")`

---

## Performance Tips

1. **Batch requests**: Submit many small requests at once, not individually
2. **Cache responses**: If same request needed multiple times, cache response
3. **Limit queue depth**: Keep `MAX_REQUEST_QUEUE` low to force processing
4. **Clean acknowledged**: Always call `acknowledgeRequest()` to free ISM space
5. **Archive old data**: Move historical records from ISM to Memory periodically

