export type CliIo = {
  stdout: (text: string) => void
  stderr: (text: string) => void
}

export const VERSION = "0.1.0"

const HELP = `kilo-factory ${VERSION}

Usage: factory <command>

Run "factory --help" to show this message.
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
  io.stderr(`Unknown command: ${command}\nRun "factory --help" for usage.\n`)
  return 2
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
