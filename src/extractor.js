import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import { templateToPattern } from './util/path.js';

const traverse = _traverse.default ?? _traverse;

const AXIOS_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch', 'head', 'options']);
const FETCH_GLOBALS = new Set(['fetch']);
const FETCH_NAMESPACES = new Set(['globalThis', 'window', 'self']);

export function extractFromSource(filePath, source) {
  const ast = safeParse(filePath, source);
  if (!ast) return [];

  const axiosInstances = collectAxiosCreateInstances(ast);
  const calls = [];

  traverse(ast, {
    CallExpression(path) {
      const node = path.node;
      const callee = node.callee;
      const args = node.arguments || [];

      // axios.create(...) — handled as instance, not a real call
      if (isAxiosCreateCall(callee)) return;

      // 1. fetch(url, init?)
      if (isFetchCallee(callee)) {
        const call = handleFetch(node, args, filePath);
        if (call) calls.push(call);
        return;
      }

      // 2. axios(config) / axios.request(config)
      if (isAxiosFunctionCall(callee, axiosInstances)) {
        const call = handleAxiosConfig(node, args, filePath, axiosInstances);
        if (call) calls.push(call);
        return;
      }

      // 3. axios.<method>(url, config?) — including instance.<method>(...)
      const methodCall = matchAxiosMethodCall(callee, axiosInstances);
      if (methodCall) {
        const call = handleAxiosMethod(node, args, filePath, methodCall);
        if (call) calls.push(call);
      }
    },
  });

  return calls;
}

function safeParse(filePath, source) {
  const plugins = pickPlugins(filePath);
  try {
    return parse(source, {
      sourceType: 'unambiguous',
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      allowImportExportEverywhere: true,
      errorRecovery: true,
      plugins,
    });
  } catch {
    return null;
  }
}

function pickPlugins(filePath) {
  const lower = filePath.toLowerCase();
  const base = ['decorators-legacy', 'importAttributes', 'explicitResourceManagement'];
  if (lower.endsWith('.tsx')) return [...base, 'typescript', 'jsx'];
  if (lower.endsWith('.ts') || lower.endsWith('.mts') || lower.endsWith('.cts')) {
    return [...base, 'typescript'];
  }
  return [...base, 'jsx'];
}

function isAxiosCreateCall(callee) {
  return (
    callee?.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object?.type === 'Identifier' &&
    callee.object.name === 'axios' &&
    callee.property?.type === 'Identifier' &&
    callee.property.name === 'create'
  );
}

function collectAxiosCreateInstances(ast) {
  const map = new Map();
  traverse(ast, {
    VariableDeclarator(path) {
      const { id, init } = path.node;
      if (id?.type !== 'Identifier' || !init) return;
      if (init.type !== 'CallExpression' || !isAxiosCreateCall(init.callee)) return;
      const baseURL = readBaseURL(init.arguments?.[0]);
      map.set(id.name, baseURL);
    },
    AssignmentExpression(path) {
      const { left, right, operator } = path.node;
      if (operator !== '=' || left?.type !== 'Identifier' || !right) return;
      if (right.type !== 'CallExpression' || !isAxiosCreateCall(right.callee)) return;
      const baseURL = readBaseURL(right.arguments?.[0]);
      map.set(left.name, baseURL);
    },
  });
  return map;
}

function readBaseURL(arg) {
  if (!arg || arg.type !== 'ObjectExpression') return null;
  for (const prop of arg.properties) {
    if (prop.type !== 'ObjectProperty' || prop.computed) continue;
    const keyName = prop.key.type === 'Identifier' ? prop.key.name : prop.key.value;
    if (keyName !== 'baseURL') continue;
    const lit = readStringLike(prop.value);
    return lit?.kind === 'literal' ? lit.value : null;
  }
  return null;
}

function isFetchCallee(callee) {
  if (callee?.type === 'Identifier' && FETCH_GLOBALS.has(callee.name)) return true;
  if (
    callee?.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object?.type === 'Identifier' &&
    FETCH_NAMESPACES.has(callee.object.name) &&
    callee.property?.type === 'Identifier' &&
    callee.property.name === 'fetch'
  ) {
    return true;
  }
  return false;
}

function isAxiosFunctionCall(callee, instances) {
  if (callee?.type === 'Identifier') {
    return callee.name === 'axios' || instances.has(callee.name);
  }
  if (
    callee?.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object?.type === 'Identifier' &&
    (callee.object.name === 'axios' || instances.has(callee.object.name)) &&
    callee.property?.type === 'Identifier' &&
    callee.property.name === 'request'
  ) {
    return true;
  }
  return false;
}

function matchAxiosMethodCall(callee, instances) {
  if (
    callee?.type !== 'MemberExpression' ||
    callee.computed ||
    callee.object?.type !== 'Identifier' ||
    callee.property?.type !== 'Identifier'
  ) {
    return null;
  }
  const methodName = callee.property.name;
  if (!AXIOS_METHODS.has(methodName)) return null;
  const objName = callee.object.name;
  if (objName === 'axios') return { method: methodName.toUpperCase(), baseURL: null };
  if (instances.has(objName)) {
    return { method: methodName.toUpperCase(), baseURL: instances.get(objName) };
  }
  return null;
}

function handleFetch(node, args, filePath) {
  const url = readStringLike(args[0]);
  const { method, methodKind } = readFetchMethod(args[1]);
  return makeCall(filePath, node, method, methodKind, url, null);
}

function handleAxiosConfig(node, args, filePath, instances) {
  const callee = node.callee;
  let baseURL = null;
  if (callee?.type === 'Identifier' && instances.has(callee.name)) {
    baseURL = instances.get(callee.name);
  } else if (callee?.type === 'MemberExpression' && callee.object?.type === 'Identifier') {
    if (instances.has(callee.object.name)) baseURL = instances.get(callee.object.name);
  }
  const config = args[0];
  if (!config || config.type !== 'ObjectExpression') {
    return makeCall(filePath, node, null, 'dynamic', { kind: 'dynamic' }, baseURL);
  }
  let url = null;
  let method = 'GET';
  let methodKind = 'literal';
  for (const prop of config.properties) {
    if (prop.type !== 'ObjectProperty' || prop.computed) continue;
    const keyName = prop.key.type === 'Identifier' ? prop.key.name : prop.key.value;
    if (keyName === 'url') url = readStringLike(prop.value);
    else if (keyName === 'method') {
      const lit = readStringLike(prop.value);
      if (lit?.kind === 'literal') {
        method = String(lit.value).toUpperCase();
      } else {
        methodKind = 'dynamic';
        method = null;
      }
    }
  }
  if (!url) url = { kind: 'dynamic' };
  return makeCall(filePath, node, method, methodKind, url, baseURL);
}

function handleAxiosMethod(node, args, filePath, methodCall) {
  const url = readStringLike(args[0]);
  return makeCall(filePath, node, methodCall.method, 'literal', url, methodCall.baseURL);
}

function readFetchMethod(initNode) {
  if (!initNode) return { method: 'GET', methodKind: 'literal' };
  if (initNode.type !== 'ObjectExpression') {
    return { method: null, methodKind: 'dynamic' };
  }
  for (const prop of initNode.properties) {
    if (prop.type === 'SpreadElement') {
      return { method: null, methodKind: 'dynamic' };
    }
    if (prop.type !== 'ObjectProperty' || prop.computed) continue;
    const keyName = prop.key.type === 'Identifier' ? prop.key.name : prop.key.value;
    if (keyName !== 'method') continue;
    const lit = readStringLike(prop.value);
    if (lit?.kind === 'literal') return { method: String(lit.value).toUpperCase(), methodKind: 'literal' };
    return { method: null, methodKind: 'dynamic' };
  }
  return { method: 'GET', methodKind: 'literal' };
}

function readStringLike(node) {
  if (!node) return null;
  if (node.type === 'StringLiteral') return { kind: 'literal', value: node.value };
  if (node.type === 'TemplateLiteral') {
    const quasis = node.quasis.map((q) => q.value.cooked ?? q.value.raw);
    if (node.expressions.length === 0) {
      return { kind: 'literal', value: quasis.join('') };
    }
    const names = node.expressions.map((e) => (e.type === 'Identifier' ? e.name : null));
    return { kind: 'template', value: templateToPattern(quasis, names) };
  }
  return { kind: 'dynamic' };
}

function makeCall(filePath, node, method, methodKind, urlInfo, baseURL) {
  const loc = node.loc?.start || { line: 0, column: 0 };
  let url = '';
  let urlKind = 'dynamic';
  if (urlInfo && urlInfo.kind !== 'dynamic') {
    urlKind = urlInfo.kind;
    url = urlInfo.value;
    if (baseURL && url && (url.startsWith('/') || !/^[a-z][a-z0-9+\-.]*:\/\//i.test(url))) {
      const baseTrimmed = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL;
      const tail = url.startsWith('/') ? url : '/' + url;
      url = baseTrimmed + tail;
    }
  }
  return {
    file: filePath,
    line: loc.line,
    column: loc.column,
    method: method,
    methodKind: methodKind,
    url,
    urlKind,
  };
}
