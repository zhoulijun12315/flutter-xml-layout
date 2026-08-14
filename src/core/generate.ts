import * as fs from 'fs';
import * as path from 'path';

import { registerBuiltInPropertyHandlers, registerBuiltInValueTransformers } from '../builtin-handlers';
import { ClassCodeGenerator } from '../generators/class-generator';
import { LocalizationGenerator } from '../generators/localization-generator';
import { WidgetCodeGenerator } from '../generators/widget-generator';
import { Config, ConfigValueTransformer } from '../models/config';
import { ParseXml } from '../parser/parser';
import { ChildWrapperPropertyHandler } from '../property-handlers/child-wrapper-property';
import { WrapperPropertyHandler } from '../property-handlers/wrapper-property';
import { PropertyHandlerProvider } from '../providers/property-handler-provider';
import { PropertyResolver } from '../resolvers/property-resolver';
import { PipeValueResolver } from '../resolvers/pipe-value-resolver';
import { ValueTransformersProvider } from '../providers/value-transformers-provider';
import { IValueTransformer } from '../providers/value-transformers-provider';
import { WidgetResolver } from '../resolvers/widget-resolver';
import { ColorValueTransformer } from '../value-transformers/color';
import { EdgeInsetsValueTransformer } from '../value-transformers/edge-insets';
import { EnumValueTransformer } from '../value-transformers/enum';
import { spawnSync } from 'child_process';

export interface GenerationOptions {
    rootDir: string;
    configPath?: string;
    format?: boolean;
    file?: string;
}

export interface GeneratedFile {
    file: string;
    controller: boolean;
    unchanged: boolean;
}

export interface GenError {
    file: string;
    message: string;
    line?: number;
    column?: number;
}

export interface GenResult {
    ok: boolean;
    generated: GeneratedFile[];
    i18n: string[];
    errors: GenError[];
    warnings: string[];
}

export function loadConfig(rootDir: string, configPath?: string): Config {
    const resolvedPath = configPath
        ? path.resolve(configPath)
        : path.join(rootDir, 'fxmllayout.json');
    if (fs.existsSync(resolvedPath)) {
        try {
            return JSON.parse(fs.readFileSync(resolvedPath, 'utf8')) as Config;
        } catch (e) {
            throw new Error(`Failed to parse config ${resolvedPath}: ${(e as Error).message}`);
        }
    }
    return {};
}

function createValueTransformer(p: ConfigValueTransformer): IValueTransformer | null {
    switch (p.type) {
        case 'enum':
            if (p.widgetEnumMap) {
                return new EnumValueTransformer(p.enumType || '', p.widgetEnumMap);
            }
            if (p.enumType) {
                return new EnumValueTransformer(p.enumType);
            }
            return null;
        case 'color':
            return new ColorValueTransformer();
        case 'edgeInsets':
            return new EdgeInsetsValueTransformer();
        default:
            return null;
    }
}

function applyConfig(
    config: Config,
    propertyHandlersProvider: PropertyHandlerProvider,
    propertyResolver: PropertyResolver,
    valueTransformersProvider: ValueTransformersProvider,
): void {
    if (config.wrappers) {
        config.wrappers
            .filter(p => p.properties[0] && p.widget)
            .forEach(p => {
                propertyHandlersProvider.register(
                    p.properties.map(a => a.handler),
                    new WrapperPropertyHandler(
                        propertyResolver,
                        p.properties,
                        p.widget,
                        p.defaults,
                        p.priority !== undefined && p.priority !== null ? p.priority : 100,
                    ),
                );
            });
    }

    if (config.childWrappers) {
        config.childWrappers
            .filter(p => p.properties[0] && p.widget)
            .forEach(p => {
                propertyHandlersProvider.register(
                    p.properties.map(a => a.handler),
                    new ChildWrapperPropertyHandler(
                        propertyResolver,
                        p.properties,
                        p.widget,
                        p.defaults,
                        p.priority !== undefined && p.priority !== null ? p.priority : 100,
                    ),
                );
            });
    }

    if (config.valueTransformers) {
        config.valueTransformers
            .filter(p => p.properties && p.properties.length && p.type)
            .forEach(p => {
                const transformer = createValueTransformer(p);
                if (transformer) {
                    valueTransformersProvider.register(p.properties, transformer);
                }
            });
    }
}

export function findXmlFiles(libDir: string): string[] {
    if (!fs.existsSync(libDir)) {
        return [];
    }
    const files: string[] = [];
    for (const entry of fs.readdirSync(libDir, { withFileTypes: true })) {
        const full = path.join(libDir, entry.name);
        if (entry.isDirectory()) {
            files.push(...findXmlFiles(full));
        } else if (entry.name.endsWith('.xml')) {
            files.push(full);
        }
    }
    return files;
}

function writeIfChanged(file: string, content: string): boolean {
    if (fs.existsSync(file)) {
        const existing = fs.readFileSync(file, 'utf8');
        if (existing === content) {
            return false;
        }
    }
    fs.writeFileSync(file, content);
    return true;
}

/**
 * Reusable generator instance. Both the CLI/MCP and the VS Code extension use
 * this so the parsing/resolution/generation logic lives in exactly one place.
 */
export class XmlLayoutGenerator {
    private readonly resolver: WidgetResolver;
    private readonly classGenerator: ClassCodeGenerator;

    constructor(private readonly rootDir: string, config?: Config) {
        const pipeValueResolver = new PipeValueResolver();
        const propertyHandlersProvider = new PropertyHandlerProvider();
        const propertyResolver = new PropertyResolver(
            config || {},
            propertyHandlersProvider,
            pipeValueResolver,
        );
        const valueTransformersProvider = new ValueTransformersProvider();
        this.resolver = new WidgetResolver(config || {}, propertyHandlersProvider, propertyResolver);
        const widgetGenerator = new WidgetCodeGenerator(propertyHandlersProvider);
        this.classGenerator = new ClassCodeGenerator(widgetGenerator);

        registerBuiltInPropertyHandlers(propertyHandlersProvider, propertyResolver);
        registerBuiltInValueTransformers(valueTransformersProvider);
        applyConfig(config || {}, propertyHandlersProvider, propertyResolver, valueTransformersProvider);
    }

    /**
     * Generates the .xml.dart (and .ctrl.dart if new) for a single XML file.
     * Returns the GeneratedFile entry or pushes an error into `result`.
     */
    generateXmlFile(xmlFile: string, result: GenResult): void {
        try {
            const filePath = xmlFile.substring(0, xmlFile.lastIndexOf('.'));
            const controllerFilePath = filePath + '.ctrl.dart';
            const layoutDart = this.generateXmlFileContent(xmlFile);
            const rootWidget = this.resolveRoot(xmlFile);
            const layoutChanged = writeIfChanged(xmlFile + '.dart', layoutDart);

            let controllerCreated = false;
            let controllerChanged = false;
            if (rootWidget.controller && !fs.existsSync(controllerFilePath)) {
                const fileName = path.parse(filePath).base;
                const controllerDart = this.classGenerator.generateControllerFile(fileName, rootWidget);
                if (controllerDart) {
                    fs.writeFileSync(controllerFilePath, controllerDart);
                    controllerCreated = true;
                    controllerChanged = true;
                }
            }
            result.generated.push({
                file: xmlFile + '.dart',
                controller: controllerCreated,
                unchanged: !layoutChanged && !controllerChanged,
            });
        } catch (e) {
            const err = e as any;
            result.errors.push({
                file: xmlFile,
                message: err && err.message ? err.message : String(e),
                line: err && typeof err.line === 'number' ? err.line : undefined,
                column: err && typeof err.column === 'number' ? err.column : undefined,
            });
        }
    }

    /**
     * Returns the generated layout Dart for a single XML file without writing
     * anything (used by the regression diff tool).
     */
    generateXmlFileContent(xmlFile: string): string {
        const filePath = xmlFile.substring(0, xmlFile.lastIndexOf('.'));
        const controllerFileName = path.parse(filePath + '.ctrl.dart').base;
        return this.classGenerator.generate(this.resolveRoot(xmlFile), controllerFileName);
    }

    private resolveRoot(xmlFile: string) {
        const xml = fs.readFileSync(xmlFile, 'utf8');
        const parser = new ParseXml();
        const xmlDoc = parser.parse(xml);
        return this.resolver.resolve(xmlDoc);
    }

    generateLocalizationFiles(result: GenResult): void {
        const jsonDirPath = path.join(this.rootDir, 'lib', 'i18n');
        if (!fs.existsSync(jsonDirPath)) {
            return;
        }
        try {
            const langs: { [code: string]: string } = {};
            for (const file of fs.readdirSync(jsonDirPath)) {
                if (file.endsWith('.json')) {
                    const code = file.substring(0, file.lastIndexOf('.'));
                    langs[code] = fs.readFileSync(path.join(jsonDirPath, file), 'utf8');
                }
            }
            if (Object.keys(langs).length === 0) {
                return;
            }
            const genDirPath = path.join(jsonDirPath, 'gen');
            fs.mkdirSync(genDirPath, { recursive: true });
            const generator = new LocalizationGenerator();
            const localizationFile = path.join(genDirPath, 'localizations.dart');
            const delegateFile = path.join(genDirPath, 'delegate.dart');
            writeIfChanged(localizationFile, generator.generateLocalization(langs));
            writeIfChanged(delegateFile, generator.generateDelegate(Object.keys(langs)));
            result.i18n.push(localizationFile, delegateFile);
        } catch (e) {
            result.errors.push({ file: path.join(jsonDirPath, '*.json'), message: (e as Error).message });
        }
    }

    generateAll(): GenResult {
        const result: GenResult = { ok: true, generated: [], i18n: [], errors: [], warnings: [] };
        const libDir = path.join(this.rootDir, 'lib');
        const xmlFiles = findXmlFiles(libDir);
        for (const file of xmlFiles) {
            this.generateXmlFile(file, result);
        }
        this.generateLocalizationFiles(result);
        result.ok = result.errors.length === 0;
        return result;
    }
}

export function runGenerate(options: GenerationOptions): GenResult {
    const generator = new XmlLayoutGenerator(options.rootDir, loadConfig(options.rootDir, options.configPath));
    const result = options.file
        ? (() => {
            const r: GenResult = { ok: true, generated: [], i18n: [], errors: [], warnings: [] };
            generator.generateXmlFile(path.resolve(options.rootDir, options.file as string), r);
            r.ok = r.errors.length === 0;
            return r;
        })()
        : generator.generateAll();

    if (options.format && result.ok) {
        const files = [...result.generated.map(g => g.file), ...result.i18n];
        const formatted = spawnSync('dart', ['format', ...files], { encoding: 'utf8' });
        if (formatted.status !== 0) {
            if (formatted.error) {
                result.warnings.push('dart not found on PATH — skipping format');
            } else {
                result.errors.push({ file: '(dart format)', message: formatted.stderr || 'dart format failed' });
                result.ok = false;
            }
        }
    }
    return result;
}
