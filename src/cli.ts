import { initProject } from "./commands/init"

export type CliIo = {
  stdout: (text: string) => void
  stderr: (text: string) => void
}

export const VERSION = "0.1.0"

const HELP = `kilo-factory ${VERSION}

Usage: factory <command>

Commands:
  init      Initialize a new project with factory configuration
  --help    Show this message
  --version Show version
`

export function runCli(args: string[], io: CliIo): number {
  const [command] = args
  if (!command || command === "--help" || command === "-h" || command === "help") {
    io.stdout(HELP)
    return 0
  }
  if (command === "--version" || command === "-v") {
    io.stdout(`${VERSION}\n`)
    return 0
  }
  if (command === "init") {
    return runInit(args.slice(1), io)
  }
  io.stderr(`Unknown command: ${command}\nRun "factory --help" for usage.\n`)
  return 2
}

function runInit(args: string[], io: CliIo): number {
  const directory = args[0] ?? process.cwd()
  initProject(directory).then((result) => {
    if (result.ok) {
      io.stdout(`Initialized factory project at ${result.path}\n`)
      process.exitCode = 0
    } else {
      io.stderr(`Init failed: ${result.error}\n`)
      process.exitCode = 1
    }
  })
  return 0
}

if (import.meta.main) {
  process.exitCode = runCli(process.argv.slice(2), {
    stdout(text) {
      process.stdout.write(text)
    },
    stderr(text) {
      process.stderr.write(text)
    },
  })
}
