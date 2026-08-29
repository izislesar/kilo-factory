export type CommandContext = {
  configPath: string
  statePath: string
  worktreeRoot: string
}

export type CommandResult = {
  ok: boolean
  exitCode: number
  output?: string
  error?: string
}

export type CliCommand = {
  name: string
  description: string
  execute(args: string[], context: CommandContext): Promise<CommandResult>
}

export class CommandDispatcher {
  private commands = new Map<string, CliCommand>()

  register(command: CliCommand): void {
    this.commands.set(command.name, command)
  }

  async dispatch(args: string[], context: CommandContext): Promise<CommandResult> {
    const [name, ...rest] = args
    if (!name) {
      return { ok: false, exitCode: 2, error: "No command specified" }
    }
    const command = this.commands.get(name)
    if (!command) {
      return { ok: false, exitCode: 2, error: `Unknown command: ${name}` }
    }
    return command.execute(rest, context)
  }

  getCommand(name: string): CliCommand | undefined {
    return this.commands.get(name)
  }

  commandNames(): string[] {
    return [...this.commands.keys()]
  }
}

export function createDispatcher(): CommandDispatcher {
  return new CommandDispatcher()
}
