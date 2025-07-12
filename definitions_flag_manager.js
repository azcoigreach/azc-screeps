/* ***********************************************************
 *  [secXXa] DEFINITIONS: FLAG MANAGER
 * *********************************************************** */

// Color constants (Screeps uses numbers for colors)
const COLOR_RED = 1;
const COLOR_PURPLE = 2;
const COLOR_BLUE = 3;
const COLOR_CYAN = 4;
const COLOR_GREEN = 5;
const COLOR_YELLOW = 6;
const COLOR_ORANGE = 7;
const COLOR_BROWN = 8;
const COLOR_GREY = 9;
const COLOR_WHITE = 10;

// Primary color codes for directives
const PRIMARY_COLONIZE = COLOR_BLUE;
const PRIMARY_REMOTE = COLOR_ORANGE;

// Blueprint mapping for secondary color (must match definitions_blueprint_layouts.js)
const BLUEPRINT_MAP = {
    [COLOR_WHITE]: 'Default_Horizontal',      // White: Default horizontal layout
    [COLOR_GREY]: 'Default_Vertical',        // Grey: Default vertical layout
    [COLOR_RED]: 'Compact_Horizontal',       // Red: Compact horizontal layout
    [COLOR_PURPLE]: 'Compact_Vertical',      // Purple: Compact vertical layout
    [COLOR_BROWN]: 'Default_Horizontal__Walled', // Brown: Default horizontal walled
    [COLOR_CYAN]: 'Default_Vertical__Walled',    // Cyan: Default vertical walled
    [COLOR_YELLOW]: 'Compact_Horizontal__Walled',// Yellow: Compact horizontal walled
    [COLOR_GREEN]: 'Compact_Vertical__Walled',   // Green: Compact vertical walled
    // Add more as needed, must match layout names in definitions_blueprint_layouts.js
};

// Main FlagManager object
global.FlagManager = {
    run: function() {
        if (!isPulse_Short()) return;
        this.detectColorFlags();
    },

    detectColorFlags: function() {
        if (!Memory.flags) Memory.flags = {};
        // Track all current flag names
        let currentFlagNames = Object.keys(Game.flags);
        // --- Cleanup memory for deleted flags ---
        for (let flagName in Memory.flags) {
            if (!Game.flags[flagName]) {
                let targetRoom = Memory.flags[flagName].targetRoom;
                // Remove layout from room memory if it matches
                if (targetRoom && Memory.rooms[targetRoom] && Memory.rooms[targetRoom].layout && Memory.rooms[targetRoom].layout.name === Memory.flags[flagName].layoutName) {
                    delete Memory.rooms[targetRoom].layout;
                    console.log(`[FlagManager] Removed layout from room memory: ${targetRoom}`);
                }
                delete Memory.flags[flagName];
                console.log(`[FlagManager] Cleaned up memory for deleted flag: ${flagName}`);
            }
        }
        // --- Process all current flags ---
        for (let flagName in Game.flags) {
            let flag = Game.flags[flagName];
            // Colonize directive (primary blue)
            if (flag.color === PRIMARY_COLONIZE) {
                this.handleColonizeFlag(flag, true); // true = allow update
            }
            // Remote mining directive (primary orange)
            else if (flag.color === PRIMARY_REMOTE) {
                this.handleRemoteMiningFlag(flag);
            }
        }
    },

    // Enhanced: allow update if flag already exists
    handleColonizeFlag: function(flag, allowUpdate = false) {
        // Map secondary color to internal layout name
        const LAYOUT_MAP = {
            [COLOR_WHITE]: 'def_hor',                // Default_Horizontal
            [COLOR_GREY]: 'def_vert',                // Default_Vertical
            [COLOR_RED]: 'comp_hor',                 // Compact_Horizontal
            [COLOR_PURPLE]: 'comp_vert',             // Compact_Vertical
            [COLOR_BROWN]: 'def_hor_w',              // Default_Horizontal__Walled
            [COLOR_CYAN]: 'def_vert_w',              // Default_Vertical__Walled
            [COLOR_YELLOW]: 'comp_hor_w',            // Compact_Horizontal__Walled
            [COLOR_GREEN]: 'comp_vert_w'             // Compact_Vertical__Walled
        };
        let layoutName = LAYOUT_MAP[flag.secondaryColor] || 'def_hor';
        let needsUpdate = false;
        if (!Memory.flags[flag.name]) {
            needsUpdate = true;
        } else {
            let mem = Memory.flags[flag.name];
            if (mem.layoutName !== layoutName || mem.directive !== 'colonize') {
                needsUpdate = true;
            }
        }
        if (needsUpdate || allowUpdate) {
            Memory.flags[flag.name] = {
                directive: 'colonize',
                targetRoom: flag.pos.roomName,
                spawnPos: {x: flag.pos.x, y: flag.pos.y, roomName: flag.pos.roomName},
                layoutName: layoutName,
                status: 'pending',
                createdAt: Game.time
            };
            if (!Memory.rooms[flag.pos.roomName]) {
                Memory.rooms[flag.pos.roomName] = {};
            }
            // Set layout in room memory
            Memory.rooms[flag.pos.roomName].layout = {
                origin: { x: flag.pos.x, y: flag.pos.y },
                name: layoutName
            };
            // Remove old blueprint property if present
            if (Memory.rooms[flag.pos.roomName].blueprint) {
                delete Memory.rooms[flag.pos.roomName].blueprint;
            }
            console.log(`[FlagManager] Set layout in room memory: ${flag.pos.roomName} -> { origin: (${flag.pos.x},${flag.pos.y}), name: ${layoutName} }`);
            console.log(`[FlagManager] Colonize flag processed: ${flag.name} at ${flag.pos.roomName} (${flag.pos.x},${flag.pos.y}) with layout '${layoutName}'`);
        }
    },

    handleRemoteMiningFlag: function(flag) {
        // For now, secondary color is unused
        if (!Memory.flags[flag.name]) {
            Memory.flags[flag.name] = {
                directive: 'remote',
                targetRoom: flag.pos.roomName,
                status: 'pending',
                createdAt: Game.time
            };
            console.log(`[FlagManager] Remote mining flag detected: ${flag.name} in ${flag.pos.roomName}`);
        }
    }
}; 