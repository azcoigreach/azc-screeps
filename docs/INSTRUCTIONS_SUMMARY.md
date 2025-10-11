# AI Assistant Instructions Summary

This document provides an overview of the AI assistant instruction files created for the AZC Screeps Bot project.

## Created Files

### 1. `.cursorrules` - Cursor AI Instructions
**Location**: `/home/azcoigreach/repos/azc-screeps/.cursorrules`

**Purpose**: Comprehensive instructions for Cursor AI assistant when working on this Screeps bot codebase.

**Key Sections**:
- Project overview and architecture
- Detailed file structure (overloads vs definitions)
- Coding conventions and patterns
- **MCP Integration for Screeps** (including multi-file upload)
- Console command system
- Performance optimization guidelines
- Common development tasks
- Testing checklist

**Highlights**:
- Documents where to put different types of code (overloads for prototypes, definitions for systems)
- Complete MCP tool reference with examples
- Emphasis on uploading entire directory for multi-file support
- Memory access patterns using `_.get()`
- Task system patterns
- CPU management strategies

---

### 2. `.github/copilot-instructions.md` - GitHub Copilot Instructions
**Location**: `/home/azcoigreach/repos/azc-screeps/.github/copilot-instructions.md`

**Purpose**: Instructions for GitHub Copilot when providing code suggestions and completions.

**Key Sections**:
- Project context and architecture
- Code placement guidelines
- Coding patterns (memory, tasks, CPU, globals)
- **Screeps MCP integration** (upload, console, memory, debugging)
- Console command system
- Development workflow
- Common development tasks
- Performance optimization
- Testing checklist

**Highlights**:
- Quick reference format for common operations
- Code examples for each pattern
- MCP workflow examples
- Memory structure reference
- Error handling patterns
- Documentation standards

---

### 3. `DEVELOPMENT.md` - Developer Guide
**Location**: `/home/azcoigreach/repos/azc-screeps/DEVELOPMENT.md`

**Purpose**: Comprehensive developer documentation for maintaining and extending the bot.

**Key Sections**:
- Quick reference to all instruction files
- Project structure overview
- File category reference tables
- **Complete MCP tool reference**
- Coding standards with examples
- Step-by-step guides for adding features
- Testing and debugging procedures
- Performance optimization
- Memory structure reference
- Documentation standards

**Highlights**:
- Complete reference table of all files
- Step-by-step guides for common tasks
- Troubleshooting section with solutions
- Complete MCP tool list with parameters
- Pre/post-upload checklists
- Memory structure diagram
- Contributing guidelines

---

### 4. `INSTRUCTIONS_SUMMARY.md` - This File
**Location**: `/home/azcoigreach/repos/azc-screeps/INSTRUCTIONS_SUMMARY.md`

**Purpose**: Overview of all instruction files and quick navigation guide.

---

## Screeps MCP Integration Coverage

All instruction files include comprehensive documentation of Screeps MCP tools:

### Multi-File Upload Support
✅ **Documented in all files** - Emphasis on uploading entire directory:
```javascript
mcp_screeps_upload_code({
    mainJsPath: "/home/azcoigreach/repos/azc-screeps",  // Directory path
    branch: "default"
});
```

### MCP Tools Covered

#### Code Management
- `mcp_screeps_upload_code` - Upload single file or entire directory

#### Console Operations
- `mcp_screeps_get_console` - Retrieve console logs
- `mcp_screeps_execute_command` - Execute console commands

#### Memory Management
- `mcp_screeps_get_memory` - Get bot memory (full or specific path)
- `mcp_screeps_set_memory` - Set memory values

#### Game Information
- `mcp_screeps_get_room_terrain` - Get terrain data
- `mcp_screeps_get_room_status` - Get room ownership/status
- `mcp_screeps_get_room_objects` - Get structures, creeps, etc.
- `mcp_screeps_get_user_info` - Get user information
- `mcp_screeps_get_game_time` - Get current game tick

#### Debugging & Troubleshooting
- `mcp_screeps_analyze_performance` - Performance analysis
- `mcp_screeps_check_for_errors` - Error checking
- `mcp_screeps_troubleshoot_bot` - Comprehensive health check

### Typical Workflow Examples
All files include complete workflow examples:
1. Upload code (directory)
2. Check console logs
3. Execute test commands
4. Verify functionality
5. Profile performance
6. Debug issues

---

## Code Organization Documentation

All instruction files clearly document where to put different types of code:

### Overloads (`overloads_*.js`)
**Purpose**: Extend Screeps prototypes (Creep, Room, RoomPosition, Lab)

**Pattern**:
```javascript
Creep.prototype.methodName = function() {
    return this.property;
};
```

**When to use**: Adding methods to game objects

### Definitions (`definitions_*.js`)
**Purpose**: Define global systems and logic

**Pattern**:
```javascript
global.SystemName = {
    method: function() {
        // Implementation
    }
};
```

**When to use**: Creating new systems, console commands, game logic

### Main Entry (`main.js`)
**Purpose**: Game loop and module loading

**Structure**:
- Table of contents with section markers
- Module requires in dependency order
- Main game loop

---

## Code Layout Documentation

### Section Markers
All files document the section marker system from `main.js`:
- `[sec01a-g]`: Overloads (General, Creep, Tasks, Travel, Lab, Room, Position)
- `[sec02a-b]`: Populations (Standard, Combat)
- `[sec03a-c]`: Creep (Bodies, Roles, Combat Roles)
- `[sec04a]`: Sites
- `[sec05a]`: Hive Control
- `[sec06a-b]`: Blueprint (System, Layouts)
- `[sec07a]`: Console Commands
- `[sec08a]`: Visual Elements
- `[sec09a]`: CPU Profiling
- `[sec10a]`: Grafana Statistics

### File Organization
Complete tables showing:
- File names
- Section markers
- Purpose/responsibility
- When to add code there

### Module Loading Order
Documentation of dependency order:
1. Overloads (prototypes must exist first)
2. Definitions (systems built on prototypes)
3. Main loop (uses all systems)

---

## Special Features Documented

### Memory Access Patterns
All files emphasize safe memory access:
```javascript
// CORRECT ✓
let value = _.get(Memory, ["rooms", roomName, "field"], defaultValue);

// INCORRECT ✗
let value = Memory.rooms[roomName].field;
```

### Task System
Complete documentation of task creation, retrieval, and execution

### CPU Management
- `hasCPU()` checks
- Pulse system timing
- Profiling tools

### Console Commands
- How they're defined
- How to add them
- How to test them

### Base Layouts
- Excel file structure
- CSV exports
- Coordinate system
- How to add/modify layouts

---

## Quick Reference Card

| Need to... | Check File | Section |
|-----------|-----------|---------|
| Add a creep role | All files | "Adding a New Creep Role" |
| Add a console command | All files | "Adding Console Commands" |
| Add a new system | All files | "Adding a New System" |
| Upload code | All files | "MCP Integration" → "Code Upload" |
| Debug issues | DEVELOPMENT.md | "Testing & Debugging" |
| Optimize performance | All files | "Performance Optimization" |
| Understand file structure | All files | "File Organization" / "Code Architecture" |
| Use MCP tools | All files | "MCP Integration" / "Screeps MCP" |
| Check memory structure | All files | "Memory Structure Reference" |

---

## Usage by AI Assistants

### Cursor AI
- Reads `.cursorrules` automatically
- Reference for all code suggestions
- Guides file placement decisions
- Informs MCP tool usage

### GitHub Copilot
- Reads `.github/copilot-instructions.md` automatically
- Influences code completions
- Provides pattern-aware suggestions
- Guides architecture decisions

### General Reference
- `DEVELOPMENT.md` for comprehensive guide
- `readme.md` for user documentation
- This file for navigation

---

## Maintenance Notes

### Updating Instructions
When the codebase changes:
1. Update all three instruction files consistently
2. Keep MCP tool references synchronized
3. Update code examples to match current patterns
4. Maintain section marker references
5. Update file organization tables

### Adding New Patterns
When introducing new patterns:
1. Document in all instruction files
2. Provide code examples
3. Explain when to use the pattern
4. Add to quick reference sections

### Version Control
All instruction files should be:
- Committed to repository
- Versioned with code changes
- Reviewed during pull requests
- Updated when architecture changes

---

## User Preference Note

**Important**: This user prefers thorough documentation of context in case a new chat session is started.

All instruction files emphasize documenting:
- **What** was changed
- **Where** changes were made (file and section)
- **Why** changes were made
- **How** to test the changes
- **Dependencies** or related systems affected

---

## File Comparison

| Feature | .cursorrules | copilot-instructions.md | DEVELOPMENT.md |
|---------|--------------|-------------------------|----------------|
| MCP Integration | ✅ Complete | ✅ Complete | ✅ Complete + Detailed |
| Code Placement | ✅ Detailed | ✅ Detailed | ✅ With Tables |
| Coding Patterns | ✅ Comprehensive | ✅ Comprehensive | ✅ Comprehensive |
| Step-by-Step Guides | ✅ Basic | ✅ Basic | ✅ Detailed |
| Testing Procedures | ✅ Checklist | ✅ Checklist | ✅ Complete Guide |
| Troubleshooting | ✅ Basic | ✅ Error Handling | ✅ Complete Section |
| Memory Structure | ✅ Overview | ✅ Reference | ✅ Detailed Diagram |
| Quick Reference | ✅ Embedded | ✅ Embedded | ✅ Tables & Card |
| Target Audience | Cursor AI | GitHub Copilot | All Developers |

---

## Success Criteria

These instruction files successfully document:

✅ **Where to put code**: Clear distinction between overloads and definitions
✅ **How code is laid out**: Section markers, file organization, module loading
✅ **MCP integration**: Complete tool reference with multi-file upload
✅ **Multi-file upload**: Emphasis on directory upload method
✅ **Coding patterns**: Memory access, tasks, CPU, globals
✅ **Development workflow**: Upload, test, debug cycle
✅ **Common tasks**: Step-by-step guides for frequent operations
✅ **Testing procedures**: Pre/post-upload checklists
✅ **Performance**: Optimization strategies and profiling
✅ **Documentation standards**: Style guide and examples

---

## Next Steps

For developers using these instructions:
1. Read `.cursorrules` or `copilot-instructions.md` (depending on your AI assistant)
2. Reference `DEVELOPMENT.md` for detailed guides
3. Use MCP tools to upload and test code
4. Follow coding patterns documented in all files
5. Update instructions when making architectural changes

For AI assistants:
1. Load appropriate instruction file automatically
2. Follow coding patterns and conventions
3. Use MCP tools for Screeps interaction
4. Place code in correct files (overloads vs definitions)
5. Document changes thoroughly per user preference

---

**Last Updated**: October 11, 2025
**Repository**: azcoigreach/azc-screeps
**Fork of**: tanjera/screeps

