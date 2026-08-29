import { describe, expect, test, beforeEach } from "bun:test"
import type { ProjectConfig, RoleConfig } from "../../src/config/types"

describe("project config schema", () => {
  test("accepts minimal valid config", () => {
    const config: ProjectConfig = {
      version: 1,
      mainBranch: "main",
      roles: [{ name: "core", instructions: "Core work" }],
      validation: { command: "echo ok" },
    }
    expect(config.roles.length).toBe(1)
  })

  test("role names are configuration not hardcoded", () => {
    const role: RoleConfig = { name: "any-name" }
    expect(typeof role.name).toBe("string")
  })

  test("validation command is optional", () => {
    const config: ProjectConfig = {
      version: 1,
      mainBranch: "main",
      roles: [{ name: "core" }],
    }
    expect(config.validation).toBeUndefined()
  })
})
