import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { initProject, loadProjectConfig } from "../../src/commands/init"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "kilo-factory-init-"))
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe("factory init", () => {
  test("creates project config in .kilo-factory directory", async () => {
    const result = await initProject(tempDir)

    expect(result.ok).toBe(true)
    expect(result.path).toContain(".kilo-factory/config.json")
  })

  test("loads created config", async () => {
    await initProject(tempDir)
    const config = await loadProjectConfig(tempDir)

    expect(config).not.toBeNull()
    expect(config?.version).toBe(1)
    expect(config?.mainBranch).toBe("main")
  })

  test("re-init is idempotent and preserves config", async () => {
    await initProject(tempDir)
    const second = await initProject(tempDir)

    expect(second.ok).toBe(true)
    const config = await loadProjectConfig(tempDir)
    expect(config?.version).toBe(1)
  })

  test("accepts custom config overrides", async () => {
    const result = await initProject(tempDir, {
      mainBranch: "develop",
      roles: [{ name: "backend" }, { name: "frontend" }],
    })

    expect(result.ok).toBe(true)
    const config = await loadProjectConfig(tempDir)
    expect(config?.mainBranch).toBe("develop")
    expect(config?.roles.length).toBe(2)
  })

  test("returns null for uninitialized directory", async () => {
    const config = await loadProjectConfig(tempDir)
    expect(config).toBeNull()
  })
})
