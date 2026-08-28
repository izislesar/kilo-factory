# Kilo runtime integration

Researched baseline: Kilo upstream `Kilo-Org/kilocode` main at commit `5e02825c8c5318912e39fe0ceee46793589fae3f` on 2026-08-29. Re-verify against the installed Kilo version during `kilo-factory-001`; upstream APIs can change.

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

## Preferred API boundary

Use the typed SDK for normal control where stable and REST/SSE where required. Do not make `kilo run` process exit status the semantic completion protocol. CLI subprocesses are acceptable for user-facing attach/start helpers, not as the core job state machine.

## Security/ownership

Bind factory-started Kilo servers to loopback. Generate a per-run password if practical. Record process ownership so `factory stop` never kills unrelated user Kilo servers.
