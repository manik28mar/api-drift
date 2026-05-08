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

  const normalized = stripBasePath(normalizeUrl(call.url), spec.basePaths);
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
    return {
      ...call,
      status: 'NOT_FOUND',
      matchedPath: best.pathPattern,
      reason: `method-mismatch (spec has ${best.method}, code uses ${call.method})`,
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
