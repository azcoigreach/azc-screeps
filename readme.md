# AZC-Screeps Bot

**A semi-automated Screeps AI that handles tedious colony management while you retain full strategic control.**

This bot automates spawning, building, mining, resource management, and defense—but leaves expansion, economy, and combat decisions in your hands. Think of it as a **command-and-control interface** rather than a fully autonomous AI.

---

## 🎮 Philosophy

**You decide**: Which rooms to colonize, where to mine, what to produce, when to attack  
**The bot handles**: Spawning creeps, building structures, mining energy, running factories, defending against invaders

**Result**: You play the strategy game, the bot handles the logistics.

---

## 📘 Documentation

**Complete player manual with guides, examples, and troubleshooting**:

👉 **[GitHub Wiki](https://github.com/azcoigreach/azc-screeps/wiki)** ← Start Here!

**Quick Links**:
- [Getting Started](https://github.com/azcoigreach/azc-screeps/wiki/getting-started) – Installation and setup
- [Driving the Bot](https://github.com/azcoigreach/azc-screeps/wiki/driving-the-bot) – Core commands and workflows
- [Command Reference](https://github.com/azcoigreach/azc-screeps/wiki/reference-commands) – All commands with examples

---

## 🚀 Quick Start

```javascript
// 1. Install: Copy all .js files to your Screeps account
// 2. In console, discover commands:
help();

// 3. Set your base layout:
blueprint.set_layout("W1N1", 25, 25, "def_hor");

// 4. Check health:
system_status();

// 5. Expand:
empire.remote_mining("W1N1", "W2N1");
```

**That's it!** The bot now manages your colony. See the [wiki](https://github.com/azcoigreach/azc-screeps/wiki) for complete documentation.

---

## ✨ Key Features

- ✅ **Automatic Spawning** – Population scales with RCL
- ✅ **Base Building** – Automated layouts with blueprint system
- ⚙️ **Remote Mining** – You configure, bot executes
- ⚙️ **Factory Production** – Set targets, bot produces
- ⚙️ **Lab Reactions** – Set compounds, bot manages
- ✅ **Tower Defense** – Automated enemy targeting
- ✅ **Wall/Rampart Repair** – Auto-scales with RCL
- ✅ **Pixel Generation** – Auto-generates when CPU is low
- 🎮 **Combat Operations** – Manual control via console

---

## 📚 Original Codebase

This is a fork of **[tanjera/screeps](https://github.com/tanjera/screeps)** by Ibi Keller.

We maintain this repository separately to preserve the original basecode while adding our own enhancements. The original repository remains the authoritative source for the base implementation.

---

## 📖 For More Information

**Everything you need is in the wiki**:

- **[Full Documentation](https://github.com/azcoigreach/azc-screeps/wiki)** – Complete player manual
- **Console Commands**: Type `help()` in-game for all available commands
- **Issues & Support**: [GitHub Issues](https://github.com/azcoigreach/azc-screeps/issues)

---

## 🤝 Contributing

Contributions welcome! Please follow the branch-and-PR workflow documented in the [Contributing Guide](https://github.com/azcoigreach/azc-screeps/wiki/contributing).

---

## 📄 License

This project is licensed under the MIT License - see the [license.md](license.md) file for details.

---

**Happy Screeping!** 🎮
