import { describe, expect, test } from "bun:test"
import { runCliAsync } from "../src/cli"

function capture() {
  const stdout: string[] = []
  const stderr: string[] = []
  return {
    io: {
      stdout: (text: string) => stdout.push(text),
      stderr: (text: string) => stderr.push(text),
    },
    stdout,
    stderr,
  }
}

describe("factory CLI", () => {
  test("prints help without starting a coordinator", async () => {
    const output = capture()
    expect(await runCliAsync([], output.io)).toBe(0)
    expect(output.stdout.join("")).toContain("Usage: factory <command>")
    expect(output.stderr).toEqual([])
  })

  test("prints the package version", async () => {
    const output = capture()
    expect(await runCliAsync(["--version"], output.io)).toBe(0)
    expect(output.stdout).toEqual(["0.1.0\n"])
    expect(output.stderr).toEqual([])
  })

  test("rejects commands that are not implemented", async () => {
    const output = capture()
    expect(await runCliAsync(["unknown"], output.io)).toBe(2)
    expect(output.stdout).toEqual([])
    expect(output.stderr.join("")).toContain("Unknown command: unknown")
  })

  test("init command is recognized", async () => {
    const output = capture()
    const exitCode = await runCliAsync(["init"], output.io)
    expect(exitCode).toBe(0)
  })
})
