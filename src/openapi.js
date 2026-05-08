import SwaggerParser from '@apidevtools/swagger-parser';
import { pathToRegex, literalSegmentCount, normalizeUrl } from './util/path.js';

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

export class SpecLoadError extends Error {
  constructor(message, { cause } = {}) {
    super(message);
    this.name = 'SpecLoadError';
    if (cause) this.cause = cause;
  }
}

export async function loadSpec(specPath, { baseUrlOverrides } = {}) {
  let api;
  try {
    api = await SwaggerParser.dereference(specPath);
  } catch (err) {
    throw new SpecLoadError(`Failed to load OpenAPI spec at ${specPath}: ${err.message}`, {
      cause: err,
    });
  }

  if (!api || typeof api !== 'object') {
    throw new SpecLoadError(`Spec at ${specPath} did not parse to an object`);
  }
  const version = api.openapi || api.swagger;
  if (!version || !String(version).startsWith('3.')) {
    throw new SpecLoadError(
      `Only OpenAPI 3.x is supported. Got ${version ? `version ${version}` : 'no version field'}.`
    );
  }

  const basePaths = deriveBasePaths(api, baseUrlOverrides);
  const endpoints = buildEndpoints(api);
  return { endpoints, basePaths, version };
}

function deriveBasePaths(api, overrides) {
  if (Array.isArray(overrides) && overrides.length) {
    return overrides.map(normalizeBase).filter(Boolean);
  }
  if (!Array.isArray(api.servers) || api.servers.length === 0) return [];
  const out = [];
  for (const s of api.servers) {
    if (!s || typeof s.url !== 'string') continue;
    const base = extractPathFromServerUrl(s.url);
    const norm = normalizeBase(base);
    if (norm && !out.includes(norm)) out.push(norm);
  }
  return out;
}

function extractPathFromServerUrl(url) {
  // Server URLs may have variables like {scheme}://{host}/{basePath}.
  // We only care about the path portion. Strip protocol + host if present.
  const stripped = url.replace(/^[a-z][a-z0-9+\-.]*:\/\/[^/]+/i, '');
  // Remove leftover variable-only paths (e.g. "/{basePath}") — they can't be matched literally.
  if (/^\/?\{[^}]+\}\/?$/.test(stripped)) return '';
  return stripped || '';
}

function normalizeBase(p) {
  if (!p) return '';
  const norm = normalizeUrl(p);
  if (norm === '/' || norm === '') return '';
  return norm;
}

function buildEndpoints(api) {
  const endpoints = [];
  const paths = api.paths || {};
  for (const [pathPattern, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    const pathItemDeprecated = pathItem.deprecated === true;
    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (!op || typeof op !== 'object') continue;
      endpoints.push({
        method: method.toUpperCase(),
        pathPattern,
        regex: pathToRegex(pathPattern),
        literalSegmentCount: literalSegmentCount(pathPattern),
        deprecated: pathItemDeprecated || op.deprecated === true,
      });
    }
  }
  return endpoints;
}
