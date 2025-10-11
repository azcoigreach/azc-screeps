# Performance and CPU Optimization

**Summary**: This guide covers CPU profiling, visual performance tuning, pulse frequency optimization, caching strategies, and how to identify and fix performance bottlenecks.

**When you need this**: When CPU usage is high (> 60%), CPU bucket is draining, or you want to maximize efficiency before expanding.

**Prerequisites**: Basic understanding of Screeps CPU mechanics (bucket, limit, usage per tick).

---

## Understanding CPU in Screeps

### CPU Basics

- **CPU Limit**: Your allocated CPU per tick (e.g., 100 CPU/tick for GCL 10)
- **CPU Bucket**: Buffer that stores unused CPU (max 10,000)
- **CPU Usage**: Actual CPU consumed each tick
- **Bucket Drain**: When usage > limit, bucket depletes

**Healthy CPU**:
- ✅ Average usage < 70% of limit
- ✅ Bucket stays > 5,000
- ✅ No prolonged spikes (> 90%)

**Unhealthy CPU**:
- ⚠️ Average usage > 80% of limit
- ⚠️ Bucket draining below 1,000
- ⚠️ Frequent spikes causing throttling

---

## CPU Profiling System

The bot includes a **built-in profiler** that tracks CPU usage across 50+ functions and per-room breakdowns.

### Running the Profiler

**Start Profiling**:
```javascript
profiler.run(100);  // Profile for 100 ticks
```

**What happens**:
- Profiler tracks every major function call
- Records CPU cost per function
- Aggregates data over 100 ticks
- Automatically stops after 100 ticks

**Analyze Results**:
```javascript
profiler.analyze();
```

**Example Output**:
```
=== PROFILER ANALYSIS ===
Total Cycles: 100
Average CPU: 22.3 / 100 (22.3%)
Peak CPU: 45.8
CPU Bucket: 9,450 / 10,000

=== TOP CPU CONSUMERS ===
1. Control.runColonies          : 5.2 avg, 520 total (23.3%)
2. Visuals                       : 4.1 avg, 410 total (18.4%)
3. Control.processSpawnRequests  : 3.5 avg, 350 total (15.7%)
4. Blueprint.Init                : 2.8 avg, 280 total (12.6%)
5. Control.factories             : 2.1 avg, 210 total (9.4%)

=== PER-ROOM CPU ===
W1N1: 8.5 avg (38.1%)
W2N2: 6.2 avg (27.8%)
W3N3: 4.5 avg (20.2%)

⚠️ HOTSPOTS (>0.5 CPU avg):
  - Control.runColonies (5.2)
  - Visuals (4.1)
  - Control.processSpawnRequests (3.5)
  - Blueprint.Init (2.8)
  - Control.factories (2.1)

💡 RECOMMENDATIONS:
  ✅ Reduce visual update frequency (currently every 5 ticks)
  ✅ Limit remote mining operations (3+ per colony)
  ⚠️ Check for pathfinding issues in Control.runColonies
  ⚠️ Blueprint may be recalculating too often
```

---

### Stopping the Profiler Early

If you need to stop profiling before it completes:

```javascript
profiler.stop();
```

---

### Profiling Best Practices

1. **Profile During Normal Operation**: Don't profile during attacks or unusual events
2. **Run for 50-100 Ticks**: Too short = unreliable data, too long = wasted CPU
3. **Profile After Changes**: Always re-profile after optimization attempts
4. **Focus on Top 3-5 Hotspots**: Biggest impact for least effort
5. **Compare Before/After**: Track improvements over time

---

## Visual Performance Optimization

**Visuals** (room overlays, info displays) are the **#1 CPU consumer** in most setups.

### Understanding Visual CPU Cost

- **Default**: Visuals update **every 5 ticks** (~20% of ticks)
- **CPU Cost**: ~2-5 CPU per room per update
- **Total Cost**: For 5 rooms = 10-25 CPU per visual update

**Optimization Goal**: Update visuals less frequently without losing useful information.

---

### Visual Performance Controls

**Set Update Interval**:
```javascript
visuals.set_performance(10);  // Update every 10 ticks (reduces CPU by ~50%)
```

**Check Current Setting**:
```javascript
visuals.get_performance();
```

**Clear Cached Visuals** (if they seem stale):
```javascript
visuals.clear_cache();
```

---

### Recommended Visual Settings

| CPU Usage | Recommended Interval | CPU Savings |
|-----------|---------------------|-------------|
| **< 60%** | 5 ticks (default) | Baseline |
| **60-70%** | 10 ticks | ~40-50% reduction |
| **70-80%** | 15 ticks | ~60-70% reduction |
| **> 80%** | 20-25 ticks | ~75-80% reduction |

**Example Workflow**:
```javascript
// Check current CPU
system_status();  // CPU: 75%

// Increase visual interval
visuals.set_performance(15);

// Re-profile after 100 ticks
profiler.run(100);
profiler.analyze();  // New CPU: 60% ✅
```

---

### What's Included in Visuals?

Visuals display:
- Room level (RCL) and progress
- Energy levels and storage
- Creep counts by role
- Structure status
- Remote mining status
- Factory production progress

**Trade-off**: Higher intervals = less real-time info, but more CPU for game logic.

---

## Pulse Frequency Tuning

The bot uses **"pulses"** to avoid running expensive operations every tick.

### Understanding Pulses

**Pulses** are intervals (in ticks) at which certain operations run.

**Current Pulse Intervals**:
- **Defense Pulse**: 6-12 ticks (spawns soldiers, checks threats)
- **Factory Pulse**: 12-24 ticks (assigns production, loads components)
- **Market Pulse**: 24-48 ticks (processes trades, checks thresholds)

**Pulse Scaling**: Intervals increase when CPU bucket is low (automatic throttling).

---

### Why Pulses Matter

**Without Pulses**:
- Every operation runs every tick
- CPU usage spikes to 100%+
- Bucket drains rapidly

**With Pulses**:
- Operations spread across ticks
- Steady CPU usage
- Bucket remains stable

---

### Tuning Pulse Intervals (Advanced)

**Pulse intervals are set in code** (`Control.setPulse()` in `definitions_hive_control.js`).

**To modify pulse intervals**, you must edit the code:

```javascript
// Example (in definitions_hive_control.js)
if (Game.cpu.bucket > 9000) {
    global.Hive.pulse_short = 6;   // More frequent
    global.Hive.pulse_long = 12;
} else if (Game.cpu.bucket > 5000) {
    global.Hive.pulse_short = 12;  // Default
    global.Hive.pulse_long = 24;
} else {
    global.Hive.pulse_short = 24;  // Throttled
    global.Hive.pulse_long = 48;
}
```

**Effect**: Longer pulses = lower CPU usage, but slower reactions to changes.

**Use case**: If CPU is consistently high, increase pulse intervals by ~50%.

---

## Caching Strategies

**Caching** stores expensive calculations for reuse across ticks.

### Built-In Caching

The bot already caches:
- **Room.find() results** (structures, creeps)
- **Pathfinding results** (cached for 10-50 ticks)
- **Visual data** (cached based on update interval)

### Manual Caching (Code Level)

**Pattern**:
```javascript
// Cache expensive operation
if (!room._cachedStructures) {
    room._cachedStructures = room.find(FIND_STRUCTURES);
}
let structures = room._cachedStructures;
```

**Where to Cache**:
- `room.find()` calls (FIND_STRUCTURES, FIND_CREEPS, etc.)
- Complex calculations (distance, pathfinding)
- API queries (Memory lookups, Game object access)

**Cache Lifetime**:
- **Per-tick cache**: Stored on `room._variable` (cleared every tick)
- **Multi-tick cache**: Stored in Memory (persists, but uses memory)

---

## Optimization Recipes

### Recipe 1: Reduce CPU by 20% (Basic)

**Steps**:

1. **Increase Visual Interval**:
   ```javascript
   visuals.set_performance(15);
   ```

2. **Profile**:
   ```javascript
   profiler.run(100);
   profiler.analyze();
   ```

3. **Verify Improvement**:
   - Average CPU should drop by 15-20%

**Expected Result**: CPU: 80% → 60%

---

### Recipe 2: Reduce CPU by 40% (Aggressive)

**Steps**:

1. **Maximize Visual Interval**:
   ```javascript
   visuals.set_performance(25);
   ```

2. **Limit Remote Mining** (if applicable):
   - Remove 1-2 remote mines with lowest energy yield

3. **Pause Non-Critical Operations**:
   - Reduce wall HP targets: `empire.wall_target(100000)`
   - Pause factory production: `factories.clear_all()`

4. **Profile**:
   ```javascript
   profiler.run(100);
   profiler.analyze();
   ```

**Expected Result**: CPU: 80% → 40-50%

---

### Recipe 3: Optimize Pathfinding (Advanced)

**Symptoms**:
- Creeps recalculating paths frequently
- High CPU in creep movement functions

**Solutions**:

1. **Use Explicit Routing** (for remote mining):
   ```javascript
   empire.remote_mining("W1N1", "W5N5", false, ["W1N1", "W2N2", "W3N3", "W5N5"]);
   ```

2. **Avoid Swamps**: Choose routes with fewer swamps/walls

3. **Check for Stuck Creeps**:
   ```javascript
   log.population();  // Look for creeps stuck in one room
   ```

4. **Profile Again**:
   ```javascript
   profiler.run(100);
   profiler.analyze();  // Check creep movement CPU
   ```

**Expected CPU Savings**: 5-15% (depends on pathfinding complexity)

---

### Recipe 4: Reduce Spawn Burden (Advanced)

**Symptoms**:
- Spawns always busy
- High CPU in `Control.processSpawnRequests`

**Solutions**:

1. **Limit Remote Mines**:
   - Remove excess remote mines (see [Remote Mining](remote-mining.md))

2. **Reduce Population Targets** (via Memory edits):
   - Lower creep counts for non-critical roles

3. **Add Spawn Assistance**:
   ```javascript
   empire.spawn_assist("W2N1", ["W1N1"], ["W1N1", "W2N1"]);
   ```

4. **Profile**:
   ```javascript
   profiler.run(100);
   profiler.analyze();
   ```

**Expected CPU Savings**: 5-10%

---

## CPU Bucket Management

### Understanding the Bucket

- **Max Capacity**: 10,000 CPU
- **Fill Rate**: Unused CPU per tick (e.g., if limit is 100 and you use 80, bucket gains 20)
- **Drain Rate**: Excess CPU per tick (e.g., if limit is 100 and you use 120, bucket loses 20)

**Critical Thresholds**:
- **> 9,000**: Safe zone (full capacity)
- **5,000-9,000**: Healthy (some buffer)
- **1,000-5,000**: Caution (reduce operations)
- **< 1,000**: Emergency (bot auto-throttles)

---

### Auto-Throttling (Built-In)

The bot has an **auto-throttle** mechanism in `Control.refillBucket()`:

**When bucket < 1,000**:
- Bot skips main loop (returns early)
- Only critical operations run (spawn, defense)
- Bucket refills quickly

**When bucket < 500**:
- Bot enters "hibernation" mode
- Almost nothing runs until bucket > 1,000

**Player Action**: Wait for bucket to refill (10-30 minutes). Don't panic!

---

### Monitoring Bucket Health

**Check Bucket**:
```javascript
system_status();  // Shows bucket level
```

**Manual Check**:
```javascript
Game.cpu.bucket;  // Returns current bucket value
```

**Healthy Pattern**:
- Bucket fluctuates between 8,000-10,000
- Occasional dips to 6,000-7,000 (acceptable)

**Unhealthy Pattern**:
- Bucket consistently < 5,000
- Long-term drain (losing 100+ per tick)

---

## Troubleshooting High CPU

### Step 1: Profile to Identify Hotspots

```javascript
profiler.run(100);
profiler.analyze();
```

**Look for**:
- Functions using > 5 CPU avg
- Rooms using > 20% of total CPU
- Unexpected hotspots (shouldn't be there)

---

### Step 2: Check Common Culprits

**1. Visuals**:
- Solution: `visuals.set_performance(20)`

**2. Too Many Remote Mines**:
- Solution: Remove 1-2 remote mines

**3. Pathfinding Issues**:
- Solution: Use explicit routing, avoid swamps

**4. Factory Production**:
- Solution: `factories.clear_all()` (temporary)

**5. Combat Operations**:
- Solution: Cancel active combat orders

---

### Step 3: Incremental Optimization

**Don't change everything at once!**

1. Make **one change** (e.g., increase visual interval)
2. Wait 100 ticks
3. Profile again: `profiler.run(100); profiler.analyze();`
4. If improved, keep change; if not, revert
5. Repeat with next optimization

---

### Step 4: Extreme Measures (Last Resort)

If CPU is still critical (> 90% sustained):

1. **Pause All Factories**: `factories.clear_all()`
2. **Remove All Remote Mines**: (delete from Memory)
3. **Disable Visuals**: `visuals.set_performance(50)` or higher
4. **Reduce Wall HP**: `empire.wall_target(10000)`
5. **Profile**: Verify CPU drops to safe levels

**Then gradually re-enable** operations one by one, profiling after each.

---

## Performance Monitoring Dashboard

### Daily Check (5 Minutes)

```javascript
// 1. System health
system_status();  // Check CPU % and bucket

// 2. Profile (if CPU > 70%)
profiler.run(50);
// Wait 50 ticks
profiler.analyze();

// 3. Visual performance
visuals.get_performance();  // Check current interval
```

---

### Weekly Check (10 Minutes)

```javascript
// 1. Deep profile
profiler.run(200);  // Longer for accurate data
// Wait 200 ticks
profiler.analyze();

// 2. Review hotspots (top 5)
// Take notes on changes over time

// 3. Check bucket trend
// Is it draining or stable?

// 4. Optimize if needed
// Follow recipes above
```

---

## Performance Best Practices

### 1. Profile Before Expanding

**Before adding**:
- New colonies
- Remote mines
- Factory targets
- Combat operations

**Run a profile**:
```javascript
profiler.run(100);
profiler.analyze();
```

**If CPU < 60%**: Safe to expand  
**If CPU > 70%**: Optimize first

---

### 2. Keep Bucket > 5,000

**If bucket drops below 5,000**:
1. Pause non-critical operations
2. Profile to find cause
3. Fix hotspots
4. Wait for bucket to refill

**Prevention**: Monitor bucket weekly.

---

### 3. Use Explicit Routing

**For all remote mining**:
```javascript
empire.remote_mining("W1N1", "W5N5", false, ["W1N1", "W2N2", "W3N3", "W5N5"]);
```

**CPU Savings**: 10-20% reduction in pathfinding cost.

---

### 4. Optimize Visuals Early

**Don't wait until CPU is critical!**

**Set visuals to 10 ticks** as a default:
```javascript
visuals.set_performance(10);
```

**Only increase if needed** (CPU > 70%).

---

### 5. Limit Concurrent Operations

**Don't run simultaneously**:
- Multiple combat operations
- 5+ remote mines per colony
- Heavy factory production + labs + market trading

**Stagger operations** or prioritize the most critical.

---

## CPU Quick Reference

```javascript
// === PROFILING ===
profiler.run(100);              // Start profiling for 100 ticks
profiler.stop();                // Stop profiling early
profiler.analyze();             // Analyze results

// === VISUAL PERFORMANCE ===
visuals.set_performance(10);    // Update every 10 ticks
visuals.get_performance();      // Check current setting
visuals.clear_cache();          // Clear cached visuals

// === MONITORING ===
system_status();                // Overall CPU and bucket
Game.cpu.bucket;                // Current bucket value
Game.cpu.getUsed();             // CPU used this tick
```

---

## Next Steps

- **Understand Memory Structure**: [Configuration](configuration.md)
- **Troubleshoot Issues**: [Maintenance and Debugging](maintenance-and-debug.md)
- **Review Commands**: [Command Reference](reference-commands.md)

---

**Your bot is now optimized for peak performance!** ⚡

