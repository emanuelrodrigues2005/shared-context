#!/usr/bin/env node
// Offline checks for the Shared Context preset bundle.
//
// 1. The bundle declares the four expected presets and wires the MCP client to
//    the local daemon.
// 2. The daemon is reachable and the token from its config file opens an MCP
//    session that lists the expected tools.
//
// No dependencies beyond the built daemon: the config path and token resolution
// is imported from `dist/server/config.js` so this check can never drift from
// the daemon it is verifying. Run `npm run build` first.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const patchPath = path.resolve(here, '..', 'cordis.patch.yml');
const defaultBaseUrl = 'http://127.0.0.1:4319';

let resolveConfigPath;
let readConfigFile;
try {
  ({ resolveConfigPath, readConfigFile } = await import(
    pathToFileURL(path.resolve(here, '..', '..', 'dist', 'server', 'config.js')).href
  ));
} catch (error) {
  console.error(`FAIL cannot load dist/server/config.js — run "npm run build" first`);
  console.error(`     ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const PRESET_IDS = [
  'shared-context-orchestrator',
  'shared-context-implementer',
  'shared-context-reviewer',
  'shared-context-researcher',
];

const ORCHESTRATOR_TOOLS = [
  'identify',
  'wait_for_change',
  'list_projects',
  'get_project_context',
  'read_project_doc',
  'create_module',
  'create_issue',
  'get_issue',
  'list_issues',
  'get_board',
  'update_issue',
  'move_issue',
  'claim_issue',
  'release_issue',
  'block_issue',
  'unblock_issue',
  'delete_issue',
  'add_attachment',
  'remove_attachment',
  'read_attachment',
  'add_link',
  'remove_link',
  'add_comment',
];

let failures = 0;

function pass(message) {
  console.log(`ok   ${message}`);
}

function fail(message, detail) {
  failures += 1;
  console.error(`FAIL ${message}`);
  if (detail) console.error(`     ${detail}`);
}

function resolveDaemon() {
  const explicitUrl = process.env.SHARED_CONTEXT_URL;
  const explicitToken = process.env.SHARED_CONTEXT_TOKEN;
  let fileConfig = {};
  const file = resolveConfigPath();
  try {
    fileConfig = readConfigFile(file);
  } catch {
    // Reported below when neither an explicit token nor the file provides one.
  }
  const port = fileConfig.port ?? 4319;
  return {
    baseUrl: explicitUrl ?? `http://127.0.0.1:${port}`,
    token: explicitToken ?? fileConfig.token,
    file,
  };
}

function checkBundle() {
  let patch;
  try {
    patch = fs.readFileSync(patchPath, 'utf8');
  } catch (error) {
    fail(`cannot read ${patchPath}`, error.message);
    return;
  }
  for (const id of PRESET_IDS) {
    if (patch.includes(`id: ${id}`)) pass(`preset declared: ${id}`);
    else fail(`preset missing from cordis.patch.yml: ${id}`);
  }
  if (patch.includes('serverName: shared_context')) pass('MCP server name: shared_context');
  else fail('cordis.patch.yml does not name the shared_context MCP server');
  for (const id of PRESET_IDS.slice(1)) {
    if (patch.includes(`- ${id}`)) pass(`agent_preset offered: ${id}`);
    else fail(`agent_preset allowlist is missing: ${id}`);
  }
  if (patch.includes('transport: streamable-http')) pass('MCP transport: streamable-http');
  else fail('cordis.patch.yml does not declare the streamable-http transport');
}

async function rpc(url, token, body, sessionId) {
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    authorization: `Bearer ${token}`,
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { response, text, json };
}

async function checkDaemon({ baseUrl, token, file }) {
  let health;
  try {
    health = await fetch(`${baseUrl}/healthz`, { signal: AbortSignal.timeout(3000) });
  } catch (error) {
    fail(`daemon is not reachable at ${baseUrl}`, error.message);
    console.error('     Start it with `npm start`, or the SharedContext logon task.');
    return;
  }
  if (!health.ok) fail(`healthz returned ${health.status}`);
  else pass(`daemon reachable at ${baseUrl}`);

  if (!token) {
    fail('no bearer token found', `expected a token in ${file} or SHARED_CONTEXT_TOKEN`);
    return;
  }

  const url = `${baseUrl}/mcp`;
  const initialize = await rpc(url, token, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'dsh-preset-check', version: '0.1.0' },
    },
  });
  if (initialize.response.status === 401) {
    fail(
      'daemon rejected the token (401)',
      `token source: ${file}; regenerate it and reload the preset`,
    );
    return;
  }
  if (!initialize.response.ok || initialize.json?.error) {
    fail(
      `initialize failed with HTTP ${initialize.response.status}`,
      initialize.json?.error?.message ?? initialize.text.slice(0, 300),
    );
    return;
  }
  const sessionId = initialize.response.headers.get('mcp-session-id');
  if (!sessionId) {
    fail('initialize returned no mcp-session-id header');
    return;
  }
  pass(`MCP session opened (protocol ${initialize.json?.result?.protocolVersion ?? 'unknown'})`);

  await rpc(url, token, { jsonrpc: '2.0', method: 'notifications/initialized' }, sessionId);

  const listed = await rpc(url, token, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, sessionId);
  if (!listed.json?.result?.tools) {
    fail(
      `tools/list failed with HTTP ${listed.response.status}`,
      listed.json?.error?.message ?? listed.text.slice(0, 300),
    );
    return;
  }
  const names = new Set(listed.json.result.tools.map((tool) => tool.name));
  const missing = ORCHESTRATOR_TOOLS.filter((name) => !names.has(name));
  const extra = [...names].filter((name) => !ORCHESTRATOR_TOOLS.includes(name));
  if (missing.length) fail(`tools missing: ${missing.join(', ')}`);
  else pass(`all ${ORCHESTRATOR_TOOLS.length} tracker tools are registered`);
  if (extra.length) console.warn(`warn unexpected extra tools: ${extra.join(', ')}`);

  const projects = await rpc(
    url,
    token,
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'list_projects', arguments: {} },
    },
    sessionId,
  );
  const payload = projects.json?.result?.content?.[0]?.text;
  if (projects.json?.result?.isError) fail('list_projects call failed', payload);
  else pass('read-only tools/call succeeds (list_projects)');

  await fetch(url, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}`, 'mcp-session-id': sessionId },
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}

async function main() {
  console.log('Shared Context preset checks\n');
  console.log('-- bundle');
  checkBundle();
  console.log('\n-- daemon');
  await checkDaemon(resolveDaemon());
  console.log('');
  if (failures) {
    console.error(`${failures} check(s) failed`);
    process.exitCode = 1;
    return;
  }
  console.log('all checks passed');
}

await main();
