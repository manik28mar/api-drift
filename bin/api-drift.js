#!/usr/bin/env node
import { run } from '../src/cli.js';

run(process.argv).then(
  (code) => process.exit(code ?? 0),
  (err) => {
    process.stderr.write((err?.stack || err?.message || String(err)) + '\n');
    process.exit(2);
  }
);
