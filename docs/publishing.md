# Publishing to the VS Code Marketplace

## Prerequisites

- `package.json` is release-ready: `publisher`, `name`, `version`, `engines`,
  `repository`, `displayName`, `description` and `icon` are set.
- `README.md`, `LICENSE` and `CHANGELOG.md` exist.
- Node.js 20+ is available (`/opt/homebrew/opt/node@22/bin/node` on this
  machine) — the latest `vsce` requires it.

## 1. Register the publisher

1. Sign in at <https://marketplace.visualstudio.com/manage> with a Microsoft
   account.
2. Create a publisher whose name matches `package.json > publisher`
   (`zhoulijun12315`). If that name is taken, pick a variant and update
   `package.json` accordingly.

## 2. Create a Personal Access Token

1. Open Azure DevOps (<https://dev.azure.com>), then **User settings →
   Personal Access Tokens → New Token**.
2. Scope: **Marketplace → Manage** (full access), leave everything else
   default.
3. Copy the token (shown only once).

## 3. Package and verify

```sh
cd /Users/lee_zhou/work/project/Ark7_flutter_xml_layout/flutter-xml-layout
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npx vsce package
```

Inspect the produced `.vsix` (file list, size) and optionally install it
locally to smoke-test.

## 4. Publish

```sh
# Store the token once (optional; then publish without -p)
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npx vsce login zhoulijun12315

PATH="/opt/homebrew/opt/node@22/bin:$PATH" npx vsce publish
# or, non-interactively:
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npx vsce publish -p <TOKEN>
```

The extension appears on the Marketplace within minutes. Each subsequent
release must bump `version` in `package.json`.

## Notes

- The published extension ID is `<publisher>.<name>`; the original extension
  is `WaseemDev.flutter-xml-layout`, so `zhoulijun12315.flutter-xml-layout`
  does not collide.
- Consider also publishing to Open VSX (open-source registry) once the
  Marketplace release is stable.
