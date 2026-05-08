import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadSpec } from '../src/openapi.js';
import { classifyCalls } from '../src/matcher.js';

const here = dirname(fileURLToPath(import.meta.url));
const PETSTORE = resolve(here, 'fixtures/specs/petstore-3.0.yaml');

let spec;
beforeAll(async () => {
  spec = await loadSpec(PETSTORE);
});

const call = (overrides) => ({
  file: 'a.js',
  line: 1,
  column: 0,
  method: 'GET',
  methodKind: 'literal',
  url: '/v1/pets',
  urlKind: 'literal',
  ...overrides,
});

describe('matcher', () => {
  it('classifies a valid GET as VALID', () => {
    const r = classifyCalls([call({ url: '/v1/pets' })], spec);
    expect(r[0].status).toBe('VALID');
    expect(r[0].matchedPath).toBe('/pets');
  });

  it('classifies a deprecated DELETE as DEPRECATED', () => {
    const r = classifyCalls([call({ method: 'DELETE', url: '/v1/pets/42' })], spec);
    expect(r[0].status).toBe('DEPRECATED');
    expect(r[0].reason).toBe('deprecated-in-spec');
  });

  it('classifies an unknown URL as NOT_FOUND', () => {
    const r = classifyCalls([call({ url: '/v1/unknown' })], spec);
    expect(r[0].status).toBe('NOT_FOUND');
    expect(r[0].reason).toBe('no-matching-path');
  });

  it('detects method mismatch as NOT_FOUND with method-mismatch reason', () => {
    const r = classifyCalls([call({ method: 'PATCH', url: '/v1/pets' })], spec);
    expect(r[0].status).toBe('NOT_FOUND');
    expect(r[0].reason).toMatch(/method-mismatch/);
    expect(r[0].matchedPath).toBe('/pets');
  });

  it('applies literal-wins-over-parametric tiebreaker', () => {
    // /pets/me must beat /pets/{petId} when matching the URL '/v1/pets/me'
    const r = classifyCalls([call({ url: '/v1/pets/me' })], spec);
    expect(r[0].status).toBe('VALID');
    expect(r[0].matchedPath).toBe('/pets/me');
  });

  it('still matches /pets/{petId} for non-literal IDs', () => {
    const r = classifyCalls([call({ url: '/v1/pets/abc-123' })], spec);
    expect(r[0].matchedPath).toBe('/pets/{petId}');
  });

  it('marks DYNAMIC when urlKind is dynamic', () => {
    const r = classifyCalls([call({ url: '', urlKind: 'dynamic' })], spec);
    expect(r[0].status).toBe('DYNAMIC');
    expect(r[0].reason).toBe('url-unresolvable');
  });

  it('marks DYNAMIC when methodKind is dynamic', () => {
    const r = classifyCalls(
      [call({ url: '/v1/pets', method: null, methodKind: 'dynamic' })],
      spec
    );
    expect(r[0].status).toBe('DYNAMIC');
    expect(r[0].reason).toBe('method-unresolvable');
  });

  it('strips spec base path before matching', () => {
    const r = classifyCalls([call({ url: 'https://api.example.com/v1/pets' })], spec);
    expect(r[0].status).toBe('VALID');
  });

  it('matches multi-param paths', () => {
    const r = classifyCalls(
      [call({ url: '/v1/users/1/posts/2' })],
      spec
    );
    expect(r[0].status).toBe('VALID');
    expect(r[0].matchedPath).toBe('/users/{userId}/posts/{postId}');
  });

  it('matches template-resolved URLs', () => {
    const r = classifyCalls(
      [call({ url: '/v1/pets/{id}', urlKind: 'template' })],
      spec
    );
    expect(r[0].status).toBe('VALID');
    expect(r[0].matchedPath).toBe('/pets/{petId}');
  });
});
