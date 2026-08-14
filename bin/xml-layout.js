#!/usr/bin/env node
// XML Layout for Flutter — CLI entry.
// Installed as `fxml` (and `xml-layout`) via `npm link` or `npm i -g .`.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const cli = path.join(root, '.tools-out', 'tools', 'generate.js');
const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');

if (!fs.existsSync(cli)) {
    console.error('First run: compiling the generator...');
    const result = spawnSync(process.execPath, [tsc, '-p', path.join(root, 'tools', 'tsconfig.build.json')], {
        stdio: 'inherit',
    });
    if (result.status !== 0) {
        process.exit(result.status || 1);
    }
}

require(cli);
