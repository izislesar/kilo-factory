import { describe, expect, test } from "bun:test"
import { CommandDispatcher } from "../../src/cli/dispatcher"
import type { CommandResult, CommandContext } from "../../src/cli/dispatcher"

const context: CommandContext = {
  configPath: "/tmp/config.json",
  statePath: "/tmp/state.db",
  worktreeRoot: "/tmp/wt",
}

const stubCommand = (result: CommandResult) => ({
  name: "test",
  description: "Test command",
  execute: async () => result,
})

describe("CommandDispatcher", () => {
  test("dispatches registered command", async () => {
    const dispatcher = new CommandDispatcher()
    dispatcher.register(stubCommand({ ok: true, exitCode: 0, output: "done" }))

    const result = await dispatcher.dispatch(["test"], context)

    expect(result.ok).toBe(true)
    expect(result.output).toBe("done")
  })

  test("returns error for unknown command", async () => {
    const dispatcher = new CommandDispatcher()

    const result = await dispatcher.dispatch(["unknown"], context)

    expect(result.ok).toBe(false)
    expect(result.exitCode).toBe(2)
    expect(result.error).toContain("Unknown command")
  })

  test("returns error when no command specified", async () => {
    const dispatcher = new CommandDispatcher()

    const result = await dispatcher.dispatch([], context)

    expect(result.ok).toBe(false)
    expect(result.exitCode).toBe(2)
  })

  test("passes args to command execute", async () => {
    let receivedArgs: string[] = []
    const dispatcher = new CommandDispatcher()
    dispatcher.register({
      name: "echo",
      description: "Echo",
      execute: async (args) => {
        receivedArgs = args
        return { ok: true, exitCode: 0 }
      },
    })

    await dispatcher.dispatch(["echo", "hello", "world"], context)

    expect(receivedArgs).toEqual(["hello", "world"])
  })

  test("lists registered command names", async () => {
    const dispatcher = new CommandDispatcher()
    dispatcher.register(stubCommand({ ok: true, exitCode: 0 }))
    dispatcher.register({ ...stubCommand({ ok: true, exitCode: 0 }), name: "other" })

    expect(dispatcher.commandNames().sort()).toEqual(["other", "test"])
  })
})
