import { describe, expect, test } from "bun:test"
import { mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

const seedSessionID = process.env.KILO_FRESH_SEED_SESSION_ID
const packageDir = join(import.meta.dir, "..", "..")
const factoryBin = join(packageDir, "dist", "cli.js")

let cleanDir: string

const describeIfFresh = seedSessionID ? describe : describe.skip

describeIfFresh("fresh clone: package acceptance", () => {
  test("tarball contains all required runtime files", () => {
    const result = spawnSync("npm", ["pack", "--dry-run"], { cwd: packageDir, encoding: "utf8" })
    const output = result.stdout + result.stderr
    expect(output).toContain("dist/cli.js")
    expect(output).toContain("dist/plugin.js")
    expect(output).toContain("package.json")
  })

  test("package.json has correct bin and exports", () => {
    const pkg = JSON.parse(require("fs").readFileSync(join(packageDir, "package.json"), "utf8"))
    expect(pkg.bin.factory).toBe("./dist/cli.js")
    expect(pkg.exports["./server"]).toBeDefined()
    expect(pkg.files).toContain("dist")
  })

  test("CLI is executable from built output", () => {
    const result = spawnSync("bun", [factoryBin, "--version"], { encoding: "utf8" })
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe("0.1.0")
  })

  test("CLI help works without config", () => {
    const result = spawnSync("bun", [factoryBin, "--help"], { encoding: "utf8" })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("factory")
  })
})
