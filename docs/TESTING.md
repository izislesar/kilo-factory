# Testing

Testing is part of the product. The factory is not considered ready merely because a happy-path demo works.

## Unit tests

Cover:

- config parsing/validation;
- job generation and fencing;
- FSM legal/illegal transitions;
- retry budgets/backoff decisions;
- process ownership bookkeeping;
- Beads JSON parsing;
- Git ancestry/candidate validation;
- context builder identity isolation;
- result manifest validation;
- status rendering.

## Kilo contract tests

Executable probes against a real local Kilo server must verify the contracts listed in `docs/KILO_RUNTIME.md`. Skip with an explicit reason only when Kilo is unavailable; release acceptance cannot skip them.

## Fixture repository

Create a small disposable Git fixture with a few deterministic tasks and validation command. It must prove the factory without depending on this repository modifying itself.

## Fault-injection matrix

Automate at least:

1. kill coordinator while a job is running;
2. kill/abort a Kilo job session mid-edit;
3. restart Kilo server;
4. stale old-generation result arrives after reassignment;
5. duplicate completion event;
6. job worktree left dirty;
7. clean unique commit exists without completion manifest;
8. merge conflict;
9. validation failure;
10. provider/model error or session error event;
11. pause during active work;
12. stop during active work;
13. restart factory with durable state present;
14. unrelated Kilo server/process exists during stop;
15. compaction during a job;
16. two roles become ready simultaneously.

Expected invariants:

- no infinite redispatch;
- no stale result integrated;
- no unrelated process killed;
- no dirty work silently discarded;
- no failed candidate makes main non-green;
- restart converges to a consistent state;
- pause creates no new jobs;
- stop leaves no factory-owned background processes.

## Context contamination tests

Given seed history containing old bead IDs and a new job envelope:

- generated task context contains the current bead/generation exactly as authoritative identity;
- unrelated ready/in-progress bead IDs are absent;
- completion for an old bead/generation is rejected;
- recovery and compaction preserve current identity.

## Release gate

Before v1 release, run an unattended multi-task fixture long enough to observe multiple complete cycles:

`ready -> job -> result -> integration -> validation -> close -> next assignment`

Then execute `factory stop` and prove zero factory-owned coordinator/server/job processes remain.
