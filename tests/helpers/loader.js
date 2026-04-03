// helpers/loader.js
// Builds the `modules` object expected by screeps-server-mockup.
// Reads every *.js file from the repo root and keys them by module
// name (filename without the .js extension).

'use strict';

const fs   = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');

/**
 * Returns an object whose keys are Screeps module names and values
 * are the corresponding source strings.
 *
 * @param {string[]} [exclude]  Module names to skip (default: none)
 * @returns {{ [moduleName: string]: string }}
 */
function loadModules(exclude) {
    const skip = new Set(exclude || []);

    return fs.readdirSync(REPO_ROOT)
        .filter(file => file.endsWith('.js') && !file.startsWith('.'))
        .reduce((acc, file) => {
            const moduleName = path.basename(file, '.js');
            if (!skip.has(moduleName)) {
                acc[moduleName] = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
            }
            return acc;
        }, {});
}

module.exports = { loadModules, REPO_ROOT };
