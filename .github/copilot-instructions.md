# AZC Screeps AI Bot

**Always follow these instructions first** - Only fallback to additional search and context gathering if the information here is incomplete or found to be in error.

## Working Effectively

### Core Understanding
- **Project Type**: This is a Screeps AI bot written in pure JavaScript (NOT Node.js)
- **Runtime**: Code runs directly in the Screeps game engine (browser or private server)
- **No Build Process**: JavaScript files are uploaded directly to Screeps - no compilation needed
- **No Package Manager**: Uses Screeps' built-in `require()` system, no npm/yarn
- **Total Codebase**: 21 JavaScript files (~12,827 lines of code)

### Development Workflow
- Edit JavaScript files in the repository
- Upload code to Screeps via web client, desktop app, or API tools
- Test and debug using in-game console commands
- Monitor performance using built-in CPU profiler and external monitoring

### Key Files and Structure
```
Repository root:
main.js                           <- Entry point, exports main loop
overloads_*.js                    <- Extend Screeps classes (Creep, Room, etc.)
definitions_*.js                  <- Core bot functionality
base_layouts/                     <- Excel-based base building layouts
screeps-stats/                    <- Docker monitoring with Grafana/Prometheus
readme.md                         <- Comprehensive documentation
```

### Essential Console Commands
Always use these commands for debugging and management:
- `help()` - Show all available console commands
- `help("profiler")` - CPU profiling commands
- `profiler.run(100)` - Profile for 100 ticks to identify performance issues
- `profiler.analyze()` - Get performance analysis and optimization recommendations
- `visuals.set_performance(10)` - Reduce visual update frequency for CPU savings
- `factories.status()` - Show factory production status
- `empire.colonize("W1N1", "W2N2", {origin: {x: 25, y: 25}, name: "default_horizontal"})` - Colonize rooms

### Performance and CPU Management
- **CRITICAL**: CPU optimization is essential - Screeps has strict CPU limits
- **Profiler**: Always run `profiler.run(100)` then `profiler.analyze()` when debugging performance
- **Pulsing System**: Bot uses adaptive pulsing - fewer operations when CPU bucket is low
- **Visual Performance**: Visuals are CPU-intensive, use `visuals.set_performance(N)` to set update intervals
- **Expected Performance**: Well-optimized bot should use 15-20 CPU per tick for medium-sized empire

### Testing and Validation
- **No Unit Tests**: Screeps bots are tested live in-game environment only
- **Console Testing**: Use console commands to validate functionality immediately
- **Performance Testing**: Use profiler to ensure changes don't cause CPU spikes
- **Live Validation**: Always test changes in-game before committing
- **TIMING**: Profiling runs take 1-2 minutes for 100 ticks - NEVER CANCEL these operations
- **Memory Validation**: Check that Memory structures remain intact after changes

### Monitoring System (Optional)
The `screeps-stats/` directory contains Docker-based monitoring:

**Setup Requirements:**
- Docker and Docker Compose
- Screeps API token

**Commands to run monitoring (TIMING: 5-10 minutes for full setup):**
```bash
cd screeps-stats/
chmod +x setup.sh
cp example.env .env
# Edit .env with your Screeps API token
export DOCKER_BUILDKIT=1
docker compose up -d --build --no-cache  # Takes 5-10 minutes first time
```

**Access Points:**
- Prometheus UI: http://localhost:9090
- Grafana UI: http://localhost:3000 (admin/admin)

**Known Issues:**
- Docker build may fail due to SSL certificate issues when downloading Prometheus
- **Workaround**: Use `docker compose up --build --no-cache` if build fails initially
- This monitoring system is optional - bot works without it
- Requires Screeps API token to function

### Common Development Tasks

#### Making Code Changes
1. Edit the relevant JavaScript files (see structure above)
2. Upload to Screeps using one of these methods:
   - Screeps web client (copy/paste code)
   - Screeps desktop app
   - Third-party tools like screeps-cli or grunt-screeps
3. Test using console commands (see Essential Console Commands)
4. Monitor CPU usage with profiler

#### Adding New Features
1. Follow existing patterns in `definitions_*.js` files
2. Add console commands in `definitions_console_commands.js` following the pattern:
   ```javascript
   help_category.push("command.function(params)");
   command.function = function(params) {
       // Implementation
       return `<font color="#D3FFA3">[Console]</font> Success message.`;
   };
   ```
3. Test thoroughly using console commands
4. Profile for CPU impact with `profiler.run(100)` then `profiler.analyze()`

#### Debugging Performance Issues
1. Run `profiler.run(100)` to profile for 100 ticks (NEVER CANCEL - wait for completion)
2. Wait for profiling to complete (will show "[CPU] Profiler stopped" automatically)
3. Run `profiler.analyze()` to get detailed breakdown
4. Focus on functions using >1.0 CPU average per tick
5. Test optimizations with additional profiling cycles

#### Base Layout Modifications
- **Primary File**: `base_layouts/base_layouts.xlsx` (Excel file with visual layouts)
- **CSV Exports**: Various CSV files like `def_hor.csv`, `comp_vert.csv` contain coordinate data
- **Format**: CSV uses abbreviations (SP=spawn, EX=extension, TO=tower, RD=road, RM=rampart)
- **Usage**: Bot reads these files to automatically place construction sites
- **Tool**: `_csv_to_coords.exe` converts CSV to coordinate arrays

### Key Memory Structures
The bot stores configuration in `Memory` object:
- `Memory.hive.allies` - List of allied players
- `Memory.resources.factories.targets` - Factory production goals
- `Memory.hive.visuals.update_interval` - Visual performance setting
- `Memory.resources.market_energy_threshold` - Emergency energy buying threshold

### Code Style and Patterns
- Uses prototypal inheritance to extend Screeps classes
- Extensive use of lodash `_.get()` and `_.set()` for memory access
- Console commands return HTML-formatted strings with color coding
- Error handling via try/catch with console logging
- Functions organized by purpose in separate definition files

### Validation Steps for Changes
1. **Syntax Check**: Ensure JavaScript syntax is valid (Screeps console will show errors)
2. **Console Test**: Test new console commands work correctly in-game
3. **CPU Profile**: Run `profiler.run(100)` - wait 1-2 minutes - then `profiler.analyze()`
4. **Live Test**: Test functionality in-game environment with real creeps/rooms
5. **Memory Check**: Verify Memory structures intact with `JSON.stringify(Memory.hive)` in console
6. **Performance Check**: Ensure bot stays under CPU limit (check Game.cpu.bucket > 500)

### DO NOT Attempt
- Adding Node.js dependencies (bot runs in Screeps engine, not Node.js)
- Creating package.json or build scripts
- Using ES6 modules (use Screeps' require system)
- Running npm/yarn commands
- Setting up traditional unit tests

### File Locations Reference
- Main bot logic: `/` (root directory, 21 .js files)
- Documentation: `readme.md` (comprehensive usage guide)
- Base layouts: `base_layouts/base_layouts.xlsx`
- Monitoring: `screeps-stats/` (Docker-based, optional)
- License: `license.md` (MIT license)

Always reference the comprehensive `readme.md` for detailed explanations of bot features, console commands, and game mechanics. The readme contains extensive documentation on colonies, mining, combat, factories, and all bot systems.