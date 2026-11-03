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

- The daemon is reachable (default `http://127.0.0.1:4319`): `npm start`, or the
  `SharedContext` logon task.
- A DeepSeek Harness profile with `@deepseek-ai/dsh-web-app` (the agent-preset
  registry and roster UI) and the subagent seam. The Desktop profile qualifies.
- The daemon token, which the bundle reads from the daemon's own config file:
  `%APPDATA%\shared-context\config.json` on Windows, or
  `$XDG_CONFIG_HOME/shared-context/config.json` (falling back to
  `~/.config/...`) elsewhere. The token is never copied into this repository.

## Install

From a Harness conversation, install the bundle by absolute directory:

```text
plugin_manager(action="install_bundle", target="C:\Users\<you>\Documents\shared-context\dsh-preset")
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
       ├─ dsh-mcp-client ...... streamable HTTP -> 127.0.0.1:4319/mcp
       │                         Authorization: Bearer <token read at activation>
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
- **Token at activation.** The `Authorization` header is a `!!js` expression
  that reads the daemon config when the preset loads. Regenerating the token
  therefore needs a plugin reload (or a Harness restart), not an edit here.
- **Portable overrides.** `SHARED_CONTEXT_URL`, `SHARED_CONTEXT_TOKEN`, and
  `SHARED_CONTEXT_CONFIG` are honored by the expression when set in the Harness
  process environment.

## Verification

The bundle ships one offline check that needs no browser:

```sh
node dsh-preset/scripts/check-mcp.mjs
```

It verifies the patch declares all four presets, the daemon answers `/healthz`,
the token opens an MCP session, all 23 tools are registered, and a read-only
`list_projects` call succeeds. It also accepts `SHARED_CONTEXT_URL` and
`SHARED_CONTEXT_TOKEN` for a non-default daemon.

After install, confirm the rows:

```text
plugin_manager(action="list_plugins")   # preset-shared-context-* should be enabled
```

A preset whose activation failed stays on the roster with its diagnostic; the
usual causes are a missing `@deepseek-ai/dsh-persona`/`dsh-mcp-client` package or
a daemon that was down long enough to exhaust the MCP reconnect budget.

## Configuration

| Knob                  | Where                                                                                            | Default                           |
| --------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------- |
| Daemon base URL       | `SHARED_CONTEXT_URL` in the Harness environment, else the `url` expression in `cordis.patch.yml` | `http://127.0.0.1:4319`           |
| Bearer token          | `SHARED_CONTEXT_TOKEN`, else the daemon config file                                              | generated by the daemon           |
| Explicit config file  | `SHARED_CONTEXT_CONFIG`                                                                          | platform default                  |
| Child presets offered | `allowedAgentPresets` on the `tool-subagent` row                                                 | implementer, reviewer, researcher |
| Default child preset  | `agentPreset`                                                                                    | `shared-context-implementer`      |
| Delegation depth      | `maxDepth` on the `tool-subagent` row                                                            | `1`                               |

To change the default child preset, the enabled specialists, the depth, or the
model behavior, edit `cordis.patch.yml` and reinstall the bundle. Presets are
declarations, not live settings: the Web editor's preset overrides do not apply
to these rows.

## Files

| File                    | Purpose                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `package.json`          | Bundle manifest: `dsh.bundle.patch` plus the `check` script.                                      |
| `cordis.patch.yml`      | Four `@deepseek-ai/dsh-agent-preset` declarations, their personas, tools, and the MCP client row. |
| `scripts/check-mcp.mjs` | Bundle and daemon verification, with no dependencies.                                             |
| `README.md`             | This document.                                                                                    |

## Limits

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
