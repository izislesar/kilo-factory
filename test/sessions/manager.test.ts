import { describe, expect, test } from "bun:test"
import { SessionManager } from "../../src/sessions/manager"

describe("SessionManager", () => {
  test("lists configured roles with attach instructions", () => {
    const manager = new SessionManager([
      { name: "core", serverUrl: "http://localhost:4096" },
      { name: "review", serverUrl: "http://localhost:4096" },
    ])

    const roles = manager.listRoles()
    expect(roles.length).toBe(2)
    expect(roles[0].role).toBe("core")
    expect(roles[1].role).toBe("review")
  })

  test("generates copyable attach command for each role", () => {
    const manager = new SessionManager([
      { name: "core", serverUrl: "http://localhost:4096" },
    ])

    const instructions = manager.attachInstructions("core")
    expect(instructions).toContain("kilo attach")
    expect(instructions).toContain("http://localhost:4096")
    expect(instructions).toContain("--dir")
  })

  test("manual model selection is preserved in instructions", () => {
    const manager = new SessionManager([
      { name: "core", serverUrl: "http://localhost:4096" },
    ])

    const instructions = manager.attachInstructions("core")
    expect(instructions).not.toContain("--model")
    expect(instructions).not.toContain("--variant")
  })

  test("seed sessions are not reused as cross-task memory", () => {
    const manager = new SessionManager([
      { name: "core", serverUrl: "http://localhost:4096" },
    ])

    const roles = manager.listRoles()
    for (const role of roles) {
      expect(role.attachCommand).not.toContain("--continue")
      expect(role.attachCommand).not.toContain("--session")
    }
  })

  test("configured number of roles is arbitrary", () => {
    const configs = Array.from({ length: 5 }, (_, i) => ({
      name: `role-${i}`,
      serverUrl: "http://localhost:4096",
    }))
    const manager = new SessionManager(configs)

    expect(manager.listRoles().length).toBe(5)
  })
})
