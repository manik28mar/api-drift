import { describe, it, expect, beforeAll } from 'vitest';
import { renderTable, renderSummary, summarize, toJSON } from '../src/reporter.js';

beforeAll(() => {
  // Force chalk on so tests are deterministic regardless of CI TTY
  process.env.FORCE_COLOR = '0';
});

const r = (overrides) => ({
  file: '/repo/src/a.ts',
  line: 10,
  column: 4,
  method: 'GET',
  methodKind: 'literal',
  url: '/users/1',
  urlKind: 'literal',
  status: 'VALID',
  ...overrides,
});

describe('summarize', () => {
  it('counts statuses', () => {
    const counts = summarize([
      r({ status: 'VALID' }),
      r({ status: 'DEPRECATED' }),
      r({ status: 'NOT_FOUND' }),
      r({ status: 'DYNAMIC' }),
      r({ status: 'NOT_FOUND' }),
    ]);
    expect(counts).toEqual({ VALID: 1, DEPRECATED: 1, NOT_FOUND: 2, DYNAMIC: 1, total: 5 });
  });
});

describe('renderTable', () => {
  it('groups by status (NOT_FOUND first, VALID last)', () => {
    const out = renderTable(
      [
        r({ status: 'VALID', url: '/a' }),
        r({ status: 'NOT_FOUND', url: '/b' }),
        r({ status: 'DYNAMIC', url: '/c', urlKind: 'dynamic' }),
        r({ status: 'DEPRECATED', url: '/d' }),
      ],
      { cwd: '/repo' }
    );
    const lines = out.split('\n');
    expect(lines[0]).toMatch(/NOT_FOUND/);
    expect(lines[1]).toMatch(/DEPRECATED/);
    expect(lines[2]).toMatch(/DYNAMIC/);
    expect(lines[3]).toMatch(/VALID/);
  });

  it('renders <unresolved> for dynamic URLs', () => {
    const out = renderTable([r({ status: 'DYNAMIC', urlKind: 'dynamic', url: '' })], { cwd: '/repo' });
    expect(out).toMatch(/<unresolved>/);
  });

  it('relativizes file paths', () => {
    const out = renderTable([r({ file: '/repo/src/a.ts' })], { cwd: '/repo' });
    expect(out).toMatch(/src\/a\.ts:10:4/);
    expect(out).not.toMatch(/\/repo\/src/);
  });

  it('truncates long URLs', () => {
    const longUrl = '/' + 'x'.repeat(100);
    const out = renderTable([r({ url: longUrl })], { cwd: '/repo', truncate: 20 });
    expect(out).toMatch(/x{18}…/);
  });

  it('handles empty results', () => {
    expect(renderTable([])).toMatch(/No HTTP calls found/);
  });
});

describe('renderSummary', () => {
  it('builds a one-line summary', () => {
    const out = renderSummary({ VALID: 2, DEPRECATED: 1, NOT_FOUND: 0, DYNAMIC: 0, total: 3 });
    expect(out).toMatch(/3 calls/);
    expect(out).toMatch(/2 valid/);
    expect(out).toMatch(/1 deprecated/);
  });
});

describe('toJSON', () => {
  it('serializes results with relative paths', () => {
    const out = toJSON([r({ status: 'NOT_FOUND', reason: 'no-matching-path' })], { cwd: '/repo' });
    expect(out[0]).toEqual({
      file: 'src/a.ts',
      line: 10,
      column: 4,
      method: 'GET',
      methodKind: 'literal',
      url: '/users/1',
      urlKind: 'literal',
      status: 'NOT_FOUND',
      matchedPath: null,
      reason: 'no-matching-path',
    });
  });
});
