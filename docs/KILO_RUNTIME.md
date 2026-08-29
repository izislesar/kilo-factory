# Kilo runtime integration

Researched baseline: Kilo upstream `Kilo-Org/kilocode` main at commit `5e02825c8c5318912e39fe0ceee46793589fae3f` on 2026-08-29. The executable probe in `scripts/probe-kilo-runtime.ts` verified installed Kilo `7.5.6` on 2026-08-29; upstream APIs can change.

Run the contract probe from the repository root while the visible role session exists:

```bash
KILO_RUNTIME_SEED_SESSION_ID=<visible-seed-session-id> bun scripts/probe-kilo-runtime.ts
```

The probe starts only password-protected loopback servers, uses the seed's read-back configuration rather than model CLI flags, and fails if the named seed does not expose an agent, provider, model, and variant. A successful run verifies deletion of every probe session and removes its temporary worktrees and plugin fixtures; failure cleanup is bounded and fails visibly rather than hiding a leaked session or process.

## Verified upstream capabilities

From Kilo plugin documentation:

- Plugins are TypeScript/JavaScript modules loaded at startup.
- Global plugin directory: `~/.config/kilo/plugin/`.
- Project plugin directory: `.kilo/plugin/`.
- npm plugins can be installed with `kilo plugin <package>` and `--global`.
- Plugin context includes `client`, `directory`, `worktree`, shell helper `$`, project metadata, and server URL.
- The generic `event` hook receives session events including `session.created`, `session.updated`, `session.idle`, `session.error`, `session.deleted`, `session.compacted`, `session.diff`, and `session.status`.
- Plugins can register custom tools.
- `experimental.session.compacting` can inject context during compaction, but it is explicitly experimental.

From Kilo backend/testing documentation:

- `kilo serve` exposes a local HTTP backend.
- Project scoping uses `x-kilo-directory` for mutating requests and `?directory=` for GET/HEAD in the documented examples.
- `POST /session` creates a session.
- `POST /session/:id/prompt_async` sends a fire-and-forget prompt.
- `GET /session/:id/message` reads messages.
- `POST /session/:id/abort` aborts an in-flight prompt.
- `GET /global/event` is an SSE stream.
- `@kilocode/sdk/v2` can create a client for an already-running server.
- The server handles normal termination signals and performs disposal.

From CLI reference:

- `kilo`, `kilo attach`, and `kilo run` support continuing a specific session.
- `kilo`, `kilo attach`, and `kilo run` expose `--fork` when continuing a session.
- `kilo attach` can target an existing server and directory.
- `kilo run` supports `--model` and `--variant`, but factory automation must not use them to override user-selected role configuration.

## Capability spike: mandatory proofs

Before implementing the coordinator around assumptions, `kilo-factory-001` must add executable probes/tests proving the installed-version behavior of:

1. Creating/listing/reading/aborting sessions via SDK or REST.
2. Receiving `session.idle`, error, deletion, and compaction events through SSE/plugin hooks.
3. Forking a seed session.
4. Whether a fork inherits the seed session's manually selected model.
5. Whether a fork inherits reasoning variant and agent selection.
6. Whether model/variant can be read back reliably from session/message state.
7. Directory/worktree scoping for forked/child sessions.
8. Server shutdown and orphan behavior.
9. Plugin loading globally and in a project.
10. Behavior when Kilo restarts while durable factory state remains.

If inheritance cannot be proven, the architecture must not fake it. Preserve manual user control through a different verified mechanism.

## Installed-version observations

The `7.5.6` probe demonstrated:

- A real local server supports authenticated health checks and session create/list/read/async-prompt/abort/delete through REST.
- Mutations honor `x-kilo-directory`; session listings honor `?directory=` without leaking sessions from a second directory. Session metadata and assistant-message `path.cwd` and `path.root` reflected the requested disposable Git worktree.
- `GET /global/event` delivered structured `session.idle`, `session.error`, `session.deleted`, and `session.compacted` payloads for probe-owned sessions.
- A prompt using a deliberately missing provider deterministically emitted `session.error` and then `session.idle`.
- Aborting an active turn returned `true` and the session returned to idle. An abort can occur before streaming and does not always emit `session.error`, so error-on-abort is not a contract.
- Manual summarization emitted `session.compacted`, returned to idle, and persisted a summary message. The persisted compaction message had no variant field even though the source session used `xhigh`; factory correctness must not assume compaction uses the seed reasoning variant.
- Global `~/.config/kilo/plugin/` and project `.kilo/plugin/` JavaScript modules both loaded and received `session.created` in an isolated configuration home.
- Probe sessions survived a graceful server stop/restart while an independent durable-state fixture remained unchanged. The unrelated visible seed remained readable with the same configuration, a new SSE subscription worked after restart, `SIGTERM` exited within the bounded wait, and the owned loopback listener stopped accepting connections. Startup, requests, shutdown, forced cleanup, and session deletion are time-bounded; a successful probe verifies that no probe session or owned process remains.

The probe used a visible seed whose session record exposed `agent=code`, `providerID=openai`, `modelID=gpt-5.6-sol`, and `variant=xhigh`. The values are observations from that seed, not package defaults.

### Fork evidence

`POST /session/:id/fork` into another directory retained the seed provider/model/variant in session metadata and honored the target directory, but its session record omitted the seed agent and contained non-empty seed conversation history. The probe intentionally did not execute the contaminated fork, so effective fork execution inheritance is unsupported. A fork fails the fresh-task-context invariant regardless of whether runtime inheritance would succeed.

**Decision:** production jobs must not fork or continue visible seed sessions. Forking is rejected as the v1 isolation mechanism.

### Selected fresh-session strategy

Creating an empty session with the seed record's exact `agent` and `model` object retained provider/model/variant and started with zero messages. Sending a prompt containing only `parts` (no model, provider, agent, or variant override) produced user and assistant message records with the seed's provider/model/variant/agent and executed in the requested directory.

**Decision:** read the visible seed session configuration, create a fresh job session in the job worktree with those exact fields, verify the created record, and send task prompts without model/provider/variant flags. Fail closed if any required seed field is absent or if read-back differs.

### SDK version boundary

The ambient SDK under the active Kilo config was `@kilocode/sdk` `7.4.22` while the server was `7.5.6`. Ambient SDK installation is therefore not a safe compatibility assumption.

**Decision:** the capability probe uses the proven REST/SSE surface. Package code may use the typed SDK only when it pins or validates a version compatible with the detected Kilo server; it must retain a version/capability guard and must not silently consume an ambient mismatched SDK.

## Preferred API boundary

Use the typed SDK for normal control only after its version is validated, and use the proven REST/SSE surface where required. Do not make `kilo run` process exit status the semantic completion protocol. CLI subprocesses are acceptable for user-facing attach/start helpers, not as the core job state machine.

## Security/ownership

Bind factory-started Kilo servers to loopback. Generate a per-run password if practical. Record process ownership so `factory stop` never kills unrelated user Kilo servers.
