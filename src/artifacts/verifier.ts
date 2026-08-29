import type { JobRecord } from "../state"
import type { WorktreeInfo } from "../worktree/types"
import type { CompletionPayload } from "../plugin/types"
import { spawnSync } from "node:child_process"
import { resolve } from "node:path"

export type VerificationResult = {
  ok: boolean
  errors: string[]
}

export type Verifier = {
  verify(
    job: JobRecord,
    payload: CompletionPayload,
    worktree: WorktreeInfo | null,
    currentGeneration: number,
  ): Promise<VerificationResult>
}

export class IndependentVerifier implements Verifier {
  private validationCommand?: string
  private worktreeRoot: string

  constructor(worktreeRoot: string, validationCommand?: string) {
    this.worktreeRoot = worktreeRoot
    this.validationCommand = validationCommand
  }

  async verify(
    job: JobRecord,
    payload: CompletionPayload,
    worktree: WorktreeInfo | null,
    currentGeneration: number,
  ): Promise<VerificationResult> {
    const errors: string[] = []

    if (job.jobId !== payload.jobId) {
      errors.push(`Job ID mismatch: expected ${job.jobId}, got ${payload.jobId}`)
    }

    if (job.generation !== payload.generation) {
      errors.push(`Generation mismatch: expected ${job.generation}, got ${payload.generation}`)
    }

    if (payload.generation !== currentGeneration) {
      errors.push(`Stale generation: payload is ${payload.generation}, current is ${currentGeneration}`)
    }

    if (!job.sessionID) {
      errors.push("No active session ownership")
    }

    if (worktree) {
      if (worktree.headSha !== payload.headSha) {
        errors.push(`Head SHA mismatch: worktree has ${worktree.headSha}, payload claims ${payload.headSha}`)
      }

      if (worktree.status === "dirty" && !payload.dirty) {
        errors.push("Worktree is dirty but payload claims clean")
      }

      if (worktree.status === "clean" && payload.dirty) {
        errors.push("Worktree is clean but payload claims dirty")
      }

      if (worktree.uniqueCommitCount === 0) {
        errors.push("No unique commits found")
      }
    } else {
      errors.push("Worktree not found")
    }

    if (this.validationCommand && worktree) {
      try {
        const result = spawnSync("sh", ["-c", this.validationCommand], {
          cwd: worktree.path,
          encoding: "utf8",
          timeout: 300_000,
        })
        if (result.status !== 0) {
          errors.push(`Validation command failed: ${result.stderr || result.stdout}`)
        }
      } catch (error) {
        errors.push(`Validation error: ${String(error)}`)
      }
    }

    return { ok: errors.length === 0, errors }
  }
}

export function createVerifier(worktreeRoot: string, validationCommand?: string): Verifier {
  return new IndependentVerifier(worktreeRoot, validationCommand)
}
