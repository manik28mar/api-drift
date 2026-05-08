import { Command } from 'commander';
import { globby } from 'globby';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { isAbsolute, resolve } from 'node:path';
import chalk from 'chalk';

import { loadSpec, SpecLoadError } from './openapi.js';
import { extractFromSource } from './extractor.js';
import { classifyCalls } from './matcher.js';
import { renderTable, renderSummary, summarize, toJSON } from './reporter.js';
import { pMap } from './util/concurrency.js';

const DEFAULT_IGNORES = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.next/**',
  '**/*.min.js',
  '**/*.bundle.js',
];

const DEFAULT_PATTERNS = ['**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'];

export async function run(argv = process.argv) {
  const program = new Command();
  program
    .name('api-drift')
    .description('Flag drift between fetch/axios calls and an OpenAPI 3.x spec.')
    .argument('[patterns...]', 'globs of source files', [])
    .requiredOption('-s, --spec <path>', 'OpenAPI 3.x spec (YAML or JSON)')
    .option('-o, --output <path>', 'write JSON report to path (or "-" for stdout)')
    .option('--json', 'emit JSON to stdout (alias for --output -)')
    .option('--base-url <url...>', 'override spec server base path(s)')
    .option('-i, --ignore <glob...>', 'additional ignore patterns')
    .option('--concurrency <n>', 'parallel parse workers', (v) => parseInt(v, 10))
    .option('--no-fail', 'always exit 0')
    .option('--no-color', 'disable ANSI colors')
    .option('--no-truncate', 'do not truncate long URLs in table')
    .option('--cwd <path>', 'working directory', process.cwd())
    .exitOverride();

  let opts;
  try {
    program.parse(argv);
    opts = program.opts();
  } catch (err) {
    if (err && (err.code === 'commander.helpDisplayed' || err.code === 'commander.version')) {
      return 0;
    }
    process.stderr.write(chalk.red(err.message || String(err)) + '\n');
    return 2;
  }

  const patterns = program.args.length ? program.args : DEFAULT_PATTERNS;
  const cwd = resolve(opts.cwd);

  let spec;
  try {
    spec = await loadSpec(opts.spec, { baseUrlOverrides: opts.baseUrl });
  } catch (err) {
    if (err instanceof SpecLoadError) {
      process.stderr.write(chalk.red(`spec error: ${err.message}`) + '\n');
      return 2;
    }
    throw err;
  }

  let files;
  try {
    files = await collectFiles(patterns, cwd, opts.ignore || []);
  } catch (err) {
    process.stderr.write(chalk.red(`glob error: ${err.message}`) + '\n');
    return 2;
  }

  if (files.length === 0) {
    process.stderr.write(chalk.dim('No source files matched.') + '\n');
  }

  const concurrency = Number.isInteger(opts.concurrency) && opts.concurrency > 0
    ? opts.concurrency
    : availableParallelism();

  const allCalls = await pMap(
    files,
    async (file) => {
      try {
        const source = await readFile(file, 'utf8');
        return extractFromSource(file, source);
      } catch (err) {
        process.stderr.write(chalk.dim(`skip ${file}: ${err.message}\n`));
        return [];
      }
    },
    { concurrency }
  );

  const calls = allCalls.flat();
  const results = classifyCalls(calls, spec);

  const wantJson = opts.json || opts.output === '-';
  if (wantJson) {
    process.stdout.write(JSON.stringify(toJSON(results, { cwd }), null, 2) + '\n');
  } else if (opts.output) {
    await writeFile(
      resolve(cwd, opts.output),
      JSON.stringify(toJSON(results, { cwd }), null, 2) + '\n',
      'utf8'
    );
    process.stderr.write(chalk.dim(`wrote ${opts.output}\n`));
    process.stderr.write(renderTable(results, { cwd, truncate: opts.truncate ? 60 : 0 }) + '\n');
  } else {
    process.stdout.write(renderTable(results, { cwd, truncate: opts.truncate ? 60 : 0 }) + '\n');
  }

  const counts = summarize(results);
  process.stderr.write(renderSummary(counts) + '\n');

  if (opts.fail === false) return 0;
  if (counts.NOT_FOUND > 0 || counts.DEPRECATED > 0) return 1;
  return 0;
}

async function collectFiles(patterns, cwd, extraIgnores) {
  const directFiles = [];
  const globPatterns = [];
  for (const p of patterns) {
    if (isAbsolute(p) && !p.includes('*')) {
      try {
        const s = await stat(p);
        if (s.isFile()) {
          directFiles.push(p);
          continue;
        }
      } catch {
        // fall through to globby; it'll surface the no-match condition
      }
    }
    globPatterns.push(p);
  }

  let globbed = [];
  if (globPatterns.length) {
    globbed = await globby(globPatterns, {
      cwd,
      gitignore: true,
      ignore: [...DEFAULT_IGNORES, ...extraIgnores],
      absolute: true,
      onlyFiles: true,
    });
  }
  return Array.from(new Set([...directFiles, ...globbed]));
}
