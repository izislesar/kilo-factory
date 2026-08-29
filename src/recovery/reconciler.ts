import type { JobRecord } from "../state"
import type { BeadsBackend, BeadsIssue } from "../beads/types"
import type { KiloAdapter } from "../kilo/types"
import type { WorktreeManager } from "../worktree/types"
import type { ProcessTracker } from "../security/types"

export type JobObservation = {
  job: JobRecord
  beadStatus: string
  worktreeExists: boolean
  worktreeStatus: "clean" | "dirty" | "missing"
  uniqueCommits: number
  headSha: string
  sessionAlive: boolean
}

export type RecoveryAction = "retry" | "recover" | "quarantine" | "noop" | "integrate"

export type RecoveryResult = {
  jobId: string
  action: RecoveryAction
  reason: string
}

export type RecoveryReconciler = {
  reconcile(jobs: JobRecord[]): Promise<RecoveryResult[]>
}

export class ProductionRecoveryReconciler implements RecoveryReconciler {
  private beads: BeadsBackend
  private kilo: KiloAdapter
  private worktree: WorktreeManager
  private tracker: ProcessTracker
  private maxAttempts: number

  constructor(
    beads: BeadsBackend,
    kilo: KiloAdapter,
    worktree: WorktreeManager,
    tracker: ProcessTracker,
    maxAttempts = 3,
  ) {
    this.beads = beads
    this.kilo = kilo
    this.worktree = worktree
    this.tracker = tracker
    this.maxAttempts = maxAttempts
  }

  async reconcile(jobs: JobRecord[]): Promise<RecoveryResult[]> {
    const results: RecoveryResult[] = []
    for (const job of jobs) {
      if (job.state === "CLOSED" || job.state === "QUARANTINED") {
        results.push({ jobId: job.jobId, action: "noop", reason: "Already terminal" })
        continue
      }
      const observation = await this.observe(job)
      const decision = this.decide(observation)
      results.push({ jobId: job.jobId, action: decision.action, reason: decision.reason })
    }
    return results
  }

  private async observe(job: JobRecord): Promise<JobObservation & { reason: string }> {
    let beadStatus = "unknown"
    try {
      const issue = await this.beads.show(job.bead)
      beadStatus = issue?.status ?? "unknown"
    } catch {
      beadStatus = "error"
    }

    const worktreeInfo = await this.worktree.inspect(job.worktree)
    const sessionAlive = job.sessionID ? this.tracker.isOwned(parseInt(job.sessionID.split("_").pop() || "0")) : false

    return {
      job,
      beadStatus,
      worktreeExists: !!worktreeInfo,
      worktreeStatus: (worktreeInfo?.status ?? "missing") as "clean" | "dirty" | "missing",
      uniqueCommits: worktreeInfo?.uniqueCommitCount ?? 0,
      headSha: worktreeInfo?.headSha ?? "",
      sessionAlive,
      reason: "",
    }
  }

  private decide(obs: JobObservation & { reason: string }): { action: RecoveryAction; reason: string } {
    const job = obs.job

    if (obs.beadStatus === "closed") {
      return { action: "noop", reason: "Bead already closed" }
    }

    if (job.state === "RETRY_WAIT") {
      if (job.attempts >= this.maxAttempts) {
        return { action: "quarantine", reason: `Exceeded max attempts (${this.maxAttempts})` }
      }
      return { action: "retry", reason: `Retry attempt ${job.attempts + 1}` }
    }

    if (!obs.worktreeExists) {
      if (job.attempts < this.maxAttempts) {
        return { action: "retry", reason: "Worktree missing, retrying" }
      }
      return { action: "quarantine", reason: "Worktree missing, budget exhausted" }
    }

    if (obs.worktreeStatus === "dirty") {
      return { action: "recover", reason: "Dirty worktree preserved for recovery" }
    }

    if (obs.uniqueCommits > 0 && job.state === "RESULT_READY") {
      return { action: "integrate", reason: "Valid unique commits ready for integration" }
    }

    if (!obs.sessionAlive && job.state === "RUNNING") {
      return { action: "quarantine", reason: "Session died while running" }
    }

    if (obs.worktreeStatus === "clean" && obs.uniqueCommits === 0) {
      return { action: "noop", reason: "Clean, no commits, still in progress" }
    }

    return { action: "noop", reason: "No action needed" }
  }
}

export function createRecoveryReconciler(
  beads: BeadsBackend,
  kilo: KiloAdapter,
  worktree: WorktreeManager,
  tracker: ProcessTracker,
  maxAttempts?: number,
): RecoveryReconciler {
  return new ProductionRecoveryReconciler(beads, kilo, worktree, tracker, maxAttempts)
}
