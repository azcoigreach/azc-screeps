# Defense and Security: Towers, Walls, and Combat

**Summary**: This guide covers defensive systems including tower automation, wall/rampart management, ally configuration, and automated defense responses against invaders.

**When you need this**: Setting up defenses, managing allies, responding to attacks, or understanding how the bot protects your colonies.

**Prerequisites**: Basic understanding of Screeps defense mechanics (towers, walls, ramparts).

---

## Defense System Overview

The bot provides **automated defenses** that respond to threats without your intervention:

| Defense Type | RCL Req. | Automation Level | Notes |
|--------------|----------|------------------|-------|
| **Towers** | 3+ | ✅ Fully Automated | Auto-target enemies, heal friendlies |
| **Walls/Ramparts** | 2+ | ✅ Fully Automated | Auto-repair to target HP |
| **Soldiers** | Any | ✅ Auto-Spawn on Threat | Spawn when enemies detected |
| **Combat Operations** | Any | 🎮 Manual | You issue attack orders |

---

## Tower Defense (RCL 3+)

### How Tower Automation Works

**When an enemy enters your room**:
1. Towers detect hostile creeps (non-ally players)
2. Select the **closest** enemy to the tower
3. Fire attack until enemy is destroyed or leaves
4. If friendly creeps are wounded, towers prioritize healing them
5. When idle, towers repair structures (starting with lowest HP)

**No configuration required!** Towers work automatically if:
- ✅ Tower is built and functional
- ✅ Tower has energy
- ✅ Enemy is not on your ally list

---

### Tower Energy Management

Towers pull energy from:
1. **Links** (if near a link)
2. **Storage** (via couriers)
3. **Carriers** (if no storage yet)

**If towers are out of energy**:
- Couriers prioritize filling towers when enemies are present
- Workers fill towers from storage as a backup

**Monitoring Tower Energy**:
```javascript
log.resources();  // Shows energy in towers by room
```

**Expected Energy Consumption**:
- **Idle** (repair only): ~1-5 energy/tick
- **Combat** (light): ~10-20 energy/tick per tower
- **Combat** (heavy): ~50-100 energy/tick per tower

---

### Tower Coverage & Placement

**Automatic Placement**: Towers are placed by the blueprint system based on your room layout.

**Coverage**:
- Towers are most effective within ~20 tiles (full damage/heal)
- Effectiveness drops significantly beyond 20 tiles
- RCL 8 rooms have **6 towers** = excellent coverage

**Checking Tower Count**:
```javascript
log.can_build();  // Shows how many towers you can build
```

---

## Walls and Ramparts

### Auto-Repair System

**How It Works**:
1. Workers and repairers automatically repair walls/ramparts
2. Target HP scales with RCL (higher RCL = higher HP targets)
3. **Critical repairs** (< 10k HP) are prioritized
4. **Maintenance repairs** (to target HP) happen when CPU allows

**Default Target HP by RCL**:
| RCL | Default HP Target |
|-----|-------------------|
| 1-2 | 10,000 |
| 3-4 | 100,000 |
| 5-6 | 1,000,000 |
| 7 | 3,000,000 |
| 8 | 5,000,000 |

---

### Setting Custom Wall Targets

**Change Wall/Rampart HP Goal**:
```javascript
empire.wall_target(5000000);  // Set to 5 million HP
```

**What happens**:
- All rooms adopt this target
- Workers/repairers repair walls/ramparts to this HP
- Repairs pause once target is reached

**Use cases**:
- **Low HP target** (100k-500k): Save energy for RCL upgrades or production
- **Medium HP target** (1M-3M): Balanced defense and economy
- **High HP target** (5M+): Maximum security, slower growth

---

### Per-Room Wall Targets (Advanced)

You can set different HP targets for specific rooms via Memory:

```javascript
// Example: Set W1N1 to 1M HP, W2N2 to 3M HP
Memory.rooms["W1N1"].wall_target = 1000000;
Memory.rooms["W2N2"].wall_target = 3000000;
```

**Note**: Per-room settings override the empire-wide target.

---

### Disabling Wall Construction

To **temporarily stop** placing walls/ramparts (e.g., to prioritize RCL):

```javascript
blueprint.toggle_walls("W1N1");  // Disable walls in W1N1
```

Run again to re-enable.

**Use case**: Early RCL push (1-4) where you want to reach RCL 4+ before building defenses.

---

## Ally Management

**Allies** are players whose creeps:
- ✅ Won't trigger tower attacks
- ✅ Can move through your rooms freely
- ✅ Can access your structures (containers, etc.)

**⚠️ Warning**: Only add players you trust! Allies have significant access.

---

### Adding Allies

**Add One Ally**:
```javascript
allies.add("PlayerName");
```

**Add Multiple Allies**:
```javascript
allies.add_list(["Ally1", "Ally2", "Ally3"]);
```

**What happens**:
- Ally names stored in `Memory.hive.allies`
- Towers ignore creeps owned by these players
- Soldiers won't attack their creeps

---

### Removing Allies

**Remove One Ally**:
```javascript
allies.remove("ExAlly");
```

**Clear All Allies**:
```javascript
allies.clear();
```

---

### Checking Ally List

```javascript
// View current allies (no console command yet)
JSON.stringify(Memory.hive.allies);  // Copy output to see list
```

**Example Output**:
```json
["Ally1", "Ally2", "Ally3"]
```

---

## Automated Defense Responses

### Auto-Spawning Soldiers

**When enemies enter a room** (colony or remote mine):
1. Bot detects hostile creeps
2. Spawns soldiers automatically (based on threat level)
3. Soldiers travel to the room and engage
4. Soldiers continue spawning until threats are eliminated

**No action required!** The bot handles this automatically.

---

### Defense in Remote Mining Rooms

**If enemies enter a remote mining room**:
1. Miners retreat to safe distance
2. Soldiers spawn and travel to the remote mine
3. Soldiers eliminate threats
4. Miners resume harvesting

**If threats persist**:
- Consider pausing the remote mine (delete from Memory)
- Set up a permanent defense (see Combat Operations below)

---

### Safe Mode (Manual)

**If your colony is under heavy attack**, you can activate **Safe Mode** manually:

```javascript
// In the Screeps client or via console
Game.rooms["W1N1"].controller.activateSafeMode();
```

**Safe Mode Effects**:
- No enemy creeps can use hostile actions in your room
- Lasts 20,000 ticks (~14 hours at 1 tick/sec)
- Limited uses (check `Game.rooms["W1N1"].controller.safeModeAvailable`)

**Bot Behavior During Safe Mode**:
- Towers continue repairing
- Soldiers may despawn (no enemies to fight)
- Normal operations resume

---

## Combat Operations (Manual)

The bot includes a **combat system** for offensive operations. See `help("empire")` for full details.

### Common Combat Commands

**Trickle Attack** (creeps enter one by one):
```javascript
empire.combat_trickle("W1N1", "W5N5", "standard_army");
```

**Wave Attack** (creeps rally, then attack together):
```javascript
empire.combat_wave("W1N1", "W5N5", "W3N3", "standard_army");  // Rally at W3N3
```

**Occupy a Room** (maintain presence):
```javascript
empire.combat_occupy("W1N1", "W5N5", "occupation_force");
```

**Tower Drain** (drain enemy towers):
```javascript
empire.combat_tower_drain("W1N1", "W5N5");
```

**Dismantle Structures**:
```javascript
empire.combat_dismantle("W1N1", "W5N5");
```

**Attack Controller** (speed up downgrade):
```javascript
empire.combat_controller("W1N1", "W5N5");
```

---

## Defense Playbooks

### Playbook 1: Setting Up Basic Defenses (RCL 3+)

**Goal**: Establish automated defenses for a new colony.

**Steps**:

1. **Verify Tower Count**:
   ```javascript
   log.can_build();  // Should show at least 1 tower available (RCL 3+)
   ```

2. **Build Towers** (automated via blueprint):
   - Towers are placed automatically by the blueprint system
   - Workers build them as energy allows

3. **Set Wall HP Target**:
   ```javascript
   empire.wall_target(1000000);  // 1M HP for balanced defense
   ```

4. **Add Allies** (if applicable):
   ```javascript
   allies.add_list(["Ally1", "Ally2"]);
   ```

5. **Monitor Defense Status**:
   ```javascript
   log.resources();  // Check tower energy levels
   ```

**Expected Outcome**: Towers auto-defend, walls repair to 1M HP, allies can pass safely.

---

### Playbook 2: Responding to an Attack

**Scenario**: Enemies entered your colony and are destroying structures.

**Steps**:

1. **Check Tower Energy**:
   ```javascript
   log.resources();  // Verify towers have energy
   ```

2. **Let Towers Engage**: Towers attack automatically (no action needed).

3. **If Towers Fail** (overwhelmed or out of energy):
   - Manually fill towers with energy (use workers)
   - Activate Safe Mode:
     ```javascript
     Game.rooms["W1N1"].controller.activateSafeMode();
     ```

4. **Spawn Reinforcements** (if needed):
   - Bot auto-spawns soldiers, but you can add more via combat commands

5. **Repair Damage** (after attack):
   - Workers auto-repair structures
   - Check progress: `log.construction()`

**Expected Outcome**: Towers eliminate threats, structures repaired, colony restored.

---

### Playbook 3: Fortifying for High-Level Defense (RCL 7-8)

**Goal**: Prepare for serious attacks from experienced players.

**Steps**:

1. **Max Out Towers**:
   ```javascript
   log.can_build();  // Build all available towers (6 at RCL 8)
   ```

2. **Set High Wall HP**:
   ```javascript
   empire.wall_target(5000000);  // 5M HP (very hard to breach)
   ```

3. **Ensure Energy Reserves**:
   ```javascript
   log.resources();  // Verify > 500k energy in storage
   ```

4. **Set Up Terminal Energy Overflow**:
   ```javascript
   resources.overflow_cap(600000);  // Share energy between colonies
   ```

5. **Test Defenses** (optional):
   - Invite a trusted ally to "attack" (coordinated test)
   - Verify towers engage correctly

**Expected Outcome**: Colony can withstand sustained attacks, towers always have energy, walls are very strong.

---

## Defense Monitoring

### Check Defense Readiness

```javascript
// Overall status
system_status();

// Energy in towers
log.resources();

// Structure HP
// (No console command yet; visually inspect in-game or check Memory)

// Ally list
JSON.stringify(Memory.hive.allies);
```

---

### CPU Impact of Defense

**Idle Defense** (no threats): +0.1-0.5 CPU/tick  
**Active Defense** (towers firing): +0.5-1.5 CPU/tick  
**Combat Operations** (soldiers moving): +1-3 CPU/tick per combat site

**Monitoring Defense CPU**:
```javascript
profiler.run(100);  // During an attack
profiler.analyze(); // Check defense CPU usage
```

---

## Common Defense Issues

### Problem: Towers Not Firing

**Causes**:
- Towers out of energy
- Enemy is an ally (check ally list)
- Towers destroyed or damaged
- Bug in tower targeting logic

**Solutions**:
1. Check tower energy: `log.resources()`
2. Verify ally list: `JSON.stringify(Memory.hive.allies)`
3. Rebuild/repair towers if destroyed
4. Manually fill towers with energy

---

### Problem: Walls Repairing Too Slowly

**Causes**:
- Not enough workers/repairers
- Energy shortage
- HP target too high for current economy
- Workers busy with other tasks

**Solutions**:
1. Check worker count: `log.population()`
2. Verify energy: `log.resources()`
3. Lower wall HP target: `empire.wall_target(500000)`
4. Prioritize defense (pause factory production, reduce remote mines)

---

### Problem: Soldiers Not Spawning

**Causes**:
- Spawn overloaded
- Insufficient energy
- No threats detected (soldiers only spawn when enemies present)

**Solutions**:
1. Manually spawn soldiers via combat commands
2. Check energy: `log.resources()`
3. Verify threats exist (soldiers won't spawn if room is safe)

---

### Problem: Ally Creeps Still Being Attacked

**Causes**:
- Ally name misspelled in Memory
- Ally not added via console command
- Bug in ally detection

**Solutions**:
1. Re-add ally: `allies.add("CorrectName")`
2. Verify spelling matches exactly (case-sensitive)
3. Check ally list: `JSON.stringify(Memory.hive.allies)`

---

## Defense Best Practices

### 1. Always Maintain Tower Energy

**Set Up Auto-Overflow**:
```javascript
resources.overflow_cap(300000);  // Share energy across colonies
resources.set_energy_threshold(100000);  // Buy energy if low
```

**Why**: Towers are useless without energy. Keep reserves high.

---

### 2. Scale Wall HP to Your Economy

**Don't over-build defenses** if it slows growth:
- **Early RCL (1-4)**: 10k-100k HP (focus on growth)
- **Mid RCL (5-6)**: 500k-1M HP (balanced)
- **Late RCL (7-8)**: 3M-5M HP (full defense)

---

### 3. Add Allies Carefully

**Only add players you trust!** Allies can:
- Move freely through your rooms
- Access your structures
- Potentially grief you (though they can't damage your structures directly)

**Best practice**: Only ally with players you've coordinated with on Slack/Discord.

---

### 4. Use Safe Mode as a Last Resort

Safe Mode is **limited** (only a few uses per controller lifetime). Save it for:
- **Catastrophic attacks** that threaten to destroy your spawn
- **Surprise attacks** when you're offline
- **Buying time** to organize a defense or evacuate resources

---

### 5. Monitor Defense CPU

Defense operations (especially soldiers) can spike CPU. Profile regularly:
```javascript
profiler.run(100);
profiler.analyze();
```

If defense CPU is > 10%, consider optimizing (reduce soldier counts, simplify combat logic).

---

## Defense Quick Reference

```javascript
// === ALLIES ===
allies.add("PlayerName");                   // Add one ally
allies.add_list(["Ally1", "Ally2"]);        // Add multiple allies
allies.remove("ExAlly");                    // Remove an ally
allies.clear();                             // Clear all allies

// === WALLS & RAMPARTS ===
empire.wall_target(5000000);                // Set HP target (all rooms)
blueprint.toggle_walls("W1N1");             // Disable/enable wall construction

// === MONITORING ===
system_status();                            // Overall defense status
log.resources();                            // Tower energy levels
log.population();                           // Soldier counts

// === COMBAT (MANUAL) ===
empire.combat_trickle("W1N1", "W5N5", "army");    // Trickle attack
empire.combat_occupy("W1N1", "W5N5", "army");     // Occupy room
empire.combat_tower_drain("W1N1", "W5N5");        // Drain towers
```

---

## Next Steps

- **Optimize Defense CPU**: [Performance and CPU](performance-and-cpu.md)
- **Advanced Configuration**: [Configuration](configuration.md)
- **Troubleshoot Issues**: [Maintenance and Debugging](maintenance-and-debug.md)

---

**Your colonies are now fortified!** 🛡️

