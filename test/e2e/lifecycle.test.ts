import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { mkdir, rm, writeFile, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

const seedSessionID = process.env.KILO_E2E_SEED_SESSION_ID
const factoryBin = process.env.FACTORY_BIN ?? join(import.meta.dir, "..", "..", "dist", "cli.js")

let fixtureDir: string
let fixtureRepo: string

beforeAll(async () => {
  fixtureDir = join(tmpdir(), "kilo-factory-e2e-" + Date.now())
  fixtureRepo = join(fixtureDir, "repo")
  await mkdir(fixtureRepo, { recursive: true })

  spawnSync("git", ["init", "--initial-branch=main"], { cwd: fixtureRepo })
  await writeFile(join(fixtureRepo, "README.md"), "# E2E Fixture\n\nInitial content.\n")
  spawnSync("git", ["add", "README.md"], { cwd: fixtureRepo })
  spawnSync("git", ["-c", "user.name=Test", "-c", "user.email=test@invalid", "commit", "-m", "init"], { cwd: fixtureRepo })
})

afterAll(async () => {
  await rm(fixtureDir, { recursive: true, force: true }).catch(() => undefined)
})

const describeIfE2E = seedSessionID ? describe : describe.skip

describeIfE2E("E2E: true shipped autonomous lifecycle", () => {
  test("fixture repository initialized correctly", async () => {
    const readme = await readFile(join(fixtureRepo, "README.md"), "utf8")
    expect(readme).toContain("E2E Fixture")
  })

  test("factory CLI is functional", () => {
    const result = spawnSync("bun", [factoryBin, "--version"], { encoding: "utf8" })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("0.1.0")
  })

  test("factory init works in fixture directory", () => {
    const result = spawnSync("bun", [factoryBin, "init", fixtureRepo], { encoding: "utf8" })
    expect(result.status).toBe(0)

    const configPath = join(fixtureRepo, ".kilo-factory", "config.json")
    const config = JSON.parse(require("fs").readFileSync(configPath, "utf8"))
    expect(config.version).toBe(1)
  })

  test("factory doctor passes in fixture", () => {
    const result = spawnSync("bun", [factoryBin, "doctor"], {
      cwd: fixtureRepo,
      encoding: "utf8",
      env: { ...process.env, KILO_BASE_URL: "http://127.0.0.1:37273" },
      timeout: 30_000,
    })
    expect(result.status).toBe(0)
  })
})
