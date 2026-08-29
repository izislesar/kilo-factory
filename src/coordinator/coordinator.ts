import type { BeadsBackend, BeadsIssue } from "../beads/types"
import type { KiloAdapter, SeedConfiguration } from "../kilo/types"
import type { SqliteStateStore } from "../state/sqlite"
import type { JobRecord, NewJob } from "../state"
import { assertTransition } from "./transitions"
import type { WorktreeManager } from "../worktree/types"
import { createContextBuilder, type JobEnvelope } from "../context/builder"
import { validateCompletion } from "../plugin/contract"
import type { ProjectConfig } from "../config/types"

export type CoordinatorOptions = {
  beads: BeadsBackend
  kilo: KiloAdapter
  state: SqliteStateStore
  worktree: WorktreeManager
  repoPath: string
  worktreeRoot: string
  config: ProjectConfig
  maxAttempts?: number
  seedSessionID?: string
}

type ActiveSubscription = {
  sessionID: string
  stop: () => Promise<void>
}

export class Coordinator {
  private beads: BeadsBackend
  private kilo: KiloAdapter
  private state: SqliteStateStore
  private worktree: WorktreeManager
  private repoPath: string
  private worktreeRoot: string
  private config: ProjectConfig
  private maxAttempts: number
  private seedSessionID?: string
  private subscriptions = new Map<string, ActiveSubscription>()

  constructor(options: CoordinatorOptions) {
    this.beads = options.beads
    this.kilo = options.kilo
    this.state = options.state
    this.worktree = options.worktree
    this.repoPath = options.repoPath
    this.worktreeRoot = options.worktreeRoot
    this.config = options.config
    this.maxAttempts = options.maxAttempts ?? 3
    this.seedSessionID = options.seedSessionID
  }

  async reconcile(): Promise<void> {
    const readyIssues = await this.beads.ready({ excludeEpics: true })
    for (const issue of readyIssues) {
      await this.reconcileIssue(issue)
    }
    await this.reconcileActiveJobs()
  }

  private async reconcileActiveJobs(): Promise<void> {
    const all = await this.state.listJobsByBead("__all__")
    for (const job of all) {
      if (job.state === "CLOSED" || job.state === "QUARANTINED") continue
      await this.reconcileJob(job)
    }
  }

  private async reconcileIssue(issue: BeadsIssue): Promise<void> {
    const existing = await this.findActiveJob(issue.id)
    if (existing) {
      await this.reconcileJob(existing)
    } else {
      await this.assign(issue)
    }
  }

  private async findActiveJob(beadId: string): Promise<JobRecord | null> {
    const owned = await this.state.listJobsByBead(beadId)
    const active = owned.find((job) => job.state !== "CLOSED" && job.state !== "QUARANTINED")
    return active ?? null
  }

  private async assign(issue: BeadsIssue): Promise<void> {
    const baseSha = await this.getBaseSha()
    const seed = await this.getSeedConfiguration()
    const generation = await this.nextGeneration(issue.id)
    const worktree = await this.worktree.create(baseSha, issue.id, generation)

    const job: NewJob = {
      jobId: `${issue.id}:${generation}`,
      bead: issue.id,
      generation,
      role: issue.title,
      baseSha,
      worktree: worktree.path,
      state: "LEASED",
      sessionID: undefined,
      attempts: 0,
    }
    await this.state.upsertJob(job)
    await this.beads.claim(issue.id)
  }

  private async nextGeneration(beadId: string): Promise<number> {
    const owned = await this.state.listJobsByBead(beadId)
    const maxGeneration = owned.reduce((max, job) => Math.max(max, job.generation), 0)
    return maxGeneration + 1
  }

  private async getBaseSha(): Promise<string> {
    return "HEAD"
  }

  private async getSeedConfiguration(): Promise<SeedConfiguration> {
    const seedSessionID = this.seedSessionID ?? process.env.KILO_SEED_SESSION_ID
    if (!seedSessionID) throw new Error("Seed session ID required")
    return this.kilo.getSeedConfiguration(seedSessionID, this.repoPath)
  }

  private async reconcileJob(job: JobRecord): Promise<void> {
    switch (job.state) {
      case "LEASED":
        await this.startJob(job)
        break
      case "RUNNING":
        await this.monitorJob(job)
        break
      case "RESULT_READY":
        await this.verifyAndIntegrate(job)
        break
      case "RETRY_WAIT":
        await this.handleRetry(job)
        break
      default:
        break
    }
  }

  private async startJob(job: JobRecord): Promise<void> {
    try {
      const seed = await this.getSeedConfiguration()
      const session = await this.kilo.createJobSession(job.worktree, seed, `${job.bead} gen ${job.generation}`)

      await this.state.updateJob(job.jobId, { state: "RUNNING", sessionID: session.id }, { expectedGeneration: job.generation })

      const builder = createContextBuilder(
        "You are a factory worker executing an exact job.",
        "Complete the assigned task.",
        "Follow the role instructions.",
      )
      const envelope: JobEnvelope = {
        jobId: job.jobId,
        bead: job.bead,
        generation: job.generation,
        role: job.role,
        acceptance: job.role,
        dependencies: [],
        comments: [],
      }
      const context = builder.build(
        { jobId: job.jobId, bead: job.bead, generation: job.generation, role: job.role },
        job.role,
        [],
        [],
      )

      await this.kilo.promptAsync(session, {
        parts: [{ type: "text", text: JSON.stringify(context) }],
      })

      const stop = await this.kilo.subscribe(session, (event) => {
        this.handleJobEvent(job, event).catch(() => undefined)
      })
      this.subscriptions.set(job.jobId, { sessionID: session.id, stop })
    } catch (error) {
      await this.quarantine(job, `Start failed: ${String(error)}`)
    }
  }

  private async handleJobEvent(job: JobRecord, event: { type: string; error?: unknown }): Promise<void> {
    if (event.type === "session.error" && event.error) {
      await this.quarantine(job, `Session error: ${String(event.error)}`)
    }
  }

  private async monitorJob(job: JobRecord): Promise<void> {
    if (!job.sessionID) {
      await this.quarantine(job, "Running job has no session ID")
      return
    }
    const worktreeInfo = await this.worktree.inspect(job.worktree)
    if (!worktreeInfo) {
      await this.quarantine(job, "Worktree disappeared")
      return
    }
    if (worktreeInfo.status === "clean" && worktreeInfo.uniqueCommitCount > 0) {
      try {
        await this.state.updateJob(job.jobId, { state: "RESULT_READY" }, { expectedGeneration: job.generation })
      } catch (error) {
        await this.quarantine(job, String(error))
      }
    }
  }

  private async verifyAndIntegrate(job: JobRecord): Promise<void> {
    try {
      await this.state.updateJob(job.jobId, { state: "REVIEWING" }, { expectedGeneration: job.generation })
      await this.state.updateJob(job.jobId, { state: "INTEGRATING" }, { expectedGeneration: job.generation })
      await this.state.updateJob(job.jobId, { state: "VALIDATING" }, { expectedGeneration: job.generation })

      await this.state.updateJob(job.jobId, { state: "COMMITTED" }, { expectedGeneration: job.generation })
      await this.beads.close(job.bead, `Completed generation ${job.generation}`)
      await this.state.updateJob(job.jobId, { state: "CLOSED" }, { expectedGeneration: job.generation })

      const sub = this.subscriptions.get(job.jobId)
      if (sub) {
        await sub.stop()
        this.subscriptions.delete(job.jobId)
      }
    } catch (error) {
      await this.quarantine(job, `Integration failed: ${String(error)}`)
    }
  }

  private async handleRetry(job: JobRecord): Promise<void> {
    if (job.attempts >= this.maxAttempts) {
      await this.quarantine(job, `Exceeded max attempts (${this.maxAttempts})`)
      return
    }
    try {
      await this.state.updateJob(
        job.jobId,
        { state: "LEASED", attempts: job.attempts + 1 },
        { expectedGeneration: job.generation },
      )
    } catch (error) {
      await this.quarantine(job, String(error))
    }
  }

  private async quarantine(job: JobRecord, reason: string): Promise<void> {
    try {
      await this.state.updateJob(
        job.jobId,
        { state: "QUARANTINED", failureReason: reason },
        { expectedGeneration: job.generation },
      )
    } catch {
      // Already terminal or illegal - leave as-is
    }
    const sub = this.subscriptions.get(job.jobId)
    if (sub) {
      await sub.stop().catch(() => undefined)
      this.subscriptions.delete(job.jobId)
    }
  }

  async shutdown(): Promise<void> {
    for (const [, sub] of this.subscriptions) {
      await sub.stop().catch(() => undefined)
    }
    this.subscriptions.clear()
    await this.kilo.close().catch(() => undefined)
  }
}

export function createCoordinator(options: CoordinatorOptions): Coordinator {
  return new Coordinator(options)
}
