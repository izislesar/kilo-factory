import { describe, expect, test } from "bun:test"
import { BeadsCliBackend } from "../../src/beads/cli"
import type { BeadsIssue } from "../../src/beads/types"

const makeIssue = (overrides: Partial<BeadsIssue> = {}): BeadsIssue => ({
  id: "kilo-factory-001",
  title: "Test issue",
  description: "A test issue",
  status: "open",
  priority: 0,
  issue_type: "task",
  dependencies: [],
  dependency_count: 0,
  dependent_count: 0,
  ...overrides,
})

const makeBackend = (
  handler: (command: string[]) => { stdout?: string; stderr?: string; exitCode?: number },
): BeadsCliBackend => {
  const execFn = async (command: string[]) => {
    const result = handler(command) ?? {}
    return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", exitCode: result.exitCode ?? 0 }
  }
  return new BeadsCliBackend("bd", execFn as never)
}

describe("BeadsCliBackend", () => {
  test("ready returns parsed issues from JSON", async () => {
    const issues = [makeIssue(), makeIssue({ id: "kilo-factory-002", title: "Second" })]
    const commands: string[][] = []
    const backend = makeBackend((command) => {
      commands.push(command)
      if (command.includes("ready")) {
        return { stdout: JSON.stringify(issues) }
      }
      return {}
    })

    const result = await backend.ready()

    expect(result.length).toBe(2)
    expect(result[0].id).toBe("kilo-factory-001")
    expect(result[1].title).toBe("Second")
  })

  test("ready excludes epics when filter is set", async () => {
    const issues = [
      makeIssue({ id: "kilo-factory-001", issue_type: "task" }),
      makeIssue({ id: "kilo-factory-000", issue_type: "epic", title: "Epic" }),
    ]
    const backend = makeBackend((command) => {
      if (command.includes("ready")) return { stdout: JSON.stringify(issues) }
      return {}
    })

    const result = await backend.ready({ excludeEpics: true })

    expect(result.length).toBe(1)
    expect(result[0].issue_type).toBe("task")
  })

  test("ready handles empty JSON array", async () => {
    const backend = makeBackend(() => ({ stdout: "[]" }))
    const result = await backend.ready()
    expect(result).toEqual([])
  })

  test("ready handles malformed JSON gracefully", async () => {
    const backend = makeBackend(() => ({ stdout: "not json" }))
    const result = await backend.ready()
    expect(result).toEqual([])
  })

  test("show returns single issue", async () => {
    const issue = makeIssue()
    const backend = makeBackend((command) => {
      if (command.includes("show")) return { stdout: JSON.stringify(issue) }
      return {}
    })

    const result = await backend.show("kilo-factory-001")

    expect(result?.id).toBe("kilo-factory-001")
  })

  test("show returns null on command failure", async () => {
    const backend = makeBackend((command) => {
      if (command.includes("show")) return { exitCode: 1, stderr: "not found" }
      return {}
    })

    const result = await backend.show("kilo-factory-999")

    expect(result).toBeNull()
  })

  test("claim updates issue status", async () => {
    const commands: string[][] = []
    const backend = makeBackend((command) => {
      commands.push(command)
      return {}
    })

    const result = await backend.claim("kilo-factory-001")

    expect(result).toBe(true)
    expect(commands.some((c) => c.includes("update") && c.includes("kilo-factory-001") && c.includes("--claim"))).toBe(true)
  })

  test("close updates issue with reason", async () => {
    const commands: string[][] = []
    const backend = makeBackend((command) => {
      commands.push(command)
      return {}
    })

    const result = await backend.close("kilo-factory-001", "completed")

    expect(result).toBe(true)
    expect(commands.some((c) => c.includes("close") && c.includes("kilo-factory-001"))).toBe(true)
  })

  test("update sends field changes as flags", async () => {
    const commands: string[][] = []
    const backend = makeBackend((command) => {
      commands.push(command)
      return {}
    })

    await backend.update("kilo-factory-001", { title: "New title", notes: "Some notes" })

    const update = commands.find((c) => c.includes("update"))
    expect(update).toContain("--title")
    expect(update).toContain("New title")
    expect(update).toContain("--notes")
    expect(update).toContain("Some notes")
  })

  test("handles command failure gracefully", async () => {
    const backend = makeBackend(() => ({ exitCode: 1, stderr: "error" }))

    const result = await backend.claim("kilo-factory-001")

    expect(result).toBe(false)
  })
})
