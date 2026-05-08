import { normalizeUrl, stripBasePath } from './util/path.js';

export function classifyCalls(calls, spec) {
  return calls.map((call) => classifyCall(call, spec));
}

function classifyCall(call, spec) {
  if (call.urlKind === 'dynamic') {
    return { ...call, status: 'DYNAMIC', reason: 'url-unresolvable' };
  }
  if (call.methodKind === 'dynamic' || !call.method) {
    return { ...call, status: 'DYNAMIC', reason: 'method-unresolvable' };
  }

  // Template literal where the first path segment is a variable placeholder
  // e.g. `${BASE_URL}/users` → "{BASE_URL}/users". We can't determine whether
  // {BASE_URL} corresponds to the spec server, so classify as DYNAMIC.
  const rawNorm = normalizeUrl(call.url);
  if (/^\{[^}]+\}\//.test(rawNorm) || rawNorm === '{' || /^\{[^}]+\}$/.test(rawNorm)) {
    return { ...call, status: 'DYNAMIC', reason: 'url-base-unresolvable' };
  }

  const normalized = stripBasePath(rawNorm, spec.basePaths);
  const sameMethodMatches = spec.endpoints.filter(
    (e) => e.method === call.method && e.regex.test(normalized)
  );

  if (sameMethodMatches.length > 0) {
    const best = pickBest(sameMethodMatches);
    return {
      ...call,
      status: best.deprecated ? 'DEPRECATED' : 'VALID',
      matchedPath: best.pathPattern,
      reason: best.deprecated ? 'deprecated-in-spec' : undefined,
    };
  }

  const otherMethods = spec.endpoints.filter(
    (e) => e.method !== call.method && e.regex.test(normalized)
  );
  if (otherMethods.length > 0) {
    const best = pickBest(otherMethods);
    const specMethods = [...new Set(otherMethods.map((e) => e.method))].sort().join(', ');
    return {
      ...call,
      status: 'NOT_FOUND',
      matchedPath: best.pathPattern,
      reason: `method-mismatch (spec has ${specMethods}, code uses ${call.method})`,
    };
  }

  return { ...call, status: 'NOT_FOUND', reason: 'no-matching-path' };
}

function pickBest(endpoints) {
  return endpoints.reduce((best, e) => {
    if (!best) return e;
    if (e.literalSegmentCount > best.literalSegmentCount) return e;
    return best;
  }, null);
}
