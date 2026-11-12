# Shared Context — agent presets

A DeepSeek Harness bundle that adds four agent presets for working this
repository's issue tracker:

| Preset                        | Role                                                                                        | Tracker access              |
| ----------------------------- | ------------------------------------------------------------------------------------------- | --------------------------- |
| `shared-context-orchestrator` | Triages Issues, designs and delegates specialists, verifies their work, records the outcome | **Full MCP** (all 23 tools) |
| `shared-context-implementer`  | Writes and verifies one scoped change from a brief                                          | None                        |
| `shared-context-reviewer`     | Read-only review of a finished change with a verdict                                        | None                        |
| `shared-context-researcher`   | Answers one bounded question from repository and primary sources                            | None                        |

The orchestrator is the only Actor in the composition that reads or writes the
tracker. Specialists are deliberately tracker-free: their whole world is the
brief the orchestrator writes plus the repository on disk.

## Requirements

- The daemon for the current DSH home is reachable. A home with a
  `<DSH_HOME>/shared-context/` directory uses that profile instance; every
  other home uses the global daemon on `http://127.0.0.1:4319`. Run
  `npm run dsh:profiles` to see the resolved port and health.
- A DeepSeek Harness profile with `@deepseek-ai/dsh-web-app` (the agent-preset
  registry and roster UI) and the subagent seam. The Desktop profile qualifies.
- The daemon token, which the bundle resolves at activation. A home with a
  `<DSH_HOME>/shared-context/` directory uses that profile config; otherwise the
  bundle reads the platform global config:
  `%APPDATA%\shared-context\config.json` on Windows, or
  `$XDG_CONFIG_HOME/shared-context/config.json` (falling back to
  `~/.config/...`) elsewhere. `SHARED_CONTEXT_CONFIG` overrides both paths.
  The token is never copied into this repository.

## Install

From a Harness conversation, install the bundle by absolute directory:

```text
plugin_manager(action="install_bundle", target="/path/to/shared-context/dsh-preset")
```

Or install both bundles into every profile of every DSH home at once:

```sh
npm run dsh:install
npm run dsh:status
```

The install applies live. Presets appear in the roster immediately; a new
session picks one at creation, and a running session keeps the composition it
started with unless you reassign its preset.

## Use it

Start a new session, choose **Shared Context Orchestrator** in the preset picker,
and give it an Issue:

```text
Work SHC-42 to done. Ask before anything destructive.
```

The orchestrator identifies itself as `shared-context-orchestrator`, reads the
Project context and the Issue, claims it, writes one Comment with the plan, and
delegates. A typical path:

```text
identify -> get_project_context -> get_issue -> claim_issue
  -> subagent(agent_preset="shared-context-researcher",    brief: unknowns
  -> subagent(agent_preset="shared-context-implementer",   brief: scoped change
  -> subagent(agent_preset="shared-context-reviewer",      brief: verify the diff
  -> add_comment -> move_issue(review) -> move_issue(done)
```

The orchestrator keeps the Issue assigned to itself and names the specialist and
child id in handoff Comments, so the human can follow the child session.

### What each specialist can do

| Preset      | Files                                     | Shell | Web | Notes                                                      |
| ----------- | ----------------------------------------- | ----- | --- | ---------------------------------------------------------- |
| Implementer | read, write, edit                         | yes   | yes | Runs typecheck, lint, and the relevant tests               |
| Reviewer    | read only (`write: false`, `edit: false`) | yes   | no  | Mutating commands are forbidden by persona, not by sandbox |
| Researcher  | read only (`write: false`, `edit: false`) | no    | yes | Citations required                                         |

All three load `AGENTS.md` from the workspace and compact their own context.
They cannot delegate further: the orchestrator's `subagent` tool sets
`maxDepth: 1`.

## How it works

```text
Harness Host
  └─ preset shared-context-orchestrator
       ├─ dsh-persona ......... operating contract (workflow, invariants, brief anatomy)
       ├─ dsh-mcp-client ...... streamable HTTP -> <resolved profile or global daemon>/mcp
       │                         Authorization: Bearer <token from the same config>
       ├─ dsh-tool-subagent ... provider spawn, agent_preset allowlist, maxDepth 1
       └─ fs, shell, jobs, todo, ask-user, compaction
  └─ preset shared-context-implementer | reviewer | researcher
       └─ persona + scoped tools; no MCP client
```

- **One writer.** Only the orchestrator holds the token, so tracker mutations
  are attributable and serialized through one coordinator.
- **Explicit addressing.** Preset revisions can be shared by several sessions, so
  the persona requires `project` on project-scoped calls and `actor` on
  mutations instead of relying on the MCP session binding.
- **Token and URL at activation.** The `Authorization` and `url` fields are
  `!!js` expressions evaluated when the preset mounts. Resolution order is
  `SHARED_CONTEXT_URL` / `SHARED_CONTEXT_TOKEN`, then an explicit
  `SHARED_CONTEXT_CONFIG`, then `<DSH_HOME>/shared-context/config.json` when
  that directory exists, then the platform global config (default
  `http://127.0.0.1:4319`). A new session picks up a changed URL or token
  without a DSH restart; an existing session keeps its current MCP connection.
- **Fail closed.** A set-but-unreadable `SHARED_CONTEXT_CONFIG`, or a profile
  directory whose config is missing or invalid, does not borrow the global
  store: the URL falls back to `http://127.0.0.1:1` and the token expression
  yields `Bearer unavailable`. The row still activates, so the failure appears
  as a connection or 401 error instead of a broken preset. Regenerating a token
  needs a plugin reload (or a Harness restart) for an existing session.
- **Port follows the config.** A daemon moved off 4319 needs no bundle edit; the
  expressions read `port` from the same config file. `SHARED_CONTEXT_URL` wins
  when set.
- **Portable overrides.** `SHARED_CONTEXT_URL`, `SHARED_CONTEXT_TOKEN`, and
  `SHARED_CONTEXT_CONFIG` are honored by the expressions when set in the Harness
  process environment.

## Skills

Each preset can load skills through DSH's `skill` tool. The registry has no filter
primitive, so scoping is done by roots: every preset mounts
`dsh-skill-filesystem` with `includeDefaultRoots: false` and one
`customSkillDirs` entry pointing at `<agentsHome>/skill-sets/<preset id>`.

Two maps declare the catalog per preset:

| File                              | Covers                                                                                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dsh-preset/skills.json`          | the four `shared-context-*` presets declared here                                                                                                    |
| `dsh-preset/prebuilt-skills.json` | the nine built-in presets in the DSH profile (`architect`, `coder`, `database`, `devops`, `planner`, `researcher`, `reviewer`, `security`, `tester`) |

Build or verify the sets:

```sh
npm run dsh:skills           # link the named skills into ~/.agents/skill-sets/
npm run dsh:skills:status    # report missing or stale links
```

The nine built-in presets live in the profile patch, not in this bundle. Give them
the same treatment with:

```sh
npm run dsh:presets:skills:check   # which presets still lack a catalog
npm run dsh:presets:skills         # append the two rows, backup first
```

Both commands are idempotent and skip a preset that already mounts
`skill-filesystem` (the `equipe` orchestrator does). Re-run
`dsh:presets:skills` after `tools/apply-dsh-presets.py` writes a fresh preset
block into a profile.

`tool-skill` is what gives an agent the catalog _and_ the loader: a preset without
it has no `skill` tool at all, which is why hand-written prompts have to fall back
to reading `SKILL.md` from disk.

## Verification

The bundle ships one offline check that needs no browser:

```sh
node dsh-preset/scripts/check-mcp.mjs
```

It verifies the patch declares all four presets, the `url` and `Authorization`
expressions resolve the expected daemon, the daemon answers `/healthz`, the
token opens an MCP session, all 23 tools are registered, and a read-only
`list_projects` call succeeds. It resolves the live daemon with the same
precedence as the preset: `SHARED_CONTEXT_URL` / `SHARED_CONTEXT_CONFIG` when
set, then `<DSH_HOME>/shared-context/config.json`, then the global config. An
empty personal store is accepted; `list_projects` may return no Projects until
the first one is created in that instance. `SHARED_CONTEXT_URL`,
`SHARED_CONTEXT_TOKEN`, and `SHARED_CONTEXT_CONFIG` are accepted for a
non-default daemon.

After install, confirm the rows:

```text
plugin_manager(action="list_plugins")   # preset-shared-context-* should be enabled
```

A preset whose activation failed stays on the roster with its diagnostic; the
usual causes are a missing `@deepseek-ai/dsh-persona`/`dsh-mcp-client` package or
a daemon that was down long enough to exhaust the MCP reconnect budget.

## Configuration

| Knob                  | Where                                                                                                                    | Default                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| Daemon base URL       | `SHARED_CONTEXT_URL`, else `SHARED_CONTEXT_CONFIG`, else `<DSH_HOME>/shared-context/config.json`, else the global config | `http://127.0.0.1:4319`           |
| Bearer token          | `SHARED_CONTEXT_TOKEN`, else the same config order                                                                       | generated by each store           |
| Explicit config file  | `SHARED_CONTEXT_CONFIG`                                                                                                  | platform default                  |
| Profile config        | `<DSH_HOME>/shared-context/config.json` when that directory exists                                                       | skipped when absent               |
| DSH home              | `DSH_HOME` in the Harness process environment                                                                            | the home the session runs in      |
| Child presets offered | `allowedAgentPresets` on the `tool-subagent` row                                                                         | implementer, reviewer, researcher |
| Default child preset  | `agentPreset`                                                                                                            | `shared-context-implementer`      |
| Delegation depth      | `maxDepth` on the `tool-subagent` row                                                                                    | `1`                               |

To change the default child preset, the enabled specialists, the depth, or the
model behavior, edit `cordis.patch.yml` and reinstall the bundle. Presets are
declarations, not live settings: the Web editor's preset overrides do not apply
to these rows.

## Files

| File                    | Purpose                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `package.json`          | Bundle manifest: `dsh.bundle.patch` plus the `check` script.                                      |
| `cordis.patch.yml`      | Four `@deepseek-ai/dsh-agent-preset` declarations, their personas, tools, and the MCP client row. |
| `skills.json`           | Skill catalog for the four `shared-context-*` presets.                                            |
| `prebuilt-skills.json`  | Skill catalog for the nine built-in DSH presets.                                                  |
| `scripts/check-mcp.mjs` | Bundle and daemon verification, with no dependencies.                                             |
| `README.md`             | This document.                                                                                    |

## Limits

- **One orchestrator per home/store.** The preset resolves one daemon when it
  mounts and has no cross-home view. A session talks to the store for its DSH
  home; seeing both stores takes two sessions, one per home. Changing the
  resolved endpoint does not move an existing session's MCP connection.
- Children share the session working directory; parallel implementers must get
  disjoint scopes, which the persona requires but does not enforce.
- The reviewer's read-only posture is a persona contract: `write`/`edit` are
  removed from its tool set, but its shell tool can still run mutating commands.
  Run it in a checkout you are willing to inspect, not a locked one.
- The MCP client keeps one connection per preset revision; concurrent
  orchestrator sessions rely on explicit `project`/`actor` arguments, not on
  per-session MCP state.
- `wait_for_change` is available but the persona forbids using it to wait for
  children; completion notices are the intended wake-up.
