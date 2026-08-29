import type { BeadsBackend, BeadsIssue } from "../beads/types"
import type { KiloAdapter, SeedConfiguration } from "../kilo/types"
import type { SqliteStateStore } from "../state/sqlite"
import type { JobRecord, NewJob } from "../state"
import { assertTransition } from "./transitions"
import type { WorktreeManager } from "../worktree/types"

export type CoordinatorOptions = {
  beads: BeadsBackend
  kilo: KiloAdapter
  state: SqliteStateStore
  worktree: WorktreeManager
  repoPath: string
  worktreeRoot: string
  maxAttempts?: number
}

export type Assignment = {
  bead: string
  generation: number
  role: string
  jobIssue: BeadsIssue
}

export class Coordinator {
  private beads: BeadsBackend
  private kilo: KiloAdapter
  private state: SqliteStateStore
  private worktree: WorktreeManager
  private repoPath: string
  private worktreeRoot: string
  private maxAttempts: number

  constructor(options: CoordinatorOptions) {
    this.beads = options.beads
    this.kilo = options.kilo
    this.state = options.state
    this.worktree = options.worktree
    this.repoPath = options.repoPath
    this.worktreeRoot = options.worktreeRoot
    this.maxAttempts = options.maxAttempts ?? 3
  }

  async reconcile(): Promise<void> {
    const readyIssues = await this.beads.ready({ excludeEpics: true })
    for (const issue of readyIssues) {
      await this.reconcileIssue(issue)
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
    const seed = await this.getSeedConfiguration(issue)
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

  private async getSeedConfiguration(issue: BeadsIssue): Promise<SeedConfiguration> {
    const seedSessionID = process.env.KILO_SEED_SESSION_ID
    if (!seedSessionID) throw new Error("KILO_SEED_SESSION_ID required")
    return this.kilo.getSeedConfiguration(seedSessionID, this.repoPath)
  }

  private async reconcileJob(job: JobRecord): Promise<void> {
    switch (job.state) {
      case "LEASED":
        await this.startJob(job)
        break
      case "RUNNING":
        await this.checkProgress(job)
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
      assertTransition(job.state, "RUNNING")
      await this.state.updateJob(job.jobId, { state: "RUNNING" }, { expectedGeneration: job.generation })
    } catch (error) {
      await this.quarantine(job, String(error))
    }
  }

  private async checkProgress(job: JobRecord): Promise<void> {
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
        assertTransition(job.state, "RESULT_READY")
        await this.state.updateJob(job.jobId, { state: "RESULT_READY" }, { expectedGeneration: job.generation })
      } catch (error) {
        await this.quarantine(job, String(error))
      }
    }
  }

  private async handleRetry(job: JobRecord): Promise<void> {
    if (job.attempts >= this.maxAttempts) {
      await this.quarantine(job, `Exceeded max attempts (${this.maxAttempts})`)
      return
    }
    try {
      assertTransition(job.state, "LEASED")
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
      assertTransition(job.state, "QUARANTINED")
      await this.state.updateJob(
        job.jobId,
        { state: "QUARANTINED", failureReason: reason },
        { expectedGeneration: job.generation },
      )
    } catch {
      // Already terminal or illegal - leave as-is
    }
  }
}

export function createCoordinator(options: CoordinatorOptions): Coordinator {
  return new Coordinator(options)
}
