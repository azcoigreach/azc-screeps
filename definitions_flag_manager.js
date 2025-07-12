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
        // Scan all flags in the game
        for (let flagName in Game.flags) {
            let flag = Game.flags[flagName];
            // Colonize directive (primary blue)
            if (flag.color === PRIMARY_COLONIZE) {
                this.handleColonizeFlag(flag);
            }
            // Remote mining directive (primary orange)
            else if (flag.color === PRIMARY_REMOTE) {
                this.handleRemoteMiningFlag(flag);
            }
        }
    },

    handleColonizeFlag: function(flag) {
        // Use secondary color to select blueprint
        let blueprint = BLUEPRINT_MAP[flag.secondaryColor] || 'Default_Horizontal';
        // Use flag position as spawn location
        if (!Memory.flags[flag.name]) {
            Memory.flags[flag.name] = {
                directive: 'colonize',
                targetRoom: flag.pos.roomName,
                spawnPos: {x: flag.pos.x, y: flag.pos.y, roomName: flag.pos.roomName},
                blueprint: blueprint,
                status: 'pending',
                createdAt: Game.time
            };
            console.log(`[FlagManager] Colonize flag detected: ${flag.name} at ${flag.pos.roomName} (${flag.pos.x},${flag.pos.y}) with blueprint '${blueprint}'`);
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