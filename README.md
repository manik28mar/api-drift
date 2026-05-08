# api-drift

> Flag drift between `fetch`/`axios` calls and an OpenAPI 3.x spec — locally, with no network calls and no API keys.

`api-drift` walks your JS/TS codebase, extracts every HTTP call, and classifies each one against your OpenAPI spec as **VALID / DEPRECATED / NOT_FOUND / DYNAMIC**. It catches the kind of bug AI coding tools love to introduce: endpoints that were renamed, deprecated, or never existed.

## Install

```sh
npm install --save-dev api-drift
# or run once
npx api-drift "src/**/*.{ts,tsx}" --spec openapi.yaml
```

Requires Node ≥ 20.

## Quickstart

```sh
api-drift "src/**/*.{js,ts,tsx}" --spec ./openapi.yaml
```

```
✗ NOT_FOUND   GET     /v1/users/42/profile          src/api/user.ts:42:10  (no-matching-path)
⚠ DEPRECATED  POST    /v1/login                     src/auth/login.ts:18:14  (deprecated-in-spec)
? DYNAMIC     ?       <unresolved>                  src/api/router.ts:55:8  (method-unresolvable)
✓ VALID       GET     /v1/users/{id}                src/api/user.ts:30:10
4 calls — 1 not_found, 1 deprecated, 1 dynamic, 1 valid
```

Exit code: `0` clean · `1` drift detected · `2` usage / spec error. CI-friendly out of the box.

## Options

```
api-drift [patterns...] --spec <openapi.{yaml,json}> [options]

  -s, --spec <path>       OpenAPI 3.x spec                    [required]
  -o, --output <path>     write JSON report (or "-" = stdout)
      --json              alias for --output -
      --base-url <url...> override server base path(s)
  -i, --ignore <glob...>  extra glob(s) to exclude
      --concurrency <n>   parallel parse workers              [default: cpu count]
      --no-fail           always exit 0
      --no-color          disable ANSI colors
      --no-truncate       don't truncate long URLs in table
      --cwd <path>        working directory                   [default: process.cwd()]
```

Default ignores: `node_modules`, `dist`, `build`, `coverage`, `.next`, `*.min.js`, `*.bundle.js`. `.gitignore` is honored automatically.

## What it detects

- **`fetch(url, init?)`** — global, `globalThis.fetch`, `window.fetch`, `self.fetch`. Method read from `init.method` (default `GET`).
- **`axios(config)` / `axios.request(config)`** — `url` and `method` from object literal.
- **`axios.<method>(url, ...)`** — method from member name (`get`, `post`, `put`, `delete`, `patch`, `head`, `options`).
- **`axios.create({ baseURL })` instances** — within the same file, instance calls have their `baseURL` prepended automatically.

URL kinds:
- **Literal** — string literal, matched directly.
- **Template** — template literal; `${expr}` is converted to `{param}` and matched against parameterized spec paths.
- **Dynamic** — variable references and other non-resolvable expressions; reported as `DYNAMIC` (no false positives).

## JSON schema

`--json` and `--output report.json` emit:

```ts
type Result = {
  file: string;        // relative to --cwd
  line: number;
  column: number;
  method: string | null;
  methodKind: 'literal' | 'dynamic';
  url: string;
  urlKind: 'literal' | 'template' | 'dynamic';
  status: 'VALID' | 'DEPRECATED' | 'NOT_FOUND' | 'DYNAMIC';
  matchedPath: string | null;   // OpenAPI path pattern when matched
  reason: string | null;        // e.g. 'method-mismatch (spec has GET, code uses POST)'
};
```

## Zero-cost guarantee

`api-drift` makes no network requests. It loads your spec from disk, parses your source files locally, and writes results locally. There is no telemetry, no API key, no cloud dependency. You can run it on an air-gapped machine.

## Known gaps (v0.1.0)

- Parameter / query / body drift is not detected — URL + method only.
- Cross-file `axios.create` baseURL tracking isn't supported. The instance must be defined and used in the same file.
- Other HTTP clients (`got`, `ky`, `node-fetch`) and custom SDK wrappers are not detected.
- Specs with external `$ref` to remote URLs are rejected (would require network).
- Swagger 2.0 is rejected — OpenAPI 3.0 / 3.1 only.

## License

MIT
