#!/usr/bin/env python3
from __future__ import annotations

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
PLAN = ROOT / "automation" / "production-plan.json"

def fail(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    raise SystemExit(1)

def main() -> None:
    data = json.loads(PLAN.read_text(encoding="utf-8"))
    epic = data["epic"]
    tasks = data["tasks"]
    ids = [epic["id"]] + [t["id"] for t in tasks]
    if len(ids) != len(set(ids)):
        fail("duplicate issue IDs in production plan")
    task_ids = {t["id"] for t in tasks}
    for t in tasks:
        if not t.get("title") or not t.get("description") or not t.get("acceptance"):
            fail(f"{t['id']} missing title/description/acceptance")
        for dep in t.get("deps", []):
            if dep not in task_ids:
                fail(f"{t['id']} references unknown blocker {dep}")

    graph = {t["id"]: list(t.get("deps", [])) for t in tasks}
    visiting: set[str] = set()
    visited: set[str] = set()
    def dfs(node: str) -> None:
        if node in visiting:
            fail(f"dependency cycle includes {node}")
        if node in visited:
            return
        visiting.add(node)
        for dep in graph[node]:
            dfs(dep)
        visiting.remove(node)
        visited.add(node)
    for node in graph:
        dfs(node)

    required_docs = [
        "AGENTS.md",
        "docs/PRODUCT.md",
        "docs/ARCHITECTURE.md",
        "docs/CONTEXT_ENGINEERING.md",
        "docs/KILO_RUNTIME.md",
        "docs/FAILURE_MODEL.md",
        "docs/TESTING.md",
        "docs/DECISIONS.md",
    ]
    for rel in required_docs:
        if not (ROOT / rel).is_file():
            fail(f"missing context file {rel}")

    print(f"context-plan: OK ({len(tasks)} tasks, acyclic)")

if __name__ == "__main__":
    main()
