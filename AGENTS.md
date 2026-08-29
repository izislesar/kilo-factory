# AGENTS.md

This repository builds `kilo-factory`, a universal unattended-work controller for the Kilo CLI.

The core implementation wave is no longer the finish line. A post-acceptance source review invalidated the previous production-ready conclusion: multiple shipped subsystems were still stubs or unwired, and several acceptance tests proved scaffolds rather than the autonomous runtime. The current objective is to complete repair beads 034-054 and pass corrected release gate kilo-factory-053.

## First actions in every coding session

1. Run `bash scripts/bootstrap-beads.sh` unconditionally. It is idempotent and materializes any newly added production-plan Beads into the existing database.
2. Run `bd prime` if Beads is initialized.
3. Run `bd ready --json` and select exactly one unblocked non-epic production bead. Never claim or implement an epic; epics are containers only.
4. Inspect that bead with `bd show <id> --json` before editing.
5. Read `docs/PRODUCTION_READINESS.md` plus only the smallest relevant stable docs from `docs/`.
6. Re-anchor on repository instructions and the selected bead even when resuming a long-lived Kilo session. Old conversation history is useful context, but it is not current task truth.

## Current phase

- Production repair after a false-positive release gate, not feature brainstorming.
- Previous closures of 023/025/031/032/033 and the current NIGHT_SHIFT_REPORT.md are historical evidence only; they must not be used to claim readiness for the repair wave.
- Repair beads 034-054 are authoritative, and kilo-factory-053 is the corrected ship gate.
- A green unit suite proves only a local gate. It does not prove installability, runtime integration, recovery, or release readiness.
- Prefer exercising the actual installed plugin, Kilo runtime, Beads, Git worktrees and SQLite state whenever the selected acceptance criteria are about system behavior.
- Reuse the existing architecture unless evidence shows a production defect. Do not rewrite working subsystems merely to make them look cleaner.
- Create `discovered-from` Beads for real defects or missing production requirements found during acceptance. Do not hide new scope in prose or silently expand an unrelated bead.
- Continue through actionable production/integration/release work until the final production gate is genuinely satisfied or only external blockers remain.

## Product invariants

- Kilo is the harness. Do not replace it with OpenCode, Claude Code, Codex, LangChain, CrewAI, AutoGen, or another orchestration framework.
- The factory must be installable once and usable from arbitrary Git projects.
- The user must be able to keep role sessions visible in ordinary Kilo TUIs and manually select provider/model/reasoning.
- Never pass model/provider/variant flags from the factory when doing so would override a user's manually selected seed-session choice.
- A role TUI is a visible control/seed session, not durable task memory. Every production job must use fresh task context or a verified fork strategy that cannot inherit stale task identity.
- Never infer semantic success from a subprocess exit code alone.
- Beads is v1 task truth. Git is code truth. Durable factory state is orchestration truth. LLM text is never orchestration truth.
- `main` must remain green. Candidate integration happens in an isolated integration worktree before promotion.
- Exactly one deterministic integrator may write `main`.
- Retry is always bounded. Unknown or conflicting state becomes `QUARANTINED`/`BLOCKED`, never blind redispatch.
- No system service or boot autostart. The factory is explicitly started and must fully stop.
- `factory stop` may only terminate processes/sessions the factory owns. It must preserve Git worktrees and recoverable task state.
- Keep dependencies minimal. Prefer Kilo's native plugin API, SDK/REST/SSE, Git, Beads, and Bun/TypeScript.

## Context engineering contract

- Stable project context must not contain live task lists.
- A resumed primary Kilo development conversation may preserve architectural reasoning and prior decisions, but it never overrides current repository instructions, Beads state, or the selected job envelope.
- A job prompt contains exactly one authoritative task identity and generation.
- Never include unrelated active Beads IDs in worker task context.
- Use a monotonically increasing generation/fencing token per assignment.
- Stale generations can never be integrated, even if their code is valid.
- Compaction/recovery must re-inject the exact immutable job envelope.
- Session history is a hint only; the job envelope is law.
- Release evidence is context too: acceptance workers should receive only the exact scenario, required invariants, relevant fixture/repo state, and expected evidence for the bead being executed.

## Development workflow

- Claim one bead with `bd update <id> --claim` when appropriate.
- Implement the smallest coherent change that satisfies its acceptance criteria.
- Add focused tests with the implementation.
- Run the narrowest relevant test first, then repository gates required by the bead.
- For production acceptance beads, run the real-system scenario required by the bead after deterministic tests are green.
- Never count fixture setup, version/help/init smoke tests, direct SQLite state mutation, or isolated helper calls as E2E/multi-cycle/self-host evidence when the acceptance contract requires the shipped coordinator/plugin lifecycle.
- Commit coherent work before moving to another bead.
- Close a bead only when its acceptance criteria are proven with evidence. If a later integration/fault-injection gate is required, leave it open and document the blocker.
- Use `bd create` with a `discovered-from` relationship for newly discovered scope instead of silently expanding the task.
- If one production bead is externally blocked, continue other ready work instead of ending the shift.
- Before final release, prove behavior again from a clean environment rather than relying on developer-local state.

## Do not

- Do not add systemd units, background auto-start, cron, or hidden persistent daemons.
- Do not parse human-formatted Kilo TUI output as a primary API.
- Do not build a second model/provider abstraction; Kilo owns provider/model execution.
- Do not make `main` dirty during speculative integration.
- Do not force-reset dirty worker worktrees.
- Do not reuse a completed job session for a different bead.
- Do not encode project-specific roles such as `repair` or `gameplay` into the package core; roles are configuration.
- Do not declare production-ready because mocks/unit tests pass.
- Do not weaken verification, fencing, ownership checks, failure handling, or tests merely to pass an acceptance gate.
- Do not stop merely because no implementation bead is ready while production/integration/release beads remain actionable.

## Source-of-truth docs

- `docs/PRODUCTION_READINESS.md` — current release objective, evidence hierarchy and ship/no-ship contract.
- `docs/PRODUCT.md` — product scope and UX.
- `docs/ARCHITECTURE.md` — control-plane architecture and state machine.
- `docs/CONTEXT_ENGINEERING.md` — job/session context rules.
- `docs/KILO_RUNTIME.md` — verified Kilo integration surface and capability-spike requirements.
- `docs/FAILURE_MODEL.md` — recovery semantics learned from prior failures.
- `docs/TESTING.md` — required deterministic and fault-injection tests.
- `docs/DECISIONS.md` — durable architecture decisions.

If an upstream Kilo behavior is uncertain, do not guess. Prove it with a capability test and encode the observed contract in tests before building dependent logic.
