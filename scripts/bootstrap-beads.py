#!/usr/bin/env python3
from __future__ import annotations

import json
import pathlib
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
PLAN = ROOT / "automation" / "production-plan.json"

def run(args: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    p = subprocess.run(args, cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if check and p.returncode != 0:
        sys.stderr.write(p.stdout)
        sys.stderr.write(p.stderr)
        raise SystemExit(p.returncode)
    return p

def payload(raw: str):
    try:
        value = json.loads(raw)
    except Exception:
        return None
    if isinstance(value, dict) and "data" in value:
        value = value["data"]
    if isinstance(value, list):
        return value[0] if value else None
    return value if isinstance(value, dict) else None

def issue(issue_id: str):
    p = run(["bd", "show", issue_id, "--json"], check=False)
    if p.returncode != 0:
        return None
    return payload(p.stdout)

def create(item: dict) -> None:
    if issue(item["id"]):
        print(f"exists {item['id']}")
        return
    acceptance = item.get("acceptance", [])
    description = f"PLAN_KEY: kilo-factory.v1.{item['id']}\n\n{item['description']}"
    if acceptance:
        description += "\n\nAcceptance criteria:\n" + "\n".join(f"- {x}" for x in acceptance)
    args = [
        "bd", "create", item["title"],
        "--id", item["id"],
        "--type", item.get("type", "task"),
        "--priority", str(item.get("priority", 2)),
        "--description", description,
        "--json",
    ]
    labels = item.get("labels") or []
    if labels:
        args += ["--labels", ",".join(labels)]
    run(args)
    print(f"created {item['id']}")

def dependency_set(issue_id: str) -> set[tuple[str, str]]:
    data = issue(issue_id) or {}
    result: set[tuple[str, str]] = set()
    for dep in data.get("dependencies") or []:
        if not isinstance(dep, dict):
            continue
        dep_id = str(dep.get("id") or "")
        dep_type = str(dep.get("dependency_type") or dep.get("type") or "blocks")
        if dep_id:
            result.add((dep_id, dep_type))
    return result

def ensure_dep(child: str, parent: str, dep_type: str = "blocks") -> None:
    current = dependency_set(child)
    if (parent, dep_type) in current:
        return
    p = run(["bd", "dep", "add", child, parent, "--type", dep_type], check=False)
    if p.returncode != 0:
        # Re-read before failing: some Beads versions report duplicate links non-zero.
        if (parent, dep_type) not in dependency_set(child):
            sys.stderr.write(p.stdout)
            sys.stderr.write(p.stderr)
            raise SystemExit(p.returncode)

def main() -> None:
    if not shutil.which("bd"):
        raise SystemExit("ERROR: bd (Beads) is not installed")
    if not PLAN.exists():
        raise SystemExit(f"ERROR: missing {PLAN}")
    probe = run(["bd", "ready", "--json"], check=False)
    if probe.returncode != 0:
        print("Initializing Beads (non-interactive)...", flush=True)
        p = subprocess.run(
            ["bd", "init", "--non-interactive", "--skip-hooks", "--skip-agents"],
            cwd=ROOT,
            text=True,
        )
        if p.returncode != 0:
            raise SystemExit(p.returncode)

    plan = json.loads(PLAN.read_text(encoding="utf-8"))
    epic = plan["epic"]
    create(epic)
    for task in plan["tasks"]:
        create(task)

    for task in plan["tasks"]:
        ensure_dep(task["id"], epic["id"], "parent-child")
        for blocker in task.get("deps", []):
            ensure_dep(task["id"], blocker, "blocks")

    run(["bd", "dep", "cycles"])
    print("\nReady work:")
    ready = run(["bd", "ready"], check=False)
    sys.stdout.write(ready.stdout)
    if ready.stderr:
        sys.stderr.write(ready.stderr)
    print("\nBeads bootstrap complete.")

if __name__ == "__main__":
    main()
