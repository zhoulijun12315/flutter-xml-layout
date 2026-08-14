/**
 * MCP (Model Context Protocol) server for the XML Layout generator.
 *
 * Exposes the headless generator as MCP tools so AI agents can generate
 * `.xml.dart` / `.ctrl.dart` files directly. Speaks the standard MCP
 * JSON-RPC 2.0 protocol over stdio (no external dependencies).
 *
 * Tools:
 *   generate_xml_layout(rootDir, configPath?, format?)
 *   list_xml_layout_files(rootDir)
 *
 * Run after building:
 *   node .tools-out/src/mcp/server.js
 */
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

import { findXmlFiles, runGenerate } from '../core/generate';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'xml-layout-mcp';
const SERVER_VERSION = '0.1.0';

interface McpTool {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: { [key: string]: unknown };
        required?: string[];
    };
}

const tools: McpTool[] = [
    {
        name: 'generate_xml_layout',
        description:
            'Generate .xml.dart and .ctrl.dart files from XML layout files in a ' +
            'Flutter project, plus i18n files from lib/i18n/*.json. Reuses the ' +
            'same generator core as the VS Code extension. .ctrl.dart files are ' +
            'only created when they do not exist yet (user code is never ' +
            'overwritten). Returns a JSON summary of generated files and errors.',
        inputSchema: {
            type: 'object',
            properties: {
                rootDir: {
                    type: 'string',
                    description: 'Absolute path to the Flutter project root',
                },
                configPath: {
                    type: 'string',
                    description: 'Optional path to fxmllayout.json (defaults to <rootDir>/fxmllayout.json)',
                },
                format: {
                    type: 'boolean',
                    description: 'Run `dart format` on generated files (requires dart on PATH)',
                },
            },
            required: ['rootDir'],
        },
    },
    {
        name: 'list_xml_layout_files',
        description:
            'List all .xml layout files under lib/ in a Flutter project, so the ' +
            'caller knows which files generate_xml_layout will process.',
        inputSchema: {
            type: 'object',
            properties: {
                rootDir: {
                    type: 'string',
                    description: 'Absolute path to the Flutter project root',
                },
            },
            required: ['rootDir'],
        },
    },
];

function send(message: unknown): void {
    process.stdout.write(JSON.stringify(message) + '\n');
}

function rpcError(id: unknown, code: number, message: string): void {
    send({ jsonrpc: '2.0', id, error: { code, message } });
}

function callGenerate(args: Record<string, unknown>, id: unknown): void {
    const rootDir = typeof args.rootDir === 'string' ? path.resolve(args.rootDir) : '';
    if (!rootDir || !fs.existsSync(rootDir)) {
        rpcError(id, -32602, `rootDir does not exist: ${rootDir || '(missing)'}`);
        return;
    }
    const configPath = typeof args.configPath === 'string' ? args.configPath : undefined;
    const format = args.format === true;
    const result = runGenerate({ rootDir, configPath, format });
    send({
        jsonrpc: '2.0',
        id,
        result: {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            isError: !result.ok,
        },
    });
}

function callListFiles(args: Record<string, unknown>, id: unknown): void {
    const rootDir = typeof args.rootDir === 'string' ? path.resolve(args.rootDir) : '';
    if (!rootDir || !fs.existsSync(rootDir)) {
        rpcError(id, -32602, `rootDir does not exist: ${rootDir || '(missing)'}`);
        return;
    }
    const files = findXmlFiles(path.join(rootDir, 'lib'));
    send({
        jsonrpc: '2.0',
        id,
        result: {
            content: [{ type: 'text', text: JSON.stringify(files, null, 2) }],
            isError: false,
        },
    });
}

function handleRequest(req: { id?: unknown; method: string; params?: Record<string, unknown> }): void {
    switch (req.method) {
        case 'initialize':
            send({
                jsonrpc: '2.0',
                id: req.id,
                result: {
                    protocolVersion: PROTOCOL_VERSION,
                    capabilities: { tools: {} },
                    serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
                },
            });
            return;
        case 'notifications/initialized':
            return;
        case 'ping':
            send({ jsonrpc: '2.0', id: req.id, result: {} });
            return;
        case 'tools/list':
            send({ jsonrpc: '2.0', id: req.id, result: { tools } });
            return;
        case 'tools/call': {
            const params = req.params || {};
            const name = params.name as string;
            const args = (params.arguments as Record<string, unknown>) || {};
            if (name === 'generate_xml_layout') {
                callGenerate(args, req.id);
                return;
            }
            if (name === 'list_xml_layout_files') {
                callListFiles(args, req.id);
                return;
            }
            rpcError(req.id, -32601, `Unknown tool: ${name}`);
            return;
        }
        default:
            rpcError(req.id, -32601, `Method not found: ${req.method}`);
    }
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
        return;
    }
    try {
        const req = JSON.parse(trimmed) as { id?: unknown; method: string; params?: Record<string, unknown> };
        handleRequest(req);
    } catch (e) {
        rpcError(null, -32700, `Invalid JSON: ${(e as Error).message}`);
    }
});

process.stderr.write(`${SERVER_NAME} v${SERVER_VERSION} ready (stdio)\n`);
