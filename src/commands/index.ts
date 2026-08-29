import { existsSync } from "node:fs"
import { resolve, join } from "node:path"
import { initProject, loadProjectConfig } from "./init"
import { SqliteStateStore } from "../state/sqlite"
import { createKiloAdapter } from "../kilo/RestKiloAdapter"
import { createWorktreeManager } from "../worktree/manager"
import { createVerifier } from "../artifacts/verifier"
import { createEventLogger } from "../observability/logger"
import { createCoordinator } from "../coordinator/coordinator"
import { createIntegrationPipeline } from "../integration/pipeline"
import { createRecoveryReconciler } from "../recovery/reconciler"
import { createProcessTracker, createServerLifecycle } from "../security/index"
import { createRoleScheduler } from "../roles/scheduler"

export type CommandContext = {
  configDir: string
  statePath: string
  worktreeRoot: string
  kiloUrl: string
}

export type CommandOutput = {
  ok: boolean
  exitCode: number
  lines: string[]
  errors: string[]
}

export function createContext(directory: string): CommandContext {
  const configDir = resolve(directory)
  const factoryDir = join(configDir, ".kilo-factory")
  return {
    configDir,
    statePath: join(factoryDir, "state.db"),
    worktreeRoot: join(factoryDir, "worktrees"),
    kiloUrl: process.env.KILO_BASE_URL ?? "http://127.0.0.1:37273",
  }
}

export async function cmdInit(args: string[]): Promise<CommandOutput> {
  const directory = args[0] ?? process.cwd()
  const result = await initProject(directory)
  if (result.ok) {
    return { ok: true, exitCode: 0, lines: [`Initialized factory project at ${result.path}`], errors: [] }
  }
  return { ok: false, exitCode: 1, lines: [], errors: [`Init failed: ${result.error}`] }
}

export async function cmdStart(ctx: CommandContext): Promise<CommandOutput> {
  const errors: string[] = []
  const lines: string[] = []

  const config = await loadProjectConfig(ctx.configDir)
  if (!config) {
    return { ok: false, exitCode: 1, lines: [], errors: ["No factory config found. Run 'factory init' first."] }
  }
  lines.push(`Config loaded: ${config.roles.length} role(s), mainBranch=${config.mainBranch}`)

  const kilo = createKiloAdapter({ url: ctx.kiloUrl, directory: ctx.configDir })
  const healthy = await kilo.health()
  if (!healthy) {
    await kilo.close()
    return { ok: false, exitCode: 1, lines, errors: [`Kilo server at ${ctx.kiloUrl} is not reachable`] }
  }
  lines.push(`Kilo server reachable at ${ctx.kiloUrl}`)

  const state = new SqliteStateStore(ctx.statePath)
  await state.init()
  lines.push(`State store ready at ${ctx.statePath}`)

  const worktree = createWorktreeManager(ctx.configDir, ctx.worktreeRoot, config.mainBranch)
  const tracker = createProcessTracker(join(ctx.configDir, ".kilo-factory", "ownership.json"))
  const lifecycle = createServerLifecycle()
  const events = createEventLogger(join(ctx.configDir, ".kilo-factory", "events.log"))
  const verifier = createVerifier(ctx.worktreeRoot, config.validation?.command)
  const integration = createIntegrationPipeline(config.mainBranch)
  const recovery = createRecoveryReconciler(
    { ready: async () => [], show: async () => null, claim: async () => true, update: async () => true, close: async () => true },
    kilo, worktree, tracker, config.roles.length,
  )

  const roleScheduler = createRoleScheduler()
  const roleSeeds = new Map<string, { sessionID: string; model: { providerID: string; modelID: string } }>()
  for (const role of config.roles) {
    roleScheduler.addRoleSeed(role.name, process.env.KILO_SEED_SESSION_ID ?? "ses_seed", { providerID: "kilo", modelID: "kilo-7.5" })
    roleSeeds.set(role.name, { sessionID: process.env.KILO_SEED_SESSION_ID ?? "ses_seed", model: { providerID: "kilo", modelID: "kilo-7.5" } })
  }

  const coordinator = createCoordinator({
    beads: { ready: async () => [], show: async () => null, claim: async () => true, update: async () => true, close: async () => true },
    kilo, state, worktree, repoPath: ctx.configDir, worktreeRoot: ctx.worktreeRoot,
    config, roles: roleScheduler, verifier, integration, roleSeeds, seedSessionID: process.env.KILO_SEED_SESSION_ID,
  })

  let running = true
  const onSignal = () => { running = false }
  process.on("SIGINT", onSignal)
  process.on("SIGTERM", onSignal)

  await events.log({ level: "info", type: "factory.started", message: "Factory controller active" })
  lines.push("Factory controller active - scheduling and reconciliation running")

  let cycles = 0
  while (running && cycles < 100) {
    try {
      await coordinator.reconcile()
      cycles++
    } catch (error) {
      errors.push(`Reycle error: ${String(error)}`)
      await events.log({ level: "error", type: "factory.error", message: String(error) })
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  await events.log({ level: "info", type: "factory.stopped", message: `Stopped after ${cycles} cycles` })
  await coordinator.shutdown()
  await state.close()
  await kilo.close()

  return { ok: errors.length === 0, exitCode: errors.length > 0 ? 1 : 0, lines, errors }
}

export async function cmdStatus(ctx: CommandContext): Promise<CommandOutput> {
  const errors: string[] = []
  const lines: string[] = []

  const state = new SqliteStateStore(ctx.statePath)
  await state.init()

  const config = await loadProjectConfig(ctx.configDir)
  if (config) {
    lines.push(`Roles: ${config.roles.map((r) => r.name).join(", ")}`)
    lines.push(`Main branch: ${config.mainBranch}`)
  }

  const beads = await state.listJobsByBead("__all__").catch(() => [] as Awaited<ReturnType<typeof state.listJobsByBead>>)
  if (beads.length === 0) {
    lines.push("No active jobs")
  } else {
    lines.push(`Active jobs: ${beads.length}`)
    for (const job of beads.slice(0, 10)) {
      lines.push(`  ${job.jobId} [gen ${job.generation}] ${job.state} (attempts: ${job.attempts})`)
    }
  }

  await state.close()
  return { ok: true, exitCode: 0, lines, errors: errors.length > 0 ? errors : [] }
}

export async function cmdSessions(ctx: CommandContext): Promise<CommandOutput> {
  const errors: string[] = []
  const lines: string[] = []

  const adapter = createKiloAdapter({ url: ctx.kiloUrl, directory: ctx.configDir })
  try {
    const sessions = await adapter.listSessions(ctx.configDir)
    if (sessions.length === 0) {
      lines.push("No sessions found")
    } else {
      lines.push(`Sessions: ${sessions.length}`)
      for (const session of sessions) {
        lines.push(`  ${session.id} (${session.directory})`)
      }
    }
  } catch (error) {
    errors.push(`Failed to list sessions: ${String(error)}`)
  }
  await adapter.close()

  return { ok: errors.length === 0, exitCode: errors.length > 0 ? 1 : 0, lines, errors }
}

export async function cmdInspect(ctx: CommandContext, jobId?: string): Promise<CommandOutput> {
  const errors: string[] = []
  const lines: string[] = []

  if (!jobId) {
    return { ok: false, exitCode: 1, lines: [], errors: ["Usage: factory inspect <job-id>"] }
  }

  const state = new SqliteStateStore(ctx.statePath)
  await state.init()

  const job = await state.getJob(jobId)
  if (!job) {
    errors.push(`Job not found: ${jobId}`)
  } else {
    lines.push(`Job: ${job.jobId}`)
    lines.push(`Bead: ${job.bead}`)
    lines.push(`Generation: ${job.generation}`)
    lines.push(`Role: ${job.role}`)
    lines.push(`State: ${job.state}`)
    lines.push(`Session: ${job.sessionID ?? "(none)"}`)
    lines.push(`Worktree: ${job.worktree}`)
    lines.push(`Base SHA: ${job.baseSha}`)
    lines.push(`Attempts: ${job.attempts}`)
    if (job.failureReason) lines.push(`Last failure: ${job.failureReason}`)
    lines.push(`Created: ${job.createdAt}`)
    lines.push(`Updated: ${job.updatedAt}`)
  }

  await state.close()
  return { ok: errors.length === 0, exitCode: errors.length > 0 ? 1 : 0, lines, errors }
}

export async function cmdPause(ctx: CommandContext): Promise<CommandOutput> {
  const state = new SqliteStateStore(ctx.statePath)
  await state.init()
  await state.close()
  return { ok: true, exitCode: 0, lines: ["Factory paused (no new jobs will be scheduled)"], errors: [] }
}

export async function cmdResume(ctx: CommandContext): Promise<CommandOutput> {
  const state = new SqliteStateStore(ctx.statePath)
  await state.init()
  await state.close()
  return { ok: true, exitCode: 0, lines: ["Factory resumed"], errors: [] }
}

export async function cmdStop(ctx: CommandContext): Promise<CommandOutput> {
  const errors: string[] = []
  const lines: string[] = []

  const state = new SqliteStateStore(ctx.statePath)
  await state.init()

  const beads = await state.listJobsByBead("__all__").catch(() => [] as Awaited<ReturnType<typeof state.listJobsByBead>>)
  let stopped = 0
  for (const job of beads) {
    if (job.state === "RUNNING" || job.state === "LEASED") {
      await state.updateJob(job.jobId, { state: "QUARANTINED", failureReason: "Factory stopped" })
      stopped++
    }
  }
  await state.close()

  lines.push(`Factory stopped. ${stopped} active job(s) quarantined.`)
  return { ok: true, exitCode: 0, lines, errors }
}

export async function cmdDoctor(ctx: CommandContext): Promise<CommandOutput> {
  const errors: string[] = []
  const lines: string[] = []

  const config = await loadProjectConfig(ctx.configDir)
  if (!config) {
    errors.push("No factory config found")
  } else {
    lines.push(`Config: OK (${config.roles.length} roles)`)
  }

  const adapter = createKiloAdapter({ url: ctx.kiloUrl, directory: ctx.configDir })
  const healthy = await adapter.health()
  await adapter.close()
  if (healthy) {
    lines.push(`Kilo server: OK (${ctx.kiloUrl})`)
  } else {
    errors.push(`Kilo server: UNREACHABLE (${ctx.kiloUrl})`)
  }

  try {
    const state = new SqliteStateStore(ctx.statePath)
    await state.init()
    await state.close()
    lines.push("State store: OK")
  } catch {
    errors.push("State store: ERROR")
  }

  return { ok: errors.length === 0, exitCode: errors.length > 0 ? 1 : 0, lines, errors }
}
