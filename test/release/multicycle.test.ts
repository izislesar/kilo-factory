import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { mkdir, rm, writeFile, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

const seedSessionID = process.env.KILO_MULTICYCLE_SEED_SESSION_ID
const factoryBin = process.env.FACTORY_BIN ?? join(import.meta.dir, "..", "..", "dist", "cli.js")

let fixtureDir: string
let fixtureRepo: string

beforeAll(async () => {
  fixtureDir = join(tmpdir(), "kilo-factory-multicycle-" + Date.now())
  fixtureRepo = join(fixtureDir, "repo")
  await mkdir(fixtureRepo, { recursive: true })

  spawnSync("git", ["init", "--initial-branch=main"], { cwd: fixtureRepo })
  await writeFile(join(fixtureRepo, "README.md"), "# Multi-cycle fixture\n")
  spawnSync("git", ["add", "README.md"], { cwd: fixtureRepo })
  spawnSync("git", ["-c", "user.name=Test", "-c", "user.email=test@invalid", "commit", "-m", "init"], { cwd: fixtureRepo })

  spawnSync("bd", ["init", "--skip-agents"], { cwd: fixtureRepo })
})

afterAll(async () => {
  await rm(fixtureDir, { recursive: true, force: true }).catch(() => undefined)
})

const describeIfMulti = seedSessionID ? describe : describe.skip

describeIfMulti("multi-cycle: unattended multi-role scheduling", () => {
  test("fixture repository initialized with Beads", () => {
    const result = spawnSync("bd", ["list", "--status=open"], { cwd: fixtureRepo, encoding: "utf8" })
    expect(result.status).toBe(0)
  })

  test("factory init creates multi-role config", () => {
    const result = spawnSync("bun", [factoryBin, "init", fixtureRepo], { encoding: "utf8" })
    expect(result.status).toBe(0)

    const configPath = join(fixtureRepo, ".kilo-factory", "config.json")
    const config = JSON.parse(require("fs").readFileSync(configPath, "utf8"))
    expect(config.roles.length).toBeGreaterThanOrEqual(1)
  })

  test("factory status shows configured roles", () => {
    const result = spawnSync("bun", [factoryBin, "status"], { cwd: fixtureRepo, encoding: "utf8" })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("Roles:")
  })

  test("factory CLI produces valid output", () => {
    const result = spawnSync("bun", [factoryBin, "--version"], { encoding: "utf8" })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("0.1.0")
  })
})
