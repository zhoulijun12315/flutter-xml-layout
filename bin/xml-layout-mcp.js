#!/usr/bin/env node
// XML Layout for Flutter — MCP server entry.
// Installed as `xml-layout-mcp` via `npm link` or `npm i -g .`.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const server = path.join(root, '.tools-out', 'src', 'mcp', 'server.js');
const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');

if (!fs.existsSync(server)) {
    console.error('First run: compiling the MCP server...');
    const result = spawnSync(process.execPath, [tsc, '-p', path.join(root, 'tools', 'tsconfig.build.json')], {
        stdio: 'inherit',
    });
    if (result.status !== 0) {
        process.exit(result.status || 1);
    }
}

require(server);
