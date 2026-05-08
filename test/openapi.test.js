import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadSpec, SpecLoadError } from '../src/openapi.js';

const here = dirname(fileURLToPath(import.meta.url));
const PETSTORE = resolve(here, 'fixtures/specs/petstore-3.0.yaml');
const SWAGGER = resolve(here, 'fixtures/specs/swagger-2.0.yaml');

describe('loadSpec', () => {
  it('loads OpenAPI 3.x and indexes endpoints', async () => {
    const spec = await loadSpec(PETSTORE);
    expect(spec.version).toMatch(/^3\./);
    const ops = spec.endpoints.map((e) => `${e.method} ${e.pathPattern}`).sort();
    expect(ops).toEqual([
      'DELETE /pets/{petId}',
      'GET /pets',
      'GET /pets/me',
      'GET /pets/{petId}',
      'GET /users/{userId}/posts/{postId}',
      'POST /pets',
    ]);
  });

  it('flags deprecated operations', async () => {
    const spec = await loadSpec(PETSTORE);
    const del = spec.endpoints.find((e) => e.method === 'DELETE' && e.pathPattern === '/pets/{petId}');
    expect(del.deprecated).toBe(true);
    const get = spec.endpoints.find((e) => e.method === 'GET' && e.pathPattern === '/pets/{petId}');
    expect(get.deprecated).toBe(false);
  });

  it('derives base path from servers[]', async () => {
    const spec = await loadSpec(PETSTORE);
    expect(spec.basePaths).toEqual(['/v1']);
  });

  it('honors baseUrlOverrides over server-derived bases', async () => {
    const spec = await loadSpec(PETSTORE, { baseUrlOverrides: ['/api/v2'] });
    expect(spec.basePaths).toEqual(['/api/v2']);
  });

  it('rejects Swagger 2.0', async () => {
    await expect(loadSpec(SWAGGER)).rejects.toThrow(SpecLoadError);
    await expect(loadSpec(SWAGGER)).rejects.toThrow(/3\.x/);
  });

  it('builds working regex for parametric paths', async () => {
    const spec = await loadSpec(PETSTORE);
    const get = spec.endpoints.find((e) => e.method === 'GET' && e.pathPattern === '/pets/{petId}');
    expect(get.regex.test('/pets/42')).toBe(true);
    expect(get.regex.test('/pets/42/info')).toBe(false);
  });

  it('reports literalSegmentCount for tiebreaker', async () => {
    const spec = await loadSpec(PETSTORE);
    const me = spec.endpoints.find((e) => e.pathPattern === '/pets/me');
    const param = spec.endpoints.find((e) => e.pathPattern === '/pets/{petId}' && e.method === 'GET');
    expect(me.literalSegmentCount).toBe(2);
    expect(param.literalSegmentCount).toBe(1);
  });

  it('throws SpecLoadError for missing file', async () => {
    await expect(loadSpec('/nonexistent/spec.yaml')).rejects.toThrow(SpecLoadError);
  });
});
