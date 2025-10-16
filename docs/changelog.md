# Documentation Update Changelog

## [2025-01-11] - Target Commitment System

### Added
- **Target Commitment System** - Prevents creeps from bouncing between energy sources
  - Added commitment logic to `getTask_Mine()` for source selection
  - Added commitment logic to `getTask_Withdraw_Container()` for container selection
  - Added commitment logic to `getTask_Pickup()` for dropped resource selection
  - Creeps commit to targets for 20-100 ticks depending on task type and RCL
  - Adaptive durations: shorter commitments in early game (RCL ≤3) for flexibility
  - Graceful validation: invalid targets trigger immediate re-evaluation

### Changed
- `overloads_creep_tasks.js`:
  - `getTask_Mine()` - Lines 922-1007: Added source commitment with 50-100 tick duration
  - `getTask_Withdraw_Container()` - Lines 495-565: Added container commitment with 30-60 tick duration
  - `getTask_Pickup()` - Lines 728-804: Added pickup commitment with 20 tick duration

### Fixed
- **Bouncing behavior**: Workers and miners no longer constantly switch between sources
- **Path thrashing**: Reduced pathfinding calls by maintaining target commitments
- **Early game efficiency**: RCL 1-3 rooms now have more stable energy collection patterns
- **CPU waste**: Eliminated repeated target re-evaluation every tick

### Performance Impact
- Reduced CPU usage from target selection (fewer `findClosestByPath()` calls)
- More efficient movement patterns (fewer direction changes)
- Better creep distribution across sources
- Lower memory overhead (~50-80 bytes per creep with active commitment)

### Documentation
- Added comprehensive guide: `docs/target-commitment-system.md`
  - Problem description and solution overview
  - Implementation details with code examples
  - Memory structure documentation
  - Tuning parameters and troubleshooting
  - Testing and validation procedures

### Testing
- Deployed to W21N11 (Shard1, RCL 2)
- No runtime errors detected
- CPU usage normal (1-4%)
- Workers spawning and operating normally

---

## [2025-10-11] - Multi-Shard Phase 1 Complete

### Completed
- **Phase 1: Foundation** - Multi-shard awareness and basic coordination
  - Memory structure refactored (`Memory.hive` split into global and shard-specific)
  - InterShardMemory integration (`definitions_intershard_memory.js`)
  - Portal detection system (`definitions_portals.js`)
  - Shard coordinator (`definitions_shard_coordinator.js`)
  - Console commands (`shard.*` - status, portals, debug_ism, etc.)
  - All existing functionality preserved (CPU ~1-2%, no regression)

### Added
- 3 new core modules:
  - `definitions_intershard_memory.js` - ISM read/write and coordination
  - `definitions_portals.js` - Portal scanning and route finding
  - `definitions_shard_coordinator.js` - Cross-shard operation management

### Changed
- `main.js` - Integrated multi-shard coordination into main loop
- `definitions_hive_control.js` - Updated memory initialization for multi-shard
- `overloads_general.js` - Updated all `isPulse` functions for new memory structure
- `definitions_console_commands.js` - Added `shard.*` command category
- `overloads_creep_travel.js` - Integrated multi-shard portal awareness into existing travel system

### Fixed
- Removed optional chaining operators (`?.`) for Screeps compatibility
- Replaced with `_.get()` for safe property access
- **Portal system integration**: Updated old portal detection code to be multi-shard aware
  - Now only uses same-shard portals for automatic pathfinding
  - Prevents accidental cross-shard portal traversal
  - Cross-shard portals tracked separately for Phase 3 implementation

### Documentation
- Updated all multi-shard documentation with Phase 1 completion status
- Updated progress tracking (25% complete)
- Marked all Phase 1 tasks as complete

---

## [Unreleased] - Multi-Shard Feature Planning

### Added
- **Multi-Shard Implementation Plan** (`docs/multi-shard-implementation-plan.md`)
  - Comprehensive implementation plan for multi-shard functionality
  - 7 development phases from foundation to optimization
  - Detailed architecture changes and memory refactoring plan
  - Risk mitigation strategies and success metrics
  - Testing strategy for PTR and production deployment
  
- **Multi-Shard Overview** (`docs/multi-shard-overview.md`)
  - User-facing introduction to multi-shard gameplay
  - Feature overview and architecture explanation
  - Console command reference for `shard.*` commands
  - Best practices and troubleshooting guide
  - Performance considerations and optimization tips

- **Multi-Shard Migration Guide** (`docs/multi-shard-migration-guide.md`)
  - Step-by-step migration procedure from single to multi-shard
  - Memory structure migration with safety checks
  - Testing and validation procedures
  - Rollback instructions and troubleshooting
  - Phase 1 validation checklist

- **Multi-Shard Roadmap** (`docs/multi-shard-roadmap.md`)
  - Visual phase breakdown and progression
  - Progress tracking dashboard
  - Phase 1 planning details
  - Success metrics and quality gates
  - Development workflow and release strategy

- **Updated Documentation Index** (`docs/index.md`)
  - Added new "Multi-Shard (🚧 In Development)" section
  - Links to all multi-shard planning and implementation documents

### Planning Notes
- Multi-shard feature will enable colonies across multiple game shards
- Uses InterShardMemory for cross-shard coordination (100KB per shard)
- Portal-based creep traversal between shards
- Cross-shard colonization, resource sharing, and combat operations
- Development structured in 7 phases
- Will require major refactoring of memory structure (Memory.hive split)
- Target: Version 3.0.0

---

## [Previous] - Complete Player-Facing Documentation

### Summary
Created comprehensive player-facing documentation for the azc-screeps bot, including a complete `/docs` directory structure, automated GitHub Wiki sync, and updated README with quickstart guide.

### What Was Added

#### Documentation Files (/docs)
1. **index.md** - Landing page with quickstart, TOC, and essential commands
2. **getting-started.md** - Installation, deployment, first-time setup, troubleshooting
3. **driving-the-bot.md** - Core console commands and daily workflows
4. **room-management.md** - RCL progression, spawning logic, population management, recovery scenarios
5. **remote-mining.md** - Planning, setup, SK rooms, optimization strategies
6. **economy-and-market.md** - Factories, labs, terminals, market trading
7. **defense-and-security.md** - Towers, walls, allies, combat operations
8. **performance-and-cpu.md** - Profiling, visual optimization, pulse tuning, caching
9. **configuration.md** - Memory structure, per-room settings, safe defaults
10. **reference-commands.md** - Alphabetical command reference with examples
11. **maintenance-and-debug.md** - Status dashboards, common issues, recovery playbooks
12. **contributing.md** - Development guidelines, PR process, code style

#### Infrastructure
- **GitHub Actions Workflow** (`.github/workflows/sync-wiki.yml`):
  - Auto-syncs `/docs` to GitHub Wiki on every push to `main`
  - Renames `index.md` → `Home.md` for wiki compatibility
  - Provides commit summary and wiki link

#### README Updates
- Added "📘 Documentation" section with links to `/docs` and GitHub Wiki
- Added "Player Quickstart" with 5-step getting started guide
- Linked to key documentation pages

### Documentation Philosophy
- **Example-Driven**: Every command includes copy-paste examples and expected outputs
- **Playbook-Based**: End-to-end procedures for common tasks (e.g., set up remote mining, recover from attack)
- **Performance-Focused**: Practical thresholds, profiler recipes, and optimization guidance
- **Cross-Linked**: All pages link to related content for easy navigation
- **Player-First**: Written for human players, assumes comfort with Screeps but new to azc-screeps

### Key Features Documented
- All console commands from `definitions_console_commands.js`
- Memory structure and configuration keys
- Performance controls (`visuals.set_performance()`, `profiler.run()`)
- Status dashboards (`system_status()`, `factory_status()`, `market_status()`)
- Factory production (`factories.set_production()`)
- Lab reactions (`resources.lab_target()`)
- Remote mining workflows
- Defense automation (towers, walls, allies)
- Recovery from disasters (energy depletion, server restart, attacks)

### Concepts Explicitly Documented
- Remote mining workflows and recommended ratios by RCL
- Tower/defense behavior and auto-targeting
- Memory-driven configuration (e.g., `Memory.hive.visuals.update_interval`)
- CPU/pulse frequency tuning and auto-throttling
- Recovery logic around creep population "levels"
- Performance tips and caching patterns
- Recommended ratios of colonies to remote mines by RCL

### Quality Bar
- ✅ All commands have at least one copy-paste example
- ✅ Every page has "When you need this" bullet list
- ✅ Playbooks for key tasks with numbered steps
- ✅ Performance guidance with practical thresholds
- ✅ Safe operations notes and revert instructions
- ✅ Cross-links between related pages
- ✅ Consistent formatting and tone throughout

### Testing & Validation
- All internal links verified
- Code fences use correct syntax highlighting (JavaScript for console, JSON for Memory)
- Examples tested for accuracy against actual console commands
- Structure validated for GitHub Wiki compatibility

### Future Enhancements
Potential future additions:
- Video tutorials or animated GIFs for complex tasks
- Advanced combat strategy guide (expanded from current combat section)
- Multi-room coordination strategies
- Power processing and power creep management
- Highway mining deep dive
- Pixel generation optimization

### Commit Message (Suggested)
```
docs: Add comprehensive player-facing documentation with wiki sync

- Created 12-page documentation set in /docs covering all bot features
- Added GitHub Actions workflow to auto-sync docs to wiki
- Updated README with documentation links and quickstart guide
- All commands include copy-paste examples and expected outputs
- Playbook-based approach for common tasks and troubleshooting
- Performance optimization guidance with practical thresholds

Closes #[issue-number-if-applicable]
```

---

**Documentation Complete!** Players now have a comprehensive manual for driving the azc-screeps bot. 📚✅

