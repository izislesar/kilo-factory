import { createContext, cmdInit, cmdStart, cmdStatus, cmdSessions, cmdInspect, cmdPause, cmdResume, cmdStop, cmdDoctor } from "./commands"

export type CliIo = {
  stdout: (text: string) => void
  stderr: (text: string) => void
}

export const VERSION = "0.1.0"

const HELP = `kilo-factory ${VERSION}

Usage: factory <command>

Commands:
  init [dir]    Initialize a new project with factory configuration
  start         Start the factory (validates config and Kilo liveness)
  status        Show factory status and active jobs
  sessions      List active Kilo sessions
  inspect <id>  Inspect a specific job
  pause         Pause scheduling (no new jobs)
  resume        Resume scheduling
  stop          Stop factory and quarantine active jobs
  doctor        Run diagnostics
  --help        Show this message
  --version     Show version
`

async function runCliAsync(args: string[], io: CliIo): Promise<number> {
  const [command, ...rest] = args

  if (!command || command === "--help" || command === "-h" || command === "help") {
    io.stdout(HELP)
    return 0
  }

  if (command === "--version" || command === "-v") {
    io.stdout(`${VERSION}\n`)
    return 0
  }

  const context = createContext(process.cwd())
  let result: { ok: boolean; exitCode: number; lines: string[]; errors: string[] }

  switch (command) {
    case "init":
      result = await cmdInit(rest)
      break
    case "start":
      result = await cmdStart(context)
      break
    case "status":
      result = await cmdStatus(context)
      break
    case "sessions":
      result = await cmdSessions(context)
      break
    case "inspect":
      result = await cmdInspect(context, rest[0])
      break
    case "pause":
      result = await cmdPause(context)
      break
    case "resume":
      result = await cmdResume(context)
      break
    case "stop":
      result = await cmdStop(context)
      break
    case "doctor":
      result = await cmdDoctor(context)
      break
    default:
      io.stderr(`Unknown command: ${command}\nRun "factory --help" for usage.\n`)
      return 2
  }

  for (const line of result.lines) {
    io.stdout(`${line}\n`)
  }
  for (const error of result.errors) {
    io.stderr(`ERROR: ${error}\n`)
  }
  return result.exitCode
}

export function runCli(args: string[], io: CliIo): number {
  let exitCode = 2
  let resolved = false
  runCliAsync(args, io).then((code) => {
    exitCode = code
    resolved = true
  }).catch((error) => {
    io.stderr(`Fatal: ${String(error)}\n`)
    resolved = true
  })
  const start = Date.now()
  while (!resolved && Date.now() - start < 30_000) {
    Bun.sleepSync(10)
  }
  return exitCode
}

if (import.meta.main) {
  const code = runCli(process.argv.slice(2), {
    stdout(text) {
      process.stdout.write(text)
    },
    stderr(text) {
      process.stderr.write(text)
    },
  })
  process.exitCode = code
}
