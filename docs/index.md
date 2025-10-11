# AZC-Screeps Bot Documentation

**Welcome to the AZC-Screeps Bot player manual!** This bot is a semi-automated Screeps AI designed to handle the tedious colony management tasks while giving you full strategic control through console commands.

**Quick Summary**: This codebase automates spawning, building, mining, and resource management, but leaves strategic decisions (colonization, remote mining, combat, production targets) in your hands. It's designed to be driven through the console, not to play itself.

**When you need this**: If you want to play Screeps with intelligent automation but retain full control over expansion, economy, and warfare.

---

## 🚀 Start Here: 5-Minute Quickstart

**New to azc-screeps?** Follow these steps to get up and running:

1. **Install**: Copy all `.js` files from this repo to your Screeps scripts folder (or use the Screeps Steam client's file sync)
2. **First Tick**: The bot auto-initializes. Open the Screeps console
3. **Discover Features**: Run `help()` to see all available commands
4. **Check Health**: Run `system_status()` to verify everything is working
5. **Set Up Your First Room**:
   ```javascript
   // Set your base layout (origin = top-left spawn position)
   blueprint.set_layout("W1N1", 25, 25, "def_hor");
   ```
6. **Monitor Performance**: Run `profiler.run(50)` to baseline your CPU usage
7. **Adjust Visuals** (if CPU > 80%):
   ```javascript
   visuals.set_performance(10); // Update visuals every 10 ticks
   ```
8. **Expand to Remote Mining**:
   ```javascript
   empire.remote_mining("W1N1", "W2N1"); // Mine from W2N1 into W1N1
   ```
9. **Set Factory Production** (RCL 7+):
   ```javascript
   factories.set_production("battery", 1000, 30);
   ```

**That's it!** Your bot is now managing your colony. Read on for detailed guides.

---

## 📚 Documentation Table of Contents

### Core Guides

- **[Getting Started](getting-started.md)** – Installation, deployment, first-time setup, updating, and troubleshooting
- **[Driving the Bot](driving-the-bot.md)** – Hands-on guide to the most important console commands and workflows
- **[Room Management](room-management.md)** – RCL progression, spawn logic, population levels, and recovery from disasters
- **[Remote Mining](remote-mining.md)** – Planning and executing remote mining operations, including source keeper rooms

### Multi-Shard (🚧 In Development)

- **[Multi-Shard Overview](multi-shard-overview.md)** – Introduction to multi-shard gameplay, features, and architecture
- **[Multi-Shard Implementation Plan](multi-shard-implementation-plan.md)** – Detailed technical plan for multi-shard feature development
- **[Multi-Shard Migration Guide](multi-shard-migration-guide.md)** – Step-by-step guide for migrating to multi-shard architecture
- **[Multi-Shard Roadmap](multi-shard-roadmap.md)** – Visual timeline, progress tracking, and sprint planning

### Economy & Combat

- **[Economy and Market](economy-and-market.md)** – Factories, labs, market operations, energy thresholds, and credits
- **[Defense and Security](defense-and-security.md)** – Tower behavior, walls/ramparts, allies, and automatic defense responses

### Performance & Configuration

- **[Performance and CPU](performance-and-cpu.md)** – Profiler usage, visuals optimization, pulse tuning, caching strategies
- **[Configuration](configuration.md)** – Memory structure, per-room overrides, safe defaults, and advanced tuning

### Reference & Maintenance

- **[Command Reference](reference-commands.md)** – Alphabetical listing of all console commands with examples
- **[Maintenance and Debugging](maintenance-and-debug.md)** – Status dashboards, logs, common issues, recovery playbooks
- **[Pixel Generation](pixel-generation.md)** – Automated pixel generation system, commands, optimization tips
- **[Contributing](contributing.md)** – How to contribute code, update docs, and submit PRs

### Developer Resources

- **[Development Guide](development.md)** – Developer documentation, MCP integration, project structure, coding patterns
- **[Documentation Changelog](changelog.md)** – History of documentation updates and changes

---

## 🎯 Key Features at a Glance

| Feature | Status | Access Via |
|---------|--------|------------|
| **Automatic Spawning** | ✅ Fully Automated | Population templates adjust to RCL |
| **Base Building** | ✅ Automated (with layouts) | `blueprint.set_layout(...)` |
| **Local Mining** | ✅ Fully Automated | Miners/burrowers/carriers spawn automatically |
| **Remote Mining** | ⚙️ Semi-Automated | `empire.remote_mining(...)` |
| **Factory Production** | ⚙️ Semi-Automated | `factories.set_production(...)` |
| **Lab Reactions** | ⚙️ Semi-Automated | `resources.lab_target(...)` |
| **Market Trading** | ⚙️ Semi-Automated | `resources.market_cap(...)`, `resources.market_buy(...)` |
| **Tower Defense** | ✅ Fully Automated | Towers auto-target enemies if energized |
| **Combat Operations** | 🎮 Manual | `empire.combat_*` commands (see docs) |
| **Wall/Rampart Repair** | ✅ Fully Automated | Target HP scales with RCL |
| **Pixel Generation** | ✅ Fully Automated | Auto-generates pixels when CPU usage is below threshold and bucket is full |

**Legend**: ✅ Fully Automated | ⚙️ Semi-Automated (you set targets/goals) | 🎮 Manual (you issue orders)

---

## 🔧 Essential Commands (Copy-Paste Ready)

```javascript
// === DISCOVERY & STATUS ===
help();                          // List all command categories
help("log");                     // Show logging commands
system_status();                 // Overall health dashboard
factory_status();                // Factory production status
market_status();                 // Market and energy status

// === PERFORMANCE ===
profiler.run(100);               // Profile CPU for 100 ticks
profiler.analyze();              // Analyze profiling data
visuals.set_performance(10);     // Update visuals every 10 ticks
visuals.get_performance();       // Show current visual settings

// === ROOM SETUP ===
blueprint.set_layout("W1N1", 25, 25, "def_hor");  // Set base origin
blueprint.block_area("W1N1", 10, 10, 15, 15);                // Block construction area

// === EXPANSION ===
empire.colonize("W1N1", "W2N1", {origin: {x: 25, y: 25}, name: "def_hor"});
empire.remote_mining("W1N1", "W2N1");  // Start remote mining

// === ECONOMY ===
factories.set_production("battery", 1000, 30);    // Produce 1000 batteries (priority 30)
resources.lab_target("XGH2O", 5000, 10);          // Produce 5000 XGH2O (priority 10)
resources.market_cap("U", 10000);                 // Sell U above 10,000 units
resources.set_energy_threshold(50000);            // Buy energy if below 50k

// === DEFENSE ===
allies.add("PlayerName");                         // Add an ally
empire.wall_target(5000000);                      // Set wall/rampart HP target

// === PIXEL GENERATION ===
pixels.status();                                  // Check pixel generation status
pixels.set_threshold(80);                         // Set CPU threshold for pixel generation
```

---

## 📖 How to Use This Documentation

1. **New Players**: Start with [Getting Started](getting-started.md), then move to [Driving the Bot](driving-the-bot.md)
2. **Returning Players**: Jump to [Command Reference](reference-commands.md) for quick lookups
3. **Troubleshooting**: Check [Maintenance and Debugging](maintenance-and-debug.md)
4. **Optimization**: See [Performance and CPU](performance-and-cpu.md)
5. **Advanced Config**: Dive into [Configuration](configuration.md) for Memory-level tweaks

---

## 🌐 Additional Resources

- **GitHub Repository**: [https://github.com/azcoigreach/azc-screeps](https://github.com/azcoigreach/azc-screeps)
- **GitHub Wiki**: [https://github.com/azcoigreach/azc-screeps/wiki](https://github.com/azcoigreach/azc-screeps/wiki) _(auto-synced from /docs)_
- **Original Codebase**: [tanjera/screeps](https://github.com/tanjera/screeps) by Ibi Keller

---

## 💬 Philosophy & Design

**This bot is NOT fully automated.** It's a **command-and-control interface** that gives you the tools to manage a Screeps empire without micromanaging every creep. You decide:

- Which rooms to colonize and when
- Where to mine and which routes to take
- What to produce in factories and labs
- When to attack, defend, or expand
- How to balance CPU and spawning load

The bot handles:

- Spawning creeps based on demand
- Building structures from layouts
- Mining energy and minerals
- Running factories, labs, and terminals
- Defending against invaders
- Repairing structures

**Result**: You play the strategy game, the bot handles the logistics.

---

## 🚦 Next Steps

- **New?** → [Getting Started](getting-started.md)
- **Ready to Play?** → [Driving the Bot](driving-the-bot.md)
- **Expanding?** → [Remote Mining](remote-mining.md)
- **Optimizing?** → [Performance and CPU](performance-and-cpu.md)

**Happy Screeping!** 🎮

