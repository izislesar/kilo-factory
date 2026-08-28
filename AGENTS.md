# AGENTS.md

This repository builds `kilo-factory`, a universal unattended-work controller for the Kilo CLI.

## First actions in every coding session

1. Run `bd prime` if Beads is initialized.
2. Run `bd ready --json` and select exactly one unblocked production bead. Never claim or implement an epic; epics are containers only.
3. Inspect that bead with `bd show <id> --json` before editing.
4. Read only the smallest relevant stable docs from `docs/`.
5. Keep implementation decisions inside the contracts below; create a new bead for out-of-scope findings.

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
- A job prompt contains exactly one authoritative task identity and generation.
- Never include unrelated active Beads IDs in worker task context.
- Use a monotonically increasing generation/fencing token per assignment.
- Stale generations can never be integrated, even if their code is valid.
- Compaction/recovery must re-inject the exact immutable job envelope.
- Session history is a hint only; the job envelope is law.

## Development workflow

- Claim one bead with `bd update <id> --claim` when appropriate.
- Implement the smallest coherent change that satisfies its acceptance criteria.
- Add focused tests with the implementation.
- Run the narrowest relevant test first, then repository gates required by the bead.
- Commit coherent work before moving to another bead.
- Close a bead only when its acceptance criteria are proven. If a later integration/fault-injection gate is required, leave it open and document the blocker.
- Use `bd create` with a `discovered-from` relationship for newly discovered scope instead of silently expanding the task.

## Do not

- Do not add systemd units, background auto-start, cron, or hidden persistent daemons.
- Do not parse human-formatted Kilo TUI output as a primary API.
- Do not build a second model/provider abstraction; Kilo owns provider/model execution.
- Do not make `main` dirty during speculative integration.
- Do not force-reset dirty worker worktrees.
- Do not reuse a completed job session for a different bead.
- Do not encode project-specific roles such as `repair` or `gameplay` into the package core; roles are configuration.

## Source-of-truth docs

- `docs/PRODUCT.md` — product scope and UX.
- `docs/ARCHITECTURE.md` — control-plane architecture and state machine.
- `docs/CONTEXT_ENGINEERING.md` — job/session context rules.
- `docs/KILO_RUNTIME.md` — verified Kilo integration surface and capability-spike requirements.
- `docs/FAILURE_MODEL.md` — recovery semantics learned from prior failures.
- `docs/TESTING.md` — required deterministic and fault-injection tests.
- `docs/DECISIONS.md` — durable architecture decisions.

If an upstream Kilo behavior is uncertain, do not guess. Prove it with the capability spike and encode the observed contract in tests before building dependent logic.
