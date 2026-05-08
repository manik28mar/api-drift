import chalk from 'chalk';
import { relative } from 'node:path';

const STATUS_ORDER = ['NOT_FOUND', 'DEPRECATED', 'DYNAMIC', 'VALID'];

const SYMBOL = {
  NOT_FOUND: '✗',
  DEPRECATED: '⚠',
  DYNAMIC: '?',
  VALID: '✓',
};

const COLOR = {
  NOT_FOUND: (s) => chalk.red(s),
  DEPRECATED: (s) => chalk.yellow(s),
  DYNAMIC: (s) => chalk.magenta(s),
  VALID: (s) => chalk.green(s),
};

export function summarize(results) {
  const counts = { VALID: 0, DEPRECATED: 0, NOT_FOUND: 0, DYNAMIC: 0, total: results.length };
  for (const r of results) counts[r.status]++;
  return counts;
}

export function renderTable(results, { cwd = process.cwd(), truncate = 60 } = {}) {
  if (results.length === 0) return chalk.dim('No HTTP calls found.');
  const sorted = [...results].sort((a, b) => {
    const sa = STATUS_ORDER.indexOf(a.status);
    const sb = STATUS_ORDER.indexOf(b.status);
    if (sa !== sb) return sa - sb;
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return a.line - b.line;
  });

  const rows = sorted.map((r) => formatRow(r, cwd, truncate));
  const widths = computeColumnWidths(rows);
  return rows.map((row) => alignRow(row, widths)).join('\n');
}

function formatRow(r, cwd, truncate) {
  const sym = COLOR[r.status](SYMBOL[r.status]);
  const status = COLOR[r.status](r.status);
  const method = r.method || '?';
  let url = r.urlKind === 'dynamic' ? '<unresolved>' : r.url;
  if (truncate && url.length > truncate) url = url.slice(0, truncate - 1) + '…';
  const location = `${relative(cwd, r.file) || r.file}:${r.line}:${r.column}`;
  const note = r.reason ? chalk.dim(`(${r.reason})`) : '';
  return [sym, status, method, url, location, note];
}

function computeColumnWidths(rows) {
  const widths = [0, 0, 0, 0, 0, 0];
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      const len = visibleLength(row[i]);
      if (len > widths[i]) widths[i] = len;
    }
  }
  return widths;
}

function alignRow(row, widths) {
  return row
    .map((cell, i) => (i === row.length - 1 ? cell : pad(cell, widths[i])))
    .join('  ')
    .trimEnd();
}

function pad(s, w) {
  const len = visibleLength(s);
  if (len >= w) return s;
  return s + ' '.repeat(w - len);
}

const ANSI_RE = /\x1b\[[0-9;]*m/g;
function visibleLength(s) {
  return s.replace(ANSI_RE, '').length;
}

export function renderSummary(counts) {
  const parts = [
    counts.NOT_FOUND ? chalk.red(`${counts.NOT_FOUND} not_found`) : null,
    counts.DEPRECATED ? chalk.yellow(`${counts.DEPRECATED} deprecated`) : null,
    counts.DYNAMIC ? chalk.magenta(`${counts.DYNAMIC} dynamic`) : null,
    counts.VALID ? chalk.green(`${counts.VALID} valid`) : null,
  ].filter(Boolean);
  return chalk.bold(`${counts.total} call${counts.total === 1 ? '' : 's'}`) +
    (parts.length ? ' — ' + parts.join(', ') : '');
}

export function toJSON(results, { cwd = process.cwd() } = {}) {
  return results.map((r) => ({
    file: relative(cwd, r.file) || r.file,
    line: r.line,
    column: r.column,
    method: r.method,
    methodKind: r.methodKind,
    url: r.url,
    urlKind: r.urlKind,
    status: r.status,
    matchedPath: r.matchedPath ?? null,
    reason: r.reason ?? null,
  }));
}
