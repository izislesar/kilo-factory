import { describe, expect, test } from "bun:test"
import { ConfiguredRoleScheduler } from "../../src/roles/scheduler"
import type { ProjectConfig } from "../../src/config/types"

const config: ProjectConfig = {
  version: 1,
  mainBranch: "main",
  roles: [{ name: "core" }, { name: "review" }],
}

describe("ConfiguredRoleScheduler", () => {
  test("assigns roles by least-loaded policy", () => {
    const scheduler = new ConfiguredRoleScheduler(2)
    scheduler.addRoleSeed("core", "ses_core", { providerID: "kilo", modelID: "kilo-7.5" })
    scheduler.addRoleSeed("review", "ses_review", { providerID: "openai", modelID: "gpt-5" })

    const role1 = scheduler.assignRole("bead-1", config)
    const role2 = scheduler.assignRole("bead-2", config)

    expect(["core", "review"]).toContain(role1)
    expect(["core", "review"]).toContain(role2)
  })

  test("respects max concurrent per role", () => {
    const scheduler = new ConfiguredRoleScheduler(1)
    scheduler.addRoleSeed("core", "ses_core", { providerID: "kilo", modelID: "kilo-7.5" })
    scheduler.addRoleSeed("review", "ses_review", { providerID: "openai", modelID: "gpt-5" })

    const role1 = scheduler.assignRole("bead-1", config)
    const role2 = scheduler.assignRole("bead-2", config)

    expect(role1).not.toBe(role2)
  })

  test("distinct roles use distinct seed configurations", () => {
    const scheduler = new ConfiguredRoleScheduler()
    scheduler.addRoleSeed("core", "ses_core", { providerID: "kilo", modelID: "kilo-7.5" })
    scheduler.addRoleSeed("review", "ses_review", { providerID: "openai", modelID: "gpt-5" })

    const coreSeed = scheduler.getSeedForRole("core")
    const reviewSeed = scheduler.getSeedForRole("review")

    expect(coreSeed?.model.modelID).toBe("kilo-7.5")
    expect(reviewSeed?.model.modelID).toBe("gpt-5")
  })

  test("release role frees capacity", () => {
    const scheduler = new ConfiguredRoleScheduler(1)
    scheduler.addRoleSeed("core", "ses_core", { providerID: "kilo", modelID: "kilo-7.5" })

    scheduler.assignRole("bead-1", { ...config, roles: [{ name: "core" }] })
    scheduler.releaseRole("core")

    const role2 = scheduler.assignRole("bead-2", { ...config, roles: [{ name: "core" }] })
    expect(role2).toBe("core")
  })

  test("two roles cannot cross-contaminate identity", () => {
    const scheduler = new ConfiguredRoleScheduler()
    scheduler.addRoleSeed("core", "ses_core", { providerID: "kilo", modelID: "kilo-7.5" })
    scheduler.addRoleSeed("review", "ses_review", { providerID: "openai", modelID: "gpt-5" })

    const coreSeed = scheduler.getSeedForRole("core")
    const reviewSeed = scheduler.getSeedForRole("review")

    expect(coreSeed).not.toEqual(reviewSeed)
  })
})
