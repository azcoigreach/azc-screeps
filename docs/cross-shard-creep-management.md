# Cross-Shard Creep Management System

## Overview

The **Global Creep Management System** enables full creep control on shards without established colonies. This allows you to explore, mine, gather resources, and perform operations across multiple shards before colonizing them.

## Key Features

✅ **Independent Creep Operations** - Creeps function on any shard, regardless of colony presence  
✅ **Multi-Role Support** - Workers, miners, haulers, scouts, soldiers  
✅ **Resource Discovery** - Automatic scanning for power banks, deposits, minerals  
✅ **Highway Mining** - Cross-shard power bank and deposit harvesting  
✅ **Remote Tasking** - Assign creeps from home shard to work on target shards  
✅ **Portal Discovery** - Continuous portal mapping across all shards  

---

## Architecture

### How It Works

1. **Global Creep Detection**
   - System identifies creeps whose `memory.room` doesn't match any local colony
   - These become "global creeps" managed independently

2. **Role-Based Execution**
   - Each global creep runs its role behavior every tick
   - Supports all standard roles plus specialized cross-shard roles

3. **Resource Scanning**
   - Resource scouts automatically discover and catalog valuable resources
   - Data stored in `Memory.global_resources[shardName]`

4. **Cross-Shard Coordination**
   - Creeps can be assigned targets on any shard
   - Automatically traverse portals when needed
   - Memory preserved during shard transfers

---

## Supported Creep Roles

### 1. Portal Scout (`portal_scout`)
**Purpose**: Discover portals and map shard connections

**Behavior**:
- Explores rooms systematically
- Detects and reports portals to `Memory.shard.portals`
- Auto-tests portal traversal
- Tracks explored rooms to avoid revisiting

**Spawn Command**:
```javascript
shard.spawn_scout("W50N50")
```

**Manual Control**:
```javascript
// Set target room
Game.creeps["port:xxxx"].memory.target_room = "W49N50"

// Reset to exploration mode
shard.reset_scout("port:xxxx")
```

---

### 2. Resource Scout (`resource_scout`)
**Purpose**: Discover power banks, deposits, and minerals

**Behavior**:
- Systematically scans rooms
- Detects and catalogs:
  - Power banks (with power amount and decay time)
  - Deposits (silicon, metal, oxygen, etc.)
  - Minerals (all types)
  - Energy sources in highway rooms
- Stores findings in `Memory.global_resources`

**Spawn Command**:
```javascript
global_creeps.spawn_resource_scout("E10N10")
```

**View Discoveries**:
```javascript
global_creeps.list_resources()
```

---

### 3. Global Worker (`worker`)
**Purpose**: Remote mining and building operations

**Behavior**:
- Travels to assigned remote room
- Harvests energy sources
- Can perform building/repair tasks
- Works independently without colony support

**Assignment**:
```javascript
global_creeps.assign_worker("work:xxxx", "W49N50")
```

**Use Cases**:
- Remote energy harvesting
- Pre-colonization resource gathering
- Supporting other global operations

---

### 4. Highway Miner (`miner`, `remote_miner`)
**Purpose**: Harvest power banks and deposits

**Behavior**:
- Travels to assigned highway room
- Attacks power banks
- Harvests deposits (silicon, metal, oxygen, etc.)
- Works across shard boundaries

**Assignment**:
```javascript
global_creeps.assign_highway("mine:xxxx", "E15N15")
```

**Use Cases**:
- Power bank harvesting across shards
- Deposit collection for commodities
- Highway resource gathering

---

### 5. Global Hauler (`hauler`)
**Purpose**: Transport resources between shards

**Behavior**:
- Picks up dropped resources
- Traverses portals to return to home shard
- Delivers to storage/terminal
- Supports highway mining operations

**Setup**:
```javascript
let creep = Game.creeps["haul:xxxx"];
creep.memory.home_shard = "shard2";
creep.memory.home_room = "W51N51";
creep.memory.pickup_room = "E10N10";
```

---

### 6. Global Combat (`soldier`, `ranger`, `archer`)
**Purpose**: Cross-shard defense and offense

**Behavior**:
- Standard combat roles
- Can operate on any shard
- Supports global operations

**Usage**:
- Automatically uses standard combat behaviors
- Assign targets via standard memory flags

---

## Console Commands

### Global Creep Management

#### `global_creeps.stats()`
Display statistics for all global creeps
```javascript
global_creeps.stats()
```

**Output**:
- Total global creeps
- Breakdown by role
- Individual creep locations

---

#### `global_creeps.assign_worker(creepName, targetRoom)`
Assign a worker to remote mine in target room
```javascript
global_creeps.assign_worker("work:1234", "W49N50")
```

---

#### `global_creeps.assign_highway(creepName, targetRoom)`
Assign a miner to highway mine (power banks/deposits)
```javascript
global_creeps.assign_highway("mine:5678", "E15N15")
```

---

#### `global_creeps.spawn_resource_scout(targetRoom)`
Spawn a scout to discover resources
```javascript
global_creeps.spawn_resource_scout("E10N10")
```

---

#### `global_creeps.list_resources()`
List all discovered resources
```javascript
global_creeps.list_resources()
```

**Output**:
- Power banks (power amount, decay time, location)
- Deposits (type, decay time, location)
- Minerals (type, amount, location)
- Energy sources (highway rooms only)

---

### Portal Management

#### `shard.spawn_scout(targetRoom)`
Spawn a portal scout
```javascript
shard.spawn_scout("W50N50")
```

---

#### `shard.reset_scout(creepName)`
Reset scout to exploration mode
```javascript
shard.reset_scout("port:56b8")
```

---

#### `Portals.display()`
Show all discovered portals
```javascript
Portals.display()
```

---

## Typical Workflows

### 1. Portal Discovery and Mapping

**Goal**: Map all portals on a shard

```javascript
// 1. Spawn portal scout
shard.spawn_scout("W50N50")

// 2. Wait for discovery (scout explores automatically)

// 3. View discovered portals
Portals.display()

// 4. Check portal count in UI
// Portal counter updates automatically
```

---

### 2. Resource Discovery

**Goal**: Find power banks and deposits for harvesting

```javascript
// 1. Spawn resource scout
global_creeps.spawn_resource_scout("E10N10")

// 2. Wait for scanning (scout explores automatically)

// 3. View discovered resources
global_creeps.list_resources()

// 4. Assign miners to valuable targets
global_creeps.assign_highway("mine:1234", "E15N15")
```

---

### 3. Cross-Shard Highway Mining

**Goal**: Harvest power bank on shard3 from shard2

```javascript
// On shard2 (home shard):

// 1. Discover portal route to shard3
shard.spawn_scout("W50N50")  // Find portals

// 2. Send resource scout to shard3
// (scout will traverse portal automatically if needed)
global_creeps.spawn_resource_scout("shard3_room")

// 3. Spawn miner on shard2
// Assign highway target on shard3
global_creeps.assign_highway("mine:xxxx", "E10N10")

// 4. Miner will:
//    - Travel to portal
//    - Traverse to shard3
//    - Navigate to E10N10
//    - Attack power bank
//    - Harvest power
```

---

### 4. Remote Mining Setup

**Goal**: Harvest energy from neutral room on different shard

```javascript
// 1. Send portal scout to find route
shard.spawn_scout("target_shard_room")

// 2. Send worker creeps
global_creeps.assign_worker("work:1111", "W49N50")
global_creeps.assign_worker("work:2222", "W49N50")

// 3. Optional: Send haulers to transport
// Set up hauler memory:
let hauler = Game.creeps["haul:3333"];
hauler.memory.home_shard = "shard2";
hauler.memory.home_room = "W51N51";
hauler.memory.pickup_room = "W49N50";
```

---

## Memory Structure

### Global Resources

```javascript
Memory.global_resources = {
  "shard2": {
    "E10N10_power_bank_abc123": {
      type: "power_bank",
      room: "E10N10",
      pos: {x: 25, y: 25},
      power: 5000,
      ticksToDecay: 3000,
      discovered: 12345678
    },
    "E15N15_deposit_def456": {
      type: "deposit",
      depositType: "silicon",
      room: "E15N15",
      pos: {x: 30, y: 20},
      lastCooldown: 100,
      ticksToDecay: 50000,
      discovered: 12345679
    },
    "W50N50_mineral_ghi789": {
      type: "mineral",
      mineralType: "H",
      room: "W50N50",
      pos: {x: 15, y: 35},
      mineralAmount: 3000,
      discovered: 12345680
    }
  },
  "shard3": {
    // ... resources on shard3
  }
}
```

### Global Creep Memory

```javascript
// Worker
creep.memory = {
  role: "worker",
  room: "W51N51",  // Home room assignment
  remote_target: "W49N50",  // Target room for remote mining
  task: { /* standard task structure */ }
}

// Highway Miner
creep.memory = {
  role: "miner",
  room: "W51N51",
  highway_target: "E15N15"  // Target highway room
}

// Resource Scout
creep.memory = {
  role: "resource_scout",
  room: "W51N51",
  scan_target: "E10N10",  // Current scan target
  explore_mode: true,
  explored_rooms: ["W50N50", "W49N50", "W50N49"]
}

// Hauler
creep.memory = {
  role: "hauler",
  room: "W51N51",
  home_shard: "shard2",  // Shard to return to
  home_room: "W51N51",   // Room to deliver to
  pickup_room: "E10N10"  // Room to pickup from
}
```

---

## Integration with Portal System

### Automatic Portal Traversal

Global creeps automatically use the portal system when assigned targets on different shards:

1. **Route Detection**: System checks if target is on different shard
2. **Portal Route**: Uses `Portals.getPortalRoute()` to find best path
3. **Transfer Tracking**: Registers expected arrival with `Portals.expectArrival()`
4. **Memory Preservation**: Stores creep memory for restoration on arrival
5. **Auto-Reset**: Arriving creeps automatically reset to operational mode

### Cross-Shard Assignment Flow

```javascript
// 1. Assign creep on shard2 to target on shard3
global_creeps.assign_highway("mine:1234", "shard3_room")

// 2. System detects cross-shard assignment
// 3. Creep uses portal traversal automatically
// 4. Creep arrives on shard3
// 5. Auto-reset to mining mode
// 6. Begins mining operation
```

---

## Performance Considerations

### CPU Usage

- Global creeps run every tick (controlled by `hasCPU()`)
- Resource scanning is passive (only when scout is in room)
- Portal traversal has minimal CPU overhead

### Memory Management

- Resource discoveries auto-expire after 100,000 ticks
- Portal data refreshed on scan
- Creep memory cleaned on death (standard)

### Scaling

- System supports unlimited global creeps
- Performance scales linearly with creep count
- Recommended: 5-10 scouts per shard
- Recommended: 20-30 total global creeps per shard

---

## Troubleshooting

### Creep Not Moving

**Problem**: Global creep stuck in place

**Solutions**:
```javascript
// 1. Check creep stats
global_creeps.stats()

// 2. Verify creep has assignment
Game.creeps["name"].memory

// 3. Check room assignment
// Creep's memory.room should NOT match local colony
```

---

### Resources Not Being Discovered

**Problem**: Resource scout not finding resources

**Solutions**:
```javascript
// 1. Check scout is spawned correctly
global_creeps.stats()

// 2. Verify scout is exploring
Game.creeps["rsct:xxxx"].memory

// 3. Check explored rooms
Game.creeps["rsct:xxxx"].memory.explored_rooms

// 4. Manually assign scan target
Game.creeps["rsct:xxxx"].memory.scan_target = "E10N10"
```

---

### Highway Mining Not Working

**Problem**: Miner not harvesting power bank

**Solutions**:
```javascript
// 1. Verify power bank exists
global_creeps.list_resources()

// 2. Check miner assignment
Game.creeps["mine:xxxx"].memory.highway_target

// 3. Verify miner body has ATTACK parts
Game.creeps["mine:xxxx"].body

// 4. Check power bank location
Game.rooms["E10N10"].find(FIND_STRUCTURES, {
  filter: s => s.structureType === STRUCTURE_POWER_BANK
})
```

---

## Future Enhancements

### Planned Features

- **Auto-Assignment**: Automatically assign miners to discovered power banks
- **Hauler Coordination**: Auto-spawn haulers for highway mining operations
- **Resource Prioritization**: Smart targeting based on value and distance
- **Combat Support**: Auto-deploy defenders for power bank operations
- **Multi-Shard Routing**: Optimize portal routes for multiple shard hops
- **Resource Reservation**: Claim resources before sending creeps

---

## Related Documentation

- [Multi-Shard Roadmap](multi-shard-roadmap.md)
- [Multi-Shard Overview](multi-shard-overview.md)
- [Creep Travel Guide](multi-shard-creep-travel.md)
- [Portal Management](phase3-completion-summary.md)
- [Shard Monitoring](multi-shard-monitoring.md)

