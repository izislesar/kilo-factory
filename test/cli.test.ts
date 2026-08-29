import { describe, expect, test } from "bun:test"
import { runCli } from "../src/cli"

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
  test("prints help without starting a coordinator", () => {
    const output = capture()

    expect(runCli([], output.io)).toBe(0)
    expect(output.stdout.join("")).toContain("Usage: factory <command>")
    expect(output.stderr).toEqual([])
  })

  test("prints the package version", () => {
    const output = capture()

    expect(runCli(["--version"], output.io)).toBe(0)
    expect(output.stdout).toEqual(["0.1.0\n"])
    expect(output.stderr).toEqual([])
  })

  test("rejects commands that are not implemented", () => {
    const output = capture()

    expect(runCli(["unknown"], output.io)).toBe(2)
    expect(output.stdout).toEqual([])
    expect(output.stderr.join("")).toContain("Unknown command: unknown")
  })

  test("init command is recognized", () => {
    const output = capture()
    const exitCode = runCli(["init"], output.io)

    expect(exitCode).toBe(0)
  })
})
