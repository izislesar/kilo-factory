import { describe, expect, test } from "bun:test"
import { IndependentVerifier } from "../../src/artifacts/verifier"
import type { JobRecord } from "../../src/state"
import type { CompletionPayload } from "../../src/plugin/types"
import type { WorktreeInfo } from "../../src/worktree/types"

const makeJob = (overrides: Partial<JobRecord> = {}): JobRecord => ({
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
  ...overrides,
})

const makeWorktree = (overrides: Partial<WorktreeInfo> = {}): WorktreeInfo => ({
  path: "/wt/test/1",
  branch: "factory/test/1",
  status: "clean",
  uniqueCommitCount: 2,
  headSha: "head456",
  ...overrides,
})

describe("negative shipped-runtime E2E", () => {
  test("stale generation rejected", async () => {
    const verifier = new IndependentVerifier("/wt")
    const job = makeJob({ generation: 1 })
    const payload: CompletionPayload = { ...makeCompletion(), generation: 999 }

    const result = await verifier.verify(job, payload, makeWorktree(), 1)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes("Stale generation"))).toBe(true)
  })

  test("wrong head SHA rejected", async () => {
    const verifier = new IndependentVerifier("/wt")
    const result = await verifier.verify(makeJob(), makeCompletion(), makeWorktree({ headSha: "wrong_sha" }), 1)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes("Head SHA mismatch"))).toBe(true)
  })

  test("dirty worktree claiming clean rejected", async () => {
    const verifier = new IndependentVerifier("/wt")
    const result = await verifier.verify(makeJob(), makeCompletion(), makeWorktree({ status: "dirty" }), 1)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes("dirty"))).toBe(true)
  })

  test("no-op candidate (no unique commits) rejected", async () => {
    const verifier = new IndependentVerifier("/wt")
    const result = await verifier.verify(makeJob(), makeCompletion(), makeWorktree({ uniqueCommitCount: 0 }), 1)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes("No unique commits"))).toBe(true)
  })

  test("no session ownership rejected", async () => {
    const verifier = new IndependentVerifier("/wt")
    const result = await verifier.verify(makeJob({ sessionID: undefined }), makeCompletion(), makeWorktree(), 1)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes("session ownership"))).toBe(true)
  })
})

const makeCompletion = (): CompletionPayload => ({
  jobId: "test:1",
  generation: 1,
  summary: "Done",
  checks: [],
  risks: [],
  baseSha: "base123",
  headSha: "head456",
  dirty: false,
})
