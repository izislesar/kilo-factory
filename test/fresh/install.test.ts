import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { mkdir, rm, writeFile, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

const factoryBin = process.env.FACTORY_BIN ?? join(import.meta.dir, "..", "..", "dist", "cli.js")
const packageDir = join(import.meta.dir, "..", "..")

let cleanDir: string

beforeAll(async () => {
  cleanDir = join(tmpdir(), "kilo-factory-fresh")
  await mkdir(cleanDir, { recursive: true })
})

afterAll(async () => {
  await rm(cleanDir, { recursive: true, force: true }).catch(() => undefined)
})

describe("fresh install: clean-clone acceptance", () => {
  test("package.json has correct entrypoints", async () => {
    const pkg = JSON.parse(await readFile(join(packageDir, "package.json"), "utf8"))
    expect(pkg.bin.factory).toBe("./dist/cli.js")
    expect(pkg.main).toBe("./dist/plugin.js")
    expect(pkg.exports["./server"]).toBeDefined()
  })

  test("dist directory contains built artifacts", async () => {
    const distDir = join(packageDir, "dist")
    const cli = await readFile(join(distDir, "cli.js"), "utf8").catch(() => null)
    const plugin = await readFile(join(distDir, "plugin.js"), "utf8").catch(() => null)

    expect(cli).not.toBeNull()
    expect(plugin).not.toBeNull()
  })

  test("factory init works in clean directory", async () => {
    const result = spawnSync("bun", [factoryBin, "init", cleanDir], { encoding: "utf8" })
    expect(result.status).toBe(0)

    const config = await readFile(join(cleanDir, ".kilo-factory", "config.json"), "utf8")
    const parsed = JSON.parse(config)
    expect(parsed.version).toBe(1)
    expect(parsed.roles).toBeDefined()
  })

  test("no absolute developer paths in config template", async () => {
    const config = await readFile(join(cleanDir, ".kilo-factory", "config.json"), "utf8")
    expect(config).not.toContain("/home/")
    expect(config).not.toContain("izislesar")
  })

  test("factory binary is executable", () => {
    const result = spawnSync("bun", [factoryBin, "--version"], { encoding: "utf8" })
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe("0.1.0")
  })
})
