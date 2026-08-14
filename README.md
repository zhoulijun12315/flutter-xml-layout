
> 🚀 **Live demo:** try the XML Layout web demo —
> [open the showcase](https://zhoulijun12315.github.io/flutter-xml-layout-helpers/).
> It is a full Flutter app written entirely in XML.

## Headless CLI (for AI & CI)

The same generator core that powers the VS Code extension can be run from the
command line, so AI agents and CI pipelines can generate `.xml.dart` and
`.ctrl.dart` files without opening an editor.

```sh
npm install
npm link                                    # installs the `fxml` command (one-time)

# Generate all XML files under lib/ (and i18n JSON)
fxml generate <projectRoot> [--config <path>] [--format]

# Generate a single file
fxml generate <projectRoot> --file lib/pages/home/home.xml

# Watch for changes and regenerate automatically
fxml watch <projectRoot>

# Machine-readable output for AI/CI
fxml generate <projectRoot> --json
```

Without `npm link` you can also run it directly:
`node .tools-out/tools/generate.js generate <projectRoot>`.

**Regression checking after generator upgrades.** Generated files are often
gitignored, so a small manifest is used as a committed baseline:

```sh
node .tools-out/tools/diff-generations.js <projectRoot>           # compare
node .tools-out/tools/diff-generations.js <projectRoot> --write   # regenerate changed files
node .tools-out/tools/diff-generations.js <projectRoot> --update  # accept new baseline
```

The tool hashes the generated output for every XML file into
`.fxml-gen-manifest.json` (commit this file) and reports which files changed,
with semantic markers (widget type, stream count, null guards) for review.

Behavior:

- Scans `<projectRoot>/lib/**/*.xml` and writes `<name>.xml.dart` next to each
  file; creates `<name>.ctrl.dart` only when the widget declares a controller
  and the file does not already exist (user code is never overwritten).
- Regenerates `lib/i18n/*.json` into `lib/i18n/gen/localizations.dart` and
  `delegate.dart`.
- Reads `fxmllayout.json` for custom wrappers / value transformers.
- `--format` runs `dart format` on generated files.
- Files that did not change are reported as `(unchanged)` and not rewritten.
- Errors include `line:column` when available.
- Exit codes: `0` success, `1` generation errors, `2` usage errors.

`fxmllayout.json` also accepts `formatOnSave: false` to disable the automatic
`dart format` that the VS Code extension runs on generated files after saving
(enabled by default).

## MCP server (AI tools)

The generator is also exposed as an [MCP](https://modelcontextprotocol.io)
server, so AI agents can call it as a tool — no editor required.

```sh
npm install
npm link
xml-layout-mcp                        # stdio JSON-RPC server
```

Available tools:

- `generate_xml_layout(rootDir, configPath?, format?)` — generate `.xml.dart`,
  `.ctrl.dart` and i18n files; returns a JSON summary of generated files and
  errors.
- `list_xml_layout_files(rootDir)` — list the `.xml` files that will be
  processed.

Register it with your MCP client, for example:

```json
{
  "mcpServers": {
    "xml-layout": {
      "command": "node",
      "args": ["/absolute/path/to/flutter-xml-layout/bin/xml-layout-mcp.js"]
    }
  }
}
```

An agent can then say "generate the XML layouts for this project" and the tool
does the rest.

Imagine that you can do this :
```XML
<Container width="50 | widthPercent"
           height="50 | heightPercent"
           color="blue"
           :text="'Hello world!'"
           :opacity=".9"
           :center
           :if="ctrl.textVisible | behavior" />
```
Instead of this:
```dart
    final size = MediaQuery.of(context).size;
    final __widget = StreamBuilder(
      initialData: ctrl.textVisible.value,
      stream: ctrl.textVisible,
      builder: (BuildContext context, snapshot) {
        if (snapshot.data) {
          return Opacity(
            opacity: .9,
            child: Center(
              child: Container(
                color: Colors.blue,
                height: (size.height * 50) / 100.0,
                width: (size.width * 50) / 100.0,
                child: Text(
                  'Hello world!'
                )
              )
            )
          );
        }
        else {
          return Container(width: 0, height: 0);
        }
      }
    );
    return __widget;
```
Which is about 20 lines of code, and if you just updated the `:text` property to use a stream variable `:text="ctrl.myTextStream | stream"` that will add another 4 lines of code for the StreamBuilder.


Extension features:
--------
* Separates UI code (widget and widget's state) from the business logic.
* Brings some Angular's features like pipes, conditionals...
* Provides built-in properties & pipes to make the coding much easier.
* Generates localization code depending on json files.
* Forms & animation made easy.
* Customizable! so developers can add their own properties and modify some features.
* Supports Code completion, hover information, Go to Definition, diagnostics and code actions.


## Example
[Here is a working example](https://github.com/waseemdev/flutter_xmllayout_example)


# Get Started

1. Install the extension from [vscode marketplace](https://marketplace.visualstudio.com/items?itemName=WaseemDev.flutter-xml-layout)
2. Create a new flutter project
3. Install prerequisites packages:
    * [flutter_xml_layout_helpers](https://github.com/zhoulijun12315/flutter-xml-layout-helpers)
    * [provider](https://pub.dev/packages/provider) `^6.0.0`
    * flutter_localizations
```yaml
dependencies:
  flutter:
    sdk: flutter
  flutter_localizations:
    sdk: flutter
  provider: ^6.0.0
  flutter_xml_layout_helpers:
    git:
      url: https://github.com/zhoulijun12315/flutter-xml-layout-helpers.git
```
> Once `flutter_xml_layout_helpers` is published to pub.dev, replace the git
> dependency with `flutter_xml_layout_helpers: ^0.1.0`.
4. Apply one of the following steps:
    * Clear all `main.dart` content then use `fxml_app` snippet to create the app.
    * Modify `main.dart` to use `MultiProvider` from `provider` package:
        - Register `PipeProvider` (from `flutter_xml_layout_helpers` package) as a provider.
        - Register `RouteObserver<Route>` as a provider (only if you want to use RouteAware events in your widgets' controllers).

## Localization:
1. Create `i18n` folder inside `lib` folder and add JSON files named with locale codes e.g. `en.json`.
2. Import `i18n/gen/delegate.dart` in the main file.
3. Register `AppLocalizationsDelegate()` in `localizationsDelegates` parameter of the `MaterialApp`.
4. To use localized text in the UI see [Pipes](./docs/pipes.md) docs.

## XML layout:
1. Create a new folder and name it as your page/widget name e.g. `home`.
2. Then create home.xml file inside `home` folder.
3. Use `fxml_widget` snippet to create the starter layout, modify it as you want then save it. the extension will generate a file named `home.xml.dart` which contains UI code, and `home.ctrl.dart` file (if not exists) that contains the controller class which is the place you should put your code in (will be generated only if you added `controller` property).

Example:
```XML
<HomePage controller="HomeController" routeAware
    xmlns:cupertino="package:flutter/cupertino.dart">

  <Scaffold>

    <appBar>
      <AppBar>
        <title>
          <Text text="'Home'" />
        </title>
      </AppBar>
    </appBar>

    <body>
      <Column mainAxisAlignment="center" crossAxisAlignment="center">
        <Image :use="asset" source="'assets/my_logo.png'" />
        <Text text="'Hello world!'" />
        <Icon icon="CupertinoIcons.home" />
      </Column>
    </body>
  </Scaffold>
</HomePage>
```

`HomePage` (root element) the name of your widget.
`controller` an optional property, the controller name you want to generate.
`routeAware` an optional property, which generates navigation events (`didPush()`, `didPop()`, `didPushNext()` and `didPopNext()`).
`xmlns:*` an optional property(s) used to import packges and files to be used in HomePage class. (in this example we imported cupertino.dart to use CupertinoIcons).


## Controller:
If you added a `controller` property to your widget then will be generated (if not exists), the file looks like this:
```dart
import 'package:flutter/widgets.dart';
import 'home.xml.dart';

class HomeController extends HomeControllerBase {

  //
  // here you can add you own logic and call the variables and methods
  // within the XML file. e.g. <Text text="ctrl.myText" />
  //

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
}
```

# Features documentation

### 1. [Wrapper properties](./docs/wrapper-properties.md)
### 2. [Pipes](./docs/pipes.md)
### 3. [Custom properties](./docs/custom-properties.md)
### 4. [Injecting providers](./docs/providers.md)
### 5. [Parameters](./docs/parameters.md)
### 6. [Adding controllers to widgets](./docs/controllers.md)
### 7. [Adding mixin to widget's states](./docs/mixins.md)
### 8. [Localization](./docs/localization.md)
### 9. [Developer customization](./docs/customization.md)
