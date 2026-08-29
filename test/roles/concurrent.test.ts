import { describe, expect, test } from "bun:test"
import { ConfiguredRoleScheduler } from "../../src/roles/scheduler"
import type { ProjectConfig } from "../../src/config/types"

const config: ProjectConfig = {
  version: 1,
  mainBranch: "main",
  roles: [{ name: "core" }, { name: "review" }],
}

describe("concurrent multi-role acceptance", () => {
  test("two roles execute concurrently without cross-contamination", () => {
    const scheduler = new ConfiguredRoleScheduler(2)
    scheduler.addRoleSeed("core", "ses_core", { providerID: "kilo", modelID: "kilo-7.5" })
    scheduler.addRoleSeed("review", "ses_review", { providerID: "openai", modelID: "gpt-5" })

    const role1 = scheduler.assignRole("bead-1", config)
    const role2 = scheduler.assignRole("bead-2", config)

    expect(role1).not.toBe(role2)

    const seed1 = scheduler.getSeedForRole(role1)
    const seed2 = scheduler.getSeedForRole(role2)
    expect(seed1?.model.modelID).not.toBe(seed2?.model.modelID)
  })

  test("role capacity is enforced", () => {
    const scheduler = new ConfiguredRoleScheduler(1)

    const role1 = scheduler.assignRole("bead-1", { ...config, roles: [{ name: "core" }] })
    const role2 = scheduler.assignRole("bead-2", { ...config, roles: [{ name: "core" }] })

    expect(role1).toBe("core")
    expect(role2).toBe("core")
  })

  test("distinct roles use distinct seed sessions", () => {
    const scheduler = new ConfiguredRoleScheduler()
    scheduler.addRoleSeed("core", "ses_core", { providerID: "kilo", modelID: "kilo-7.5" })
    scheduler.addRoleSeed("review", "ses_review", { providerID: "openai", modelID: "gpt-5" })

    const coreSeed = scheduler.getSeedForRole("core")
    const reviewSeed = scheduler.getSeedForRole("review")

    expect(coreSeed?.model.modelID).toBe("kilo-7.5")
    expect(reviewSeed?.model.modelID).toBe("gpt-5")
  })
})
