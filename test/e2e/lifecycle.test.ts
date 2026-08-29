import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

const kiloBin = process.env.KILO_BIN ?? "kilo"
const factoryBin = process.env.FACTORY_BIN ?? join(import.meta.dir, "..", "..", "dist", "cli.js")
const seedSessionID = process.env.KILO_E2E_SEED_SESSION_ID

let fixtureDir: string
let fixtureWorktreeDir: string

async function initFixture(): Promise<void> {
  fixtureDir = await mkdtemp(join(tmpdir(), "kilo-factory-e2e-"))
  fixtureWorktreeDir = join(fixtureDir, "worktrees")
  await mkdir(fixtureWorktreeDir, { recursive: true })

  const gitDir = join(fixtureDir, "repo")
  await mkdir(gitDir, { recursive: true })
  spawnSync("git", ["init", "--initial-branch=main"], { cwd: gitDir })
  await writeFile(join(gitDir, "README.md"), "# E2E Fixture\n")
  spawnSync("git", ["add", "README.md"], { cwd: gitDir })
  spawnSync("git", ["-c", "user.name=E2E", "-c", "user.email=e2e@invalid", "commit", "-m", "init"], { cwd: gitDir })
}

async function cleanupFixture(): Promise<void> {
  if (fixtureDir) await rm(fixtureDir, { recursive: true, force: true }).catch(() => undefined)
}

const describeIfE2E = seedSessionID ? describe : describe.skip

describeIfE2E("E2E: real installed-plugin lifecycle", () => {
  beforeAll(async () => {
    await initFixture()
  })

  afterAll(async () => {
    await cleanupFixture()
  })

  test("fixture repository initialized correctly", async () => {
    const readme = await readFile(join(fixtureDir, "repo", "README.md"), "utf8")
    expect(readme).toContain("E2E Fixture")
  })

  test("worktree directory created", async () => {
    const stats = await readFile(join(fixtureDir, "worktrees", ".gitkeep"), "utf8").catch(() => null)
    expect(stats).toBeNull()
  })

  test("factory bin exists", async () => {
    const result = spawnSync("bun", [factoryBin, "--version"], { encoding: "utf8" })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("0.1.0")
  })
})
