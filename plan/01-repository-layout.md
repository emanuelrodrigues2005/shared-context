# 01 — Repository Layout and Toolchain

**Status:** implemented (M0)

## Final tree

```
shared-context/
  AGENTS.md
  CONTEXT.md
  README.md
  package.json
  tsconfig.json
  tsconfig.server.json
  vite.config.ts
  eslint.config.js
  .prettierrc
  .gitignore
  .github/
    workflows/
      docs.yml
  docs/
    adr/
      0001-single-local-daemon.md
      ...
  plan/
    README.md
    00-overview.md
    ...
  src/
    server/
      index.ts                 # process entry point
      config.ts                # config + env resolution
      logger.ts
      db/
        connection.ts          # node:sqlite, pragmas, close
        migrations/
          001_init.sql
        migrate.ts
        repositories/
          projects.ts
          modules.ts
          actors.ts
          issues.ts
          links.ts
          attachments.ts
          comments.ts
          activities.ts
      domain/
        projects.ts
        modules.ts
        actors.ts
        issues.ts
        links.ts
        attachments.ts
        comments.ts
        activity.ts
        errors.ts
        validation.ts
      http/
        server.ts
        routes/
          projects.ts
          modules.ts
          issues.ts
          links.ts
          attachments.ts
          comments.ts
          actors.ts
          search.ts
          admin.ts
          setup.ts
        middleware/
          csrf.ts
          host.ts
          errors.ts
          mcp-auth.ts
        sse.ts
      mcp/
        server.ts              # StreamableHTTPServerTransport + session map
        session.ts
        tools/
          session.ts
          projects.ts
          issues.ts
          attachments.ts
          links.ts
          comments.ts
        shapes.ts
      services/
        attachments.ts         # copy, hash, dedupe, text sidecar
        pdf.ts                 # best-effort text extraction
        open-with-os.ts
        backup.ts
        export.ts
        paths.ts
        ids.ts
        clock.ts
    web/
      main.tsx
      App.tsx
      routes/
        BoardRoute.tsx
        IssueRoute.tsx
        SettingsRoute.tsx
      components/
        board/
        drawer/
        filters/
        command/
        common/
      api/
        client.ts
        queries.ts
        sse.ts
      state/
        local.ts               # theme, density, saved views
      styles/
        index.css
  test/
    docs.test.mjs              # existing docs guard
    plan.test.mjs              # plan index/spec guard
    schema.test.mjs            # executes the v1 schema from the spec
    unit/
    integration/
    concurrency/
    mcp/
    ui/
  scripts/
    dsh-bundles.mjs
    dsh-presets-skills.mjs
    dsh-profiles.mjs           # per-DSH-home config/data/token + status/start/stop
    dsh-skills.mjs
    install-startup.ps1
    install-startup.sh
    shared-context.service.in
    startup.mjs
    uninstall-startup.ps1
    uninstall-startup.sh
  dist/
    server/
    web/
```

`dist/` is generated and ignored. The data directory is outside the repository.

## Toolchain

| Concern       | Choice                                            |
| ------------- | ------------------------------------------------- |
| Runtime       | Node 24 (installed)                               |
| Language      | TypeScript, strict, ESM                           |
| Server        | Express 5                                         |
| MCP           | `@modelcontextprotocol/sdk`                       |
| Validation    | Zod                                               |
| Database      | `node:sqlite` (`DatabaseSync`)                    |
| Logging       | `pino` + daily file transport                     |
| Uploads       | `multer` or `busboy`                              |
| MIME sniffing | `file-type`                                       |
| IDs           | `uuid` v7                                         |
| PDF text      | `unpdf` (PDF.js wrapper); fallback to metadata    |
| Zip export    | `archiver`                                        |
| UI            | React, Vite, Tailwind, Radix primitives           |
| Drag and drop | `@dnd-kit/core`, `@dnd-kit/sortable`              |
| Server state  | `@tanstack/react-query`                           |
| Markdown      | `react-markdown`, `remark-gfm`, `rehype-sanitize` |
| Tests         | Vitest, Supertest, Playwright                     |

Use current stable versions at M0 and pin them in `package-lock.json`. Avoid native modules; `node:sqlite` is the reason the Windows install is simple.

## npm scripts

The core scripts are listed below; DSH and startup variants are additive. `npm test` runs the docs/plan guards before the application tests.

| Script                                                     | Command                                                                  | Purpose                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------- |
| `dev`                                                      | `concurrently "tsx watch src/server/index.ts" "vite"`                    | Server watch + Vite dev server                     |
| `build`                                                    | `tsc -p tsconfig.server.json && vite build`                              | Server to `dist/server`, UI to `dist/web`          |
| `start`                                                    | `node dist/server/index.js`                                              | Production daemon                                  |
| `test`                                                     | `npm run test:docs && vitest run && npm run test:ui`                     | All tests                                          |
| `test:docs`                                                | `node --test test/docs.test.mjs test/plan.test.mjs test/schema.test.mjs` | Docs/plan/schema guards                            |
| `test:unit`                                                | `vitest run test/unit`                                                   | Domain and repository tests                        |
| `test:integration`                                         | `vitest run test/integration`                                            | HTTP + SQLite tests                                |
| `test:concurrency`                                         | `vitest run test/concurrency`                                            | Parallel write tests                               |
| `test:mcp`                                                 | `vitest run test/mcp`                                                    | MCP client tests                                   |
| `test:ui`                                                  | `npm run build && playwright test`                                       | Browser smoke tests                                |
| `typecheck`                                                | `tsc --noEmit`                                                           | Type check both projects                           |
| `lint`                                                     | `eslint .`                                                               | Lint                                               |
| `format`                                                   | `prettier --write .`                                                     | Format                                             |
| `startup:install` / `startup:uninstall` / `startup:verify` | `node scripts/startup.mjs <action>`                                      | Logon startup dispatch                             |
| `dsh:install` / `dsh:uninstall` / `dsh:status`             | `node scripts/dsh-bundles.mjs <action>`                                  | Install/report both DSH bundles per home           |
| `dsh:skills` / `dsh:skills:status`                         | `node scripts/dsh-skills.mjs [--status]`                                 | Build/verify per-preset skill sets                 |
| `dsh:presets:skills` / `dsh:presets:skills:check`          | `node scripts/dsh-presets-skills.mjs [--check]`                          | Add skill rows to the built-in presets             |
| `dsh:profiles`                                             | `node scripts/dsh-profiles.mjs status`                                   | Status of every discovered DSH home                |
| `dsh:profiles:install`                                     | `node scripts/dsh-profiles.mjs install --home <name>`                    | Create config/data/token and start a home instance |
| `dsh:profiles:start` / `dsh:profiles:stop`                 | `node scripts/dsh-profiles.mjs <action> --home <name>`                   | Start/stop a home daemon                           |

## Configuration files

- `tsconfig.json` — base strict config for the workspace.
- `tsconfig.server.json` — `module: NodeNext`, `moduleResolution: NodeNext`, `outDir: dist/server`. Server imports use `.js` extensions.
- `vite.config.ts` — React plugin, Tailwind plugin, root `src/web`, build output `dist/web`, dev proxy for `/api`, `/mcp`, `/healthz`, and `/api/events` to `http://127.0.0.1:4319`.
- `eslint.config.js` — flat config, TypeScript + React rules.
- `.prettierrc` — single quotes, semicolons, print width 100.
- `.gitignore` — `node_modules/`, `dist/`, `coverage/`, `test-results/`, `playwright-report/`, `*.log`, `.env*`, `*.db*`, `data/`, `attachments/`, `backups/`, `logs/`, `Thumbs.db`, `.DS_Store`.
- `.github/workflows/ci.yml` — Node 24, `npm ci`, typecheck, lint, tests, and build on push and pull request.

## Environment variables

| Variable                  | Default                                | Purpose                                                                                                                |
| ------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `SHARED_CONTEXT_PORT`     | `4319`                                 | HTTP port                                                                                                              |
| `SHARED_CONTEXT_DATA_DIR` | `%LOCALAPPDATA%\shared-context`        | Data, attachments, backups, logs                                                                                       |
| `SHARED_CONTEXT_CONFIG`   | `%APPDATA%\shared-context\config.json` | Config file path                                                                                                       |
| `SHARED_CONTEXT_TOKEN`    | generated                              | MCP bearer token override                                                                                              |
| `DSH_HOME`                | set by DSH                             | DSH home; selects the profile config/data root for the plugin, preset, and profile CLI (not read by the daemon itself) |
| `LOG_LEVEL`               | `info`                                 | `trace`/`debug`/`info`/`warn`/`error`                                                                                  |

Tests set `SHARED_CONTEXT_DATA_DIR` to a temporary directory. Never read the real user data in tests.

A profile is selected by the environment plus the filesystem: when `<DSH_HOME>/shared-context/` exists, the plugin Host, the presets, and `scripts/dsh-profiles.mjs` use `<DSH_HOME>/shared-context/config.json` and the `<DSH_HOME>/shared-context` data root. A home without that directory resolves to the platform global config and data root. The profile's config file owns its `port` and `data_dir`; do not set `SHARED_CONTEXT_PORT` for a profile daemon. `SHARED_CONTEXT_CONFIG` remains the explicit override, and `SHARED_CONTEXT_URL` / `SHARED_CONTEXT_TOKEN` remain the plugin/preset environment overrides.

## Build and run model

- Development: `npm run dev` starts the API/MCP on 4319 and Vite on its own port with a proxy.
- Production: `npm run build`, then `npm start` or the Task Scheduler task.
- A profile instance runs the same built entry point with `SHARED_CONTEXT_CONFIG` pointing at its own config; it binds the port and data root from that file. One daemon per home, one shared global instance for every home without a profile directory.
- The server serves `dist/web` as static files and falls back to `index.html` for SPA routes, excluding `/api`, `/mcp`, and `/healthz`.
- The UI and API share an origin in production; no CORS.

## CI

CI (M0):

```yaml
name: ci
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test
      - run: npm run build
```

Playwright runs inside `npm test`; CI installs Chromium with `npx playwright install --with-deps chromium`.

## M0 acceptance criteria

- `package.json` exists with the scripts above; `npm install` succeeds on Windows.
- `npm run typecheck` passes.
- `npm run test:docs` passes.
- `npm run build` produces `dist/server/index.js` and `dist/web/index.html`.
- `npm start` binds `127.0.0.1:4319` and `/healthz` reports SQLite open and WAL mode.
- The data directory is created outside the repo and ignored by git.
- No native build step is required on a clean Windows machine.
