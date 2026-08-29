# Operations guide

## Installation

Install kilo-factory globally so the `factory` CLI and Kilo plugin are available to any project:

```bash
npm install -g kilo-factory
```

## Project initialization

From any Git project root:

```bash
factory init
```

This creates a `.kilo-factory/config.json` with default settings. Edit it to configure roles and validation:

```json
{
  "version": 1,
  "mainBranch": "main",
  "roles": [
    { "name": "core", "instructions": "Core implementation work" },
    { "name": "review", "instructions": "Review and verification" }
  ],
  "validation": {
    "command": "make test",
    "timeoutSeconds": 300
  }
}
```

Role names are configuration, not hardcoded.

## Seed sessions

For each role, open a visible Kilo TUI and manually select provider/model/reasoning:

```bash
kilo attach <server-url> --dir $(pwd)
```

The factory preserves manual model selection. It never passes `--model`, `--provider`, or `--variant` flags that would override your choice.

## Operation

Start the factory:

```bash
factory start
```

Inspect status:

```bash
factory status
factory inspect <role|job>
```

## Stop semantics

`factory stop` aborts/settles owned jobs and stops only factory-owned processes and servers.

After stop, verify no factory-owned background processes remain:

```bash
factory doctor
```

Zero factory-owned background processes is the expected post-stop state.

## Recovery

On restart, the factory reconciles durable SQLite state against observed Git, Beads, and Kilo state:

- Clean worktrees with no commits: retry within budget
- Dirty worktrees: preserved and enter bounded recovery
- Unique commits: recovered as candidates
- Unknown/contradictory state: quarantined

## Troubleshooting

Use `factory doctor` and `factory status` rather than inspecting hidden files. Common issues:

- Stale generations are rejected automatically
- Orphan processes are detected by doctor
- Quarantined jobs show the failure reason in status
