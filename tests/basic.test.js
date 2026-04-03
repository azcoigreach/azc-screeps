// tests/basic.test.js
// ---------------------------------------------------------------
// Basic smoke-test suite for azc-screeps v0.2.0
//
// Test groups:
//   1. Syntax – every *.js file in the repo root passes `node --check`
//   2. Smoke   – the bot runs at least one tick via screeps-server-mockup
//                without throwing a fatal error
//
// Run all tests:       npm test
// Run syntax only:     npm run test:syntax
// ---------------------------------------------------------------
'use strict';

const assert       = require('assert');
const path         = require('path');
const fs           = require('fs');
const { execSync } = require('child_process');
const { loadModules, REPO_ROOT } = require('./helpers/loader');

// ================================================================
// 1. SYNTAX CHECKS
// ================================================================
describe('syntax', function () {
    const jsFiles = fs.readdirSync(REPO_ROOT)
        .filter(f => f.endsWith('.js') && !f.startsWith('.'))
        .sort();

    jsFiles.forEach(file => {
        it(`${file} — valid JavaScript syntax`, function () {
            try {
                execSync(
                    `node --check "${path.join(REPO_ROOT, file)}"`,
                    { stdio: 'pipe' }
                );
            } catch (err) {
                const stderr = err.stderr ? err.stderr.toString().trim() : String(err);
                assert.fail(`Syntax error in ${file}:\n${stderr}`);
            }
        });
    });
});

// ================================================================
// 2. SMOKE TEST (screeps-server-mockup)
//
// Requires the `screeps` npm package (included transitively via
// screeps-server-mockup).  The test starts a private server, loads
// the bot code, runs a small number of ticks, and asserts that no
// fatal runtime error was thrown.
//
// Skipped automatically when the `screeps` package is unavailable
// so that CI syntax-only runs still pass.
// ================================================================
describe('smoke', function () {
    this.timeout(120000); // mockup server startup can take ~30 s

    let ScreepsServer;
    let serverAvailable = false;

    before(function () {
        try {
            ({ ScreepsServer } = require('screeps-server-mockup'));
            serverAvailable = true;
        } catch (_) {
            this.skip();
        }
    });

    it('bot runs 5 ticks without a fatal error', async function () {
        if (!serverAvailable) this.skip();

        const server = new ScreepsServer();
        const errors = [];

        try {
            await server.start();

            // Provide a basic world so there is something to spawn in
            await server.world.stubWorld();

            const modules = loadModules();

            // Add a bot user with our full module set
            const bot = await server.world.addBot({
                username : 'AzcTestBot',
                room     : 'W5N5',
                x        : 25,
                y        : 25,
                gcl      : 1,
                modules,
            });

            // Run 5 ticks and collect any console errors.
            // The Screeps engine prefixes fatal-level console output with
            // "[ERROR]" (case-insensitive), so we scan for that prefix.
            // See: https://docs.screeps.com/api/#Game.notify
            for (let tick = 1; tick <= 5; tick++) {
                await server.tick();
                const logs = await bot.logs;
                logs
                    .filter(line => /^\[ERROR\]/i.test(line))
                    .forEach(line => errors.push(`tick ${tick}: ${line}`));
            }
        } finally {
            await server.stop();
        }

        assert.strictEqual(
            errors.length,
            0,
            `Bot produced ERROR-level console output:\n${errors.join('\n')}`
        );
    });
});
