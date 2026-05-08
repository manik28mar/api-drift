import { describe, it, expect } from 'vitest';
import { extractFromSource } from '../src/extractor.js';

const at = (calls, i) => calls[i];

describe('extractor — fetch', () => {
  it('extracts a simple GET fetch with string literal', () => {
    const src = `await fetch('/users/42');`;
    const calls = extractFromSource('a.js', src);
    expect(calls).toHaveLength(1);
    expect(at(calls, 0)).toMatchObject({
      method: 'GET',
      methodKind: 'literal',
      url: '/users/42',
      urlKind: 'literal',
    });
  });

  it('extracts method from init object literal', () => {
    const src = `fetch('/users', { method: 'POST' });`;
    const calls = extractFromSource('a.js', src);
    expect(at(calls, 0)).toMatchObject({ method: 'POST', methodKind: 'literal' });
  });

  it('uppercases method', () => {
    const src = `fetch('/x', { method: 'put' });`;
    expect(extractFromSource('a.js', src)[0].method).toBe('PUT');
  });

  it('marks method dynamic when init is a variable', () => {
    const src = `const init = { method: 'POST' }; fetch('/users', init);`;
    const calls = extractFromSource('a.js', src);
    expect(at(calls, 0)).toMatchObject({ methodKind: 'dynamic', method: null });
  });

  it('marks method dynamic when init has a spread', () => {
    const src = `fetch('/users', { ...defaults, method: 'POST' });`;
    expect(extractFromSource('a.js', src)[0].methodKind).toBe('dynamic');
  });

  it('marks method dynamic when method value is a variable', () => {
    const src = `fetch('/users', { method: m });`;
    expect(extractFromSource('a.js', src)[0].methodKind).toBe('dynamic');
  });

  it('handles globalThis.fetch and window.fetch', () => {
    const src = `globalThis.fetch('/a'); window.fetch('/b'); self.fetch('/c');`;
    const calls = extractFromSource('a.js', src);
    expect(calls.map((c) => c.url)).toEqual(['/a', '/b', '/c']);
  });

  it('records line/column', () => {
    const src = `\n  fetch('/x');`;
    const c = extractFromSource('a.js', src)[0];
    expect(c.line).toBe(2);
    expect(c.column).toBe(2);
  });
});

describe('extractor — template literals', () => {
  it('resolves template literal to {param} pattern', () => {
    const src = "const id = 1; fetch(`/users/${id}/posts`);";
    const c = extractFromSource('a.js', src)[0];
    expect(c.urlKind).toBe('template');
    expect(c.url).toBe('/users/{id}/posts');
  });

  it('uses {param} fallback for non-identifier expressions', () => {
    const src = "fetch(`/users/${user.id}`);";
    const c = extractFromSource('a.js', src)[0];
    expect(c.url).toBe('/users/{param}');
  });

  it('treats template with no exprs as literal', () => {
    const src = "fetch(`/users`);";
    const c = extractFromSource('a.js', src)[0];
    expect(c.urlKind).toBe('literal');
    expect(c.url).toBe('/users');
  });

  it('marks dynamic for non-literal/template URLs', () => {
    const src = `const u = '/users/42'; fetch(u);`;
    const c = extractFromSource('a.js', src)[0];
    expect(c.urlKind).toBe('dynamic');
  });
});

describe('extractor — axios', () => {
  it('extracts axios.get(url)', () => {
    const src = `axios.get('/users/42');`;
    expect(extractFromSource('a.js', src)[0]).toMatchObject({
      method: 'GET',
      url: '/users/42',
    });
  });

  it('extracts axios.post / put / delete / patch / head / options', () => {
    const src = [
      "axios.post('/a');",
      "axios.put('/b');",
      "axios.delete('/c');",
      "axios.patch('/d');",
      "axios.head('/e');",
      "axios.options('/f');",
    ].join('\n');
    const methods = extractFromSource('a.js', src).map((c) => c.method);
    expect(methods).toEqual(['POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']);
  });

  it('extracts axios(config) with literal url + method', () => {
    const src = `axios({ url: '/users', method: 'PATCH' });`;
    expect(extractFromSource('a.js', src)[0]).toMatchObject({
      method: 'PATCH',
      url: '/users',
    });
  });

  it('axios.request(config) defaults method to GET', () => {
    const src = `axios.request({ url: '/users' });`;
    expect(extractFromSource('a.js', src)[0]).toMatchObject({ method: 'GET', url: '/users' });
  });

  it('marks dynamic when axios config is non-literal', () => {
    const src = `const cfg = {}; axios(cfg);`;
    const c = extractFromSource('a.js', src)[0];
    expect(c.urlKind).toBe('dynamic');
    expect(c.methodKind).toBe('dynamic');
  });

  it('does not extract from axios.create itself', () => {
    const src = `const api = axios.create({ baseURL: '/v1' });`;
    expect(extractFromSource('a.js', src)).toHaveLength(0);
  });
});

describe('extractor — axios.create instance tracking', () => {
  it('prepends instance baseURL to method calls', () => {
    const src = `
      const api = axios.create({ baseURL: '/v1' });
      api.get('/users/42');
      api.post('/login');
    `;
    const calls = extractFromSource('a.js', src);
    expect(calls.map((c) => c.url)).toEqual(['/v1/users/42', '/v1/login']);
  });

  it('prepends baseURL when instance is called with config', () => {
    const src = `
      const api = axios.create({ baseURL: '/v2' });
      api({ url: '/things', method: 'POST' });
      api.request({ url: '/req' });
    `;
    const calls = extractFromSource('a.js', src);
    expect(calls.map((c) => c.url).sort()).toEqual(['/v2/req', '/v2/things']);
  });

  it('handles full-URL baseURL', () => {
    const src = `
      const api = axios.create({ baseURL: 'https://api.example.com/v1' });
      api.get('/users');
    `;
    expect(extractFromSource('a.js', src)[0].url).toBe('https://api.example.com/v1/users');
  });

  it('does not prepend baseURL to absolute URLs', () => {
    const src = `
      const api = axios.create({ baseURL: '/v1' });
      api.get('https://other.com/x');
    `;
    expect(extractFromSource('a.js', src)[0].url).toBe('https://other.com/x');
  });

  it('does nothing when baseURL is non-literal', () => {
    const src = `
      const base = '/v1';
      const api = axios.create({ baseURL: base });
      api.get('/users');
    `;
    expect(extractFromSource('a.js', src)[0].url).toBe('/users');
  });
});

describe('extractor — TS / TSX', () => {
  it('parses .ts file with type annotations', () => {
    const src = `const x: number = 1; await fetch<User>('/users/1');`;
    const calls = extractFromSource('user.ts', src);
    expect(calls[0]).toMatchObject({ url: '/users/1', method: 'GET' });
  });

  it('parses .tsx file with JSX', () => {
    const src = `
      function C() { return <div onClick={() => fetch('/click')} />; }
    `;
    const calls = extractFromSource('component.tsx', src);
    expect(calls[0].url).toBe('/click');
  });

  it('parses TypeScript generics on axios', () => {
    const src = `axios.get<User>('/users/1');`;
    expect(extractFromSource('a.ts', src)[0]).toMatchObject({ method: 'GET', url: '/users/1' });
  });
});

describe('extractor — robustness', () => {
  it('returns [] on syntactically invalid source', () => {
    const src = `function ( {{`;
    expect(extractFromSource('a.js', src)).toEqual([]);
  });

  it('ignores unrelated function calls', () => {
    const src = `myService.fetch('/x'); customFn('/y');`;
    expect(extractFromSource('a.js', src)).toEqual([]);
  });

  it('extracts multiple calls from same file', () => {
    const src = `
      fetch('/a');
      axios.get('/b');
      fetch('/c', { method: 'DELETE' });
    `;
    const calls = extractFromSource('a.js', src);
    expect(calls).toHaveLength(3);
  });
});
