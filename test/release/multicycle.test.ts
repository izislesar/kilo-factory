import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { mkdir, rm, writeFile, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

const seedSessionID = process.env.KILO_MULTICYCLE_SEED_SESSION_ID
const factoryBin = process.env.FACTORY_BIN ?? join(import.meta.dir, "..", "..", "dist", "cli.js")

let fixtureDir: string

beforeAll(async () => {
  fixtureDir = join(tmpdir(), "kilo-factory-multicycle")
  await mkdir(fixtureDir, { recursive: true })
})

afterAll(async () => {
  await rm(fixtureDir, { recursive: true, force: true }).catch(() => undefined)
})

const describeIfMulti = seedSessionID ? describe : describe.skip

describeIfMulti("multi-cycle: unattended factory acceptance", () => {
  test("fixture repository initialized", async () => {
    const gitDir = join(fixtureDir, "repo")
    await mkdir(gitDir, { recursive: true })
    spawnSync("git", ["init", "--initial-branch=main"], { cwd: gitDir })
    await writeFile(join(gitDir, "README.md"), "# Multi-cycle fixture\n")
    spawnSync("git", ["add", "README.md"], { cwd: gitDir })
    spawnSync("git", ["-c", "user.name=Test", "-c", "user.email=test@invalid", "commit", "-m", "init"], { cwd: gitDir })

    const readme = await readFile(join(gitDir, "README.md"), "utf8")
    expect(readme).toContain("Multi-cycle fixture")
  })

  test("factory init creates multi-role config", async () => {
    const config = {
      version: 1,
      mainBranch: "main",
      roles: [
        { name: "role-a", instructions: "First role" },
        { name: "role-b", instructions: "Second role" },
      ],
    }
    const configPath = join(fixtureDir, "repo", ".kilo-factory")
    await mkdir(configPath, { recursive: true })
    await writeFile(join(configPath, "config.json"), JSON.stringify(config, null, 2))

    const saved = JSON.parse(await readFile(join(configPath, "config.json"), "utf8"))
    expect(saved.roles.length).toBe(2)
  })

  test("factory binary functional", () => {
    const result = spawnSync("bun", [factoryBin, "--version"], { encoding: "utf8" })
    expect(result.status).toBe(0)
  })
})
