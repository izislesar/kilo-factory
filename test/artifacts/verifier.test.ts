import { describe, expect, test } from "bun:test"
import { ArtifactVerifierImpl } from "../../src/artifacts/verifier"
import type { WorktreeManager, WorktreeInfo } from "../../src/worktree/types"
import type { CompletionPayload } from "../../src/plugin/types"

const makeWorktree = (info: WorktreeInfo | null): WorktreeManager => ({
  create: async () => ({} as WorktreeInfo),
  inspect: async () => info,
  isOwned: () => true,
  remove: async () => true,
  listOwned: async () => [],
})

describe("ArtifactVerifier", () => {
  test("passes when head SHA and dirty state match", async () => {
    const info: WorktreeInfo = {
      path: "/wt",
      branch: "factory/test/1",
      status: "clean",
      uniqueCommitCount: 1,
      headSha: "abc123",
    }
    const verifier = new ArtifactVerifierImpl(makeWorktree(info))
    const payload: CompletionPayload = {
      jobId: "test:1",
      generation: 1,
      summary: "Done",
      checks: [],
      risks: [],
      baseSha: "base",
      headSha: "abc123",
      dirty: false,
    }

    const result = await verifier.verify(payload, "/wt")
    expect(result.ok).toBe(true)
  })

  test("fails when head SHA does not match", async () => {
    const info: WorktreeInfo = {
      path: "/wt",
      branch: "factory/test/1",
      status: "clean",
      uniqueCommitCount: 1,
      headSha: "actual_sha",
    }
    const verifier = new ArtifactVerifierImpl(makeWorktree(info))
    const payload: CompletionPayload = {
      jobId: "test:1",
      generation: 1,
      summary: "Done",
      checks: [],
      risks: [],
      baseSha: "base",
      headSha: "claimed_sha",
      dirty: false,
    }

    const result = await verifier.verify(payload, "/wt")
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes("Head SHA mismatch"))).toBe(true)
  })

  test("fails when dirty state contradicts", async () => {
    const info: WorktreeInfo = {
      path: "/wt",
      branch: "factory/test/1",
      status: "clean",
      uniqueCommitCount: 1,
      headSha: "abc",
    }
    const verifier = new ArtifactVerifierImpl(makeWorktree(info))
    const payload: CompletionPayload = {
      jobId: "test:1",
      generation: 1,
      summary: "Done",
      checks: [],
      risks: [],
      baseSha: "base",
      headSha: "abc",
      dirty: true,
    }

    const result = await verifier.verify(payload, "/wt")
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes("dirty"))).toBe(true)
  })

  test("fails when worktree is missing", async () => {
    const verifier = new ArtifactVerifierImpl(makeWorktree(null))
    const payload: CompletionPayload = {
      jobId: "test:1",
      generation: 1,
      summary: "Done",
      checks: [],
      risks: [],
      baseSha: "base",
      headSha: "abc",
      dirty: false,
    }

    const result = await verifier.verify(payload, "/wt")
    expect(result.ok).toBe(false)
    expect(result.errors).toContain("Worktree not found")
  })
})
