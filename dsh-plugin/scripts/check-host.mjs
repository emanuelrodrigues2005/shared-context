import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { apply, inject, resolveDaemonSettings } from '../index.js';

if (inject[0] !== 'webServer') throw new Error('expected webServer injection');

/* ── mock shared-context daemon ─────────────────────────────────────────── */

let csrfCounter = 0;
const seen = [];
const mock = createServer((request, response) => {
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8');
    seen.push({
      method: request.method,
      url: request.url,
      csrf: request.headers['x-csrf-token'] ?? null,
      body,
    });

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
      response.end(
        JSON.stringify({
          ok: true,
          items: [{ key: 'LLM', name: 'ia-soberana', counts: { total: 57 } }],
        }),
      );
      return;
    }
    if (request.url === '/api/issues' && request.method === 'POST') {
      if (request.headers['x-csrf-token'] !== 'tkn2') {
        response.writeHead(403, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({ ok: false, error: { code: 'csrf_invalid', message: 'stale token' } }),
        );
        return;
      }
      response.writeHead(201, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          ok: true,
          created: true,
          issue: { key: 'LLM-99', echo: JSON.parse(body) },
        }),
      );
      return;
    }
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({ ok: false, error: { code: 'not_found', message: 'mock: no route' } }),
    );
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
    if (value !== undefined && value !== null && typeof value !== 'object')
      chunks.push(Buffer.from(value));
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

/* ── daemon resolution against temp homes ──────────────────────────────── */

function writeConfig(file, config) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

function checkResolver() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-context-host-check-'));
  const options = (env) => ({ env, platform: 'linux', homedir: base });
  try {
    const profileHome = path.join(base, 'pessoal');
    const profileRoot = path.join(profileHome, 'shared-context');
    writeConfig(path.join(profileRoot, 'config.json'), {
      port: 4320,
      token: 'profile-token',
      data_dir: profileRoot,
    });

    const profile = resolveDaemonSettings(undefined, options({ DSH_HOME: profileHome }));
    assert(
      profile.baseUrl === 'http://127.0.0.1:4320' &&
        profile.home === 'pessoal' &&
        profile.source === 'profile',
      'resolver: a home profile config wins over the global config',
      `Got ${profile.baseUrl} (${profile.source}).`,
    );

    const explicitUrl = resolveDaemonSettings(
      undefined,
      options({ DSH_HOME: profileHome, SHARED_CONTEXT_URL: 'http://127.0.0.1:9999' }),
    );
    assert(
      explicitUrl.baseUrl === 'http://127.0.0.1:9999' && explicitUrl.source === 'env',
      'resolver: SHARED_CONTEXT_URL outranks every config file',
      `Got ${explicitUrl.baseUrl} (${explicitUrl.source}).`,
    );

    const rowOverride = resolveDaemonSettings(
      'http://127.0.0.1:4444',
      options({ DSH_HOME: profileHome }),
    );
    assert(
      rowOverride.baseUrl === 'http://127.0.0.1:4444' && rowOverride.source === 'config',
      'resolver: an explicit plugin row origin pins the daemon',
      `Got ${rowOverride.baseUrl} (${rowOverride.source}).`,
    );

    const noConfigHome = path.join(base, 'sem-config');
    fs.mkdirSync(path.join(noConfigHome, 'shared-context'), { recursive: true });
    const failClosed = resolveDaemonSettings(undefined, options({ DSH_HOME: noConfigHome }));
    assert(
      failClosed.baseUrl === 'http://127.0.0.1:1' && failClosed.source === 'fail-closed',
      'resolver: a profile directory without a config fails closed instead of using the global store',
      `Got ${failClosed.baseUrl} (${failClosed.source}).`,
    );

    const explicitHome = path.join(base, 'empresa');
    fs.mkdirSync(explicitHome, { recursive: true });
    const explicitConfig = path.join(base, 'explicit-config.json');
    writeConfig(explicitConfig, {
      port: 4400,
      token: 'explicit-token',
      data_dir: path.join(base, 'explicit-data'),
    });
    const explicit = resolveDaemonSettings(
      undefined,
      options({ DSH_HOME: explicitHome, SHARED_CONTEXT_CONFIG: explicitConfig }),
    );
    assert(
      explicit.baseUrl === 'http://127.0.0.1:4400' && explicit.source === 'config',
      'resolver: SHARED_CONTEXT_CONFIG outranks the profile path',
      `Got ${explicit.baseUrl} (${explicit.source}).`,
    );

    const configHome = path.join(base, 'xdg-config');
    writeConfig(path.join(configHome, 'shared-context', 'config.json'), {
      port: 4450,
      token: 'global-token',
      data_dir: path.join(base, 'global-data'),
    });
    const global = resolveDaemonSettings(
      undefined,
      options({ DSH_HOME: explicitHome, XDG_CONFIG_HOME: configHome }),
    );
    assert(
      global.baseUrl === 'http://127.0.0.1:4450' && global.source === 'global',
      'resolver: a home without a profile directory falls back to the global config',
      `Got ${global.baseUrl} (${global.source}).`,
    );

    const fallbackHome = path.join(base, '.dsh');
    const fallbackRoot = path.join(fallbackHome, 'shared-context');
    writeConfig(path.join(fallbackRoot, 'config.json'), { port: 4460, token: 'fallback-token' });
    const fallback = resolveDaemonSettings(undefined, options({}));
    assert(
      fallback.baseUrl === 'http://127.0.0.1:4460' &&
        fallback.home === null &&
        fallback.source === 'profile',
      'resolver: an unset DSH_HOME checks ~/.dsh but reports no home label',
      `Got ${fallback.baseUrl} (home ${fallback.home}, ${fallback.source}).`,
    );

    writeConfig(path.join(profileRoot, 'config.json'), { port: 70000, token: 'profile-token' });
    const invalidPort = resolveDaemonSettings(undefined, options({ DSH_HOME: profileHome }));
    assert(
      invalidPort.baseUrl === 'http://127.0.0.1:1' && invalidPort.source === 'fail-closed',
      'resolver: an invalid profile port fails closed',
      `Got ${invalidPort.baseUrl} (${invalidPort.source}).`,
    );
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
}

checkResolver();

/* ── proxy behavior against the mock ───────────────────────────────────── */

const mockMount = mount(`http://127.0.0.1:${String(mockPort)}`);

const health = await call(mockMount.route, `${mockMount.route.path}/healthz`, {
  headers: { 'sec-fetch-site': 'same-origin', accept: 'application/json' },
});
assert(
  health.status === 200 && JSON.parse(health.body).version === 'test-1.0.0',
  'forwards GET /healthz',
);

const projects = await call(mockMount.route, `${mockMount.route.path}/api/projects`, {
  headers: { 'sec-fetch-site': 'same-origin' },
});
assert(
  projects.status === 200 && JSON.parse(projects.body).items[0].key === 'LLM',
  'forwards GET /api/projects',
);

const created = await call(mockMount.route, `${mockMount.route.path}/api/issues`, {
  method: 'POST',
  headers: { 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' },
  body: JSON.stringify({ project: 'LLM', title: 'From proxy' }),
});
const createdPayload = JSON.parse(created.body);
assert(
  created.status === 201 && createdPayload.issue.key === 'LLM-99',
  'retries a stale CSRF token and creates',
);
assert(createdPayload.issue.echo.title === 'From proxy', 'forwards the JSON request body');
assert(
  seen.filter((entry) => entry.url === '/api/issues')[1].csrf === 'tkn2',
  'retry carries the refreshed token',
);

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
assert(
  crossSite.status === 403 && JSON.parse(crossSite.body).error.code === 'cross_site_rejected',
  'rejects cross-site requests',
);

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

const legacyToken = await call(
  mockMount.route,
  `${mockMount.route.path}/0123456789abcdef0123456789abcdef/api/projects`,
  {
    headers: { 'sec-fetch-site': 'same-origin' },
  },
);
assert(
  legacyToken.status === 200,
  'accepts a legacy tokenized URL from a page loaded before a reload',
);

const wrongSegment = await call(
  mockMount.route,
  `${mockMount.route.path}/wrong-token/api/projects`,
  {
    headers: { 'sec-fetch-site': 'same-origin' },
  },
);
assert(wrongSegment.status === 404, 'rejects a non-hex path segment');

const injectionTable = [];
mockMount.injection(injectionTable);
assert(
  injectionTable.length === 1 && injectionTable[0].kind === 'global',
  'publishes one boot global',
);
assert(injectionTable[0].value.route === '/shared-context', 'boot global carries the stable mount');
assert(mockMount.route.path === '/shared-context', 'mounts the stable route');
assert(injectionTable[0].name === '__DSH_SHARED_CONTEXT__', 'boot global has the expected name');
const boot = injectionTable[0].value;
assert(boot.version === 3, 'boot global payload version is 3');
const expectedHome = process.env.DSH_HOME ? path.basename(process.env.DSH_HOME) : null;
assert(
  boot.home === expectedHome,
  'boot global carries the DSH home label',
  `Got ${JSON.stringify(boot.home)}, expected ${JSON.stringify(expectedHome)}.`,
);
assert(
  ['env', 'config', 'profile', 'global', 'fail-closed'].includes(boot.source),
  'boot global carries the resolution source',
  `Got ${JSON.stringify(boot.source)}.`,
);

/* ── read-only pass against the resolved daemon ────────────────────────── */
// This pass needs a running daemon; the board and Issue-detail assertions also
// need at least one Project. Missing environment setup is reported with the
// exact next command instead of a bare assertion.

const liveDaemon = resolveDaemonSettings(undefined);
console.log(
  `     resolved ${liveDaemon.baseUrl} (home ${liveDaemon.home ?? 'none'}, source ${liveDaemon.source})`,
);
const liveHint =
  liveDaemon.error !== undefined
    ? `${liveDaemon.error}. Provision this home with "npm run dsh:profiles:install -- --home ${
        liveDaemon.home ?? '<home>'
      }", then retry.`
    : `Start it with "npm run dsh:profiles:start -- --home ${
        liveDaemon.home ?? '<home>'
      }" or "npm start", then retry.`;

const liveMount = mount(liveDaemon.baseUrl);
const liveHealth = await call(liveMount.route, `${liveMount.route.path}/healthz`, {
  headers: { 'sec-fetch-site': 'same-origin' },
});
assert(
  liveHealth.status === 200,
  'live daemon /healthz through the proxy',
  `Got HTTP ${liveHealth.status} from ${liveDaemon.baseUrl}. ${liveHint}`,
);
const liveProjects = await call(liveMount.route, `${liveMount.route.path}/api/projects`, {
  headers: { 'sec-fetch-site': 'same-origin' },
});
const liveProjectsOk = liveProjects.status === 200;
const liveItems =
  liveProjectsOk && Array.isArray(JSON.parse(liveProjects.body).items)
    ? JSON.parse(liveProjects.body).items
    : [];
assert(
  liveProjectsOk,
  'live daemon /api/projects through the proxy',
  `Got HTTP ${liveProjects.status} from ${liveDaemon.baseUrl}. ${liveHint}`,
);

if (liveProjectsOk && liveItems.length === 0) {
  console.warn('warn live daemon has no Projects; skipping board and Issue-detail checks');
} else if (liveProjectsOk) {
  const firstKey = liveItems[0]?.key;
  const liveBoard = await call(
    liveMount.route,
    `${liveMount.route.path}/api/projects/${encodeURIComponent(firstKey)}/board?include_closed=false`,
    { headers: { 'sec-fetch-site': 'same-origin' } },
  );
  const liveBoardPayload = liveBoard.status === 200 ? JSON.parse(liveBoard.body) : null;
  assert(
    liveBoard.status === 200 &&
      Array.isArray(liveBoardPayload?.columns) &&
      liveBoardPayload.columns.length === 4,
    'live daemon board returns the four open stages',
    `Got HTTP ${liveBoard.status} from ${liveDaemon.baseUrl}. Create a Project before running the live pass.`,
  );

  // Tolerate a missing board payload: the assertion above already reported it,
  // and a TypeError here would hide the real message.
  const liveIssueKey = (liveBoardPayload?.columns ?? []).flatMap((column) => column.issues)[0]?.key;
  if (liveIssueKey !== undefined) {
    const liveIssue = await call(
      liveMount.route,
      `${liveMount.route.path}/api/issues/${encodeURIComponent(liveIssueKey)}`,
      { headers: { 'sec-fetch-site': 'same-origin' } },
    );
    const liveIssuePayload = liveIssue.status === 200 ? JSON.parse(liveIssue.body) : null;
    assert(
      liveIssue.status === 200 &&
        liveIssuePayload?.issue?.key === liveIssueKey &&
        Array.isArray(liveIssuePayload.issue.activity),
      'live daemon Issue detail through the proxy',
      `Got HTTP ${liveIssue.status} for ${liveIssueKey}.`,
    );
  }
}

mock.close();
console.log('done');
