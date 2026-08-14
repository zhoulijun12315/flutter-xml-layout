/**
 * Headless XML → Dart generator CLI.
 *
 * Reuses the exact same core as the VS Code extension (see src/core/generate.ts),
 * so AI agents and CI can generate `.xml.dart` / `.ctrl.dart` files without
 * opening VS Code.
 *
 * Usage:
 *   node .tools-out/tools/generate.js generate [rootDir] [options]
 *   node .tools-out/tools/generate.js watch    [rootDir] [options]
 *   node .tools-out/tools/generate.js [rootDir]          (shorthand for generate)
 *
 * Options:
 *   --config <path>   path to fxmllayout.json (defaults to <rootDir>/fxmllayout.json)
 *   --format          run `dart format` on generated files (requires dart on PATH)
 *   --json            print machine-readable JSON instead of human output
 *
 * Exit codes: 0 = success, 1 = one or more files failed, 2 = usage error.
 */
import * as fs from 'fs';
import * as path from 'path';

import { GenResult, runGenerate } from '../src/core/generate';

interface Options {
    rootDir: string;
    configPath?: string;
    file?: string;
    format: boolean;
    json: boolean;
}

function usage(): string {
    return [
        'XML Layout for Flutter — headless generator',
        '',
        'Usage:',
        '  fxml generate [rootDir] [options]',
        '  fxml watch    [rootDir] [options]',
        '  fxml [rootDir]                     (shorthand for generate)',
        '',
        'Options:',
        '  --config <path>  path to fxmllayout.json',
        '  --file <path>    generate a single XML file instead of all files',
        '  --format         run `dart format` on generated files',
        '  --json           machine-readable JSON output',
        '',
    ].join('\n');
}

function parseArgs(argv: string[]): { command: 'generate' | 'watch'; options: Options } {
    let command: 'generate' | 'watch' = 'generate';
    const positional: string[] = [];
    const options: Options = { rootDir: process.cwd(), format: false, json: false };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if ((arg === 'generate' || arg === 'watch') && i === 0) {
            command = arg;
            continue;
        }
        if (arg === '--config') {
            options.configPath = argv[++i];
            if (!options.configPath) {
                throw new Error('--config requires a path');
            }
            continue;
        }
        if (arg === '--file') {
            options.file = argv[++i];
            if (!options.file) {
                throw new Error('--file requires a path');
            }
            continue;
        }
        if (arg === '--format') {
            options.format = true;
            continue;
        }
        if (arg === '--json') {
            options.json = true;
            continue;
        }
        if (arg === '--help' || arg === '-h') {
            throw new UsageError();
        }
        if (arg.startsWith('-')) {
            throw new Error(`Unknown option: ${arg}`);
        }
        positional.push(arg);
    }

    if (positional.length > 1) {
        throw new Error(`Too many arguments: ${positional.join(' ')}`);
    }
    if (positional.length === 1) {
        options.rootDir = path.resolve(positional[0]);
    } else {
        options.rootDir = process.cwd();
    }
    return { command, options };
}

class UsageError extends Error {}

function printResult(result: GenResult, options: Options): void {
    if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    for (const g of result.generated) {
        console.log(`generated ${g.file}${g.controller ? ' (+ controller)' : ''}${g.unchanged ? ' (unchanged)' : ''}`);
    }
    for (const f of result.i18n) {
        console.log(`generated ${f}`);
    }
    for (const w of result.warnings) {
        console.warn(`WARN ${w}`);
    }
    if (result.errors.length) {
        for (const e of result.errors) {
            const loc = e.line !== undefined && e.column !== undefined ? `:${e.line}:${e.column}` : '';
            console.error(`ERROR ${e.file}${loc}: ${e.message}`);
        }
    }
    if (result.ok) {
        console.log(`OK — ${result.generated.length} xml file(s), ${result.i18n.length} i18n file(s)`);
    } else {
        console.error(`FAILED — ${result.errors.length} error(s)`);
    }
}

function watch(options: Options): void {
    let timer: NodeJS.Timeout | null = null;
    let pending = false;
    const debounced = (fn: () => void) => {
        if (timer) {
            clearTimeout(timer);
        }
        timer = setTimeout(() => {
            pending = false;
            fn();
        }, 150);
    };

    const regenerateAll = () => {
        const result = runGenerate({
            rootDir: options.rootDir,
            configPath: options.configPath,
            file: options.file,
            format: options.format,
        });
        printResult(result, options);
        if (!result.ok) {
            process.exitCode = 1;
        }
    };

    regenerateAll();
    console.log(`Watching ${options.rootDir} for changes... (Ctrl+C to stop)`);

    try {
        const watcher = fs.watch(options.rootDir, { recursive: true }, (_event, filename) => {
            if (!filename) {
                return;
            }
            const name = filename.toString();
            if (name.endsWith('.xml') || name.endsWith('.json') || name === 'fxmllayout.json') {
                if (pending) {
                    return;
                }
                pending = true;
                console.log(`change detected: ${name}`);
                debounced(regenerateAll);
            }
        });
        watcher.on('error', (e) => {
            console.error(`watcher error: ${(e as Error).message}`);
        });
    } catch (e) {
        console.error(`Failed to start watcher: ${(e as Error).message}`);
        process.exitCode = 2;
    }
}

function main(): void {
    let parsed: { command: 'generate' | 'watch'; options: Options };
    try {
        parsed = parseArgs(process.argv.slice(2));
    } catch (e) {
        if (e instanceof UsageError) {
            console.log(usage());
            return;
        }
        console.error(`Error: ${(e as Error).message}`);
        console.error(usage());
        process.exitCode = 2;
        return;
    }

    if (parsed.command === 'watch') {
        if (!fs.existsSync(parsed.options.rootDir)) {
            console.error(`Error: root directory does not exist: ${parsed.options.rootDir}`);
            process.exitCode = 2;
            return;
        }
        watch(parsed.options);
        return;
    }

    if (!fs.existsSync(parsed.options.rootDir)) {
        console.error(`Error: root directory does not exist: ${parsed.options.rootDir}`);
        process.exitCode = 2;
        return;
    }

    const result = runGenerate({
        rootDir: parsed.options.rootDir,
        configPath: parsed.options.configPath,
        file: parsed.options.file,
        format: parsed.options.format,
    });
    printResult(result, parsed.options);
    if (!result.ok) {
        process.exitCode = 1;
    }
}

main();
