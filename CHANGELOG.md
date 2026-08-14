# Change Log

## [0.1.0] - 2026-08-14

First public release of the maintained fork.

- Headless generator CLI (`fxml generate/watch`) and MCP server, reusing the
  same core as the extension (AI/CI callable).
- Null-safe, lint-clean generated code:
  - single `headers.dart` import,
  - `context.watch` instead of `Provider.of`,
  - explicit null handling (`??` / `!= null` / `== null`) respected instead of
    being overridden by the pipe null guard,
  - `:watch` multi-stream wrapper,
  - warning-free generated files (curated `ignore_for_file` header).
- Generator bug fixes: grouped multi-pipe placeholders, per-group null guards,
  duplicate-builder merging with different guards, itemBuilder null fallback,
  animation getters, consumer child nullability, i18n null safety.
- Regression tool: manifest-based diff (`tools/diff-generations.js`).
- Distinct branding (name, logo) from the original extension.
