/**
 * Regression diff via a committed baseline manifest.
 *
 * Generated .xml.dart files are often gitignored, so instead of comparing
 * against committed files we hash the generated content into a manifest
 * (.fxml-gen-manifest.json) that IS committed. Running this tool after a
 * generator upgrade reports every file whose generated output semantically
 * changed.
 *
 * Usage:
 *   node .tools-out/tools/diff-generations.js <projectRoot>            # compare
 *   node .tools-out/tools/diff-generations.js <projectRoot> --write    # write changed files
 *   node .tools-out/tools/diff-generations.js <projectRoot> --update   # accept new baseline
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import { findXmlFiles, loadConfig, XmlLayoutGenerator } from '../src/core/generate';

const rootDir = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const writeChanged = process.argv.includes('--write');
const updateBaseline = process.argv.includes('--update');

const manifestPath = path.join(rootDir, '.fxml-gen-manifest.json');
const normalize = (s: string) => s.replace(/\s+/g, '');
const hashOf = (s: string) => crypto.createHash('sha256').update(normalize(s)).digest('hex');

const generator = new XmlLayoutGenerator(rootDir, loadConfig(rootDir));
const xmlFiles = findXmlFiles(path.join(rootDir, 'lib'));

interface Manifest {
    version: number;
    files: { [rel: string]: string };
}

let manifest: Manifest = { version: 1, files: {} };
if (fs.existsSync(manifestPath)) {
    try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Manifest;
    } catch (e) {
        console.error(`WARN failed to parse ${manifestPath}: ${(e as Error).message}`);
    }
}

const newManifest: Manifest = { version: 1, files: {} };
let unchanged = 0;
let changed = 0;
let added = 0;
let errors = 0;

for (const xmlFile of xmlFiles) {
    const rel = path.relative(rootDir, xmlFile);
    try {
        const content = generator.generateXmlFileContent(xmlFile);
        newManifest.files[rel] = hashOf(content);
        const prev = manifest.files[rel];
        if (prev === undefined) {
            added++;
            console.log(`NEW     ${rel}`);
            if (writeChanged) {
                fs.writeFileSync(xmlFile + '.dart', content);
            }
            continue;
        }
        if (prev === newManifest.files[rel]) {
            unchanged++;
            console.log(`SAME    ${rel}`);
            continue;
        }
        changed++;
        const classMatch = /class \w+ extends (Stateful|Stateless)Widget/.exec(content);
        const streamCount = (content.match(/StreamBuilder\(/g) || []).length;
        const guardCount = (content.match(/if \(\w+Value == null\)/g) || []).length;
        console.log(`CHANGED ${rel}`);
        console.log(`  widget: ${classMatch ? classMatch[0] : '?'} | StreamBuilders: ${streamCount} | null guards: ${guardCount}`);
        if (writeChanged) {
            fs.writeFileSync(xmlFile + '.dart', content);
        }
    } catch (e) {
        errors++;
        console.log(`ERROR   ${rel}: ${(e as Error).message}`);
    }
}

const removed = Object.keys(manifest.files).filter(rel => !newManifest.files[rel]);
for (const rel of removed) {
    console.log(`REMOVED ${rel}`);
}

if (updateBaseline) {
    fs.writeFileSync(manifestPath, JSON.stringify(newManifest, null, 2) + '\n');
    console.log(`\nBaseline updated: ${manifestPath} (${Object.keys(newManifest.files).length} files)`);
} else {
    console.log(
        `\nSummary: ${unchanged} unchanged, ${changed} changed, ${added} new, ${removed.length} removed, ${errors} errors`,
    );
    if (changed + added + removed.length > 0) {
        console.log('Review the changes, then run with --write to regenerate and --update to accept the new baseline.');
    }
}

process.exitCode = errors > 0 ? 1 : 0;
