import { describe, expect, test } from "bun:test"
import { IndependentVerifier } from "../../src/artifacts/verifier"
import type { JobRecord } from "../../src/state"
import type { CompletionPayload } from "../../src/plugin/types"
import type { WorktreeInfo } from "../../src/worktree/types"

const baseJob: JobRecord = {
  jobId: "test:1",
  bead: "test",
  generation: 1,
  role: "core",
  baseSha: "base123",
  worktree: "/wt/test/1",
  state: "RESULT_READY",
  sessionID: "ses_123",
  attempts: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

const basePayload: CompletionPayload = {
  jobId: "test:1",
  generation: 1,
  summary: "Done",
  checks: [],
  risks: [],
  baseSha: "base123",
  headSha: "head456",
  dirty: false,
}

const baseWorktree: WorktreeInfo = {
  path: "/wt/test/1",
  branch: "factory/test/1",
  status: "clean",
  uniqueCommitCount: 2,
  headSha: "head456",
}

describe("IndependentVerifier", () => {
  test("passes when all checks match", async () => {
    const verifier = new IndependentVerifier("/wt")
    const result = await verifier.verify(baseJob, basePayload, baseWorktree, 1)
    expect(result.ok).toBe(true)
  })

  test("rejects mismatched jobId", async () => {
    const verifier = new IndependentVerifier("/wt")
    const payload = { ...basePayload, jobId: "other:1" }
    const result = await verifier.verify(baseJob, payload, baseWorktree, 1)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e: string) => e.includes("Job ID mismatch"))).toBe(true)
  })

  test("rejects mismatched generation", async () => {
    const verifier = new IndependentVerifier("/wt")
    const payload = { ...basePayload, generation: 999 }
    const result = await verifier.verify(baseJob, payload, baseWorktree, 1)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e: string) => e.includes("Generation mismatch"))).toBe(true)
  })

  test("rejects stale generation", async () => {
    const verifier = new IndependentVerifier("/wt")
    const result = await verifier.verify(baseJob, basePayload, baseWorktree, 2)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e: string) => e.includes("Stale generation"))).toBe(true)
  })

  test("rejects when no session ownership", async () => {
    const verifier = new IndependentVerifier("/wt")
    const job = { ...baseJob, sessionID: undefined }
    const result = await verifier.verify(job, basePayload, baseWorktree, 1)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e: string) => e.includes("session ownership"))).toBe(true)
  })

  test("rejects wrong head SHA", async () => {
    const verifier = new IndependentVerifier("/wt")
    const worktree = { ...baseWorktree, headSha: "wrong_sha" }
    const result = await verifier.verify(baseJob, basePayload, worktree, 1)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e: string) => e.includes("Head SHA mismatch"))).toBe(true)
  })

  test("rejects dirty worktree claiming clean", async () => {
    const verifier = new IndependentVerifier("/wt")
    const worktree = { ...baseWorktree, status: "dirty" as const }
    const result = await verifier.verify(baseJob, basePayload, worktree, 1)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e: string) => e.includes("dirty"))).toBe(true)
  })

  test("rejects no unique commits", async () => {
    const verifier = new IndependentVerifier("/wt")
    const worktree = { ...baseWorktree, uniqueCommitCount: 0 }
    const result = await verifier.verify(baseJob, basePayload, worktree, 1)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e: string) => e.includes("No unique commits"))).toBe(true)
  })
})
