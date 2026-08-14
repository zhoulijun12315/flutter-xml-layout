import { FormControlModel, RootWidgetModel, VariableModel, WidgetModel } from "../models/models";

import { WidgetCodeGenerator } from "./widget-generator";
import { getUniqueBy } from "../utils";

export class ClassCodeGenerator {
    private readonly widgetGenerator: WidgetCodeGenerator;

    constructor(widgetGenerator: WidgetCodeGenerator) {
        this.widgetGenerator = widgetGenerator;
    }

    generate(rootWidget: RootWidgetModel, controllerPath: string): string {
        let vars: VariableModel[] = this.getChildrenRecursively<VariableModel>(rootWidget.rootChild, w => w.vars);
        vars = getUniqueBy(vars, a => a.name);

        let controllers: VariableModel[] = this.getChildrenRecursively<VariableModel>(rootWidget.rootChild, w => w.controllers);
        controllers = getUniqueBy(controllers, a => a.name);

        let formControls: FormControlModel[] = this.getChildrenRecursively<FormControlModel>(rootWidget.rootChild, w => w.formControls);
        formControls = getUniqueBy(formControls, a => a.name);

        const mixins: string[] = [...new Set([...rootWidget.mixins, ...this.getChildrenRecursively<string>(rootWidget.rootChild, w => w.mixins as any)])];
        const rootChildCode = this.widgetGenerator.generateWidgetCode(rootWidget.rootChild, 0);
        const widgetName = rootWidget.type;
        const hasController = !!rootWidget.controller;

        const hasNamedAnimation = vars.some(v => v.type === 'GlobalKey<AnimationBuilderState>');
        if (hasNamedAnimation && !hasController) {
            throw new Error(':: apply-animation with a "name" attribute requires a controller on the root widget (e.g. controller="MyController").');
        }

        // route aware
        let routeAwareStateMethods = '';
        let routeAwareControllerMethods = '';
        const routeAware = rootWidget.routeAware;
        if (routeAware && hasController) {
          routeAwareStateMethods = `
  // Called when the top route has been popped off, and the current route shows up.
  void didPopNext() {
    ctrl.didPopNext();
  }

  // Called when the current route has been pushed.
  void didPush() {
    ctrl.didPush();
  }

  // Called when the current route has been popped off.
  void didPop() {
    ctrl.didPop();
  }

  // Called when a new route has been pushed, and the current route is no longer visible.
  void didPushNext() {
    ctrl.didPushNext();
  }`;

          routeAwareControllerMethods = `
  void didPopNext() {
  }

  void didPush() {
  }

  void didPop() {
  }

  void didPushNext() {
  }`;
        }

        // A widget needs a StatefulWidget when it has a controller, declared
        // params (accessed as `widget.xxx`), state variables, providers,
        // forms, mixins or route awareness, or when the XML references
        // `widget.xxx` (only available in a State). Simple pages without any
        // of those are generated as StatelessWidget.
        const usesWidgetPrefix = /widget\./.test(rootChildCode);
        const isStateful =
            rootWidget.stateful ||
            hasController ||
            rootWidget.params.length > 0 ||
            controllers.length > 0 ||
            vars.length > 0 ||
            rootWidget.vars.length > 0 ||
            rootWidget.providers.length > 0 ||
            formControls.length > 0 ||
            routeAware ||
            mixins.length > 0 ||
            usesWidgetPrefix;


        //
        // mixins
        //         
        let mixinsCode = '';
        if (mixins && mixins.length) {
          mixinsCode = ' with ' + mixins.map(a => a).join(', ');
        }

        //
        // build method
        //
        let buildMethodContent = 
`
  @override
  Widget build(BuildContext context) {
    final pipeProvider = context.watch<PipeProvider>();
    final layout = ${rootChildCode};
    return layout;
  }`;


        if (hasController) {
          rootWidget.imports.push({ path: `${rootWidget.controllerPath || controllerPath}` });
        }
        rootWidget.imports.push({ path: `package:flutter/material.dart` });
        rootWidget.imports.push({ path: `package:flutter_xml_layout_helpers/headers.dart` });
        rootWidget.imports.push({ path: `package:provider/provider.dart` });

        // Generated code can trip analyzer lints that don't affect behavior
        // (e.g. a `!= null` after the stream pipe already null-guards the
        // value). Keep generated files warning-free with a curated ignore
        // header, matching common codegen practice.
        const ignoreHeader =
            '// ignore_for_file: unnecessary_null_comparison, prefer_const_constructors, ' +
            'prefer_const_literals_to_create_immutables, sized_box_for_whitespace, ' +
            'prefer_interpolation_to_compose_strings, use_key_in_widget_constructors, ' +
            'library_private_types_in_public_api, unnecessary_cast, ' +
            'unnecessary_type_check, dead_code, dead_null_aware_expression, ' +
            'unnecessary_non_null_assertion\n\n';

        let code = ignoreHeader + rootWidget.imports.map(a => `import '${a.path}';`).join('\n');

        // 
        // widget state
        //
        if (isStateful) {
            code += this.createStatefulWidget(widgetName, mixinsCode, rootWidget, controllers, routeAware, routeAwareStateMethods, buildMethodContent, hasController, formControls);
        }
        else {
          code += this.createStatelessWidget(rootWidget, widgetName, mixinsCode, buildMethodContent);
        }

        // 
        // base controller
        //
        if (hasController) {
          code += this.createControllerBase(rootWidget, controllers, vars, formControls, routeAwareControllerMethods);
        }

        return code;
    }
    
    private createControllerBase(rootWidget: RootWidgetModel, controllers: VariableModel[], vars: VariableModel[], formControls: FormControlModel[], routeAwareControllerMethods: string) {
        const varsLines: string[] = [
            ...controllers.filter(a => !a.isPrivate && !a.skipGenerate).map(a => this.createControllerVar(a)),
            ...vars.map(a => a.type ? `final ${a.name} = ${a.type}();` : a.name),
            ...rootWidget.vars.map(a => this.createControllerVar(a)),
            ...rootWidget.params.filter(a => !!a.name).map(a => this.createControllerVar(a)),
            ...rootWidget.providers.map(a => this.createControllerVar(a))
        ];
        const disposeLines = [
          ...controllers.filter(a => !a.isPrivate && !a.skipGenerate).map(a => a.name),
          ...vars.filter(a => a.type === 'FormGroup').map(a => a.name)
        ];
        
        let formCode = '';
        if (formControls.length) {
          formCode = `
  Map<String, dynamic> _attachedControllers = <String, dynamic>{};

  dynamic _attachController(FormGroup formGroup, String controlName, controllerBuilder) {
    if (_attachedControllers.containsKey(controlName)) {
      final controller = _attachedControllers[controlName];
      return controller;
    }
    final controller = controllerBuilder();
    _attachedControllers[controlName] = controller;
    formGroup.get(controlName).attachTextEditingController(controller);
    return controller;
  }`;
        }

        return `

class ${rootWidget.controller}Base {
  bool _loaded = false;
  ${varsLines.join('\n  ')}${formCode}

  void _load(BuildContext context) {
    if (!_loaded) {
      _loaded = true;
      didLoad(context);
    }
    
    onBuild(context);
  }

  void didLoad(BuildContext context) {
  }

  void onBuild(BuildContext context) {
  }

  void afterFirstBuild(BuildContext context) {
  }
  ${routeAwareControllerMethods}

  void didUpdateWidgetPreHook(dynamic oldWidget) {
  }
  void didUpdateWidgetPostHook(dynamic oldWidget) {
  }
  
  @mustCallSuper
  void dispose() {
    ${disposeLines.map(a => `${a}.dispose();`).join('\n    ')}
  }
}`;
    }

    private createStatelessWidget(rootWidget: RootWidgetModel, widgetName: string, mixinsCode: string, buildMethodContent: string) {
      // todo add variables, formGroups, services, controllers, routeAware events...
      return `

class ${widgetName} extends StatelessWidget${mixinsCode} {
  ${rootWidget.params.filter(a => !!a.name).map(a => `final ${a.type ? (a.value === undefined && !a.required ? a.type + '? ' : a.type + ' ') : ''}${a.name}${a.value !== undefined ? ' = ' + a.value : ''};`).join('\n  ')}
  ${widgetName}(${rootWidget.params.length ? '{': ''}
    ${rootWidget.params.map(a => `${a.required ? 'required ' : ''}${a.name ? `this.${a.name}` : `${(a.type ? a.type + ' ' : '')}${a.superParamName}`}`).join(',\n    ')}
  ${rootWidget.params.length ? '}': ''});
  ${buildMethodContent}
}
      `;
    }

    private createStatefulWidget(widgetName: string, mixinsCode: string, rootWidget: RootWidgetModel, controllers: VariableModel[], routeAware: boolean, routeAwareStateMethods: string, buildMethodContent: string, hasController: boolean, formControls: FormControlModel[]) {
        const stateVarsDeclaration: string[] = [
            ...(hasController ? [`late ${rootWidget.controller} ctrl;`] : []),
            ...controllers.filter(a => !a.skipGenerate).map(a => a.isPrivate ? `final ${a.name} = ${a.type}();` : `${a.type} ${a.name};`),
            ...rootWidget.providers.map(a => `${a.type} ${a.name};`),
            ...rootWidget.vars.map(a => `late ${a.type} ${a.name};`),
            ...(routeAware ? [`late RouteObserver<Route> _routeObserver;`] : [])
        ];
        const stateVarsInit: string[] = [
            ...(hasController ? [`ctrl = ${rootWidget.controller}();`] : []),
            ...(hasController ? rootWidget.params.filter(a => !!a.name).map(a => `ctrl._${a.name} = widget.${a.name};`) : []),
            ...controllers.filter(a => !a.isPrivate && !a.skipGenerate).map(a => `${hasController ? `ctrl._${a.name} = `: ''}${a.name} = ${a.value ? a.value : `${a.type}()`};`),
            ...rootWidget.vars.map(a => `${hasController ? `ctrl._${a.name} = `: ''}${a.name} = ${a.value};`),
            ...(hasController ? [`WidgetsBinding.instance.addPostFrameCallback((_) => mounted ? ctrl.afterFirstBuild(context) : null);`] : [])
        ];
        const stateVarsUpdate: string[] = [
          ...(hasController ? rootWidget.params.filter(a => !!a.name).map(a => `ctrl._${a.name} = widget.${a.name};`) : []),
          ...controllers.filter(a => !a.isPrivate && !a.skipGenerate).map(a => `${hasController ? `ctrl._${a.name} = `: ''}${a.name} = ${a.value ? a.value : `${a.type}()`};`),
          ...rootWidget.vars.map(a => `${hasController ? `ctrl._${a.name} = `: ''}${a.name} = ${a.value};`),
        ];
        const superParams = rootWidget.params
          .filter(a => a.superParamName)
          .map(a => `${a.superParamName}: ${a.name || a.superParamName}`)
          .join(', ');
        const superCtor = superParams ? ` : super(${superParams})` : '';

        return `

class ${widgetName} extends StatefulWidget {
  ${rootWidget.params.filter(a => !!a.name).map(a => `final ${a.type ? (a.value === undefined && !a.required ? a.type + '? ' : a.type + ' ') : ''}${a.name};`).join('\n  ')}
  ${widgetName}(${rootWidget.params.length ? '{': ''}
    ${rootWidget.params.map(a => `${a.required ? 'required ' : ''}${a.name ? `this.${a.name}` : `${(a.type ? a.type + ' ' : '')}${a.superParamName}`}${a.value !== undefined ? ' = ' + a.value : ''}`).join(',\n    ')}
  ${rootWidget.params.length ? '}': ''})${superCtor};

  @override
  _${widgetName}State createState() => _${widgetName}State();
}

class _${widgetName}State extends State<${widgetName}>${mixinsCode} {
  ${stateVarsDeclaration.join('\n  ')}
  ${routeAwareStateMethods}

  @override
  void initState() {
    super.initState();${(stateVarsInit.length > 0 ? '\n    ' : '') + stateVarsInit.join(`\n    `)}
  }

  @override
  void didUpdateWidget(${widgetName} oldWidget) {
    super.didUpdateWidget(oldWidget);
    ${hasController ? `\n    ctrl.didUpdateWidgetPreHook(oldWidget);` : ''}
    ${(stateVarsUpdate.length > 0 ? '\n    ' : '') + stateVarsUpdate.join(`\n    `)}
    ${hasController ? `\n    ctrl.didUpdateWidgetPostHook(oldWidget);` : ''}
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();${routeAware ? `\n    _routeObserver = context.watch<RouteObserver<Route>>()..subscribe(this, ModalRoute.of(context) as Route);` : ''
  }${(rootWidget.providers.length ? '\n    ' : '') + rootWidget.providers.map(a => `${hasController ? `ctrl._${a.name} = `: ''}${a.name} = context.watch<${a.type}>();`).join('\n    ')
  }${hasController ? `\n    ctrl._load(context);` : ''}
  }

  @override
  void dispose() {${hasController ? `\n    ctrl.dispose();` : ''
    }${routeAware ? `\n    _routeObserver.unsubscribe(this);` : ''
    }${(controllers.length > 0 ? '\n    ' : '') + controllers.filter(a => a.isPrivate).map(a => `${a.name}.dispose();`).join('\n    ')}
    super.dispose();
  }
  ${buildMethodContent}
}`;
    }

    private createControllerVar(a: VariableModel): string {
        a.type = a.type || 'var';
        return ((a as any).required || a.value !== undefined) ? 
          `late ${a.type} _${a.name};\n  ${a.type} get ${a.name} => _${a.name};` : 
          `${a.type}? _${a.name};\n  ${a.type}? get ${a.name} => _${a.name};`;
    }

    generateControllerFile(fileName: string, rootWidget: RootWidgetModel): string {
        if (!rootWidget.controller) {
          return '';
        }

        let code = `import 'package:flutter/widgets.dart';
import '${fileName}.xml.dart';

class ${rootWidget.controller} extends ${rootWidget.controller}Base {

  @override
  void didLoad(BuildContext context) {
  }

  @override
  void onBuild(BuildContext context) {
  }

  @override
  void afterFirstBuild(BuildContext context) {
  }

  @override
  void dispose() {
    super.dispose();
  }
}`;
        return code;
    }

    private getChildrenRecursively<T>(widget: WidgetModel | null, variableGetter: (widget: WidgetModel) => T[]): T[] {
        if (!widget) {
            return [];
        }

        const res = variableGetter(widget as any) || [];

        if (widget instanceof Array) {
            widget = widget[0] as any;
            if (!widget) {
                return [];
            }
        }

        widget.properties.forEach(prop => {
            let property = prop;
            if (prop.dataType === 'propertyElement') {
              // unwrap the contained property
              property = prop.value as any;
            }

            if (property.dataType === 'widget') {
                res.push(...this.getChildrenRecursively(property.value as WidgetModel, variableGetter));
            }
            else if (property.dataType === 'widgetList') {
                (property.value as WidgetModel[]).forEach(w => {
                    res.push(...this.getChildrenRecursively(w, variableGetter));
                });
            }
        });
        
        if (widget.wrappedWidgets) {
            widget.wrappedWidgets.forEach(w => res.push(...this.getChildrenRecursively(w, variableGetter)));
        }

        return new Array(...new Set(res));
    }
}
