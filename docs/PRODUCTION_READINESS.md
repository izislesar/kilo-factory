# Production readiness

## Objective

The current objective is to ship `kilo-factory` as a real Kilo product, not merely to finish its core modules.

The core control-plane pieces already exist: runtime capability probing, package/plugin scaffold, project configuration and SQLite state, structured completion, Kilo and Beads adapters, generation-scoped worktrees, coordinator FSM, exact-job context, visible role seed sessions, idle continuation, candidate verification, green-main integration, CLI dispatch, crash reconciliation, process/session ownership hardening, context-contamination regression coverage, and structured observability.

That implementation is necessary but not sufficient for release.

Production readiness requires evidence that those pieces operate together through the real installed plugin and real Kilo runtime, survive failures safely, install cleanly outside the developer's current state, and can operate on meaningful work without manual repair.

## Post-acceptance code-review reset

The production conclusion recorded before repair bead `kilo-factory-034` is superseded.

A source-level review of the shipped `main` found that several previously closed acceptance beads tested component scaffolds rather than the autonomous runtime they claimed to prove. In particular, the shipped CLI lacked lifecycle commands, the Kilo plugin returned an empty tool surface, the coordinator did not create/prompt job sessions, the integration/recovery/observability layers were incomplete, and the so-called E2E/multi-cycle/self-host tests did not drive the shipped lifecycle end to end.

Therefore:

- historical closure of `kilo-factory-023/025/031/032/033` is not current ship evidence;
- `NIGHT_SHIFT_REPORT.md` is historical until repair bead `kilo-factory-054` replaces it;
- repair beads `kilo-factory-034` through `kilo-factory-054` are the authoritative remaining production path;
- a test may count as E2E/multi-cycle/self-host only when it invokes the shipped runtime path and observes the required real side effects instead of directly mutating SQLite or merely testing fixture setup/version/init;
- the corrected final gate is `kilo-factory-053`.

## Evidence hierarchy

Evidence gets stronger in this order:

1. Static/type checks.
2. Unit tests.
3. Deterministic integration tests.
4. Real local Kilo/plugin/Beads/Git acceptance.
5. Deliberate failure and restart injection.
6. Repeated concurrent/soak execution.
7. Fresh-clone/fresh-install acceptance.
8. Self-hosting on kilo-factory's own work.
9. Final release-gate rerun on the candidate being shipped.

A stronger required layer cannot be replaced by more evidence from a weaker layer. One hundred green unit tests do not substitute for a failed or unexecuted real-runtime acceptance path.

## Production contract

A shippable release must demonstrate all of the following where the environment can exercise them:

- The documented install path produces a plugin that Kilo actually discovers.
- A new project can be initialized without copying implementation source or relying on developer-local hidden state.
- `/build-factory` / factory control flow can start or resume the real controller.
- Beads, Kilo sessions, exact-job context, worktrees, structured completion, verification and green-main integration operate as one lifecycle.
- Independent jobs/roles can progress concurrently without double ownership, double completion, cross-task context leakage or state corruption.
- A failed test/build/verification, malformed result, stale generation, no-op candidate or integration conflict cannot silently reach `main`.
- Coordinator, worker/session and Kilo-runtime failures reconcile deterministically and remain bounded.
- Dirty or ambiguous work is preserved/quarantined rather than force-reset.
- SQLite state is durable enough to restart safely and idempotent enough not to duplicate semantic effects.
- Process/session/worktree cleanup is positively ownership-scoped and cannot destroy unrelated user state.
- Status/events provide enough evidence to understand active, blocked, recovering, quarantined and integrating work.
- Repeated operation does not accidentally leak unbounded processes, sessions, worktrees, descriptors or runtime state.
- A fresh clone/install passes without inherited node_modules, build products, runtime DB, old worktrees/sessions or developer-specific paths.
- The factory can dogfood suitable work on its own repository through the same normal verification/integration rules.
- Final tests/typecheck/build and any configured lint gate pass on the release candidate.
- Git is clean at the release gate.

## Autonomous productionization policy

Use Beads as the executable production plan.

When an acceptance scenario reveals a real defect or missing requirement:

1. Create a focused Bead linked with `discovered-from` to the task that exposed it.
2. Fix the root cause rather than weakening the acceptance.
3. Add regression coverage where practical.
4. Re-run the failed acceptance scenario.
5. Close the defect only with evidence.

Do not stop the shift because one task is externally blocked while unrelated ready work remains.

Do not create speculative architecture epics merely to stay busy. Productionization should mostly prove, harden and package the architecture already built.

## Ship/no-ship rule

The final production release gate is authoritative.

It must not close because:
- all child Beads happen to be closed;
- unit tests are green;
- an agent states that the product looks ready;
- a mocked E2E passes;
- a previous commit once passed the gate.

It closes only when the final candidate satisfies its own acceptance criteria with reproducible evidence.

If the environment prevents a required external action, document the exact blocker, evidence, and safe owner verification steps. An external blocker may remain open; an internal defect may not be relabeled as external merely to finish the shift.

## Night-shift result

After the production gate, produce `NIGHT_SHIFT_REPORT.md` with exact evidence: work completed, defects found/fixed, architecture changes, real E2E/failure/soak/fresh-install/self-host results, final quality-gate output, remaining limitations/blockers, and commands the owner can run independently.

The report is a handoff artifact, not completion truth. Beads, Git, durable state and reproducible gate evidence remain authoritative.
