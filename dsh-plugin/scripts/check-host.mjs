import { createServer } from 'node:http';
import { Readable, Writable } from 'node:stream';
import { apply, inject } from '../index.js';

if (inject[0] !== 'webServer') throw new Error('expected webServer injection');

/* ── mock shared-context daemon ─────────────────────────────────────────── */

let csrfCounter = 0;
const seen = [];
const mock = createServer((request, response) => {
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8');
    seen.push({ method: request.method, url: request.url, csrf: request.headers['x-csrf-token'] ?? null, body });

    if (request.url === '/healthz') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true, version: 'test-1.0.0' }));
      return;
    }
    if (request.url === '/api/csrf') {
      csrfCounter += 1;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true, token: `tkn${csrfCounter}` }));
      return;
    }
    if (request.url === '/api/projects') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true, items: [{ key: 'LLM', name: 'ia-soberana', counts: { total: 57 } }] }));
      return;
    }
    if (request.url === '/api/issues' && request.method === 'POST') {
      if (request.headers['x-csrf-token'] !== 'tkn2') {
        response.writeHead(403, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ ok: false, error: { code: 'csrf_invalid', message: 'stale token' } }));
        return;
      }
      response.writeHead(201, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true, created: true, issue: { key: 'LLM-99', echo: JSON.parse(body) } }));
      return;
    }
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: false, error: { code: 'not_found', message: 'mock: no route' } }));
  });
});

await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));
const mockPort = mock.address().port;

/* ── fake plugin context ────────────────────────────────────────────────── */

function mount(baseUrl) {
  const state = { route: null, injection: null };
  const ctx = {
    effect(fn) {
      fn();
      return () => {};
    },
    on(event, listener) {
      if (event === 'webserver/index-inject') state.injection = listener;
      return () => {};
    },
    webServer: {
      register(route) {
        if (route.kind !== 'prefix') throw new Error(`unexpected route kind ${route.kind}`);
        state.route = route;
        return () => {};
      },
    },
    logger: { debug() {} },
  };
  apply(ctx, { baseUrl });
  if (!state.route) throw new Error('plugin did not register a route');
  return state;
}

/* ── request harness ───────────────────────────────────────────────────── */

function call(route, url, { method = 'GET', body, headers = {} } = {}) {
  const request = Readable.from(body === undefined ? [] : [Buffer.from(body)]);
  request.method = method;
  request.url = url;
  request.headers = headers;

  const chunks = [];
  const response = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });
  let status = 0;
  let responseHeaders = {};
  response.writeHead = (code, headersOut = {}) => {
    status = code;
    responseHeaders = headersOut;
    return response;
  };
  response.end = (value) => {
    if (value !== undefined && value !== null && typeof value !== 'object') chunks.push(Buffer.from(value));
    Writable.prototype.end.call(response);
  };
  return new Promise((resolve, reject) => {
    response.on('finish', () => {
      resolve({ status, headers: responseHeaders, body: Buffer.concat(chunks).toString('utf8') });
    });
    response.on('error', reject);
    route.handler(request, response).catch(reject);
  });
}

/**
 * Record one check.
 *
 * @param {boolean} condition - the expectation.
 * @param {string} label - what is being checked, phrased as a statement.
 * @param {string} [hint] - remediation printed only when the check fails.
 */
function assert(condition, label, hint) {
  console.log(`${condition ? 'ok' : 'FAIL'} - ${label}`);
  if (!condition) {
    if (hint) console.error(`       ${hint}`);
    process.exitCode = 1;
  }
}

/* ── proxy behavior against the mock ───────────────────────────────────── */

const mockMount = mount(`http://127.0.0.1:${String(mockPort)}`);

const health = await call(mockMount.route, `${mockMount.route.path}/healthz`, {
  headers: { 'sec-fetch-site': 'same-origin', accept: 'application/json' },
});
assert(health.status === 200 && JSON.parse(health.body).version === 'test-1.0.0', 'forwards GET /healthz');

const projects = await call(mockMount.route, `${mockMount.route.path}/api/projects`, {
  headers: { 'sec-fetch-site': 'same-origin' },
});
assert(projects.status === 200 && JSON.parse(projects.body).items[0].key === 'LLM', 'forwards GET /api/projects');

const created = await call(mockMount.route, `${mockMount.route.path}/api/issues`, {
  method: 'POST',
  headers: { 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' },
  body: JSON.stringify({ project: 'LLM', title: 'From proxy' }),
});
const createdPayload = JSON.parse(created.body);
assert(created.status === 201 && createdPayload.issue.key === 'LLM-99', 'retries a stale CSRF token and creates');
assert(createdPayload.issue.echo.title === 'From proxy', 'forwards the JSON request body');
assert(seen.filter((entry) => entry.url === '/api/issues')[1].csrf === 'tkn2', 'retry carries the refreshed token');

const markerOnly = await call(mockMount.route, `${mockMount.route.path}/api/issues`, {
  method: 'POST',
  headers: { 'x-dsh-shared-context': '1', 'content-type': 'application/json' },
  body: JSON.stringify({ project: 'LLM', title: 'Marker only' }),
});
assert(markerOnly.status === 201, 'a marker-only mutation from the panel is accepted');

const noMarker = await call(mockMount.route, `${mockMount.route.path}/api/issues`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ project: 'LLM', title: 'No marker' }),
});
assert(
  noMarker.status === 403 && JSON.parse(noMarker.body).error.code === 'missing_marker',
  'a mutation without the marker or same-origin signal is rejected',
);

const crossSite = await call(mockMount.route, `${mockMount.route.path}/api/projects`, {
  headers: { 'sec-fetch-site': 'cross-site' },
});
assert(crossSite.status === 403 && JSON.parse(crossSite.body).error.code === 'cross_site_rejected', 'rejects cross-site requests');

const traversal = await call(mockMount.route, `${mockMount.route.path}/api/../admin/backup`, {
  headers: { 'sec-fetch-site': 'same-origin' },
});
assert(traversal.status === 404, 'rejects traversal and unsupported paths');

const notAllowed = await call(mockMount.route, `${mockMount.route.path}/mcp`, {
  headers: { 'sec-fetch-site': 'same-origin' },
});
assert(notAllowed.status === 404, 'does not proxy the MCP endpoint');

const badMethod = await call(mockMount.route, `${mockMount.route.path}/api/projects`, {
  method: 'OPTIONS',
  headers: { 'sec-fetch-site': 'same-origin' },
});
assert(badMethod.status === 405, 'rejects unsupported methods');

const legacyToken = await call(mockMount.route, `${mockMount.route.path}/0123456789abcdef0123456789abcdef/api/projects`, {
  headers: { 'sec-fetch-site': 'same-origin' },
});
assert(legacyToken.status === 200, 'accepts a legacy tokenized URL from a page loaded before a reload');

const wrongSegment = await call(mockMount.route, `${mockMount.route.path}/wrong-token/api/projects`, {
  headers: { 'sec-fetch-site': 'same-origin' },
});
assert(wrongSegment.status === 404, 'rejects a non-hex path segment');

const injectionTable = [];
mockMount.injection(injectionTable);
assert(injectionTable.length === 1 && injectionTable[0].kind === 'global', 'publishes one boot global');
assert(injectionTable[0].value.route === '/shared-context', 'boot global carries the stable mount');
assert(mockMount.route.path === '/shared-context', 'mounts the stable route');
assert(injectionTable[0].name === '__DSH_SHARED_CONTEXT__', 'boot global has the expected name');

/* ── read-only pass against the real daemon ────────────────────────────── */
// This pass needs a running daemon with at least one Project. Both failures are
// environment setup, not proxy defects, so say what to do instead of dumping a
// bare assertion.

const liveMount = mount('http://127.0.0.1:4319');
const liveHealth = await call(liveMount.route, `${liveMount.route.path}/healthz`, {
  headers: { 'sec-fetch-site': 'same-origin' },
});
assert(
  liveHealth.status === 200,
  'live daemon /healthz through the proxy',
  `Got HTTP ${liveHealth.status}. Start the daemon with "npm start" or the startup script, then retry.`,
);
const liveProjects = await call(liveMount.route, `${liveMount.route.path}/api/projects`, {
  headers: { 'sec-fetch-site': 'same-origin' },
});
const liveItems = liveProjects.status === 200 ? JSON.parse(liveProjects.body).items : [];
assert(
  liveProjects.status === 200,
  'live daemon /api/projects through the proxy',
  `Got HTTP ${liveProjects.status}. Check the daemon log for a startup error.`,
);
assert(
  Array.isArray(liveItems) && liveItems.length > 0,
  'live daemon has at least one Project',
  'Open http://127.0.0.1:4319, run the setup flow, then retry.',
);
const firstKey = liveItems[0]?.key;
const liveBoard = await call(liveMount.route, `${liveMount.route.path}/api/projects/${encodeURIComponent(firstKey)}/board?include_closed=false`, {
  headers: { 'sec-fetch-site': 'same-origin' },
});
const liveBoardPayload = liveBoard.status === 200 ? JSON.parse(liveBoard.body) : null;
assert(
  liveBoard.status === 200 &&
    Array.isArray(liveBoardPayload?.columns) &&
    liveBoardPayload.columns.length === 4,
  'live daemon board returns the four open stages',
  `Got HTTP ${liveBoard.status}. Start the daemon with a Project before running the live pass.`,
);

// Tolerate a missing board payload: the assertions above already reported it,
// and a TypeError here would hide the real message.
const liveIssueKey = (liveBoardPayload?.columns ?? []).flatMap((column) => column.issues)[0]?.key;
if (liveIssueKey !== undefined) {
  const liveIssue = await call(liveMount.route, `${liveMount.route.path}/api/issues/${encodeURIComponent(liveIssueKey)}`, {
    headers: { 'sec-fetch-site': 'same-origin' },
  });
  const liveIssuePayload = liveIssue.status === 200 ? JSON.parse(liveIssue.body) : null;
  assert(
    liveIssue.status === 200 &&
      liveIssuePayload?.issue?.key === liveIssueKey &&
      Array.isArray(liveIssuePayload.issue.activity),
    'live daemon Issue detail through the proxy',
    `Got HTTP ${liveIssue.status} for ${liveIssueKey}.`,
  );
}

mock.close();
console.log('done');
