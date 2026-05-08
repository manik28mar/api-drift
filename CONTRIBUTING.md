# Contributing

Thanks for your interest in `api-drift`. PRs that add HTTP-client coverage, broaden test fixtures, or improve performance are especially welcome.

## Dev setup

```sh
git clone https://github.com/<owner>/api-drift.git
cd api-drift
npm install
npm test
```

## Project layout

```
bin/api-drift.js     # shebang entry
src/cli.js           # commander wiring + orchestration
src/extractor.js     # AST walker (Babel)
src/openapi.js       # spec loader (swagger-parser)
src/matcher.js       # classification + tiebreaker
src/reporter.js      # table + JSON output
src/util/            # path normalization, concurrency
test/                # vitest suites + fixtures
```

## Test commands

```sh
npm test              # one-shot
npm run test:watch    # watch mode
npm run test:coverage # v8 coverage
```

## PR checklist

- [ ] Code passes `npm test`.
- [ ] New behavior is covered by a unit test (or a fixture if it's end-to-end).
- [ ] No new runtime dependencies unless discussed in an issue first.
- [ ] No network calls. The zero-cost guarantee is non-negotiable.
- [ ] README updated if user-facing flags or output changed.

## Filing bugs

Please include:
- Node version (`node -v`).
- A minimal source snippet that reproduces.
- A minimal OpenAPI snippet (or a link to a public spec) that reproduces.
- The actual vs. expected classification.

## Releasing (maintainers)

1. Bump `package.json` version.
2. Tag: `git tag v$(node -p "require('./package.json').version")`.
3. `npm pack` and inspect the tarball.
4. `npm publish --access public --provenance`.
5. Push tag.
