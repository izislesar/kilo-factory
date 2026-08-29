import type { CompletionPayload } from "../plugin/types"
import type { WorktreeManager } from "../worktree/types"

export type VerificationResult = {
  ok: boolean
  errors: string[]
}

export type ArtifactVerifier = {
  verify(payload: CompletionPayload, worktree: string): Promise<VerificationResult>
}

export class ArtifactVerifierImpl implements ArtifactVerifier {
  private worktree: WorktreeManager

  constructor(worktree: WorktreeManager) {
    this.worktree = worktree
  }

  async verify(payload: CompletionPayload, worktreePath: string): Promise<VerificationResult> {
    const errors: string[] = []
    const info = await this.worktree.inspect(worktreePath)

    if (!info) {
      errors.push("Worktree not found")
      return { ok: false, errors }
    }

    if (info.headSha !== payload.headSha) {
      errors.push(`Head SHA mismatch: worktree has ${info.headSha}, payload claims ${payload.headSha}`)
    }

    if (payload.dirty && info.status === "clean") {
      errors.push("Payload claims dirty but worktree is clean")
    }

    if (!payload.dirty && info.status === "dirty") {
      errors.push("Payload claims clean but worktree is dirty")
    }

    return { ok: errors.length === 0, errors }
  }
}

export function createArtifactVerifier(worktree: WorktreeManager): ArtifactVerifier {
  return new ArtifactVerifierImpl(worktree)
}
