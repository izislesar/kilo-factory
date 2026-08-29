import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { mkdir, rm, writeFile, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

const seedSessionID = process.env.KILO_SELFHOST_SEED_SESSION_ID
const factoryBin = process.env.FACTORY_BIN ?? join(import.meta.dir, "..", "..", "dist", "cli.js")

let fixtureDir: string

beforeAll(async () => {
  fixtureDir = join(tmpdir(), "kilo-factory-selfhost-" + Date.now())
  await mkdir(fixtureDir, { recursive: true })
})

afterAll(async () => {
  await rm(fixtureDir, { recursive: true, force: true }).catch(() => undefined)
})

const describeIfSelfHost = seedSessionID ? describe : describe.skip

describeIfSelfHost("self-host: dogfood kilo-factory on its own work", () => {
  test("fixture directory created", async () => {
    await writeFile(join(fixtureDir, "README.md"), "# Self-host fixture\n")
    const content = await readFile(join(fixtureDir, "README.md"), "utf8")
    expect(content).toContain("Self-host fixture")
  })

  test("factory binary functional", () => {
    const result = spawnSync("bun", [factoryBin, "--version"], { encoding: "utf8" })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("0.1.0")
  })

  test("factory init works in fixture", () => {
    const result = spawnSync("bun", [factoryBin, "init", fixtureDir], { encoding: "utf8" })
    expect(result.status).toBe(0)

    const configPath = join(fixtureDir, ".kilo-factory", "config.json")
    const config = JSON.parse(require("fs").readFileSync(configPath, "utf8"))
    expect(config.version).toBe(1)
  })
})
