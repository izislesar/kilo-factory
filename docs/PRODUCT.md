# Product

## Purpose

`kilo-factory` turns Kilo CLI into a lightweight unattended coding factory without replacing the Kilo harness.

The target workflow is:

1. Install the package/plugin once.
2. Enter any Git project and run `factory init`.
3. Configure project roles and validation commands.
4. Start the factory.
5. Open/attach visible Kilo role TUIs and manually choose the model/provider/reasoning for each role.
6. Arm the role sessions.
7. Leave the factory running unattended.
8. Inspect live state, pause it, resume it, or stop it with explicit CLI commands.

## Required commands

- `factory init` — create project-local configuration and ignore/runtime paths.
- `factory start` — start only factory-owned runtime processes and begin reconciliation.
- `factory sessions` — show role seed sessions and copyable `kilo attach` commands.
- `factory status` — show current task, generation, state, session/worktree, age, attempts, and last failure.
- `factory inspect <role|job>` — detailed state and recent evidence.
- `factory pause` — stop new scheduling; active jobs may drain.
- `factory resume` — resume scheduling.
- `factory stop` — abort/settle owned active job sessions, checkpoint state, stop owned coordinator/server processes, preserve recoverable work.
- `factory doctor` — verify Kilo, Beads, Git, config, server ownership, worktrees, and orphan processes.

Names may be refined, but the capability set is mandatory.

## Portability

The package is project-agnostic. A project supplies:

- repository root;
- Beads task backend configuration;
- roles and optional role instructions;
- integration branch policy;
- validation commands;
- optional path/scope rules.

Core code must not assume Unity, Rust, Go, Node, a particular number of roles, or a specific project name.

## Non-goals for v1

- Distributed multi-machine scheduling.
- Cloud-hosted coordinator.
- Web dashboard.
- Mobile control plane.
- Automatic provider billing optimization.
- Replacing Kilo's model picker or Kilo Gateway.
- A second general-purpose agent framework.
- Automatic boot startup.

## User-experience invariant

The factory must be easier to stop than to start. A forgotten factory must not survive reboot by design, and `factory stop` must have a deterministic ownership boundary.
