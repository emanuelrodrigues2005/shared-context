import { Readable } from 'node:stream';

/**
 * Host half of the Shared Context bundle.
 *
 * The shared-context daemon (127.0.0.1:4319) answers its JSON API with a
 * loopback-only Host guard and no CORS headers, so the browser panel cannot
 * call it cross-origin. This plugin mounts a same-origin proxy at
 * `/shared-context` and publishes its mount and daemon origin to the page as a
 * boot global. Mutations need the daemon's CSRF token, which stays on this
 * side: the browser sends only JSON to the proxy.
 *
 * The mount path is deliberately stable. A random per-activation path proved
 * fragile: a page that predates a plugin reload keeps the old path in its boot
 * payload and receives 404 from the catch-all. The fixed mount plus the
 * same-origin/`Sec-Fetch-Site` guard and the marker-header requirement on
 * mutations provides the CSRF protection that the unguessable path was meant
 * to add, without coupling the browser half to a token that can rotate.
 */

const DEFAULT_BASE_URL = 'http://127.0.0.1:4319';
const ROUTE = '/shared-context';
const BOOT_GLOBAL = '__DSH_SHARED_CONTEXT__';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PATCH', 'DELETE']);
const MAX_REQUEST_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15000;
/** Legacy pre-stable-mount URLs carry a hex capability segment after the root. */
const LEGACY_TOKEN = /^\/([0-9a-f]{16,64})(?=\/|$)/;

export const inject = ['webServer'];

/**
 * Resolve the daemon origin from the row's config.
 *
 * Only loopback HTTP origins are accepted: the plugin exists to surface a
 * local daemon, and a remote origin would turn the proxy into an exfiltration
 * path for every issue in the local database.
 *
 * @param {unknown} value - the `baseUrl` field of the row config.
 * @returns {string} one normalized origin without a trailing slash.
 */
function resolveBaseUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') return DEFAULT_BASE_URL;
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return DEFAULT_BASE_URL;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return DEFAULT_BASE_URL;
  if (!LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) return DEFAULT_BASE_URL;
  return url.origin;
}

/**
 * Whether an upstream path is part of the supported surface.
 *
 * @param {string} path - path below the proxy mount.
 * @returns {boolean} true for `/healthz` and every `/api/...` path.
 */
function isAllowedUpstreamPath(path) {
  return path === '/healthz' || path === '/api' || path.startsWith('/api/');
}

/**
 * Whether a decoded path could escape the proxy mount.
 *
 * @param {string} path - the raw path below the proxy mount.
 * @returns {boolean} true for dot segments or encoded dot segments.
 */
function hasTraversal(path) {
  const lower = path.toLowerCase();
  if (lower.includes('%2e') || lower.includes('%2f') || lower.includes('%5c')) return true;
  return lower.split('/').some((segment) => segment === '.' || segment === '..');
}

/**
 * Send one JSON response.
 *
 * @param {import('node:http').ServerResponse} response - the owning response.
 * @param {number} status - HTTP status.
 * @param {unknown} payload - JSON-serializable body.
 */
function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(body);
}

/**
 * Read a bounded request body.
 *
 * @param {import('node:http').IncomingMessage} request - the proxy request.
 * @returns {Promise<Buffer>} the collected body.
 */
async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) {
      throw Object.assign(new Error('Request body is too large'), { statusCode: 413 });
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Mount the proxy and publish its route to the page.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - the Host plugin context.
 * @param {Record<string, unknown>} [config] - the row config.
 */
export function apply(ctx, config) {
  const baseUrl = resolveBaseUrl(config?.baseUrl);

  /** @type {string | null} */
  let csrfToken = null;

  /**
   * Read the daemon's CSRF token, caching it for subsequent mutations.
   *
   * @param {boolean} force - discard the cached value first.
   * @returns {Promise<string>} the current daemon token.
   */
  async function csrf(force = false) {
    if (csrfToken !== null && !force) return csrfToken;
    const response = await fetch(`${baseUrl}/api/csrf`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      throw new Error(`shared-context: /api/csrf answered ${response.status}`);
    }
    const payload = await response.json();
    if (typeof payload?.token !== 'string' || payload.token === '') {
      throw new Error('shared-context: /api/csrf did not return a token');
    }
    csrfToken = payload.token;
    return csrfToken;
  }

  /**
   * Call the daemon once, optionally supplying the CSRF token.
   *
   * @param {string} target - absolute upstream URL.
   * @param {string} method - HTTP method.
   * @param {HeadersInit} headers - forwarded headers.
   * @param {Buffer | undefined} body - request body for mutations.
   * @param {boolean} withCsrf - whether to attach the CSRF token.
   * @returns {Promise<Response>} the upstream response.
   */
  async function callUpstream(target, method, headers, body, withCsrf) {
    const send = (tokenValue) => {
      const outgoing = new Headers(headers);
      if (tokenValue !== null && tokenValue !== undefined) {
        outgoing.set('x-csrf-token', tokenValue);
      }
      return fetch(target, {
        method,
        headers: outgoing,
        body: body === undefined || method === 'GET' || method === 'HEAD' ? undefined : body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: 'error',
      });
    };

    const first = await send(withCsrf ? csrfToken : null);
    if (!withCsrf || first.status !== 403) return first;

    const text = await first.clone().text();
    if (!text.includes('csrf_invalid')) return first;

    await first.body?.cancel();
    csrfToken = null;
    return send(await csrf(true));
  }

  /**
   * Forward one request to the shared-context daemon.
   *
   * @param {import('node:http').IncomingMessage} request - the browser request.
   * @param {import('node:http').ServerResponse} response - the browser response.
   */
  async function proxy(request, response) {
    const method = (request.method ?? 'GET').toUpperCase();
    if (!ALLOWED_METHODS.has(method)) {
      sendJson(response, 405, {
        ok: false,
        error: { code: 'method_not_allowed', message: `Unsupported method ${method}` },
      });
      return;
    }

    const fetchSite = request.headers['sec-fetch-site'];
    if (typeof fetchSite === 'string' && fetchSite !== 'same-origin' && fetchSite !== 'none') {
      sendJson(response, 403, {
        ok: false,
        error: { code: 'cross_site_rejected', message: 'Cross-site requests are rejected' },
      });
      return;
    }

    const mutating = method !== 'GET' && method !== 'HEAD';
    const marker = request.headers['x-dsh-shared-context'];
    if (mutating && marker !== '1' && fetchSite !== 'same-origin') {
      sendJson(response, 403, {
        ok: false,
        error: {
          code: 'missing_marker',
          message: 'Mutations require the Shared Context marker header',
        },
      });
      return;
    }

    let url;
    try {
      url = new URL(request.url ?? '/', 'http://127.0.0.1');
    } catch {
      sendJson(response, 400, {
        ok: false,
        error: { code: 'invalid_url', message: 'Malformed request URL' },
      });
      return;
    }

    if (url.pathname !== ROUTE && !url.pathname.startsWith(`${ROUTE}/`)) {
      sendJson(response, 404, {
        ok: false,
        error: { code: 'not_found', message: 'Unknown Shared Context route' },
      });
      return;
    }

    let below = url.pathname.slice(ROUTE.length) || '/';
    // Accept a pre-stable-mount URL from a page that loaded before a plugin
    // reload: the hex segment is no longer a capability, so it is ignored.
    const legacy = LEGACY_TOKEN.exec(below);
    if (legacy !== null) below = below.slice(legacy[0].length) || '/';

    if (hasTraversal(below) || !isAllowedUpstreamPath(below)) {
      sendJson(response, 404, {
        ok: false,
        error: { code: 'not_found', message: `Unsupported Shared Context path: ${below}` },
      });
      return;
    }

    const headers = new Headers();
    headers.set('accept', typeof request.headers.accept === 'string' ? request.headers.accept : 'application/json');
    const contentType = request.headers['content-type'];
    if (typeof contentType === 'string') headers.set('content-type', contentType);

    let body;
    try {
      body = method === 'GET' || method === 'HEAD' ? undefined : await readBody(request);
    } catch (error) {
      const status = error && typeof error === 'object' && 'statusCode' in error ? Number(error.statusCode) : 400;
      sendJson(response, status, {
        ok: false,
        error: { code: 'invalid_body', message: error instanceof Error ? error.message : 'Invalid body' },
      });
      return;
    }

    let upstream;
    try {
      const needsCsrf = method !== 'GET' && method !== 'HEAD';
      if (needsCsrf) headers.set('x-csrf-token', await csrf());
      upstream = await callUpstream(`${baseUrl}${below}${url.search}`, method, headers, body, needsCsrf);
    } catch (error) {
      sendJson(response, 502, {
        ok: false,
        error: {
          code: 'shared_context_unreachable',
          message: `Cannot reach the Shared Context daemon at ${baseUrl}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      });
      return;
    }

    if (upstream.status === 204 || upstream.body === null) {
      response.writeHead(upstream.status, { 'cache-control': 'no-store' });
      response.end();
      return;
    }

    const responseHeaders = {
      'content-type': upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    };
    const disposition = upstream.headers.get('content-disposition');
    if (disposition !== null) responseHeaders['content-disposition'] = disposition;
    const length = upstream.headers.get('content-length');
    if (length !== null) responseHeaders['content-length'] = length;

    response.writeHead(upstream.status, responseHeaders);
    Readable.fromWeb(upstream.body).pipe(response);
  }

  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: ROUTE, handler: proxy }),
    'shared-context: same-origin proxy',
  );

  ctx.effect(
    () =>
      ctx.on('webserver/index-inject', (table) => {
        table.push({
          kind: 'global',
          name: BOOT_GLOBAL,
          value: { route: ROUTE, baseUrl, version: 2 },
        });
      }),
    'shared-context: boot payload',
  );

  ctx.logger?.debug?.(`shared-context: proxy mounted at ${ROUTE} for ${baseUrl}`);
}
