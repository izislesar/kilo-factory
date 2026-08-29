import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { mkdir, rm, writeFile, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

const seedSessionID = process.env.KILO_FRESH_SEED_SESSION_ID
const packageDir = join(import.meta.dir, "..", "..")

let cleanDir: string
let tarballPath: string

beforeAll(async () => {
  cleanDir = join(tmpdir(), "kilo-factory-fresh-" + Date.now())
  await mkdir(cleanDir, { recursive: true })

  const packResult = spawnSync("npm", ["pack", "--dry-run", "--json"], { cwd: packageDir, encoding: "utf8" })
  try {
    const packInfo = JSON.parse(packResult.stdout)
    tarballPath = join(packageDir, packInfo[0]?.filename ?? "kilo-factory-0.1.0.tgz")
  } catch {
    tarballPath = join(packageDir, "kilo-factory-0.1.0.tgz")
  }
})

afterAll(async () => {
  await rm(cleanDir, { recursive: true, force: true }).catch(() => undefined)
})

const describeIfFresh = seedSessionID ? describe : describe.skip

describeIfFresh("fresh install: clean package acceptance", () => {
  test("tarball contains dist files", () => {
    const result = spawnSync("npm", ["pack", "--dry-run"], { cwd: packageDir, encoding: "utf8" })
    const output = result.stdout + result.stderr
    expect(output).toContain("dist/cli.js")
    expect(output).toContain("dist/plugin.js")
  })

  test("tarball contains declaration files", () => {
    const result = spawnSync("npm", ["pack", "--dry-run"], { cwd: packageDir, encoding: "utf8" })
    const output = result.stdout + result.stderr
    expect(output).toContain(".d.ts")
  })

  test("package.json has correct bin entry", async () => {
    const pkg = JSON.parse(await readFile(join(packageDir, "package.json"), "utf8"))
    expect(pkg.bin.factory).toBe("./dist/cli.js")
    expect(pkg.files).toContain("dist")
  })
})
