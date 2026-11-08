# 11 — Test Plan

**Status:** specified
**Depends on:** all specs
**Feeds:** every milestone

## Test pyramid

| Layer | Tool | What it proves |
|---|---|---|
| Docs/plan/schema guards | `node:test` | Glossary, ADRs, plan index, spec links, and executable v1 schema |
| Unit | Vitest | Domain rules, validation, key generation, progress, FTS helpers |
| Integration | Vitest + Supertest | HTTP routes, SQLite transactions, SSE, CSRF |
| Concurrency | Vitest + real HTTP | No lost updates, no double claims, idempotent creates |
| MCP | Vitest + MCP SDK client | Tool contracts, sessions, conflicts, attachments |
| UI | Playwright | Board, drawer, filters, conflicts, uploads |
| Manual | Windows checklist | Default-app opening, startup, backup/restore |

Coverage target: 80%+ for `src/server/domain` and `src/server/db`; no hard global gate in v1.

## Docs and plan guards

- `CONTEXT.md` exists, starts with `# Shared Context`, and contains every glossary term.
- Eight ADRs exist, each with a title.
- `plan/README.md` links every spec.
- Every spec exists and has a title.
- Milestones M0–M7 appear in the tracker.
- ADR links from the plan resolve.

- `node --test test/docs.test.mjs test/plan.test.mjs test/schema.test.mjs`
- The schema test executes the v1 DDL from `plan/02-data-model.md` in an in-memory database.

## Unit tests

| Area | Cases |
|---|---|
| Project | Key format `[A-Z][A-Z0-9]{1,5}`, duplicate key, immutable key, delete with Issues refused |
| Module | Slug generation, duplicate slug, rename keeps slug, delete in use refused |
| Actor | Case-folded unique name, `identify` creates/updates, `can_read_images` toggle |
| Issue create | Required title, defaults, key allocation, position append, parent same project, links validation, idempotency key |
| Issue update | Each field, null clears, no-op detection, description cap, title cap |
| Parent | Self-parent rejected, cycle rejected, cross-project rejected, valid hierarchy accepted |
| Progress | Direct children only, cancelled excluded, deleted excluded, zero children |
| Stage | Six values; unknown rejected; done/cancelled timestamps set and cleared |
| Blocked | Reason required, stage unchanged, same-reason no-op, unblock clears fields |
| Delete | Single, cascade, has-children error, batch restore, earlier batch not revived |
| FTS | Insert, update, soft delete, quoted query, malformed query |
| Activity | One row per mutation, append-only triggers, `actor_name` snapshot, JSON changes |
| Attachments | Extension/MIME allowlist, size cap, sanitize name, SHA-256, dedupe, text extraction fallback |
| Docs | Allowlist match, `..` rejection, symlink escape, 256 KB truncation |
| URL | `http`/`https` only, credentials rejected, length cap |
| Backup | Snapshot filename, retention pruning, attachment mirror does not delete |

## Integration tests

| Scenario | Expected |
|---|---|
| Create Project → Module → Issue → board | Issue appears once in the right column with key `KEY-1` |
| Update with stale `expected_rev` | 409, current Issue in the body, no rev change |
| Update with correct rev | 200, rev +1, one Activity row |
| No-op update | 200, `changed: false`, no Activity, rev unchanged |
| Move to done | `completed_at` set, `cancelled_at` null |
| Move out of done | `completed_at` cleared |
| Block/unblock | Stage unchanged; reason required; Activity recorded |
| Claim | Assignee set; backlog/todo → in_progress; review stays review |
| Release by non-owner | 403/conflict; no change |
| Delete parent without cascade | `has_children` with count |
| Cascade delete + restore | Subtree hidden then restored; earlier deletion stays deleted |
| Add attachment | File copied, metadata row, Activity, SSE |
| Duplicate attachment | Existing returned, `deduplicated: true`, no second row |
| Read non-vision image | Metadata, no image block |
| Read vision image | Image block plus summary |
| PDF text | Sidecar created; `read_attachment` returns text |
| Scanned PDF | Metadata with `text_status: failed` |
| Comment add/edit/delete | Own only; Activity events; Issue rev unchanged |
| Link add/remove | Activity; Issue rev unchanged |
| FTS search | Finds updated text; excludes deleted Issues |
| SSE replay | Reconnect from `Last-Event-ID` receives missed events |
| SSE gap > 1000 | `resync` event |
| CSRF missing | 403 |
| Foreign Origin | 403 |
| Foreign Host | 400/403 |
| `/mcp` without token | 401 |
| `/healthz` | 200, WAL |

## Concurrency tests

These run through the real HTTP API (and a subset through MCP) with `Promise.all`. They are the gate for M2/M3.

1. **Lost update**: create an Issue at `rev = 1`; fire 20 `PATCH` requests with `expected_rev = 1` and different titles. Assert exactly one 200, 19 × 409, final `rev = 2`, final title equals the winner.
2. **Claim race**: create an unassigned Issue; fire 20 `claim` requests from 20 Actors. Assert exactly one `claimed: true`, 19 `claim_conflict`, and exactly one Assignee in the DB.
3. **Move + update**: fire `move_issue` and `update_issue` with the same `expected_rev`. Assert one 200 and one 409, and that the winning change is fully applied.
4. **Idempotent create**: fire 10 `POST /api/issues` with the same `client_request_id`. Assert one Issue, nine `created: false`, and one key.
5. **Key allocation**: fire 50 creates in one Project. Assert numbers 1–50 with no gaps or duplicates.
6. **Waiters**: start `wait_for_change` at cursor N, commit a mutation after 100ms. Assert wake in <1s and the event id > N.
7. **Rollback**: force a constraint error after the rev update. Assert no Activity row and no persisted rev change.
8. **No-op**: fire 20 identical updates at the same rev. Assert one Activity row, or none after the first no-op, and `rev` stable.
9. **Delete/restore race**: delete a subtree while a child update is in flight. Assert either the update wins before deletion or returns `not_found`; no orphan Activity.
10. **SSE order**: commit 50 mutations sequentially; assert event ids are strictly increasing and no duplicates.

## MCP tests

Use the SDK client against a real HTTP server with a test token.

- Initialize, `identify`, `list_projects`, `get_project_context`.
- `create_issue` with links and a parent; `get_issue` includes children.
- `update_issue` with a stale rev returns `isError` and a parseable conflict payload.
- `claim_issue` race with two sessions: one winner.
- `wait_for_change` returns persisted events and wakes on a commit.
- `add_attachment` with a temp PNG; `read_attachment` as vision and non-vision Actors.
- `read_project_doc` allowed and refused paths.
- `delete_issue` with/without cascade.
- Missing token → 401; missing Actor → `actor_required`.
- Session reconnect: lose the session id, re-initialize, `identify` again.

## UI tests (Playwright)

**M7 status:** wired in `test/ui/smoke.spec.ts`; `npm run test:ui` builds the app and runs it, and `npm test` includes it. CI installs Chromium with `npx playwright install --with-deps chromium`; local runs use the same bundled Chromium via `npm run test:ui:install`, so no branded browser is needed on any platform.

- Load the board; six columns; Done/Cancelled collapse.
- Create an Issue from a column; Stage pre-filled.
- Drag a card to another column; reload and verify.
- Open the drawer via URL; edit description; Save.
- Simulate 409 on description save; draft preserved; reload banner.
- Block an Issue with a reason; card shows the badge; Stage unchanged.
- Add a comment; appears in Comments, not Activity content.
- Upload a PNG; thumbnail appears; click opens the OS handler (mock the server call).
- Filter by assignee + priority; URL updates; clear all.
- Command palette searches across Projects.
- Trash restores a deleted subtree.
- Keyboard: `n`, `Ctrl/Cmd+K`, `Esc`, dnd-kit keyboard move.

## Manual Windows checklist

1. Install and start at logon; reboot and log in; `/healthz` passes.
2. Attach a PNG with spaces and non-ASCII characters; click it; opens in the default image viewer.
3. Attach a PDF; click it; opens in the default PDF viewer.
4. Attach a scanned PDF; confirm "No extractable text".
5. Send an image to a vision-capable Reasonix session; confirm the model receives it.
6. Send the same image to a non-vision session; confirm metadata only.
7. Back up; stop; restore; verify board and attachments.
8. Delete a parent subtree; restore from Trash.
9. Kill the daemon while a board is open; restart; the UI reconnects and resyncs.
10. Fill the port with another process; confirm a clear startup error.

## Fixtures and isolation

- Tests use a temp `SHARED_CONTEXT_DATA_DIR`; never the real profile.
- A factory creates projects, actors, issues, links, attachments, and comments with deterministic IDs where useful.
- Attachment fixtures: a tiny PNG, a text PDF, a scanned/image-only PDF, a `.md`, an `.exe`, an SVG.
- Time is injected through a clock service so timestamps are deterministic.
- Each integration test resets the DB or uses a unique project key.

## CI

- Docs/plan guards run on every push and PR now.
- M0 adds `npm ci`, `npm run typecheck`, `npm test`.
- M2 adds the concurrency suite as a required job.
- UI automation runs as part of `npm test`; CI installs Chromium with `npx playwright install --with-deps chromium`.
- Windows-specific manual checks are documented, not CI-gated; a Windows runner can be added later for attachment/open tests.

## Acceptance criteria

- The docs/plan guards pass today.
- Every spec's acceptance criteria has at least one automated or manual test.
- The concurrency suite is deterministic (no sleeps except the waiter test).
- A failed test leaves no data in the real profile.
- `npm test` is the single command a future agent runs before claiming a milestone.
