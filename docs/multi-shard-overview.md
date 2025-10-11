# Multi-Shard Overview

## Introduction

Multi-shard functionality enables your AZC-Screeps bot to establish and manage colonies across multiple game shards simultaneously. This dramatically expands your empire's reach and allows for strategic resource distribution and coordination across the entire game world.

**Status**: 🚧 In Development  
**Target Release**: Version 3.0.0

---

## What is Multi-Shard Play?

In Screeps, the game world is divided into multiple **shards** - separate, parallel game instances that each run independently. Each shard has:

- Its own map with rooms and terrain
- Its own `Memory` object (isolated from other shards)
- Its own `Game` object (cannot see rooms/creeps from other shards)
- Connections to other shards via **inter-shard portals**

### Inter-Shard Portals

Portals are special structures located at highway intersections that allow creeps to travel between shards. When a creep enters a portal:

1. The creep disappears from the current shard
2. The creep appears at the corresponding location on the destination shard
3. The creep retains its body parts, resources, and TTL
4. The creep's memory is transferred to the new shard

Portals come in two types:
- **Stable Portals**: Permanent connections between shards
- **Unstable Portals**: Temporary connections that appear and disappear

---

## Key Features

### 1. Cross-Shard Coordination

The bot uses **InterShardMemory** (ISM) to coordinate operations across shards:

```javascript
// Each shard publishes its status to ISM
InterShardMemory.setLocal(JSON.stringify({
    colonies: { /* colony info */ },
    resources: { /* resource availability */ },
    operations: { /* ongoing cross-shard operations */ }
}));

// Other shards can read this data
let otherShardData = JSON.parse(InterShardMemory.getRemote('shard0'));
```

### 2. Automated Portal Detection

The bot automatically scans for portals in controlled and visible rooms:

```javascript
// Portals are stored in memory
Memory.shard.portals = {
    "E10N10": {
        pos: {x: 25, y: 25, roomName: "E10N10"},
        destination: {shard: "shard1", room: "E10N10"},
        stable: true,
        lastSeen: 12345678
    }
}
```

### 3. Cross-Shard Creep Travel

Creeps can be commanded to move to rooms on other shards:

```javascript
// Existing single-shard movement
creep.moveToRoom("W1N1");

// New multi-shard movement
creep.moveToRoom("W1N1", "shard1");

// The bot automatically:
// 1. Finds optimal portal route
// 2. Moves creep to portal
// 3. Tracks expected arrival
// 4. Re-assigns creep on arrival at destination shard
```

### 4. Cross-Shard Colonization

Establish colonies on other shards with a single command:

```javascript
// Colonize W1N1 on shard1 from your colony on shard0
shard.colonize("shard1", "W1N1", {
    origin: {x: 25, y: 25},
    layout: "def_hor"
});

// The bot will:
// 1. Spawn initial creeps on source shard
// 2. Navigate creeps through portals
// 3. Establish base on destination shard
// 4. Bootstrap colony to self-sufficiency
```

### 5. Resource Sharing

Share resources between shards to optimize production:

```javascript
// Request resources from another shard
shard.request_resource("U", 5000, "shard0");

// Offer resources to another shard
shard.offer_resource("energy", 100000, "shard1");

// The bot automatically:
// 1. Coordinates resource transfers via ISM
// 2. Spawns hauler creeps
// 3. Routes haulers through portals
// 4. Delivers resources to destination
```

### 6. Strategic Coordination

The bot coordinates strategy across all shards:

- **Expansion Priority**: Which shards to expand to first
- **Resource Balancing**: Where resources are needed most
- **Defense Coordination**: Sharing threat intelligence
- **Combat Operations**: Deploying forces across shards

---

## Architecture Overview

### Memory Structure

```javascript
// Global settings (same on all shards)
Memory.hive = {
    shard_name: "shard0",      // Current shard
    master_shard: "shard0",    // Coordination master
    allies: [],                // Ally list (global)
    global_pause: false        // Emergency pause
}

// Shard-specific settings
Memory.shard = {
    pulses: {},                // Timing for this shard
    pause: {},                 // Shard-specific pause
    spawn_queue: [],           // Spawn requests for this shard
    portals: {},               // Known portals on this shard
    operations: {}             // Operations originating from this shard
}

// Existing structures (unchanged)
Memory.rooms = { /* room data */ }
Memory.sites = { /* site data */ }
Memory.creeps = { /* creep data */ }
```

### InterShardMemory Structure

```javascript
{
    shard_name: "shard0",
    tick: 12345678,
    
    colonies: {
        "W1N1": {
            rcl: 8,
            energy: 500000,
            spawns_available: 3,
            portal_rooms: ["E10N10"]
        }
    },
    
    resources: {
        energy: 5000000,
        minerals: { /* mineral counts */ },
        commodities: { /* commodity counts */ }
    },
    
    operations: {
        colonizations: [ /* active colonization operations */ ],
        creep_transfers: [ /* creeps in transit */ ]
    },
    
    strategy: {
        expansion_priority: ["shard1", "shard2"],
        resource_sharing: { /* needs and offers */ }
    }
}
```

---

## Console Commands

### Status & Monitoring

```javascript
shard.status()                // Show status of all shards
shard.colonies("shard1")      // List colonies on specific shard
shard.resources("shard1")     // Show resources on specific shard
shard.operations()            // Show ongoing cross-shard operations
shard.portals()               // Show known portals
```

### Colonization

```javascript
// Start colonization on another shard
shard.colonize("shard1", "W1N1", {
    origin: {x: 25, y: 25},
    layout: "def_hor"
});

// Abandon colony on another shard
shard.abandon_colony("shard1", "W1N1");
```

### Resource Management

```javascript
// Request resources from another shard
shard.request_resource("U", 5000, "shard0");

// Offer resources to another shard  
shard.offer_resource("energy", 100000, "shard1");

// Show resource transfer status
shard.transfer_status();
```

### Combat

```javascript
// Deploy combat force to another shard
shard.deploy_force("shard1", "W5N5", "small_attack");

// Recall combat force
shard.recall_force("operation_id");
```

### Configuration

```javascript
// Set master coordination shard
shard.set_master("shard0");

// Set expansion priority
shard.set_priority(["shard1", "shard2", "shard3"]);
```

### Debugging

```javascript
// Show InterShardMemory contents
shard.debug_ism();

// Clear stuck operations
shard.clear_operations();
```

---

## How It Works

### 1. Portal Detection & Mapping

Every long pulse (99-400 ticks), the bot:
1. Scans all controlled/visible rooms for portals
2. Records portal positions and destinations
3. Updates portal stability status
4. Builds portal route map

### 2. Cross-Shard Coordination Loop

Every medium pulse (199-400 ticks), the bot:
1. Publishes current shard status to InterShardMemory
2. Reads status from other shards
3. Updates strategic decisions based on global state
4. Processes cross-shard operation requests

### 3. Creep Portal Traversal

When a creep needs to go to another shard:
1. Calculate optimal portal route
2. Move creep to portal room
3. Enter portal structure
4. Record expected arrival in ISM
5. On destination shard, detect arrival and assign tasks

### 4. Colonization Workflow

When starting a new colony on another shard:
1. Create colonization operation in ISM
2. Spawn initial creeps on source shard (2-3 workers, 1 scout)
3. Navigate creeps to portal
4. Transfer creeps to destination shard
5. On destination shard, assign colony tasks
6. Bootstrap colony (build spawn, establish economy)
7. Grow colony to self-sufficiency
8. Mark operation complete

### 5. Resource Transfer Workflow

When transferring resources between shards:
1. Record transfer request in ISM
2. Spawn hauler creeps with resources
3. Navigate haulers to portal
4. Transfer to destination shard
5. Deliver resources to target storage/terminal
6. Mark transfer complete

---

## Benefits

### 1. Expanded Territory
- Control rooms on multiple shards simultaneously
- Reduce competition for room claims
- Access to more resources and minerals

### 2. Strategic Flexibility
- Establish colonies in low-competition areas
- Diversify across shards for resilience
- Coordinate attacks from multiple shards

### 3. Resource Optimization
- Share resources between shards
- Balance production across shards
- Specialize shards for different tasks

### 4. Risk Mitigation
- If one shard becomes hostile, others are unaffected
- Distribute assets across shards
- Maintain presence even if wiped on one shard

---

## Limitations

### 1. InterShardMemory Size
- Limited to 100 KB per shard
- Must be efficient with data structure
- Cannot store full game objects

### 2. Portal Instability
- Unstable portals can disappear
- Creeps may need alternate routes
- Must monitor portal status

### 3. CPU Overhead
- Cross-shard coordination adds CPU cost
- ISM reads/writes are not free
- Must optimize update frequency

### 4. Creep Travel Time
- Portal traversal takes time
- Cannot instantly teleport creeps
- Must plan for transit delays

### 5. No Direct Communication
- Cannot directly access `Game` or `Memory` from other shards
- Must use InterShardMemory for all coordination
- Some latency in cross-shard updates

---

## Best Practices

### 1. Establish Strong Home Base First
- Reach RCL 8 on home shard before expanding
- Build up energy reserves (> 1M)
- Ensure stable CPU usage (< 80%)

### 2. Scout Before Colonizing
- Send scout creeps to explore target rooms
- Verify portal routes are stable
- Check for hostile players

### 3. Start Small
- Begin with one additional shard
- Establish single colony before expanding
- Learn multi-shard mechanics gradually

### 4. Monitor ISM Size
- Regularly check `shard.debug_ism()`
- Keep ISM usage under 80 KB
- Prune old operation data

### 5. Plan Portal Routes
- Identify stable portal locations
- Build colonies near portals when possible
- Have backup routes for critical paths

### 6. Coordinate Spawn Load
- Balance spawning across shards
- Use spawn assist effectively
- Don't overload any single shard

---

## Troubleshooting

### Creeps Not Arriving on Destination Shard

**Possible Causes**:
- Portal became unstable and disappeared
- Creep path was blocked
- ISM coordination failed

**Solutions**:
```javascript
// Check portal status
shard.portals();

// Check operation status
shard.operations();

// Clear stuck operations
shard.clear_operations();
```

### ISM Size Too Large

**Possible Causes**:
- Too many operations in queue
- Old operation data not cleaned up
- Inefficient data structure

**Solutions**:
```javascript
// Check ISM size
shard.debug_ism();

// Clear old operations
shard.clear_operations();

// Adjust update frequency (reduce CPU cost)
Memory.shard.ism_pulse = 400; // Update less frequently
```

### High CPU Usage

**Possible Causes**:
- Too many ISM reads/writes
- Expensive portal route calculations
- Too many cross-shard operations

**Solutions**:
```javascript
// Profile CPU usage
profiler.run(100);
profiler.analyze();

// Reduce ISM update frequency
Memory.shard.ism_pulse = 400;

// Cache portal routes longer
Memory.shard.portal_cache_ticks = 2000;
```

### Colony Not Establishing

**Possible Causes**:
- Not enough initial creeps
- Resources not delivered
- Hostile interference

**Solutions**:
```javascript
// Check operation status
shard.operations();

// Check colony status on destination shard
shard.colonies("shard1");

// Manually spawn additional support creeps
empire.spawn_assist("W1N1", "worker", 3);
```

---

## Performance Considerations

### CPU Impact
- **ISM Updates**: ~0.5 CPU per update
- **Portal Detection**: ~0.1 CPU per room scanned
- **Portal Route Calculation**: ~1-2 CPU per route
- **Total Overhead**: Expected 5-10% with multiple colonies

### Memory Impact
- **ISM Usage**: 20-80 KB depending on operation count
- **Portal Data**: ~0.1 KB per portal
- **Operation Data**: ~1 KB per active operation

### Optimization Tips
1. Use pulse-based updates (not every tick)
2. Cache portal routes
3. Limit concurrent operations
4. Clean up completed operations promptly
5. Use efficient JSON structures

---

## Future Enhancements

### Planned Features
- [ ] Automated shard-to-shard market trading
- [ ] Cross-shard power creep coordination
- [ ] Multi-shard factory chains
- [ ] Shard-level strategy AI
- [ ] Visual map of shard connections

### Under Consideration
- [ ] Automated shard selection for expansion
- [ ] Cross-shard observer network
- [ ] Shard specialization (combat, economy, etc.)
- [ ] Emergency resource evacuation
- [ ] Cross-shard alliance coordination

---

## Related Documentation

- [Multi-Shard Implementation Plan](multi-shard-implementation-plan.md) - Full technical plan
- [Multi-Shard Monitoring](multi-shard-monitoring.md) - Status commands and monitoring
- [Multi-Shard Creep Travel](multi-shard-creep-travel.md) - Portal traversal mechanics
- [Multi-Shard Colonization](multi-shard-colonization.md) - Colony establishment guide
- [Multi-Shard Resources](multi-shard-resources.md) - Resource sharing system
- [Multi-Shard Combat](multi-shard-combat.md) - Combat coordination

---

**Version**: 1.0  
**Status**: Planning Phase

