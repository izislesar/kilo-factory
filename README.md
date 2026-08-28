# kilo-factory

A lightweight, project-agnostic autonomous coding factory for the Kilo CLI.

`kilo-factory` does not replace Kilo. Kilo remains the harness, provider gateway, model/session runtime, plugin host, and visible interactive UI. This project adds only the deterministic control plane needed to run unattended multi-agent shifts safely.

Hard constraints:

- Kilo is mandatory; do not reimplement a coding harness or model gateway.
- Role sessions remain visible in ordinary Kilo TUIs. The user manually chooses provider/model/reasoning in those TUIs.
- Factory automation must never silently override manual model/provider/variant choices.
- No systemd service, boot autostart, or permanent daemon. `factory stop` must leave no factory-owned background processes.
- Each production job receives fresh task context. Persistent TUI conversation memory is never task truth.
- Beads is the v1 task backend and source of task-state truth.
- Git worktrees isolate concurrent jobs.
- `main` is never an integration scratchpad and must stay green.
- Scheduling, ownership, retries, validation, integration, and closure are deterministic; LLM prose is not control-plane truth.
- Retries are bounded and unknown state fails closed.
- Crash/reboot recovery comes from durable local state plus observed Git, Beads, and Kilo state.
- Keep the implementation small: one npm/Bun package, one short-lived coordinator process, one Kilo plugin, no additional agent framework.

Read `AGENTS.md` first, then the architecture documents under `docs/`. The implementation DAG is stored in `automation/production-plan.json`.

To materialize the Beads graph in a local clone:

```bash
bash scripts/bootstrap-beads.sh
```

The bootstrap is idempotent and uses `bd init --skip-agents` so it does not replace the curated project context.

Status: architecture/bootstrap repository. Implementation is intentionally delegated through the seeded Beads plan.
