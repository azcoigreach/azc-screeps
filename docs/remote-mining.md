# Remote Mining: Expanding Your Energy Income

**Summary**: Remote mining lets you harvest energy from rooms you don't own, dramatically increasing your income. This guide covers planning, setup, source keeper handling, and optimization strategies.

**When you need this**: When your local mining isn't producing enough energy to sustain operations, or when you want to accelerate growth and production.

**Prerequisites**: At least one established colony at RCL 3+, basic understanding of Screeps pathing and room navigation.

---

## What is Remote Mining?

**Remote Mining** = Sending miners and carriers from a **colony room** to harvest energy in a **target room** (which you don't necessarily control), then returning the energy to your colony's storage.

**Benefits**:
- ✅ Doubles or triples your energy income per colony
- ✅ No need to claim the target room (saves GCL)
- ✅ Supports rapid expansion and high-energy operations
- ✅ Automated by the bot once configured

**Costs**:
- ⚠️ Increased spawn burden (more creeps needed)
- ⚠️ Higher CPU usage (pathfinding, creep management)
- ⚠️ Vulnerable to attack (remote miners are easy targets)

---

## Planning a Remote Mining Operation

### Step 1: Scout Target Rooms

**Manually scout or use a scout creep** to identify good target rooms. Look for:

✅ **2-source rooms** (double the energy of 1-source rooms)  
✅ **Short distance** from your colony (1-3 rooms away)  
✅ **Safe path** (no hostile rooms, minimal swamps)  
✅ **No active hostiles** (unless you're prepared for combat)  
✅ **No reservation** by other players (or weak reservation you can override)

**Example Good Target**: Your colony is `W1N1`, target is `W2N1` (adjacent, 2 sources, no hostiles).

---

### Step 2: Check Spawn Capacity

**Rule of Thumb**: Each 2-source remote mine requires ~6-8 creeps (miners + carriers).

**Spawn Capacity by RCL**:
| RCL | Spawns | Recommended Remote Mines | Notes |
|-----|--------|--------------------------|-------|
| 3 | 1 | 2-3 (1-source) | Barely sustainable |
| 4-6 | 1 | 2-3 (2-source) | Ideal for steady growth |
| 7 | 2 | 4-5 (2-source) | Good capacity |
| 8 | 3 | 5-7 (2-source) | Maximum throughput |

**Before adding a remote mine**:
```javascript
log.population();  // Check current creep count
system_status();   // Verify spawn isn't overloaded
```

If your spawn queue is already backed up, **don't add more remote mines!**

---

### Step 3: Estimate CPU Impact

Each remote mining operation adds **~0.5-1.5 CPU per tick** depending on:
- Distance (longer paths = more CPU)
- Source keeper presence (combat = more CPU)
- Room complexity (obstacles, walls)

**Before expanding**: Run a CPU profile:
```javascript
profiler.run(100);
// Wait 100 ticks
profiler.analyze();
```

If your average CPU is already > 70%, consider optimizations before adding remote mines.

---

## Setting Up Remote Mining

### Basic Setup (No Source Keepers)

**Command**:
```javascript
empire.remote_mining("W1N1", "W2N1");
```

**What happens**:
1. Bot adds the remote mining site to Memory
2. Miners and carriers spawn in `W1N1`
3. Miners travel to `W2N1`, harvest sources
4. Carriers pick up energy and return to `W1N1` storage
5. Operation continues indefinitely until you cancel it

**Expected Result** (after ~200 ticks):
- 4-6 miners in target room
- 4-6 carriers shuttling energy
- +10-15 energy/tick per source (20-30 total for 2-source room)

---

### With Routing (Complex Paths)

If the path crosses hostile or complex terrain:

```javascript
empire.remote_mining("W1N1", "W5N5", false, ["W1N1", "W2N2", "W3N3", "W4N4", "W5N5"]);
```

**Parameters**:
- `"W1N1"`: Colony (home room)
- `"W5N5"`: Target (mining room)
- `false`: No source keepers
- `[...]`: Explicit path to follow

**Why routing helps**:
- Avoids pathfinding across unknown rooms
- Ensures creeps don't get lost or trapped
- Reduces CPU (pre-calculated path)

---

### With Source Keepers

**Source Keeper (SK) rooms** have powerful NPC defenders. You need soldiers to kill them.

**Command**:
```javascript
empire.remote_mining("W1N1", "W5N5", true);  // true = has keepers
```

**What happens**:
1. Soldiers spawn in `W1N1` to accompany miners
2. Soldiers kill source keepers before they attack miners
3. Miners harvest while soldiers patrol
4. Higher spawn burden (~10-12 creeps instead of 6-8)

**CPU Impact**: ~2-3× higher than non-SK mining (combat AI, healing, targeting).

---

### With Spawn Assistance

If your colony can't handle the spawn load alone:

```javascript
empire.remote_mining("W2N1", "W3N1", false, [], ["W1N1", "W2N1"]);
```

**Parameters**:
- Spawn assistance from `W1N1` for miners going to `W3N1` (which are based in `W2N1`)

**Use case**: New colonies (RCL 3-4) with insufficient spawn capacity.

---

## Managing Remote Mining Operations

### Check Active Remote Mines

```javascript
log.resources();  // Shows energy flow from remote mines
log.population(); // Lists miners and carriers by room
```

**Example Output** (`log.resources()`):
```
=== RESOURCES ===
W1N1 (Colony):
  Energy: 245,000 / 300,000
  Remote Mines: W2N1 (+20/tick), W3N1 (+15/tick)

W2N1 (Remote Mine):
  Miners: 4 / 4
  Carriers: 4 / 4
  Energy/tick: 20
```

---

### Removing a Remote Mine

**There's no console command yet** to remove remote mines cleanly. You must manually edit Memory:

**Workaround**:
1. Find the site ID in Memory:
   ```javascript
   JSON.stringify(Memory.sites);  // Copy output, search for your room
   ```

2. Delete the site:
   ```javascript
   delete Memory.sites["site_id_here"];
   ```

**Planned Feature**: `empire.cancel_remote_mining("W2N1")` (not yet implemented).

---

## Optimization Strategies

### 1. Minimize Pathfinding CPU

**Problem**: Creeps recalculate paths every tick, wasting CPU.

**Solution**: Use explicit routing to pre-define paths:
```javascript
empire.remote_mining("W1N1", "W3N1", false, ["W1N1", "W2N1", "W3N1"]);
```

**Expected CPU Savings**: 10-20% reduction in creep pathfinding cost.

---

### 2. Choose Close Targets

**Distance vs. Efficiency**:
| Distance | Energy Loss (hauling) | Recommended? |
|----------|----------------------|--------------|
| 1 room | 0% loss | ✅ Ideal |
| 2 rooms | ~5% loss | ✅ Good |
| 3 rooms | ~10% loss | ⚠️ Acceptable if necessary |
| 4+ rooms | ~20%+ loss | ❌ Avoid unless SK room with huge sources |

**Why**: Carriers spend more ticks traveling, reducing effective energy/tick.

---

### 3. Avoid Swamps and Walls

Swamps slow creeps (×5 fatigue), reducing throughput. **Plan paths around swamps** or use all-terrain creeps (more expensive but faster).

**Check room terrain**:
```javascript
// In-game map or manual inspection
```

If a target room is 90% swamp, **find a better target**.

---

### 4. Reserve Target Rooms (Advanced)

**Reserving a room** prevents other players from claiming it and increases energy regeneration.

**Command** (advanced users):
```javascript
// Not exposed as a console command yet; requires Memory editing
// Add a "reserver" creep to the remote mining population
```

**Benefit**: +1 source regeneration slot per reservation level (up to 3,000 energy every 300 ticks instead of 1,500).

**Cost**: Extra spawn burden (reserver creep).

---

## Handling Threats

### Scenario: Hostile Player in Target Room

**Symptoms**:
- Miners dying
- Energy income drops to 0
- Carriers idle or dying

**Immediate Actions**:
1. Spawn soldiers:
   ```javascript
   // Use empire.combat_* commands (see Driving the Bot or help("empire"))
   ```

2. Temporarily disable the remote mine (delete from Memory)

3. Wait for threat to clear, then restart operation

---

### Scenario: Source Keeper Too Strong

**Symptoms**:
- Soldiers dying faster than they can be replaced
- Energy income negative (more spawn cost than energy returned)

**Solutions**:
1. Increase soldier creep level:
   - Edit `Memory.sites["site_id"].population` to spawn higher-level soldiers

2. Add healing support:
   - Include healer creeps in the population template

3. Abandon the SK room and find a non-SK alternative

---

### Scenario: Reservation Conflict

**Symptoms**:
- Another player reserved the room
- Energy regeneration reduced
- Their creeps are also mining

**Solutions**:
1. **Diplomatic**: Contact the player, negotiate shared mining or territories

2. **Competitive**: Spawn your own reserver to override their reservation

3. **Retreat**: Find a different target room

---

## Advanced Remote Mining

### Multi-Colony Remote Mining

**Setup**: Multiple colonies mine the same target room (rare, but possible).

**Use case**: A central, high-value SK room equidistant from multiple colonies.

**Configuration**: Each colony sets up its own remote mining operation to the same target.

**Warning**: Coordinate spawn timing to avoid wasting carrier trips (one colony's miners might over-harvest).

---

### Highway Mining

**Highway rooms** (e.g., `W0N0`, `W10N0`) have large energy deposits but also SK guards.

**Not yet fully supported** by the bot. Requires custom populations and combat logic.

**Status**: Partially implemented in `Control.runHighwayMining()` (see `main.js`). Requires advanced Memory configuration.

---

## Remote Mining Playbook

### Playbook 1: First Remote Mine (RCL 4 Colony)

**Goal**: Add your first remote mine to boost energy income.

**Steps**:

1. **Scout Adjacent Rooms**:
   - Manually explore `W2N1`, `W1N2`, `W0N1`, `W1N0`
   - Pick the closest 2-source room with no hostiles

2. **Check Spawn Capacity**:
   ```javascript
   log.population();  // Verify < 20 creeps currently
   ```

3. **Start Remote Mining**:
   ```javascript
   empire.remote_mining("W1N1", "W2N1");
   ```

4. **Monitor for 100 Ticks**:
   ```javascript
   log.resources();  // Check energy income
   profiler.run(50); // Verify CPU is acceptable
   ```

5. **Adjust if Needed**:
   - If CPU > 80%, reduce visual frequency: `visuals.set_performance(15)`
   - If spawn overloaded, wait until RCL 5 before adding more

**Expected Outcome**: +20-30 energy/tick, 6-8 additional creeps, +0.5-1 CPU.

---

### Playbook 2: Scaling to Multiple Remote Mines (RCL 6 Colony)

**Goal**: Add 2-3 remote mines to maximize income.

**Steps**:

1. **Ensure Stable Base**:
   ```javascript
   system_status();  // Energy > 150k, CPU < 60%
   ```

2. **Add Mines Incrementally**:
   ```javascript
   empire.remote_mining("W1N1", "W2N1");
   // Wait 200 ticks, check CPU and spawn capacity
   empire.remote_mining("W1N1", "W1N2");
   // Wait 200 ticks, check again
   empire.remote_mining("W1N1", "W0N1");
   ```

3. **Monitor Performance**:
   ```javascript
   profiler.run(100);
   profiler.analyze();  // Check hotspots
   ```

4. **Stop if Overloaded**:
   - CPU > 80%: Remove one remote mine
   - Spawn queue backed up: Remove one remote mine

**Expected Outcome**: +60-80 energy/tick, 18-24 additional creeps, +2-3 CPU.

---

### Playbook 3: Source Keeper Mining (RCL 7 Colony)

**Goal**: Mine an SK room for maximum energy.

**Steps**:

1. **Prepare for High Burden**:
   - Ensure RCL 7+ (2 spawns minimum)
   - Energy storage > 300k
   - CPU < 50%

2. **Start SK Mining**:
   ```javascript
   empire.remote_mining("W1N1", "W5N5", true);
   ```

3. **Monitor Combat**:
   - Check console logs for soldier deaths
   - Verify source keepers are dying before respawn

4. **Adjust Soldier Levels if Needed**:
   - Edit `Memory.sites["site_id"].population` to increase soldier body size

**Expected Outcome**: +30-40 energy/tick (SK sources are larger), 10-12 creeps, +2-3 CPU.

---

## Troubleshooting Remote Mining

### Problem: Miners Not Moving to Target Room

**Causes**:
- Path blocked by walls or hostiles
- Target room no longer visible (vision lost)
- Creep memory corrupted

**Solutions**:
1. Manually send a scout creep to the target room (restore vision)
2. Check console for pathfinding errors
3. Restart the remote mine (delete from Memory, re-add via console)

---

### Problem: Energy Income Lower Than Expected

**Causes**:
- Carriers dying or getting stuck
- Sources not fully harvested (too few miners)
- Long hauling distance (energy wasted on movement)

**Solutions**:
1. Check carrier count: `log.population()`
2. Increase miner count (edit Memory.sites population)
3. Choose a closer target room

---

### Problem: Spawn Overloaded, Can't Keep Up

**Causes**:
- Too many remote mines for spawn capacity
- Creeps dying too fast (hostiles, source keepers)

**Solutions**:
1. Remove 1-2 remote mines
2. Add spawn assistance from another colony:
   ```javascript
   empire.spawn_assist("W1N1", ["W2N2"], ["W2N2", "W1N1"]);
   ```

---

## Remote Mining Quick Reference

```javascript
// === BASIC REMOTE MINING ===
empire.remote_mining("W1N1", "W2N1");  // Colony -> Target

// === WITH ROUTING ===
empire.remote_mining("W1N1", "W5N5", false, ["W1N1", "W2N2", "W3N3", "W5N5"]);

// === SOURCE KEEPER ROOM ===
empire.remote_mining("W1N1", "W7N7", true);

// === MONITORING ===
log.resources();      // Check energy income
log.population();     // Check miner/carrier counts
system_status();      // Overall health
```

---

## Next Steps

- **Set Up Economy**: [Economy and Market](economy-and-market.md)
- **Defend Your Operations**: [Defense and Security](defense-and-security.md)
- **Optimize Performance**: [Performance and CPU](performance-and-cpu.md)

---

**Remote mining is your key to energy dominance!** ⛏️

