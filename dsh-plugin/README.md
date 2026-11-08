# Shared Context — DeepSeek Harness plugin

A DSH bundle that surfaces this repository's daemon in the Harness Web UI:

- a **left-sidebar "Issues" entry** with an original glyph;
- a **Shared Context panel** on the `main` slot: Project chips, the six-Stage
  kanban board, Issue cards with their Module's color accent down the left edge,
  an Issue drawer (description, fields, children, links, attachments, comments,
  activity), drag-and-drop Stage moves and in-column reordering, comment
  posting, and a new-Issue dialog. The Closed toggle and selected Project
  survive switching Harness panels;
- a **Host-side same-origin proxy** at `/shared-context` so the browser half can
  read and mutate the daemon without adding CORS to `shared-context`.

The panel is a first-party React component inside the Harness page. It uses the
Harness locale service and `--dsw-alias-*` theme tokens, and it never embeds the
standalone Vite UI in an iframe.

## Requirements

- The daemon is reachable (default `http://127.0.0.1:4319`):
  `npm start`, or the `SharedContext` logon task.
- The project has been built at least once, because the panel's "Open full app"
  link targets the built Vite UI at the daemon origin.
- Run the offline checks from the repository root with the repo's dev
  dependencies installed; the bundle itself has no runtime dependencies.

## Install

From the Harness conversation, install the bundle with `plugin_manager` and the
absolute package directory as the target:

```text
plugin_manager(action="install_bundle", target="/path/to/shared-context/dsh-plugin")
```

Or install every bundle into every profile of every DSH home at once, without the
agent tool:

```sh
npm run dsh:install
npm run dsh:status
```

The bundle inserts one Host row (`shared-context`) and contributes one Client
module (`dsh-plugin-shared-context`). Reload the Web page once after install so
the browser module table picks up the new `client.js` and the boot global; the
**Issues** entry then appears in the sidebar's global-panel list.

## How it works

```text
browser (Harness origin)
  └─ GET/POST /shared-context/api/... → Host proxy (index.js)
       └─ http://127.0.0.1:4319/api/...  (+ X-CSRF-Token for mutations)

window.__DSH_SHARED_CONTEXT__ = { route: '/shared-context', baseUrl, version }   ← index injection
```

- **Stable mount.** The Host half mounts `/shared-context` on `ctx.webServer`
  and publishes the daemon origin with a `webserver/index-inject` row. The
  browser half uses the fixed mount, so a page that predates a plugin reload
  still reaches the current proxy; the Host also strips the hex segment of a
  legacy `/shared-context/<token>/api/...` URL from an older page.
- **CSRF stays Host-side.** The proxy reads `GET /api/csrf` once, attaches the
  token to mutations, and retries a `403 csrf_invalid` with a freshly fetched
  token. The browser never sees the token.
- **Mutation guard.** Cross-site `Sec-Fetch-Site` values are rejected, and a
  mutation must either carry the panel's `x-dsh-shared-context: 1` marker (a
  cross-origin form cannot set it) or present `Sec-Fetch-Site: same-origin`.
- **Surface allowlist.** Only `/healthz` and `/api/...` are proxied; `/mcp`,
  traversal segments, and non-HTTP methods are rejected, and no CORS headers
  are added.
- **Loopback only.** `baseUrl` accepts only `http(s)` origins on `127.0.0.1`,
  `localhost`, or `::1`; anything else falls back to the default.

## Configuration

The row's `config.baseUrl` (in `cordis.patch.yml`) may point at a different
loopback port. The random proxy mount path is generated per activation and does
not need configuration.

## Verification

The plugin ships two offline checks that need no browser:

```sh
node scripts/check-host.mjs          # proxy behavior against a mock daemon + live read-only daemon
node scripts/check-registration.mjs  # slot registrations and dictionary key parity
node scripts/check-render.mjs        # renders the cards, column, drawer, dialog, and page server-side
node scripts/check-css.mjs           # parses the injected stylesheet and rejects literal container colors
```

`check-host.mjs` covers GET forwarding, CSRF refresh/retry, cross-site and
traversal rejection, the boot payload, and read-only calls to the real daemon.
`check-registration.mjs` verifies the `main` key, the `sidebar.panellist` id,
and matching `en`/`zh` key sets. `check-render.mjs` checks that the panel's
markup renders, that Module colors are accepted only in safe hex form and land
on the card edge, that cards are draggable, that drop positions and the
optimistic move match the standalone board, and that the Closed toggle
round-trips through storage. `check-css.mjs` parses the stylesheet with PostCSS
and verifies container styling stays on theme tokens.

## Limits

- The panel polls every 20 seconds; it does not consume the daemon's SSE feed.
- Issue creation, Stage moves, drag-and-drop ordering, and commenting are
  available. Editing titles/descriptions and attachment upload remain in the
  standalone UI.
- Drag-and-drop uses the native HTML5 drag API, so it needs a pointer; the Issue
  drawer's Stage select is the keyboard path. Done/Cancelled columns appear when
  the persisted Closed toggle is on.
- The panel is read/write against the same SQLite database as every other
  client, so mutations still follow the daemon's `expected_rev` rules.

## Files

| File | Purpose |
| --- | --- |
| `package.json` | Bundle manifest: `dsh.bundle.patch`, `dsh.client`, exports, display resources. |
| `cordis.patch.yml` | Inserts the `shared-context` Host row and its `baseUrl`. |
| `index.js` | Host half: same-origin proxy, CSRF cache, boot-payload injection. |
| `client.js` | Browser half: `sidebar.panellist` entry, `main` panel, styles, dictionaries. |
| `icon.svg` | Original panel artwork (also shown in Plugin Manager). |
| `locale/en.json`, `locale/zh.json` | Display metadata for the plugin inventory. |
