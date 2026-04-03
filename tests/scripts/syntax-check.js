#!/usr/bin/env node
// tests/scripts/syntax-check.js
// Syntax-checks every *.js file in the repo root using `node --check`.
// Exits 0 on success, 1 on any failure.
// No npm dependencies required – runs on plain Node.js.
'use strict';

const { execSync }  = require('child_process');
const fs            = require('fs');
const path          = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const jsFiles   = fs.readdirSync(REPO_ROOT)
    .filter(f => f.endsWith('.js') && !f.startsWith('.'))
    .sort();

let passed  = 0;
let failed  = 0;
const failures = [];

for (const file of jsFiles) {
    const filePath = path.join(REPO_ROOT, file);
    try {
        execSync(`node --check "${filePath}"`, { stdio: 'pipe' });
        console.log(`  ✅  ${file}`);
        passed++;
    } catch (err) {
        const stderr = err.stderr ? err.stderr.toString().trim() : String(err);
        console.error(`  ❌  ${file}\n     ${stderr.replace(/\n/g, '\n     ')}`);
        failures.push({ file, stderr });
        failed++;
    }
}

console.log(`\nSyntax check: ${passed} passed, ${failed} failed.`);

if (failed > 0) {
    console.error('\nFailed files:');
    failures.forEach(({ file, stderr }) => console.error(`  • ${file}: ${stderr.split('\n')[0]}`));
    process.exit(1);
}
