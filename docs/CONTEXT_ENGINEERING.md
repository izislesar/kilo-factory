# Context engineering

The central failure to prevent is task-identity contamination across long-lived Kilo sessions.

## Seed TUI versus job session

A visible role TUI is a human-visible seed/control session. It exists so the user can inspect the role and manually select provider/model/reasoning.

A production job must not continue the old role conversation as task memory. The coordinator must use a fresh session or a verified Kilo fork mechanism whose resulting context is explicitly controlled. The capability spike must prove model/variant inheritance behavior before this is relied upon.

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

## Completion protocol

Human-readable assistant text is not completion truth.

The Kilo plugin should expose structured factory tools such as:

- `factory_complete(summary, checks, risks)`
- `factory_block(reason, class)`
- optional `factory_job()` read-only identity inspection.

`factory_complete` writes or returns a machine-readable result containing job ID, generation, base SHA, head SHA, validation evidence, dirty state, and risks. The coordinator independently validates those claims against Git and state.

## Idle/continuation

Kilo's event stream exposes `session.idle`. Idle is an observation, not proof of completion.

If a job becomes idle without a valid terminal result:

- bounded continuation may be issued;
- continuation prompt must repeat only the exact job envelope and next-action contract;
- repeated idle-without-progress must end in recovery/quarantine, never an infinite Ralph loop.

## Context size

Prefer retrieval and narrow file inspection over large static repository dumps. Stable instructions should be short and cache-friendly. Runtime task state is appended separately and must not rewrite stable docs.

## Compaction

If using Kilo's experimental compaction hook, treat it as an optimization rather than sole correctness mechanism. Tests must prove that the job identity survives compaction; otherwise the coordinator must explicitly resend the envelope after compaction/recovery.
