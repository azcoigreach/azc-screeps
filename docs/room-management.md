# Room Management: RCL Progression & Spawning

**Summary**: This guide explains how the bot manages room controller levels (RCL), spawns creeps, handles population demand, and recovers from disasters like energy depletion or server restarts.

**When you need this**: Understanding why creeps spawn the way they do, optimizing spawn burden, planning RCL progression, or recovering from room failures.

**Prerequisites**: Basic understanding of Screeps mechanics (spawns, extensions, RCL).

---

## Room Controller Levels (RCL) Overview

The bot's behavior scales automatically with your room's RCL:

| RCL | Key Features | Typical Creep Count | Energy Storage | Spawn Capacity |
|-----|-------------|---------------------|----------------|----------------|
| **1** | Basic spawning, 1 spawn | 5-8 | ~5k (containers) | 300 energy/tick |
| **2** | Extensions (5), walls | 8-12 | ~10k | 550 energy/tick |
| **3** | Extensions (10), tower | 12-18 | ~30k | 800 energy/tick |
| **4** | Extensions (20), storage | 18-25 | ~80k | 1300 energy/tick |
| **5** | Extensions (30), links | 25-35 | ~150k | 1800 energy/tick |
| **6** | Extensions (40), terminal, labs | 35-50 | ~300k | 2300 energy/tick |
| **7** | Extensions (50), 2nd spawn, factory | 50-70 | ~600k | 2800 energy/tick |
| **8** | Extensions (60), 3rd spawn, nuker, observer | 70-100+ | ~1M+ | 3300 energy/tick |

**What the bot does**:
- Automatically adjusts creep population based on RCL
- Spawns higher-level creeps as energy capacity increases
- Prioritizes critical roles (miners, carriers) over luxury roles (repairers, couriers)

---

## Creep "Levels" System

To save energy and spawn time, the bot uses a **creep level system** that matches RCL:

### How It Works

- **Creep Level**: A number (1-8) representing the creep's body part count and effectiveness
- **Room Level (RCL)**: Your room controller level (1-8)
- **Population Demand**: Percentage of ideal creep count currently alive

**Formula**:
```
Actual Creep Level = Target Level × (Population Demand %)
```

**Example**:
- Room is RCL 6 (target level = 6)
- Population is at 60% of ideal (18 out of 30 creeps alive)
- Next creep spawns at level `6 × 0.6 = 3.6` → rounded to **level 4**

**Why This Matters**:
- **Low population** → Smaller, cheaper creeps spawn faster
- **High population** → Full-size, efficient creeps
- **Recovery**: After a disaster, small creeps bootstrap the economy quickly

---

## Spawning Logic

### Spawn Priority Order

The bot spawns creeps in this order (highest to lowest priority):

1. **Miners/Burrowers** – Critical: Generate energy
2. **Carriers** – Critical: Transport energy to spawns/extensions
3. **Workers** – Important: Build and upgrade
4. **Upgraders** – Important: Progress RCL
5. **Repairers** – Optional: Maintain structures
6. **Couriers** – Optional: Manage terminals, labs, factories
7. **Scouts** – Optional: Vision and intel
8. **Soldiers** – Conditional: Only if threats detected or combat ordered

**What this means**: If spawn capacity is tight, the bot prioritizes energy generation and transport over upgrades or repairs.

---

### Spawn Queuing

When multiple rooms need creeps, the bot queues requests and processes them in order:

```javascript
// Example internal spawn queue (you don't see this, but it's happening)
[
  { room: "W1N1", role: "miner", priority: 1 },
  { room: "W2N1", role: "carrier", priority: 1 },
  { room: "W1N1", role: "worker", priority: 2 },
  { room: "W2N1", role: "upgrader", priority: 2 },
  // ...
]
```

**If a spawn is busy**: The request waits. **If energy is insufficient**: The creep spawns at a lower level.

---

### Spawn Assistance (Multi-Room Spawning)

New or struggling colonies can request **spawn assistance** from nearby rooms:

```javascript
empire.spawn_assist("W2N1", ["W1N1"], ["W1N1", "W2N1"]);
```

**What happens**:
- `W1N1` spawns creeps for `W2N1`
- Creeps travel along the route `["W1N1", "W2N1"]`
- Spawned creeps know their target room and head there immediately

**Use cases**:
- New colonies (RCL 1-3) with insufficient spawning capacity
- Colonies recovering from energy depletion
- Remote mining operations that exceed local spawn capacity

---

## Population Demand & Recovery

### Understanding Population Demand

**Population Demand** = (Current Creep Count / Ideal Creep Count) × 100%

**Example**:
- Ideal population: 30 creeps
- Current alive: 18 creeps
- Demand: 18/30 = **60%**

When demand is low, the bot spawns smaller, cheaper creeps to recover faster.

---

### Recovery Scenarios

#### Scenario 1: Total Energy Depletion

**What happened**: Storage and spawns are at 0 energy.

**Recovery**:
1. Miners spawn at **level 1** (smallest possible)
2. Miners harvest sources, deposit to storage
3. Carriers spawn at **level 1**, transport energy to spawns
4. As energy accumulates, spawn capacity increases
5. Larger creeps spawn progressively
6. After ~200-500 ticks, population fully restored

**Player Action Required**: None! The bot self-recovers. Optionally, send energy from another room:

```javascript
resources.send("emergency_transfer", "W1N1", "W2N1", "energy", 50000);
```

---

#### Scenario 2: Server Restart (All Creeps Dead)

**What happened**: Server restart or nuke wiped out all creeps.

**Recovery**:
1. Population demand = **0%**
2. First creep spawns at **level 1** (absolute minimum)
3. Successive creeps spawn larger as population increases
4. Full recovery in ~500-1000 ticks depending on RCL

**Player Action Required**: None! The bot is designed to recover autonomously.

---

#### Scenario 3: Remote Mine Destroyed

**What happened**: Enemy destroyed your remote mining operation.

**Recovery**:
1. Remote mining site detects 0% population
2. Spawns **level 1 miners** to restart operations
3. If source keepers were involved, spawns soldiers first
4. Gradually ramps back up to full capacity

**Player Action Required**: Optionally cancel the remote mine if it's too dangerous:

```javascript
// Remove the remote mining site from Memory manually
// (There's no console command for this yet; see Configuration docs for Memory paths)
```

---

## RCL Progression Strategies

### Fast RCL Push (1 → 8)

**Goal**: Reach RCL 8 as quickly as possible.

**Strategy**:
1. Prioritize upgraders (more workers, fewer repairers)
2. Minimize wall HP targets to save energy:
   ```javascript
   empire.wall_target(100000);  // Low HP, focus on RCL
   ```
3. Limit remote mining to 2-3 operations per colony
4. Avoid factory production until RCL 8

**Timeline**:
- RCL 1 → 4: ~50k ticks (~1-2 days)
- RCL 4 → 6: ~150k ticks (~3-5 days)
- RCL 6 → 8: ~500k ticks (~10-15 days)

---

### Balanced Growth

**Goal**: Secure defenses and economy before pushing RCL.

**Strategy**:
1. Build walls/ramparts to 1M HP at RCL 5-6
2. Establish 3-4 remote mines per colony
3. Set up labs for boost production
4. Slow RCL progression, focus on resource accumulation

**Timeline**:
- Slower RCL progression
- More resilient to attacks
- Better economic base for expansion

---

### Energy-Efficient RCL (Low CPU, Low Energy)

**Goal**: Minimize spawn burden and CPU usage.

**Strategy**:
1. Use compact base layout (fewer structures to maintain)
2. Spawn fewer creeps (reduce population targets via Memory edits)
3. Limit remote mining to 1-2 operations
4. Disable visuals or set low update frequency:
   ```javascript
   visuals.set_performance(20);
   ```

---

## Managing Multiple Rooms

### Recommended Ratios (Colonies : Remote Mines)

| RCL | Spawns | Recommended Remote Mines | Notes |
|-----|--------|--------------------------|-------|
| **3** | 1 | 2-3 (1-source rooms) | Can barely sustain more |
| **4** | 1 | 2-3 (2-source rooms) | Ideal for steady growth |
| **5-6** | 1 | 3-4 (2-source rooms) | Good balance |
| **7** | 2 | 4-5 (2-source rooms) | Can handle more spawn load |
| **8** | 3 | 5-7 (2-source rooms) | Maximum capacity |

**Warning**: Exceeding these ratios will strain spawn capacity and increase CPU usage.

---

### Monitoring Spawn Capacity

```javascript
log.population();  // Check if creeps are spawning fast enough
```

**Red flags**:
- Spawn queue backlog (check with `system_status()`)
- Miners dying before replacements spawn
- Energy storage consistently low (<50k at RCL 5+)

**Solutions**:
1. Reduce remote mining operations
2. Add spawn assistance from another colony
3. Prioritize critical roles (disable repairers temporarily)

---

## Advanced Population Tuning

### Custom Population Templates

You can define custom populations in Memory for specific rooms. See [Configuration](configuration.md) for Memory structure.

**Example** (advanced users only):
```javascript
Memory.rooms["W1N1"].population = {
    workers: { count: 5, body: "worker", level: 6 },
    miners: { count: 4, body: "burrower", level: 6 },
    carriers: { count: 6, body: "carrier", level: 6 },
    // ... etc.
};
```

**Warning**: If you set a custom population, you must define ALL roles (miners, workers, carriers, etc.). Incomplete definitions will break spawning.

---

### Pausing Spawning for Specific Roles

To temporarily stop spawning a role (e.g., repairers during energy shortage):

```javascript
// Use the pause commands (see help("pause"))
// Example: pause.role("W1N1", "repairer");
```

Check `help("pause")` for available pause commands.

---

## Common Room Management Issues

### Issue: Creeps Not Spawning

**Possible Causes**:
- Insufficient energy in spawns/extensions
- Spawn is busy or broken
- Population demand is zero (no need for more creeps)

**Solutions**:
1. Manually fill spawn with energy (use a worker/miner)
2. Check for spawn existence: `Game.rooms["W1N1"].find(FIND_MY_SPAWNS)`
3. Review population: `log.population()`

---

### Issue: Too Many Creeps, Spawn Always Busy

**Possible Causes**:
- Too many remote mining operations
- Custom population set too high
- Multiple rooms using spawn assistance from this colony

**Solutions**:
1. Reduce remote mining: Remove 1-2 remote sites
2. Add another spawn (RCL 7+)
3. Review spawn assistance: `Memory.rooms["W1N1"].spawn_assist`

---

### Issue: Room Stuck at Low RCL

**Possible Causes**:
- Not enough upgraders
- Energy going to walls instead of controller
- Remote mines failing (low energy income)

**Solutions**:
1. Check upgrader count: `log.population()`
2. Lower wall HP targets: `empire.wall_target(100000)`
3. Check energy storage: `log.resources()`

---

## Population Monitoring Commands

```javascript
// See all creeps by room and role
log.population();

// Check spawn status and queue
system_status();

// See energy levels (affects spawn capacity)
log.resources();

// Check construction progress (affects worker demand)
log.construction();
```

---

## RCL Milestones & Unlocks

| RCL | Structures Unlocked | Bot Features Enabled |
|-----|---------------------|----------------------|
| **2** | Extensions (5), Walls | Basic defense, more spawn capacity |
| **3** | Extensions (10), Tower | Auto-defense, remote mining viable |
| **4** | Extensions (20), Storage | Remote mining fully effective |
| **5** | Extensions (30), Links, 2 Towers | Link automation, better energy flow |
| **6** | Extensions (40), Terminal, Labs, 3 Towers | Lab reactions, terminal shipping, market access |
| **7** | Extensions (50), 2nd Spawn, Factory, 4 Towers | Factory production, doubled spawn capacity |
| **8** | Extensions (60), 3rd Spawn, Nuker, Observer, Power Spawn | Full automation, maximum capacity |

---

## Playbook: Recovering a Failed Colony

**Scenario**: Your RCL 5 colony ran out of energy and all creeps died.

**Steps**:

1. **Check Status**:
   ```javascript
   system_status();
   log.resources();  // Confirm energy is 0
   ```

2. **Wait for Auto-Recovery**: The bot will spawn level 1 miners automatically. Don't panic!

3. **Optionally Send Energy** from another colony:
   ```javascript
   resources.send("recovery", "W1N1", "W2N1", "energy", 50000);
   ```

4. **Monitor Progress** (every ~50 ticks):
   ```javascript
   log.population();  // Watch creep count increase
   log.resources();   // Watch energy accumulate
   ```

5. **Full Recovery Checkpoint** (~500 ticks later):
   - Energy > 100k
   - Population > 80%
   - Spawn queue clear

**Done!** No manual intervention required beyond optional energy transfer.

---

## Next Steps

- **Expand with Remote Mining**: [Remote Mining](remote-mining.md)
- **Set Up Economy**: [Economy and Market](economy-and-market.md)
- **Optimize CPU**: [Performance and CPU](performance-and-cpu.md)
- **Advanced Tuning**: [Configuration](configuration.md)

---

**Your colonies are now self-managing!** 🏗️

