# Maintenance and Debugging

**Summary**: This guide provides troubleshooting playbooks, debugging techniques, common issues with solutions, and recovery procedures for critical failures.

**When you need this**: Bot isn't working as expected, experiencing errors, recovering from attacks, or diagnosing performance issues.

**Prerequisites**: Basic familiarity with the bot's core systems.

---

## Status Dashboards

### system_status()

**The most important command for health monitoring.**

```javascript
system_status();
```

**What It Shows**:
- Game time and tick rate
- CPU usage (average and current)
- CPU bucket level
- Memory usage
- Per-room summary (RCL, energy, creep counts, structures)

**When to Use**:
- **Daily**: Check overall health
- **After changes**: Verify systems still work
- **Before expansion**: Ensure capacity for growth
- **During issues**: First diagnostic step

**Example Output**:
```
=== SYSTEM STATUS ===
Game Time: 12345678
CPU Used: 18.5 / 100 (18.5%)
CPU Bucket: 9850 / 10000
Memory Usage: 3.2 MB

=== ROOMS ===
W1N1 [RCL 6]
  Energy: 245000 / 300000 (82%)
  Creeps: 28 / 30 (93%)
  Structures: 47 / 60 available

W2N2 [RCL 4]
  Energy: 45000 / 80000 (56%)
  Creeps: 15 / 18 (83%)
  Structures: 28 / 30 available
```

---

### factory_status()

**Monitor factory production progress.**

```javascript
factory_status();
```

**What It Shows**:
- Factory assignments (which factory produces what)
- Production targets and progress
- Courier/operator tasks
- Missing components

**When to Use**:
- Verifying factory production is running
- Checking why factories are idle
- Monitoring commodity production progress

---

### market_status()

**Monitor market operations and energy balance.**

```javascript
market_status();
```

**What It Shows**:
- Market credits
- Energy threshold setting
- Active buy/sell orders
- Per-room energy levels vs. threshold

**When to Use**:
- Before buying/selling on market
- Checking energy distribution across rooms
- Verifying auto-sell/buy is working

---

## Diagnostic Commands

### log.population()

**See all creeps by room and role.**

```javascript
log.population();
```

**What It Shows**:
- Total creep count per room
- Breakdown by role (workers, miners, carriers, etc.)

**Use Cases**:
- **Creeps not spawning**: Check if population is at target
- **Spawn overloaded**: Too many creeps requested
- **Role imbalance**: Too many upgraders, not enough carriers

---

### log.resources()

**See energy and minerals in each room.**

```javascript
log.resources();
```

**What It Shows**:
- Energy in storage, terminals, spawns
- Mineral stockpiles
- Remote mining energy flow

**Use Cases**:
- **Low energy**: Identify which rooms need support
- **Market decisions**: See what you have excess of
- **Factory issues**: Check component availability

---

### log.can_build()

**See available structures to build.**

```javascript
log.can_build();
```

**What It Shows**:
- Structures built vs. available by RCL
- What's available to build next

**Use Cases**:
- Planning construction priorities
- Checking if blueprint has completed all structures

---

### log.construction()

**List all active construction sites.**

```javascript
log.construction();
```

**What It Shows**:
- Construction sites by room
- Progress percentage
- Coordinates

**Use Cases**:
- Monitoring build progress
- Identifying abandoned construction sites

---

## Common Issues & Solutions

### Issue: Bot Not Running / help() Returns Nothing

**Symptoms**:
- Console shows no output for `help()`
- Game seems frozen or unresponsive
- No creeps spawning

**Diagnosis**:
```javascript
Game.time;  // Should increment each tick
```

If `Game.time` is NOT incrementing, your code has crashed.

**Solutions**:

1. **Check Console for Errors**: Look for red error messages (syntax errors, undefined variables)

2. **Re-Upload Code**: Copy all files again from the repo

3. **Hard Refresh**: Ctrl+F5 to clear browser cache

4. **Check CPU Bucket**:
   ```javascript
   Game.cpu.bucket;
   ```
   If bucket < 500, bot may be hibernating. Wait 10-30 minutes for refill.

5. **Reset Memory** (last resort):
   ```javascript
   Memory = {};  // DANGER: Deletes all settings!
   ```

---

### Issue: Creeps Not Spawning

**Symptoms**:
- Spawn exists but is idle
- Population below target
- No spawn queue

**Diagnosis**:
```javascript
system_status();   // Check creep counts
log.population();  // See which roles are missing
log.resources();   // Check energy levels
```

**Solutions**:

1. **Insufficient Energy**: Fill spawns manually
   - Send a worker to pick up energy from storage
   - Transfer to spawn

2. **Spawn Broken**: Repair the spawn
   - Workers should auto-repair
   - Manually send a repairer if needed

3. **Population Demand Zero** (rare):
   - Check `Memory.rooms[roomName].population`
   - If custom population is set incorrectly, reset it:
     ```javascript
     Memory.rooms["W1N1"].population = null;
     ```

4. **Spawn Assistance Misconfigured**:
   - Check `Memory.rooms[roomName].spawn_assist`
   - Verify route is correct

---

### Issue: Structures Not Building

**Symptoms**:
- Blueprint set but no construction sites appear
- Workers idle despite construction sites
- Structures not being built

**Diagnosis**:
```javascript
blueprint.request("W1N1");  // Force blueprint to run
log.construction();         // Check if sites exist
log.population();           // Check worker count
```

**Solutions**:

1. **Layout Not Set**:
   ```javascript
   blueprint.set_layout("W1N1", 25, 25, "def_hor");
   ```

2. **Construction Site Limit Reached** (100 per player):
   - Delete old/abandoned construction sites manually
   - Wait for workers to complete existing sites

3. **Terrain Blocking Placement**:
   ```javascript
   blueprint.block_area("W1N1", x1, y1, x2, y2);
   ```
   - Manually place structures elsewhere if blocked by walls

4. **Workers Dead or Idle**:
   - Check energy availability
   - Wait for workers to spawn

---

### Issue: Towers Not Firing

**Symptoms**:
- Enemies in room but towers don't attack
- Towers have energy but are idle

**Diagnosis**:
```javascript
log.resources();  // Check tower energy
JSON.stringify(Memory.hive.allies);  // Check if enemy is an ally
```

**Solutions**:

1. **Towers Out of Energy**: Fill towers
   - Couriers should auto-fill
   - Manually send a worker if urgent

2. **Enemy is an Ally**:
   ```javascript
   allies.remove("PlayerName");
   ```

3. **Towers Destroyed or Damaged**: Repair/rebuild towers

4. **Bug in Tower Logic** (rare): Report issue or check code

---

### Issue: High CPU / Bucket Draining

**Symptoms**:
- CPU usage > 80% consistently
- Bucket dropping below 5000
- Bot slowing down or hibernating

**Diagnosis**:
```javascript
profiler.run(100);
// Wait 100 ticks
profiler.analyze();
```

**Solutions**:

1. **Reduce Visual Frequency**:
   ```javascript
   visuals.set_performance(20);
   ```

2. **Limit Remote Mining**:
   - Remove 1-2 remote mines with lowest energy yield

3. **Pause Factories**:
   ```javascript
   factories.clear_all();
   ```

4. **Lower Wall HP Targets**:
   ```javascript
   empire.wall_target(100000);
   ```

5. **Cancel Combat Operations**:
   - Delete combat sites from `Memory.sites.combat`

6. **Wait for Bucket to Refill**: If bucket < 1000, bot auto-throttles. Be patient.

**Full Troubleshooting**: See [Performance and CPU](performance-and-cpu.md).

---

### Issue: Remote Mining Not Working

**Symptoms**:
- Miners not traveling to target room
- Energy not returning to colony
- Miners dying or idle

**Diagnosis**:
```javascript
log.population();  // Check miner/carrier counts
log.resources();   // Check energy flow from remote mine
```

**Solutions**:

1. **Path Blocked**: Use explicit routing
   ```javascript
   empire.remote_mining("W1N1", "W3N1", false, ["W1N1", "W2N1", "W3N1"]);
   ```

2. **Miners Dead** (hostiles in room):
   - Wait for soldiers to spawn and clear room
   - Or cancel remote mine: `delete Memory.sites.mining["W3N1"];`

3. **Spawn Overloaded**:
   - Remove other remote mines
   - Add spawn assistance:
     ```javascript
     empire.spawn_assist("W1N1", ["W2N2"], ["W2N2", "W1N1"]);
     ```

4. **Vision Lost**: Send a scout to target room to restore vision

---

### Issue: Factories Not Producing

**Symptoms**:
- Factory exists but is idle
- Production targets set but nothing happening

**Diagnosis**:
```javascript
factory_status();  // Check assignments
log.resources();   // Check component availability
log.population();  // Check courier/operator counts
```

**Solutions**:

1. **Missing Components**: Stock storage with required resources
   - Check COMMODITIES API for recipe

2. **No Couriers/Operators**: Wait for them to spawn
   - RCL 6+ required for couriers
   - RCL 7+ required for factories

3. **Factory Assignment Stale**:
   ```javascript
   factories.renew_assignments();
   ```

4. **Production Target Completed**: Set new targets
   ```javascript
   factories.set_production("battery", 1000, 30);
   ```

---

### Issue: Lab Reactions Not Running

**Symptoms**:
- Lab targets set but reactions not happening

**Diagnosis**:
```javascript
log.resources();   // Check reagent availability
log.population();  // Check courier count
```

**Solutions**:

1. **Missing Reagents**: Stock terminals with base minerals
   - Or send reagents via terminal:
     ```javascript
     resources.send("reagent", "W1N1", "W2N2", "G", 1000);
     ```

2. **No Couriers**: Wait for RCL 6+ to spawn couriers

3. **Labs Not Built**: Need at least 3 labs for reactions
   - Check `log.can_build()`

---

### Issue: Market Orders Not Executing

**Symptoms**:
- Buy/sell orders placed but not executing

**Diagnosis**:
```javascript
market_status();   // Check active orders
resources.credits();  // Check credit balance
```

**Solutions**:

1. **Insufficient Credits**: Earn credits by selling resources

2. **Order ID Invalid**: Order may have been fulfilled by someone else
   - Re-check market for new orders

3. **No Couriers**: Wait for RCL 6+ couriers to spawn

4. **Terminal Missing**: RCL 6+ required for terminals

---

## Recovery Playbooks

### Playbook: Recovering from Total Energy Depletion

**Scenario**: Storage and spawns are at 0 energy, all creeps dead.

**Steps**:

1. **Don't Panic!** Bot auto-recovers from this.

2. **Check Status**:
   ```javascript
   system_status();
   log.resources();  // Confirm energy is 0
   ```

3. **Wait for Auto-Recovery** (~200-500 ticks):
   - Bot spawns level 1 miners (smallest possible)
   - Miners harvest and deposit to storage
   - Carriers transport energy to spawns
   - Larger creeps spawn progressively

4. **Optional: Send Energy from Another Room**:
   ```javascript
   resources.send("emergency_energy", "W2N2", "W1N1", "energy", 50000);
   ```

5. **Monitor Progress**:
   ```javascript
   log.population();  // Watch creep count increase
   log.resources();   // Watch energy accumulate
   ```

6. **Full Recovery Checkpoint** (~500 ticks later):
   - Energy > 100k
   - Population > 80%
   - Spawns running normally

---

### Playbook: Recovering from Server Restart (All Creeps Dead)

**Scenario**: Server restart wiped out all creeps, but structures are intact.

**Steps**:

1. **Check Status**:
   ```javascript
   system_status();
   log.population();  // Confirm creeps = 0
   ```

2. **Wait for Auto-Recovery**:
   - Bot spawns level 1 creeps first
   - Population rebuilds progressively
   - **No action required!**

3. **Monitor Progress** (every ~50 ticks):
   ```javascript
   log.population();
   log.resources();
   ```

4. **Full Recovery** (~500-1000 ticks):
   - Population > 90%
   - Energy stable
   - All systems operational

---

### Playbook: Recovering from Attack (Spawn Destroyed)

**Scenario**: Enemy destroyed your spawn. Colony is crippled.

**Steps**:

1. **Assess Damage**:
   ```javascript
   system_status();
   log.construction();  // Check if spawn is queued for rebuild
   ```

2. **If Spawn Is Queued**: Wait for workers to rebuild it
   - Workers from other rooms can assist if spawn assist is set

3. **If No Spawn Queue**:
   - Manually place spawn construction site
   - Send workers from another room to build it:
     ```javascript
     empire.spawn_assist("W1N1", ["W2N2"], ["W2N2", "W1N1"]);
     ```

4. **Activate Safe Mode** (if available):
   ```javascript
   Game.rooms["W1N1"].controller.activateSafeMode();
   ```

5. **Wait for Spawn to Complete** (~15k energy, ~1000-2000 ticks)

6. **Resume Normal Operations**: Once spawn is built, colony auto-recovers

---

### Playbook: Debugging Memory Corruption

**Scenario**: Bot behaving erratically, suspect Memory is corrupted.

**Steps**:

1. **Backup Current Memory**:
   ```javascript
   copy(JSON.stringify(Memory));  // Save to a text file
   ```

2. **Inspect Suspected Areas**:
   ```javascript
   JSON.stringify(Memory.resources.factories);
   JSON.stringify(Memory.sites.mining);
   JSON.stringify(Memory.rooms["W1N1"]);
   ```

3. **Look for Anomalies**:
   - Missing fields (`undefined`, `null` where shouldn't be)
   - Wrong types (`string` instead of `integer`)
   - Corrupted data (`NaN`, `Infinity`)

4. **Fix Specific Fields**:
   ```javascript
   Memory.resources.factories.targets = {};  // Reset
   ```

5. **Re-Apply Settings via Console**:
   ```javascript
   factories.set_production("battery", 1000, 30);
   ```

6. **Nuclear Option** (if corruption is extensive):
   ```javascript
   Memory = {};  // Wipes everything!
   ```
   - Bot will re-initialize next tick
   - **You'll lose all settings!**

---

## Debugging Techniques

### 1. Console Logging (Code Level)

**Add to code for debugging**:
```javascript
console.log("[DEBUG] Variable value:", variableName);
```

**Remove before committing** (logging is expensive CPU-wise).

---

### 2. Memory Inspection

**View entire Memory**:
```javascript
copy(JSON.stringify(Memory));  // Copy to clipboard
```

**View specific section**:
```javascript
JSON.stringify(Memory.rooms["W1N1"], null, 2);  // Pretty-printed
```

---

### 3. Game Object Inspection

**Check if object exists**:
```javascript
Game.rooms["W1N1"];             // Should return room object
Game.creeps["Worker123"];       // Should return creep object
Game.rooms["W1N1"].storage;     // Should return storage structure
```

**If `undefined`**: Object doesn't exist (dead creep, no vision, etc.)

---

### 4. CPU Profiling for Slow Functions

**Wrap suspect code**:
```javascript
let startCPU = Game.cpu.getUsed();
// ... suspect code ...
let endCPU = Game.cpu.getUsed();
console.log("CPU used:", endCPU - startCPU);
```

---

### 5. Manual Task Execution

**Force a creep to do a specific task**:
```javascript
let creep = Game.creeps["Worker123"];
creep.memory.task = {
    type: "build",
    target: "constructionSiteId",
    timer: 50
};
```

---

## Preventive Maintenance

### Daily Checks (5 Minutes)

```javascript
// 1. Overall health
system_status();

// 2. Creep population
log.population();

// 3. Energy levels
log.resources();

// 4. CPU usage
profiler.run(50);
// Wait 50 ticks
profiler.analyze();
```

---

### Weekly Checks (15 Minutes)

```javascript
// 1. Deep profile
profiler.run(200);
// Wait 200 ticks
profiler.analyze();

// 2. Check construction progress
log.construction();
log.can_build();

// 3. Market status
market_status();
resources.credits();

// 4. Factory progress
factory_status();

// 5. Backup Memory
copy(JSON.stringify(Memory));  // Save to file
```

---

## Emergency Commands

### Stop Everything (Critical CPU)

```javascript
factories.clear_all();                  // Stop factories
visuals.set_performance(50);            // Disable visuals
empire.wall_target(10000);              // Minimal wall repairs
// Delete all remote mines manually from Memory.sites.mining
```

---

### Force Spawn Specific Creep (Debug)

```javascript
// Example: Force spawn a worker
Game.spawns["Spawn1"].spawnCreep([WORK, CARRY, MOVE], "DebugWorker", {
    memory: { role: "worker", colony: "W1N1" }
});
```

---

### Manual Resource Transfer (Emergency)

```javascript
// Send energy immediately (bypassing terminal queue)
Game.rooms["W1N1"].terminal.send("energy", 50000, "W2N2");
```

---

## Common Error Messages

### "Script execution has been terminated: CPU limit reached"

**Cause**: Code is too CPU-intensive.

**Solution**: Optimize (see [Performance and CPU](performance-and-cpu.md)).

---

### "ReferenceError: XYZ is not defined"

**Cause**: Undefined variable or function.

**Solution**: Check code for typos, missing requires, or incorrect variable names.

---

### "TypeError: Cannot read property 'X' of undefined"

**Cause**: Trying to access a property on an undefined object.

**Solution**: Use safe access (`_.get()`) or check if object exists first.

---

## Getting Help

If you're stuck after trying these solutions:

1. **Check Console Logs**: Look for error messages
2. **Profile CPU**: Identify hotspots
3. **Inspect Memory**: Look for corruption
4. **Ask Community**: Screeps Slack, Discord, or forums
5. **Report Bug**: GitHub Issues for azc-screeps repo

---

## Next Steps

- **Optimize Performance**: [Performance and CPU](performance-and-cpu.md)
- **Advanced Config**: [Configuration](configuration.md)
- **Contribute Fixes**: [Contributing](contributing.md)

---

**Debugging is part of the game!** 🐛🔧

