import { describe, it, expect } from 'vitest';
import {
  normalizeUrl,
  stripBasePath,
  templateToPattern,
  pathToRegex,
  literalSegmentCount,
} from '../src/util/path.js';

describe('normalizeUrl', () => {
  it('strips protocol and host', () => {
    expect(normalizeUrl('https://api.example.com/users/42')).toBe('/users/42');
  });

  it('strips query string', () => {
    expect(normalizeUrl('/users?limit=10')).toBe('/users');
  });

  it('strips hash', () => {
    expect(normalizeUrl('/users#section')).toBe('/users');
  });

  it('strips trailing slash but preserves root', () => {
    expect(normalizeUrl('/users/')).toBe('/users');
    expect(normalizeUrl('/')).toBe('/');
  });

  it('prepends leading slash', () => {
    expect(normalizeUrl('users/42')).toBe('/users/42');
  });

  it('handles empty / non-string', () => {
    expect(normalizeUrl('')).toBe('/');
    expect(normalizeUrl(null)).toBe('');
    expect(normalizeUrl(undefined)).toBe('');
  });

  it('handles http and ws schemes', () => {
    expect(normalizeUrl('http://x.com/a')).toBe('/a');
    expect(normalizeUrl('ws://x.com/feed')).toBe('/feed');
  });
});

describe('stripBasePath', () => {
  it('strips matching base prefix', () => {
    expect(stripBasePath('/v1/users', ['/v1'])).toBe('/users');
  });

  it('returns / when url equals base', () => {
    expect(stripBasePath('/v1', ['/v1'])).toBe('/');
  });

  it('does not strip non-prefix', () => {
    expect(stripBasePath('/v2/users', ['/v1'])).toBe('/v2/users');
  });

  it('prefers longest prefix', () => {
    expect(stripBasePath('/api/v2/users', ['/api', '/api/v2'])).toBe('/users');
  });

  it('handles empty base list', () => {
    expect(stripBasePath('/users', [])).toBe('/users');
  });
});

describe('templateToPattern', () => {
  it('substitutes named identifiers', () => {
    expect(templateToPattern(['/users/', '/posts'], ['userId'])).toBe('/users/{userId}/posts');
  });

  it('falls back to {param} for non-identifier expressions', () => {
    expect(templateToPattern(['/users/', ''], ['user.id'])).toBe('/users/{param}');
  });

  it('handles two interpolations', () => {
    expect(
      templateToPattern(['/users/', '/posts/', ''], ['userId', 'postId'])
    ).toBe('/users/{userId}/posts/{postId}');
  });

  it('handles no interpolations', () => {
    expect(templateToPattern(['/static/path'], [])).toBe('/static/path');
  });
});

describe('pathToRegex', () => {
  it('matches concrete path against template', () => {
    const re = pathToRegex('/users/{id}');
    expect(re.test('/users/42')).toBe(true);
    expect(re.test('/users/abc-123')).toBe(true);
  });

  it('rejects extra segments', () => {
    const re = pathToRegex('/users/{id}');
    expect(re.test('/users/42/posts')).toBe(false);
  });

  it('rejects shorter paths', () => {
    const re = pathToRegex('/users/{id}');
    expect(re.test('/users')).toBe(false);
  });

  it('matches multiple params', () => {
    const re = pathToRegex('/users/{userId}/posts/{postId}');
    expect(re.test('/users/1/posts/2')).toBe(true);
    expect(re.test('/users/1/posts')).toBe(false);
  });

  it('escapes regex metacharacters in literal segments', () => {
    const re = pathToRegex('/a.b/{id}');
    expect(re.test('/a.b/1')).toBe(true);
    expect(re.test('/aXb/1')).toBe(false);
  });

  it('tolerates trailing slash', () => {
    const re = pathToRegex('/users/{id}');
    expect(re.test('/users/42/')).toBe(true);
  });
});

describe('literalSegmentCount', () => {
  it('counts non-param segments', () => {
    expect(literalSegmentCount('/users/{id}')).toBe(1);
    expect(literalSegmentCount('/users/{id}/posts')).toBe(2);
    expect(literalSegmentCount('/users/me')).toBe(2);
    expect(literalSegmentCount('/{a}/{b}')).toBe(0);
    expect(literalSegmentCount('/')).toBe(0);
  });
});
