# Getting Started with AZC-Screeps

**Summary**: This guide walks you through installing the azc-screeps bot, deploying it to your Screeps account, setting up your first colony, and verifying everything works correctly.

**When you need this**: First-time setup, deploying updates, troubleshooting installation issues, or migrating from another codebase.

---

## Prerequisites

✅ **What you need before starting**:
- Active Screeps account (either [screeps.com](https://screeps.com) or Steam)
- At least one room with a spawn (or be ready to manually claim your first room via GUI)
- Basic JavaScript knowledge (helpful but not required)
- Access to the Screeps console

---

## Installation Methods

### Method 1: Manual Copy (Recommended for Beginners)

1. **Download the Repository**:
   ```bash
   git clone https://github.com/azcoigreach/azc-screeps.git
   cd azc-screeps
   ```

2. **Copy Files to Screeps**:
   - **Web Version**: Open the Screeps web client, navigate to "Scripts", and copy-paste the contents of each `.js` file
   - **Steam Version**: Copy all `.js` files to your Screeps local scripts folder (usually `%LOCALAPPDATA%\Screeps\scripts\screeps.com\default` on Windows)

3. **Commit/Upload**:
   - **Web**: Click "Commit" after pasting all files
   - **Steam**: Scripts auto-sync when you save files

4. **Verify**: Open the Screeps console and type:
   ```javascript
   help();
   ```
   You should see a list of command categories.

---

### Method 2: Git Sync (Advanced Users)

If you're comfortable with git and want easy updates:

1. **Clone into Screeps Scripts Folder**:
   ```bash
   cd /path/to/screeps/scripts/folder
   git clone https://github.com/azcoigreach/azc-screeps.git default
   ```

2. **Pull Updates Anytime**:
   ```bash
   cd /path/to/screeps/scripts/folder/default
   git pull origin main
   ```

3. **Screeps Auto-Detects Changes**: Both web and Steam clients will pick up file changes automatically

---

### Method 3: Using MCP Integration (For Developers)

If you have the Screeps MCP tools configured:

```javascript
// Upload entire directory to Screeps server
mcp_screeps_upload_code({
    mainJsPath: "/home/azcoigreach/repos/azc-screeps",
    branch: "default"
});
```

**Note**: This method requires MCP (Model Context Protocol) integration. See [Contributing](contributing.md) for setup details.

---

## First-Time Setup

### Step 1: Verify the Bot Is Running

After deploying the code, wait for the next game tick. Then in the console:

```javascript
help();
```

**Expected Output**:
```
List of help() arguments, e.g. help(blueprint):
- "allies"     Manage ally list
- "blueprint"  Settings for automatic base building
- "empire"     Miscellaneous empire and colony management
- "factories"  Management of factory commodity production
...
```

If you see this, **the bot is running!** ✅

If you see an error, check the console for syntax errors or missing files.

---

### Step 2: Check System Status

```javascript
system_status();
```

**Expected Output**:
```
=== SYSTEM STATUS ===
Game Time: 12345678
CPU Used: 15.2 / 100
CPU Bucket: 10000 / 10000
Memory Usage: 2.3 MB

=== ROOMS ===
Room: W1N1 [RCL 5]
  - Energy: 150000 / 300000
  - Creeps: 25 / 30 (83% populated)
...
```

This gives you a snapshot of your empire's health.

---

### Step 3: Set Up Your First Colony

**Important**: If you started via the GUI (manually placed a spawn), you need to tell the bot where your base origin is.

#### Define Base Layout Origin

The bot uses **base layouts** to auto-build structures. The origin is the **top-left spawn** position (not including walls).

**Example**: If your spawn is at (25, 25), and you want the default horizontal layout:

```javascript
blueprint.set_layout("W1N1", 25, 25, "def_hor");
```

**Available Layouts**:
- `"def_hor"` – Default horizontal spread (recommended for most rooms)
- `"def_hor_w"` – Default horizontal with walls
- `"def_vert"` – Default vertical layout (good for narrow rooms)
- `"def_vert_w"` – Default vertical with walls
- `"def_comp"` – Default compact design (for cramped spaces)
- `"def_comp_w"` – Default compact with walls
- `"comp_hor"` – Compact horizontal
- `"comp_hor_w"` – Compact horizontal with walls
- `"comp_vert"` – Compact vertical
- `"comp_vert_w"` – Compact vertical with walls

**What Happens**: Every 200-500 ticks, the bot places up to 5 construction sites automatically based on your layout.

---

#### Block Obstructed Areas (Optional)

If terrain walls block part of your layout, you can block those coordinates:

```javascript
blueprint.block_area("W1N1", 10, 10, 15, 15);
```

This prevents the bot from trying to build in impossible locations.

---

#### See What Can Be Built

```javascript
log.can_build();
```

**Output**: Lists all structures available at your current RCL and how many you can still build.

---

### Step 4: Let the Bot Run

**For the next ~1000 ticks**, the bot will:
- ✅ Spawn miners, workers, upgraders automatically
- ✅ Build construction sites from your layout
- ✅ Upgrade your room controller
- ✅ Fill spawns and extensions with energy
- ✅ Repair structures as needed

**No manual intervention required!** Just watch and enjoy.

---

### Step 5: Baseline CPU Usage

After ~100 ticks of running, profile your CPU:

```javascript
profiler.run(100);
```

Wait for 100 ticks, then:

```javascript
profiler.analyze();
```

**Expected Output**:
```
=== PROFILER ANALYSIS ===
Total Cycles: 100
Average CPU: 18.5
Peak CPU: 34.2

=== TOP CPU CONSUMERS ===
1. Control.runColonies: 4.5 avg
2. Visuals: 3.2 avg
3. Control.processSpawnRequests: 2.8 avg
...
```

**If CPU > 80% consistently**: See [Performance and CPU](performance-and-cpu.md) for optimization tips.

---

## Updating the Bot

### Pulling New Versions

1. **Backup Your Memory** (optional but recommended):
   ```javascript
   JSON.stringify(Memory);  // Copy output to a text file
   ```

2. **Pull Latest Code**:
   - **Git Method**: `git pull origin main`
   - **Manual Method**: Download and overwrite files

3. **Check Console for Errors**: After deployment, watch the console for a few ticks

4. **Re-run System Status**:
   ```javascript
   system_status();
   ```

**Note**: Updates typically do NOT reset Memory. Your settings persist across code updates.

---

## Troubleshooting

### Problem: `help()` Returns Nothing or Error

**Possible Causes**:
- Code didn't upload correctly
- Syntax error in one of the files
- Old cache in Screeps client

**Solutions**:
1. Check console for red error messages
2. Re-upload all files, ensuring no files are missing
3. Hard refresh browser (Ctrl+F5)
4. Verify `main.js` and all required files exist

---

### Problem: Creeps Not Spawning

**Possible Causes**:
- Not enough energy in spawns/extensions
- No spawn in the room
- Population demand is zero (rare)

**Solutions**:
1. Manually fill spawn with energy using a worker or colonizer
2. Check spawn exists: `Game.rooms["W1N1"].find(FIND_MY_SPAWNS)`
3. Check population demand: `log.population()`

---

### Problem: Structures Not Building

**Possible Causes**:
- Layout origin not set
- All construction sites used up (max 100 per player)
- Blocked by terrain or existing structures

**Solutions**:
1. Set layout: `blueprint.set_layout("W1N1", x, y, "def_hor")`
2. Remove old construction sites manually or wait for them to complete
3. Block obstructed areas: `blueprint.block_area(...)`

---

### Problem: High CPU Usage (Bucket Draining)

**Possible Causes**:
- Too many rooms/creeps for current optimization
- Visuals updating every tick
- Expensive profiling still running

**Solutions**:
1. Stop profiler: `profiler.stop()`
2. Reduce visual frequency: `visuals.set_performance(15)`
3. Pause non-critical rooms: See [Performance and CPU](performance-and-cpu.md)

---

### Problem: Bot Freezes or Does Nothing

**Possible Causes**:
- CPU bucket empty (bot is throttled by `Control.refillBucket()`)
- Memory corruption

**Solutions**:
1. Wait for CPU bucket to refill (can take 30-60 minutes)
2. Check `Game.cpu.bucket` value
3. If Memory is corrupted, consider a fresh start (backup first!)

---

## Common First-Time Mistakes

| Mistake | Consequence | Fix |
|---------|-------------|-----|
| Forgot to set layout origin | No structures auto-built | `blueprint.set_layout(...)` |
| Too many remote mines too early | Spawn can't keep up, CPU spikes | Remove extra remote mines, see [Remote Mining](remote-mining.md) |
| Added too many factory targets | Operators can't keep up | `factories.clear_all()`, start with 1-2 targets |
| Didn't set allies list | Towers shoot friendly creeps | `allies.add("FriendName")` |
| Placed spawn in a bad spot | Layout won't fit terrain | Manually place structures or restart room |

---

## Configuration Checklist

Before you expand beyond your first room, set these basics:

```javascript
// ✅ Base layout defined
blueprint.set_layout("W1N1", 25, 25, "def_hor");

// ✅ Ally list configured (if you have allies)
allies.add_list(["Ally1", "Ally2"]);

// ✅ Visual performance tuned (if CPU > 60%)
visuals.set_performance(10);

// ✅ Wall targets set (default is fine, but you can customize)
empire.wall_target(3000000);  // 3M HP for walls/ramparts
```

---

## Next Steps

✅ **Setup Complete!** Now you're ready to:

1. **Learn Core Commands**: [Driving the Bot](driving-the-bot.md)
2. **Expand Territory**: [Remote Mining](remote-mining.md)
3. **Optimize Performance**: [Performance and CPU](performance-and-cpu.md)
4. **Configure Advanced Settings**: [Configuration](configuration.md)

---

## Quick Reference: Essential First Commands

```javascript
// Discovery
help();                          // List all commands
system_status();                 // Health check

// Setup
blueprint.set_layout("W1N1", 25, 25, "def_hor");
allies.add("FriendName");

// Monitoring
profiler.run(100);               // Baseline CPU
log.population();                // Check creep counts
log.can_build();                 // See available structures

// Performance
visuals.set_performance(10);     // Reduce visual CPU
```

**Stuck?** Check [Maintenance and Debugging](maintenance-and-debug.md) for troubleshooting playbooks.

---

**Happy Screeping!** 🚀

