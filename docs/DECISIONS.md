# Architecture decisions

Durable decisions are append-only. Routine progress belongs in Beads, commits, and runtime state rather than this file.

## D-001 — Kilo remains the harness

The factory extends Kilo instead of replacing it. Provider/model execution, Gateway, sessions, and interactive TUI remain Kilo responsibilities.

## D-002 — Global reusable package

The factory is project-agnostic and installable globally. Project-specific roles and validation live in project configuration.

## D-003 — One short-lived coordinator, no service manager

V1 uses one explicit coordinator process plus a Kilo plugin. No systemd, boot autostart, cron, or hidden daemon.

## D-004 — Visible seed TUIs, fresh job contexts

Users retain visible Kilo role sessions and manual model choice. Production jobs do not reuse unrelated task conversation memory. Exact mechanics of seed forking/model inheritance must be proven by the Kilo capability spike.

## D-005 — Deterministic control plane

LLM prose cannot directly advance scheduling, integration, or closure. Machine-observed evidence drives an explicit FSM.

## D-006 — Generation fencing

Every assignment increments a generation. Results from previous generations are stale by definition.

## D-007 — Beads first task backend

V1 uses Beads through a narrow adapter. The coordinator does not embed Beads-specific assumptions throughout core scheduling code.

## D-008 — Job-isolated worktrees

Each job/generation gets its own worktree. Permanent role branches are not the task-isolation primitive.

## D-009 — Green-main integration

Candidate work is validated in an integration worktree. Only a deterministic integrator promotes proven state to main.

## D-010 — Embedded durable state

Use local SQLite for orchestration durability. It is a file-backed library, not a daemon, and supports crash-safe reconciliation without introducing infrastructure.

## D-011 — Bounded continuation and recovery

`session.idle` without completion may trigger bounded continuation/recovery, never an unbounded Ralph-style loop.

## D-012 — Stop owns only what start owns

The factory records ownership of every process/session it creates. `factory stop` aborts/stops only those resources and preserves recoverable Git/Beads state.
