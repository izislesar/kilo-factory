# Failure model

This project is designed around failures already observed in an earlier ad-hoc Kilo night-shift controller.

## Failure classes and required response

### Retry storm

Symptom: the same task is woken repeatedly because main HEAD or another incidental value changes.

Rule: dispatch identity is job/bead generation, not repository HEAD. Every retry budget is bounded.

### Stale persistent-session task memory

Symptom: fresh state says task B, but the model continues or reports on old task A.

Rule: never reuse old task conversation as authority. Fresh job context plus fencing token; stale result rejected mechanically.

### `rc=0` without semantic success

Symptom: Kilo client exits zero after malformed model output or a no-op turn.

Rule: exit code is transport/process evidence only. Completion requires structured result plus independently verified Git/state evidence.

### Dirty worker worktree

Symptom: a turn is interrupted after editing but before commit/handoff.

Rule: never force reset. Preserve dirty state and run bounded recovery for the same job generation.

### Dirty/failed main integration

Symptom: integration mutates main and validation then fails.

Rule: main is never the integration sandbox. Validate in an integration worktree before promotion.

### Stop/start race

Symptom: old controller still owns a lock while new controller starts and immediately exits.

Rule: explicit ownership, graceful stop, wait-for-death, and post-start liveness verification.

### Orphan child clients

Symptom: wrapper/controller stops but child Kilo request remains alive.

Rule: track owned session/process IDs, abort Kilo sessions through the API, then terminate only factory-owned processes if needed.

### Shell permission mismatch

Symptom: agents repeatedly attempt commands denied by narrow shell allowlists.

Rule: prefer plugin-provided structured tools and purpose-built wrappers for factory actions. Project coding permissions remain a project concern; the factory must not require brittle prompt instructions around common shell syntax.

### Contradictory state

Examples: task assigned to two active generations; result SHA not descendant of base; session directory does not match worktree; Beads says closed while candidate is unintegrated.

Rule: quarantine and surface evidence. Never guess.

## Error taxonomy

At minimum classify:

- `TRANSIENT_TRANSPORT` — connection reset, server temporarily unavailable.
- `RATE_LIMIT` — retry-after/backoff class.
- `MODEL_FAILURE` — malformed/no-progress response.
- `KILO_RUNTIME_FAILURE` — server/session/plugin failure.
- `WORKTREE_DIRTY` — recoverable local edits.
- `GIT_CONFLICT` — integration conflict.
- `VALIDATION_FAILURE` — tests/build/linters fail.
- `STALE_GENERATION` — old fenced result.
- `TASK_STATE_CONFLICT` — Beads/orchestration contradiction.
- `EXTERNAL_BLOCKER` — human/external dependency.

Each class must have a deterministic bounded policy and tests.
