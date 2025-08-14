'use strict';

/* ***********************************************************
 * Flag Controller
 * -----------------------------------------------------------
 * Processes in-game flags and dispatches actions based on a
 * two-colour scheme.
 *
 * Primary colour (flag.color) selects the command group.
 * Secondary colour (flag.secondaryColor) selects the action
 * within that group.
 *
 * two-color scheme.
 *
 * Primary color (flag.color) selects the command group.
 * Secondary color (flag.secondaryColor) selects the action
 * within that group.
 *
 * Color scheme:
 * - COLOR_BLUE   : Expansion commands
 *     - COLOR_BROWN : Colonize room (place spawn)
 *     - COLOR_CYAN  : Reserve remote room (not implemented)
 *     - COLOR_GREY  : Abandon colony     (not implemented)
 * - COLOR_RED    : Combat commands      (not implemented)
 * - COLOR_YELLOW : Economic/utility     (not implemented)
 *
 * Flags are expected to be placed in the target room. The flag
 * name is not parsed; additional parameters may be added in the
 * future.
 * *********************************************************** */

global.FlagController = {
        /**
         * Entry point executed each tick.
         */
        run: function () {
                _.forEach(Game.flags, flag => {
                        switch (flag.color) {
                                case COLOR_BLUE:
                                        this.handleExpansion(flag);
                                        break;
                                // other groups may be added later
                        }
                });
        },

        /**
         * Handle expansion group flags.
         * @param {Flag} flag
         */
        handleExpansion: function (flag) {
                switch (flag.secondaryColor) {
                        case COLOR_BROWN:
                                this.colonize(flag);
                                break;
                        // Additional expansion commands can be added here
                }
        },

        /**
         * Colonize the room where the flag resides. Chooses between
         * default horizontal or vertical walled blueprints based on
         * local terrain and sets up a colonization site.
         * @param {Flag} flag
         */
        colonize: function (flag) {
                let target = flag.pos.roomName;

                // Find closest owned room to serve as the origin colony
                let colonies = _.filter(Game.rooms, r => _.get(r, ["controller", "my"]) && _.get(r, ["controller", "level"], 0) >= 3);
                let from = _.min(colonies, r => Game.map.getRoomLinearDistance(r.name, target));
                if (from === Infinity) from = null; else from = from.name;

                let origin = { x: flag.pos.x, y: flag.pos.y };
                let layoutName = this.chooseLayout(flag.pos);

                // Compute route from origin to target
                let list_route = null;
                if (from != null) {
                        let route = Game.map.findRoute(from, target);
                        if (!_.isError(route)) list_route = _.map(route, 'room');
                }

                _.set(Memory, ["sites", "colonization", target], {
                        from: from,
                        target: target,
                        layout: { origin: origin, name: layoutName },
                        focus_defense: false,
                        list_route: list_route
                });

                flag.remove();
        },

        /**
         * Choose a walled default layout based on terrain around the
         * desired spawn position.
         * @param {RoomPosition} pos
         * @returns {string} layout name
         */
        chooseLayout: function (pos) {
                let terrain = new Room.Terrain(pos.roomName);
                let horizontal = 0;
                let vertical = 0;

                for (let d = -5; d <= 5; d++) {
                        if (terrain.get(pos.x + d, pos.y) != TERRAIN_MASK_WALL) horizontal++;
                        if (terrain.get(pos.x, pos.y + d) != TERRAIN_MASK_WALL) vertical++;
                }

                return (horizontal >= vertical) ? "def_hor_w" : "def_vert_w";
        }
};

