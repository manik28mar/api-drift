const PROTOCOL_HOST_RE = /^[a-z][a-z0-9+\-.]*:\/\/[^/]+/i;

export function normalizeUrl(url) {
  if (typeof url !== 'string') return '';
  let out = url.trim();
  out = out.replace(PROTOCOL_HOST_RE, '');
  const queryIdx = out.indexOf('?');
  if (queryIdx >= 0) out = out.slice(0, queryIdx);
  const hashIdx = out.indexOf('#');
  if (hashIdx >= 0) out = out.slice(0, hashIdx);
  if (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1);
  if (!out.startsWith('/')) out = '/' + out;
  return out;
}

export function stripBasePath(url, basePaths) {
  if (!Array.isArray(basePaths) || basePaths.length === 0) return url;
  const sorted = [...basePaths].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const base of sorted) {
    const norm = normalizeUrl(base);
    if (norm === '/' || norm === '') continue;
    if (url === norm) return '/';
    if (url.startsWith(norm + '/')) return url.slice(norm.length);
  }
  return url;
}

export function templateToPattern(quasis, expressionNames) {
  let out = '';
  for (let i = 0; i < quasis.length; i++) {
    out += quasis[i];
    if (i < quasis.length - 1) {
      const name = expressionNames[i];
      out += '{' + (name && /^[A-Za-z_$][\w$]*$/.test(name) ? name : 'param') + '}';
    }
  }
  return out;
}

export function pathToRegex(pattern) {
  const escaped = pattern.replace(/[.+^$()|[\]\\]/g, '\\$&');
  const withParams = escaped.replace(/\{[^}]+\}/g, '[^/]+');
  return new RegExp('^' + withParams + '/?$');
}

export function literalSegmentCount(pattern) {
  return pattern
    .split('/')
    .filter(Boolean)
    .filter((seg) => !(seg.startsWith('{') && seg.endsWith('}')))
    .length;
}
