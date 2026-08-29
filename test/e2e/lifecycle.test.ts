import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { mkdir, rm, writeFile, readFile, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"

const kiloBin = process.env.KILO_BIN ?? "kilo"
const factoryBin = process.env.FACTORY_BIN ?? join(import.meta.dir, "..", "..", "dist", "cli.js")
const seedSessionID = process.env.KILO_E2E_SEED_SESSION_ID
const distDir = join(import.meta.dir, "..", "..", "dist")

let fixtureDir: string
let fixtureRepo: string

async function initFixture(): Promise<void> {
  fixtureDir = join(tmpdir(), "kilo-factory-e2e-" + Date.now())
  fixtureRepo = join(fixtureDir, "repo")

  await mkdir(fixtureRepo, { recursive: true })

  spawnSync("git", ["init", "--initial-branch=main"], { cwd: fixtureRepo })
  await writeFile(join(fixtureRepo, "README.md"), "# E2E Fixture\n\nTest project.\n")
  spawnSync("git", ["add", "README.md"], { cwd: fixtureRepo })
  spawnSync("git", ["-c", "user.name=E2E", "-c", "user.email=e2e@invalid", "commit", "-m", "init"], { cwd: fixtureRepo })
  spawnSync("git", ["-c", "user.name=E2E", "-c", "user.email=e2e@invalid", "commit", "--allow-empty", "-m", "base"], { cwd: fixtureRepo })

  spawnSync("bd", ["init", "--skip-agents"], { cwd: fixtureRepo })

  const pluginDir = join(fixtureRepo, ".kilo", "plugin")
  await mkdir(pluginDir, { recursive: true })
  if (existsSync(join(distDir, "plugin.js"))) {
    await symlink(join(distDir, "plugin.js"), join(pluginDir, "kilo-factory.js")).catch(() => undefined)
  }
}

async function cleanupFixture(): Promise<void> {
  if (fixtureDir) {
    await rm(fixtureDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

const describeIfE2E = seedSessionID ? describe : describe.skip

describeIfE2E("E2E: real installed-plugin lifecycle", () => {
  beforeAll(async () => {
    await initFixture()
  })

  afterAll(async () => {
    await cleanupFixture()
  })

  test("fixture repository initialized", async () => {
    const readme = await readFile(join(fixtureRepo, "README.md"), "utf8")
    expect(readme).toContain("E2E Fixture")
  })

  test("Beads initialized in fixture", () => {
    const result = spawnSync("bd", ["list", "--status=open"], { cwd: fixtureRepo, encoding: "utf8" })
    expect(result.status).toBe(0)
  })

  test("plugin symlinked to fixture", () => {
    const pluginPath = join(fixtureRepo, ".kilo", "plugin", "kilo-factory.js")
    expect(existsSync(pluginPath)).toBe(true)
  })

  test("factory init creates config", () => {
    const result = spawnSync("bun", [factoryBin, "init", fixtureRepo], { encoding: "utf8" })
    expect(result.status).toBe(0)

    const configPath = join(fixtureRepo, ".kilo-factory", "config.json")
    const config = JSON.parse(require("fs").readFileSync(configPath, "utf8"))
    expect(config.version).toBe(1)
    expect(config.roles).toBeDefined()
  })

  test("Kilo server healthy", () => {
    const { execSync } = require("child_process")
    const health = execSync(`curl -s "http://127.0.0.1:41457/global/health"`, { encoding: "utf8" })
    expect(JSON.parse(health).healthy).toBe(true)
  })

  test("seed session readable via REST", () => {
    const { execSync } = require("child_process")
    const session = execSync(`curl -s "http://127.0.0.1:41457/session/${seedSessionID}?directory=${encodeURIComponent(fixtureRepo)}"`, { encoding: "utf8" })
    const parsed = JSON.parse(session)
    expect(parsed.id).toBe(seedSessionID)
  })
})
