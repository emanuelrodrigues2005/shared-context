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

- The daemon for the current DSH home is reachable. A home with a
  `<DSH_HOME>/shared-context/` directory uses that profile instance; every
  other home uses the global daemon on `http://127.0.0.1:4319`. Run
  `npm run dsh:profiles` to see the resolved port and health.
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
       └─ <resolved daemon origin>/api/...  (+ X-CSRF-Token for mutations)

window.__DSH_SHARED_CONTEXT__ = { route: '/shared-context', baseUrl, home, source, version: 3 }
```

- **Home resolution.** The Host resolves the daemon when the row activates:
  1. `SHARED_CONTEXT_URL` from the environment;
  2. an explicit row `config.baseUrl` that is not `auto` and not the legacy
     `http://127.0.0.1:4319`, loopback only;
  3. `SHARED_CONTEXT_CONFIG`, an explicit config path;
  4. `<DSH_HOME>/shared-context/config.json` when that directory exists;
  5. the platform global config, defaulting to port `4319`.

  A set-but-unreadable `SHARED_CONTEXT_CONFIG`, or a profile directory whose
  config is missing or invalid, fails closed to `http://127.0.0.1:1` instead of
  silently proxying the global store. `DSH_HOME` falls back to `~/.dsh` for the
  lookup, but the displayed home is `null` unless the variable was set.

- **`auto` by default.** `cordis.patch.yml` ships `baseUrl: auto`. A loopback
  origin in the row pins that daemon and outranks the profile config; keep
  `auto` to follow the home.
- **Boot payload.** The Host injects `route`, `baseUrl`, `home`, `source`, and
  `version: 3`. `home` is `basename(DSH_HOME)` or `null`; the panel subtitle
  shows it after the version, so it is visible which store the panel talks to.
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
- **Loopback only.** Only `http(s)` origins on `127.0.0.1`, `localhost`, or
  `::1` are accepted; a non-loopback value is ignored or fails closed, never
  proxied.

## Configuration

`config.baseUrl` in `cordis.patch.yml` defaults to `auto`, which follows the
current DSH home. Set an explicit loopback origin only to pin this row to one
daemon; the legacy `http://127.0.0.1:4319` still resolves as "auto" for
already-installed patches. `SHARED_CONTEXT_URL` overrides everything, and
`SHARED_CONTEXT_CONFIG` selects an explicit config file. The proxy mount is
fixed at `/shared-context`; no per-activation path is configured.

## Verification

The plugin ships four offline checks that need no browser:

```sh
node dsh-plugin/scripts/check-host.mjs          # proxy behavior + live read-only daemon
node dsh-plugin/scripts/check-registration.mjs  # slot registrations and dictionary key parity
node dsh-plugin/scripts/check-render.mjs        # renders the cards, column, drawer, dialog, and page server-side
node dsh-plugin/scripts/check-css.mjs           # parses the injected stylesheet and rejects literal container colors
```

`check-host.mjs` covers GET forwarding, CSRF refresh/retry, cross-site and
traversal rejection, the resolution precedence and fail-closed cases, the boot
payload, and read-only calls to the real daemon. It resolves the live daemon
from `DSH_HOME` with the same precedence as the Host and tolerates an empty
profile store, so it passes before the first personal Project exists. The other
checks cover slot registrations and `en`/`zh` dictionary parity, the rendered
panel markup (safe Module colors, draggable cards, optimistic move),
and the stylesheet's theme-token use.

## Limits

- **One store per home.** The panel shows the daemon resolved for the current
  DSH home and has no cross-home view. Switching which store the panel reads
  needs a Host restart (or row off/on) plus a page reload; a client-only reload
  is not enough for a Host-side change.
- The panel polls every 20 seconds; it does not consume the daemon's SSE feed.
- Issue creation, Stage moves, drag-and-drop ordering, and commenting are
  available. Editing titles/descriptions and attachment upload remain in the
  standalone UI.
- Drag-and-drop uses the native HTML5 drag API, so it needs a pointer; the Issue
  drawer's Stage select is the keyboard path. Done/Cancelled columns appear when
  the persisted Closed toggle is on.
- The panel is read/write against the same SQLite database as every other
  client of that store, so mutations still follow the daemon's `expected_rev`
  rules. It does not see empresa Issues when it is pointed at the personal
  store, and vice versa.

## Files

| File                               | Purpose                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `package.json`                     | Bundle manifest: `dsh.bundle.patch`, `dsh.client`, exports, display resources.   |
| `cordis.patch.yml`                 | Inserts the `shared-context` Host row with `baseUrl: auto` and the home comment. |
| `index.js`                         | Host half: same-origin proxy, CSRF cache, boot-payload injection.                |
| `client.js`                        | Browser half: `sidebar.panellist` entry, `main` panel, styles, dictionaries.     |
| `icon.svg`                         | Original panel artwork (also shown in Plugin Manager).                           |
| `locale/en.json`, `locale/zh.json` | Display metadata for the plugin inventory.                                       |
