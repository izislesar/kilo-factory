# Context engineering

The central failure to prevent is task-identity contamination across long-lived Kilo sessions.

## Seed TUI versus job session

A visible role TUI is a human-visible seed/control session. It exists so the user can inspect the role and manually select provider/model/reasoning.

A production job must not continue the old role conversation as task memory. The coordinator must use a fresh session or a verified Kilo fork mechanism whose resulting context is explicitly controlled. The capability spike must prove model/variant inheritance behavior before this is relied upon.

## Resumed primary development session

The human may intentionally resume the long-lived primary Kilo development conversation between implementation shifts. That is desirable for preserving architectural reasoning, prior tradeoffs, and the local narrative of the project.

This is different from reusing a worker job session.

At the start of each new development turn, and again after compaction or a major phase change, the primary session must re-anchor from current repository truth:

1. `AGENTS.md`.
2. `docs/PRODUCTION_READINESS.md` during the productionization phase.
3. Idempotent `bash scripts/bootstrap-beads.sh`.
4. `bd prime`, `bd ready --json`, then the exact selected `bd show <id> --json`.
5. Only the stable docs and repository files relevant to that selected bead.

Old conversation text may explain why an architecture exists. It may not decide which task is current, whether a task is complete, what generation owns work, or whether the product is ready to ship.

If old session memory conflicts with current Git, Beads, durable state or current stable docs, the current machine-owned/repository source wins.

## Worker context layers

A job receives only:

1. Stable factory execution contract.
2. Project instructions (`AGENTS.md` and explicitly selected project docs).
3. Role contract.
4. Exactly one immutable job envelope.
5. The exact Beads title/description/acceptance/dependencies/comments required for that job.
6. Relevant repository context discovered for the job.

Do not append global `bd ready`, all in-progress tasks, or unrelated bead IDs to worker task context.

## Identity rules

- The exact bead ID must appear in one authoritative machine-owned job block.
- The generation must appear with it.
- The plugin/coordinator must reject completion for a different bead or generation.
- Old conversation mentions never override the job envelope.
- Recovery and compaction re-inject the exact same envelope.

## Production acceptance context

Production acceptance work needs richer evidence, not broader conversational history.

For an acceptance/fault/release bead, construct context from:

1. The same stable execution and product invariants used for implementation work.
2. The exact acceptance bead and generation.
3. The exact scenario/fixture being exercised.
4. Relevant runtime observations: Kilo/session identifiers, owned process identity, worktree/base/head SHAs, durable state rows/events, and validation commands.
5. The minimum prior evidence required to interpret the scenario.

Do not inject the entire production DAG or all previous test output into every acceptance worker. Record durable evidence in Beads/comments, structured events, committed reports or fixture artifacts, then retrieve only what the active bead needs.

A release gate is not allowed to infer success from child statuses alone. It must run or verify the final evidence required by its own acceptance criteria.

## Completion protocol

Human-readable assistant text is not completion truth.

The Kilo plugin should expose structured factory tools such as:

- `factory_complete(summary, checks, risks)`
- `factory_block(reason, class)`
- optional `factory_job()` read-only identity inspection.

`factory_complete` writes or returns a machine-readable result containing job ID, generation, base SHA, head SHA, validation evidence, dirty state, and risks. The coordinator independently validates those claims against Git and state.

Production/release beads additionally require evidence appropriate to the scenario. A statement such as "tests pass" is insufficient when the bead requires real Kilo E2E, crash recovery, clean installation, soak, or self-hosting.

## Idle/continuation

Kilo's event stream exposes `session.idle`. Idle is an observation, not proof of completion.

If a job becomes idle without a valid terminal result:

- bounded continuation may be issued;
- continuation prompt must repeat only the exact job envelope and next-action contract;
- repeated idle-without-progress must end in recovery/quarantine, never an infinite Ralph loop.

For the primary resumed development session, an idle conversation is likewise not project completion. The shift is complete only when the current Beads/release contract says it is complete or all remaining work is genuinely externally blocked.

## Context size

Prefer retrieval and narrow file inspection over large static repository dumps. Stable instructions should be short and cache-friendly. Runtime task state is appended separately and must not rewrite stable docs.

The productionization phase should not turn `AGENTS.md` into a live checklist. The detailed DAG belongs in Beads/automation plan; stable release semantics belong in `docs/PRODUCTION_READINESS.md`.

## Compaction

If using Kilo's experimental compaction hook, treat it as an optimization rather than sole correctness mechanism. Tests must prove that the job identity survives compaction; otherwise the coordinator must explicitly resend the envelope after compaction/recovery.

After primary-session compaction, re-read repository instructions and current Beads state before continuing. Architectural memory may be compacted; task authority may not be reconstructed from memory.
