# Architecture

## Minimal topology

```text
visible Kilo role TUIs
        | manual model/provider/reasoning
        v
factory-owned or explicitly adopted Kilo server
        | REST/SDK + SSE
        v
one deterministic coordinator process
   |        |         |
 Beads     Git     durable state
   |      worktrees    SQLite
   v        v
fresh job sessions
        |
candidate commits
        v
integration worktree -> validation -> atomic promotion to main
```

One npm/Bun package contains both the Kilo server plugin and the `factory` CLI/coordinator. No separate daemon framework is required.

## Ownership

The coordinator owns:

- assignment generations;
- job lifecycle;
- factory-created Kilo child sessions;
- factory-created worktrees;
- retry/recovery policy;
- integration worktrees;
- durable orchestration state;
- factory-started Kilo server PID and credentials.

Kilo owns:

- provider/model execution;
- model credentials and Kilo Gateway;
- session runtime;
- TUI interaction;
- plugin host;
- message/event transport.

Beads owns task readiness/status/dependencies. Git owns code/history.

## Job identity

Every assignment has an immutable envelope:

```json
{
  "jobId": "<bead>:<generation>",
  "bead": "<bead>",
  "generation": 12,
  "role": "core",
  "baseSha": "<sha>",
  "worktree": "<absolute-path>",
  "acceptanceHash": "<sha256>"
}
```

`generation` is a fencing token. A result from an older generation is stale and can never advance orchestration state.

## State machine

Primary states:

```text
READY -> LEASED -> RUNNING -> RESULT_READY -> REVIEWING
      -> INTEGRATING -> VALIDATING -> COMMITTED -> CLOSED
```

Failure/recovery states:

```text
RETRY_WAIT
RECOVERING
QUARANTINED
BLOCKED_EXTERNAL
```

Transitions are made by deterministic observations, never by model prose alone.

Examples:

- `RUNNING -> RESULT_READY`: current generation matches, result artifact is valid, candidate commit exists, worktree invariants pass.
- `RUNNING -> RECOVERING`: session disappeared or became terminal while recoverable dirty/unique work exists.
- `RUNNING -> RETRY_WAIT`: transport/provider failure with no recoverable code and retry budget remains.
- any state -> `QUARANTINED`: contradictory ownership, unknown generation, unsafe Git state, or repeated recovery failure.

## Worktrees

Each production job uses a unique worktree keyed by job identity/generation. Do not keep one permanent worker branch across unrelated tasks.

On crash/restart:

- clean worktree + no unique commit -> retry is possible;
- dirty worktree -> preserve and run bounded recovery;
- clean unique commit -> candidate inspection;
- stale-generation result -> preserve for audit, never integrate.

## Integration

`main` is never the scratch integration workspace.

1. Create isolated integration worktree from current green main.
2. Apply/merge candidate commit(s) deterministically.
3. Run configured validation commands.
4. If validation fails, preserve evidence and discard/quarantine the integration workspace; main remains unchanged.
5. If validation passes, promote to main through one deterministic writer.
6. Only then close/update Beads.

## Durable state

Use one local SQLite database under the factory runtime directory. SQLite is embedded, not a daemon. WAL mode is acceptable.

The DB stores job generations, ownership, session IDs, worktree paths, observed SHAs, state transitions, retry counters, timestamps, and failure classification. It must be reconstructible/reconcilable against Git, Beads, and Kilo after process death.

## Reconciliation

The coordinator repeatedly compares desired state to observed state. It does not assume that an earlier command succeeded because it was issued.

Reconciliation must be idempotent. Re-running the loop after a crash must not duplicate assignment, integration, closure, or retry.
