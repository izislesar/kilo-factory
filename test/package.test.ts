import { describe, expect, test } from "bun:test"
import { stat } from "node:fs/promises"
import { join } from "node:path"

const root = join(import.meta.dir, "..")
const cli = join(root, "dist", "cli.js")

describe("built package", () => {
  test("ships a directly executable factory bin", async () => {
    expect((await stat(cli)).mode & 0o111).not.toBe(0)

    const process = Bun.spawn([cli, "--version"], { cwd: root, stdout: "pipe", stderr: "pipe" })
    expect(await process.exited).toBe(0)
    expect(await new Response(process.stdout).text()).toBe("0.1.0\n")
    expect(await new Response(process.stderr).text()).toBe("")
  })

  test("resolves the exported Kilo server plugin", async () => {
    const packageEntrypoint = "kilo-factory/server"
    const module = await import(packageEntrypoint)

    expect(module.default.id).toBe("kilo-factory")
    expect(typeof module.default.server).toBe("function")
  })
})
