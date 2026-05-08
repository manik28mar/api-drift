import { describe, it, expect, beforeAll } from 'vitest';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const BIN = resolve(ROOT, 'bin/api-drift.js');
const FIXTURES = resolve(ROOT, 'test/fixtures');

function exec(args, opts = {}) {
  return new Promise((resolveP) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      cwd: opts.cwd || ROOT,
      env: { ...process.env, FORCE_COLOR: '0', ...opts.env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (b) => (stdout += b));
    child.stderr.on('data', (b) => (stderr += b));
    child.on('close', (code) => resolveP({ code, stdout, stderr }));
  });
}

describe('cli — end to end against petstore fixture', () => {
  it('reports drift and exits 1', async () => {
    const { code, stdout, stderr } = await exec([
      `${FIXTURES}/code/sample.ts`,
      '--spec',
      `${FIXTURES}/specs/petstore-3.0.yaml`,
    ]);
    expect(code).toBe(1);
    expect(stdout).toMatch(/NOT_FOUND/);
    expect(stdout).toMatch(/DEPRECATED/);
    expect(stdout).toMatch(/DYNAMIC/);
    expect(stdout).toMatch(/VALID/);
    expect(stdout).toMatch(/method-mismatch/);
    expect(stderr).toMatch(/calls/);
  });

  it('emits valid JSON to stdout with --json', async () => {
    const { code, stdout } = await exec([
      `${FIXTURES}/code/sample.ts`,
      '--spec',
      `${FIXTURES}/specs/petstore-3.0.yaml`,
      '--json',
    ]);
    expect(code).toBe(1);
    const data = JSON.parse(stdout);
    expect(Array.isArray(data)).toBe(true);
    const statuses = data.map((d) => d.status).sort();
    expect(statuses).toEqual(
      ['DEPRECATED', 'DYNAMIC', 'DYNAMIC', 'NOT_FOUND', 'NOT_FOUND', 'VALID', 'VALID'].sort()
    );
    const dep = data.find((d) => d.status === 'DEPRECATED');
    expect(dep.matchedPath).toBe('/pets/{petId}');
    const me = data.find((d) => d.matchedPath === '/pets/me');
    expect(me.status).toBe('VALID');
  });

  it('writes JSON to file with --output', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'api-drift-'));
    try {
      const out = join(tmp, 'report.json');
      const { code } = await exec([
        `${FIXTURES}/code/sample.ts`,
        '--spec',
        `${FIXTURES}/specs/petstore-3.0.yaml`,
        '--output',
        out,
      ]);
      expect(code).toBe(1);
      const json = JSON.parse(await readFile(out, 'utf8'));
      expect(json.length).toBeGreaterThan(0);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('exits 0 with --no-fail even when drift exists', async () => {
    const { code } = await exec([
      `${FIXTURES}/code/sample.ts`,
      '--spec',
      `${FIXTURES}/specs/petstore-3.0.yaml`,
      '--no-fail',
    ]);
    expect(code).toBe(0);
  });

  it('exits 2 on Swagger 2.0 input', async () => {
    const { code, stderr } = await exec([
      `${FIXTURES}/code/sample.ts`,
      '--spec',
      `${FIXTURES}/specs/swagger-2.0.yaml`,
    ]);
    expect(code).toBe(2);
    expect(stderr).toMatch(/3\.x/);
  });

  it('exits 2 when --spec is missing', async () => {
    const { code, stderr } = await exec([`${FIXTURES}/code/sample.ts`]);
    expect(code).toBe(2);
    expect(stderr).toMatch(/required option/i);
  });

  it('exits 0 when no drift detected', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'api-drift-'));
    try {
      const file = join(tmp, 'clean.ts');
      await (await import('node:fs/promises')).writeFile(
        file,
        "import axios from 'axios';\naxios.get('/v1/pets');\n"
      );
      const { code } = await exec([
        file,
        '--spec',
        `${FIXTURES}/specs/petstore-3.0.yaml`,
      ]);
      expect(code).toBe(0);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
