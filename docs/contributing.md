# Contributing to AZC-Screeps

**Summary**: This guide explains how to contribute code, documentation, bug reports, and feature requests to the azc-screeps project.

**When you need this**: You want to improve the bot, fix bugs, add features, or update documentation.

**Prerequisites**: Basic git/GitHub knowledge, JavaScript proficiency, familiarity with Screeps API.

---

## Getting Started

### 1. Fork the Repository

1. Go to [https://github.com/azcoigreach/azc-screeps](https://github.com/azcoigreach/azc-screeps)
2. Click **Fork** (top right)
3. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/azc-screeps.git
   cd azc-screeps
   ```

---

### 2. Set Up Development Environment

**Recommended Setup**:
- **Editor**: VS Code with Screeps Autocomplete extension
- **Linter**: ESLint (optional but recommended)
- **Testing**: Deploy to a private Screeps server or test account

**Install Dependencies** (if any):
```bash
npm install  # If package.json exists
```

---

### 3. Create a Branch

**Branch naming convention**:
- `feature/description` – New features
- `fix/description` – Bug fixes
- `docs/description` – Documentation updates
- `refactor/description` – Code refactoring

**Example**:
```bash
git checkout -b feature/add-nuke-support
```

---

## Code Contribution Workflow

### Step 1: Make Changes

**File Structure** (see repo rules for details):
- `main.js` – Entry point, requires all modules
- `overloads_*.js` – Prototype extensions (Creep, Room, etc.)
- `definitions_*.js` – Global objects and systems
- `base_layouts/` – Base layout definitions

**Coding Conventions**:

1. **Global Objects**:
   ```javascript
   global.SystemName = {
       method: function(params) {
           // Implementation
       }
   };
   ```

2. **Prototype Extensions**:
   ```javascript
   Creep.prototype.newMethod = function() {
       return this.property;
   };
   ```

3. **Safe Memory Access** (use lodash `_.get`):
   ```javascript
   let value = _.get(Memory, ["rooms", roomName, "field"], defaultValue);
   ```

4. **CPU Guards**:
   ```javascript
   if (hasCPU()) {
       // Expensive operation
   }
   ```

5. **Pulse Checks**:
   ```javascript
   if (isPulse_Short()) {
       // Run periodically
   }
   ```

---

### Step 2: Test Your Changes

**Testing Checklist**:
- [ ] No syntax errors (linter check)
- [ ] Code runs without crashing
- [ ] Game.time increments normally
- [ ] New features work as expected
- [ ] CPU usage acceptable (profile before/after)
- [ ] No Memory leaks
- [ ] Console commands added to `help()` if applicable

**Testing Methods**:

1. **Private Server**: Test on a local Screeps server
2. **Test Account**: Use a separate Screeps account for testing
3. **Profiling**: Run `profiler.run(100)` before/after changes

**Example Test Session**:
```javascript
// 1. Upload code
mcp_screeps_upload_code({ mainJsPath: "/path/to/azc-screeps" });

// 2. Check for errors
mcp_screeps_get_console({ clearBuffer: false });

// 3. Test new feature
help("new_category");  // If you added commands
system_status();       // Overall health

// 4. Profile CPU
profiler.run(100);
profiler.analyze();
```

---

### Step 3: Document Changes

**Documentation Requirements**:

1. **Code Comments**: Add comments for complex logic
   ```javascript
   // Calculate optimal creep level based on population demand
   let level = Math.floor(targetLevel * (currentPop / idealPop));
   ```

2. **Console Commands**: Add to `definitions_console_commands.js`
   ```javascript
   global.newCommand = function(params) {
       // Implementation
   };
   
   // Add to help system
   help_category.push("newCommand(params) - Description");
   ```

3. **Update Docs**: If your changes affect player-facing features, update `/docs`
   - Add examples to relevant guides
   - Update command reference if needed

4. **Commit Message**: Write a clear commit message
   ```bash
   git commit -m "feat: Add nuke launch support for combat operations"
   ```

---

### Step 4: Submit Pull Request

1. **Push to Your Fork**:
   ```bash
   git push origin feature/add-nuke-support
   ```

2. **Create Pull Request**:
   - Go to your fork on GitHub
   - Click **Pull Request**
   - Base: `azcoigreach/azc-screeps` `main`
   - Compare: `YOUR_USERNAME/azc-screeps` `feature/add-nuke-support`

3. **PR Description** (template):
   ```markdown
   ## Description
   Adds support for launching nukes via console command `empire.nuke(from, target)`.

   ## Changes
   - Added `empire.nuke()` command to `definitions_console_commands.js`
   - Implemented nuke logic in `definitions_hive_control.js`
   - Updated docs: `driving-the-bot.md`, `reference-commands.md`

   ## Testing
   - Tested on private server: Successfully launched nuke to W5N5
   - CPU impact: +0.5 CPU per tick (acceptable)
   - No errors or crashes

   ## Checklist
   - [x] Code tested and working
   - [x] Documentation updated
   - [x] CPU profiled (no significant impact)
   - [x] Console command added to help()
   ```

4. **Wait for Review**: Maintainers will review and provide feedback

---

## Contribution Guidelines

### Code Quality

**✅ Good Practices**:
- Use `_.get()` for safe Memory access
- Wrap expensive operations in `hasCPU()` checks
- Use pulse checks (`isPulse_Short()`) for periodic operations
- Add comments for complex logic
- Follow existing code style

**❌ Avoid**:
- Hardcoded values (use Memory or configuration)
- Infinite loops
- Expensive operations every tick
- Direct Memory access without checks
- Global variables (use `global.` or `Memory`)

---

### Performance Considerations

**Before submitting**:
1. Profile CPU impact:
   ```javascript
   let startCPU = Game.cpu.getUsed();
   // Your code
   let endCPU = Game.cpu.getUsed();
   console.log("CPU used:", endCPU - startCPU);
   ```

2. Ensure changes don't spike CPU by > 10%

3. Use caching for expensive operations

4. Avoid pathfinding recalculations (cache paths)

---

### Documentation Standards

**Player-Facing Docs** (`/docs`):
- Write in clear, direct language
- Include copy-paste examples
- Add "When to use" sections
- Provide expected outputs
- Link to related docs

**Code Comments**:
- Explain "why", not "what" (code shows what)
- Comment complex algorithms
- Add TODO notes for future improvements

---

## Types of Contributions

### 1. Bug Fixes

**Process**:
1. Open an issue describing the bug (if not already open)
2. Reference the issue in your PR (`Fixes #123`)
3. Include reproduction steps and fix verification

**Example**:
```markdown
## Bug Fix: Towers not firing at enemies

Fixes #45

**Problem**: Tower targeting logic incorrectly checked ally list.

**Solution**: Fixed conditional in `Control.runDefense()` to properly check `Memory.hive.allies`.

**Testing**: Verified towers now fire at non-ally enemies.
```

---

### 2. New Features

**Process**:
1. Discuss feature in an issue first (avoid wasted work)
2. Get maintainer approval before starting
3. Implement feature following code conventions
4. Add console commands (if applicable)
5. Document thoroughly

**Example Features**:
- New combat tactics
- Additional factory commodities
- Lab boost automation
- Market trading strategies

---

### 3. Documentation Updates

**What to Update**:
- Fix typos or errors
- Add missing examples
- Clarify confusing sections
- Add new guides

**Process**:
1. Edit files in `/docs`
2. Verify links work
3. Ensure formatting is consistent
4. Submit PR with description of changes

**Note**: `/docs` automatically syncs to GitHub Wiki via CI/CD.

---

### 4. Performance Optimizations

**Process**:
1. Profile current performance (baseline)
2. Make optimization
3. Profile after changes (compare)
4. Include profiler results in PR

**Example**:
```markdown
## Performance: Reduce visual CPU by 40%

**Baseline**: Visuals: 4.1 CPU avg (18.4% of total)

**Optimization**: Added caching for room.find() calls in visuals.

**Result**: Visuals: 2.5 CPU avg (11.2% of total)

**Savings**: ~1.6 CPU per tick (~40% reduction)
```

---

## Development Best Practices

### 1. Test Incrementally

**Don't**:
- Write 500 lines, then test

**Do**:
- Write 50 lines
- Test
- Write 50 more
- Test again

---

### 2. Use Git Commits Wisely

**Commit Often**:
- Small, logical commits
- Clear commit messages
- Easy to revert if needed

**Commit Message Format**:
```
type: Short description (50 chars max)

Longer explanation if needed (72 chars per line max).
Include reasoning, tradeoffs, and context.

Fixes #123
```

**Types**: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `chore`

---

### 3. Keep PRs Focused

**One PR = One Feature/Fix**

**Don't**:
- Mix bug fixes, features, and refactoring in one PR

**Do**:
- Separate bug fix PR
- Separate feature PR
- Separate refactoring PR

---

### 4. Respond to Feedback

**PR Review Process**:
1. Maintainers review your PR
2. They may request changes
3. Address feedback (make changes, push again)
4. Once approved, PR is merged

**Be receptive to feedback!**

---

## Code Style Guide

### Indentation & Formatting

- **Tabs**: Use tabs (not spaces)
- **Braces**: Same line as function declaration
- **Line Length**: Aim for < 120 chars

**Example**:
```javascript
global.Control = {
	runColonies: function () {
		_.each(Game.rooms, room => {
			if (room.controller != null && room.controller.my) {
				Sites.Colony(room.name);
			}
		});
	}
};
```

---

### Naming Conventions

- **Functions**: `camelCase` (e.g., `runColonies()`)
- **Constants**: `UPPER_CASE` (e.g., `MAX_POPULATION`)
- **Variables**: `camelCase` (e.g., `creepLevel`)
- **Objects**: `PascalCase` for global objects (e.g., `Control`, `Sites`)

---

### Comments

**Good Comments**:
```javascript
// Scale creep level based on population demand (0-100%)
let level = Math.floor(targetLevel * demandPercent);
```

**Bad Comments**:
```javascript
// Set level to target level times demand percent
let level = Math.floor(targetLevel * demandPercent);
```

**Why**: Good comments explain WHY, not WHAT (code is self-documenting).

---

## Troubleshooting Contributions

### Issue: Code Works Locally but Fails in PR

**Possible Causes**:
- Different Screeps version
- Missing files (not committed)
- Merge conflicts

**Solutions**:
1. Test on a clean clone of your fork
2. Verify all files are committed
3. Rebase on latest `main` branch

---

### Issue: PR Review Taking Too Long

**What to Do**:
- Be patient (maintainers are volunteers)
- Check PR for merge conflicts
- Ping maintainers politely after 1 week

---

## Community Guidelines

**Be Respectful**:
- Constructive criticism only
- No personal attacks
- Help newcomers

**Communicate Clearly**:
- Explain reasoning for changes
- Ask questions if unsure
- Provide context in PRs

**Attribution**:
- Give credit where due
- Reference original authors if adapting code
- Follow licensing terms

---

## Reporting Issues

**When Reporting Bugs**:

1. **Check Existing Issues**: Avoid duplicates
2. **Provide Details**:
   - Screeps version
   - Code version (commit hash)
   - Steps to reproduce
   - Expected vs. actual behavior
   - Console errors
   - Screenshots (if applicable)

**Example Issue**:
```markdown
## Bug: Factories not producing batteries

**Version**: azc-screeps main branch (commit abc1234)
**Screeps**: Private server v5.0.0

**Steps to Reproduce**:
1. Set production target: `factories.set_production("battery", 1000, 30)`
2. Wait 100 ticks
3. Run `factory_status()`

**Expected**: Factory assigned to battery production
**Actual**: Factory shows "No assignment"

**Console Errors**: None
**Screenshot**: [link]

**Additional Context**: RCL 7 room with 1 factory, plenty of energy in storage.
```

---

## Updating Documentation

**When to Update Docs**:
- Adding new console commands
- Changing existing commands
- New features affecting players
- Fixing errors or typos

**How to Update**:

1. **Edit `/docs` Files**: Make changes to relevant markdown files
2. **Test Links**: Ensure all internal links work
3. **Preview**: Render markdown to check formatting
4. **Submit PR**: Include docs changes with code changes (or separately)

**Docs Sync**: Changes to `/docs` automatically sync to GitHub Wiki via GitHub Actions (on push to `main`).

---

## Getting Help

**Where to Ask**:
- **GitHub Issues**: Bug reports, feature requests
- **Screeps Slack**: General help, discussions
- **Screeps Discord**: Real-time chat
- **Screeps Forums**: Long-form discussions

**Before Asking**:
- Check existing docs
- Search issues/forums
- Try debugging first
- Provide context when asking

---

## Project Structure Reminder

```
azc-screeps/
├── main.js                          # Entry point
├── overloads_*.js                   # Prototype extensions
├── definitions_*.js                 # Global objects/systems
├── base_layouts/                    # Base layout files
│   ├── base_layouts.xlsx
│   └── *.csv
├── docs/                            # Player-facing documentation
│   ├── index.md
│   ├── getting-started.md
│   ├── driving-the-bot.md
│   └── ...
└── .github/
    └── workflows/
        └── sync-wiki.yml            # Auto-sync docs to wiki
```

---

## Thank You!

**Your contributions make azc-screeps better for everyone!** 🎉

Whether you're fixing a typo, adding a feature, or improving docs, every contribution is valued.

**Happy Screeping!** 🚀

---

## Next Steps

- **Understand Codebase**: Read [Getting Started](getting-started.md) and [Configuration](configuration.md)
- **Find Issues**: Check [GitHub Issues](https://github.com/azcoigreach/azc-screeps/issues)
- **Join Community**: Screeps Slack/Discord for discussions

---

**Questions?** Open an issue on GitHub or ask in the Screeps community!

