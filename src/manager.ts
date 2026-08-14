import * as path from "path";
import * as vscode from "vscode";
import { spawn } from 'child_process';

import { Config } from "./models/config";
import { GenError, GenResult, XmlLayoutGenerator } from "./core/generate";
import { registerBuiltInPropertyHandlers, registerBuiltInValueTransformers } from "./builtin-handlers";
import { ChildWrapperPropertyHandler } from "./property-handlers/child-wrapper-property";
import { WrapperPropertyHandler } from "./property-handlers/wrapper-property";
import { ColorValueTransformer } from "./value-transformers/color";
import { EdgeInsetsValueTransformer } from "./value-transformers/edge-insets";
import { EnumValueTransformer } from "./value-transformers/enum";
import { PipeValueResolver } from "./resolvers/pipe-value-resolver";
import { PropertyHandlerProvider } from "./providers/property-handler-provider";
import { PropertyResolver } from "./resolvers/property-resolver";
import { ValueTransformersProvider } from "./providers/value-transformers-provider";
import { insertAutoCloseTag } from "./autoclose/autoclose";

export default class Manager {
    public readonly propertyResolver: PropertyResolver;
    public readonly propertyHandlersProvider: PropertyHandlerProvider;
    private readonly pipeValueResolver: PipeValueResolver;
    private readonly valueTransformersProvider: ValueTransformersProvider;
    private generator: XmlLayoutGenerator;
    private readonly output: vscode.OutputChannel;
    private config: Config;

    constructor(config: Config,
                private readonly diagnostics: vscode.DiagnosticCollection) {
        this.config = config;
        this.pipeValueResolver = new PipeValueResolver();
        this.propertyHandlersProvider = new PropertyHandlerProvider();
        this.propertyResolver = new PropertyResolver(config, this.propertyHandlersProvider, this.pipeValueResolver);
        this.valueTransformersProvider = new ValueTransformersProvider();

        registerBuiltInPropertyHandlers(this.propertyHandlersProvider, this.propertyResolver);
        registerBuiltInValueTransformers(this.valueTransformersProvider);
        this.applyConfig(config);
        this.rebuildGenerator();

        this.output = vscode.window.createOutputChannel('Flutter XML Layout');

        vscode.workspace.onDidSaveTextDocument(async (document) => {
            if (this.isI18nJsonFile(document.languageId)) {
                const isValidOptionsFile = path.join(this.getRootPath(), 'fxmllayout.json') === document.fileName;
                if (isValidOptionsFile) {
                    const newConfig = JSON.parse(document.getText());
                    this.config = newConfig;
                    this.applyConfig(newConfig, config);
                    this.rebuildGenerator();
                    await this.regenerateAll();
                }
                else {
                    await this.generateLocalizationFiles();
                }
            }
            else if (this.isFxmlFile(document.languageId)) {
                await this.generateWidgetDartFile(document.fileName, document.getText());
            }
        });

        // autoclose tags
        vscode.workspace.onDidChangeTextDocument(event => {
            if (this.isFxmlFile(event.document.languageId)) {
                insertAutoCloseTag(event);
            }
        });
    }

    private getRootPath(): string {
        const folders = vscode.workspace.workspaceFolders;
        return folders && folders.length ? folders[0].uri.fsPath : process.cwd();
    }

    private rebuildGenerator(): void {
        this.generator = new XmlLayoutGenerator(this.getRootPath(), this.config);
    }

    private applyConfig(config: Config, original?: Config) {
        if (config.wrappers) {
            if (original) {
                if (original.wrappers) {
                    const removed = original.wrappers.filter(a => (config.wrappers as any[]).filter(b => b.name === a.properties[0].handler).length);
                    removed.forEach(a => this.propertyHandlersProvider.remove(a.properties.map(a => a.handler)));
                }
            }
            config.wrappers
                .filter(p => p.properties[0] && p.widget)
                .forEach(p => {
                    this.propertyHandlersProvider.register(
                        p.properties.map(a => a.handler),
                        new WrapperPropertyHandler(
                            this.propertyResolver,
                            p.properties,
                            p.widget,
                            p.defaults,
                            p.priority !== undefined && p.priority !== null ? p.priority : 100,
                        ),
                    );
                });
        }

        if (config.childWrappers) {
            if (original) {
                if (original.childWrappers) {
                    const removed = original.childWrappers.filter(a => (config.childWrappers as any[]).filter(b => b.name === a.properties[0].handler).length);
                    removed.forEach(a => this.propertyHandlersProvider.remove(a.properties.map(a => a.handler)));
                }
            }
            config.childWrappers
                .filter(p => p.properties[0] && p.widget)
                .forEach(p => {
                    this.propertyHandlersProvider.register(
                        p.properties.map(a => a.handler),
                        new ChildWrapperPropertyHandler(
                            this.propertyResolver,
                            p.properties,
                            p.widget,
                            p.defaults,
                            p.priority !== undefined && p.priority !== null ? p.priority : 100,
                        ),
                    );
                });
        }

        if (config.valueTransformers) {
            config.valueTransformers.filter(p => p.properties && p.properties.length && p.type).forEach(p => {
                const transformer = this.createValueTransformer(p);
                if (transformer) {
                    this.valueTransformersProvider.register(p.properties, transformer);
                }
            });
        }
        if (original) {
            original.unnamedProperties = config.unnamedProperties;
            original.arrayProperties = config.arrayProperties;
            original.childWrappers = config.childWrappers;
            original.valueTransformers = config.valueTransformers;
            original.wrappers = config.wrappers;
        }
    }

    private createValueTransformer(p: Config['valueTransformers'][0]) {
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

    private isFxmlFile(id: string): boolean {
        return id === 'xml';
    }

    private isI18nJsonFile(id: string): boolean {
        return id === 'json';
    }

    async generateWidgetDartFile(docName: string, xml: string, notifyUpdate = true) {
        const rootPath = this.getRootPath();
        if (!docName.startsWith(path.join(rootPath, 'lib'))) {
            return;
        }

        const fileUri = vscode.Uri.file(docName);
        this.diagnostics.set(fileUri, []);

        const result: GenResult = { ok: true, generated: [], i18n: [], errors: [], warnings: [] };
        this.generator.generateXmlFile(docName, result);

        if (result.errors.length) {
            const err = result.errors[0];
            const diagnostic = this.getExceptionDiagnostics(err);
            if (diagnostic) {
                this.diagnostics.set(fileUri, [diagnostic]);
            }
            const customMessage = this.getCustomErrorMessage(err.message);
            if (customMessage) {
                vscode.window.showErrorMessage(customMessage);
                this.output.appendLine(customMessage);
                return;
            }
            vscode.window.showErrorMessage('Please check the XML structure.');
            this.output.appendLine(`Error parsing XML file: ${err.message}`);
            return;
        }

        if (this.config.formatOnSave !== false) {
            const layoutFile = docName + '.dart';
            spawn('dart', ['format', layoutFile], { stdio: 'ignore' })
                .on('error', () => { /* dart not installed — skip formatting */ });
        }

        this.output.appendLine('XML converted to Dart code.');
        if (notifyUpdate) {
            await this.notifyUpdate();
        }
    }

    private getExceptionDiagnostics(err: GenError): vscode.Diagnostic | null {
        if (err.line !== undefined && err.column !== undefined) {
            const position = new vscode.Position(Math.max(err.line - 1, 0), Math.max(err.column - 1, 0));
            return new vscode.Diagnostic(
                new vscode.Range(position, position.translate({ characterDelta: 1000 })),
                err.message.split('\n')[0],
            );
        }
        return null;
    }

    private getCustomErrorMessage(error: string): string | null {
        if (error.startsWith('::')) {
            return error.substring(2);
        }
        else if (error.startsWith('Attribute') && error.indexOf(' redefined ') !== -1) {
            return error.replace('^', '');
        }
        return null;
    }

    async generateWidgetDartFiles() {
        const result = this.generator.generateAll();
        for (const err of result.errors) {
            this.output.appendLine(`ERROR ${err.file}: ${err.message}`);
        }
        await this.notifyUpdate();
    }

    async generateLocalizationFiles() {
        const result: GenResult = { ok: true, generated: [], i18n: [], errors: [], warnings: [] };
        this.generator.generateLocalizationFiles(result);
        for (const err of result.errors) {
            this.output.appendLine(`ERROR ${err.file}: ${err.message}`);
        }
    }

    async regenerateAll() {
        await this.generateWidgetDartFiles();
        await this.generateLocalizationFiles();
        this.output.appendLine('Re-generate operation succeeded.');
    }

    private async notifyUpdate() {
        if (vscode.debug.activeDebugSession) {
            await vscode.commands.executeCommand('flutter.hotReload');
        }
    }
}
