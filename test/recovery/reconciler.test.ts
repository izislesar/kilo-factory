import { describe, expect, test } from "bun:test"
import { ProductionRecoveryReconciler, createRecoveryReconciler } from "../../src/recovery/reconciler"
import type { JobObservation } from "../../src/recovery"
import type { JobRecord } from "../../src/state"
import type { BeadsBackend } from "../../src/beads/types"
import type { KiloAdapter } from "../../src/kilo/types"
import type { WorktreeManager, WorktreeInfo } from "../../src/worktree/types"
import type { ProcessTracker } from "../../src/security/types"

const makeJob = (id: string, state: string): JobRecord => ({
  jobId: id,
  bead: id.split(":")[0],
  generation: 1,
  role: "core",
  baseSha: "base",
  worktree: `/wt/${id}`,
  state: state as JobRecord["state"],
  sessionID: "ses_123",
  attempts: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
})

const makeBackend = (): BeadsBackend => ({
  ready: async () => [],
  show: async () => null,
  claim: async () => true,
  update: async () => true,
  close: async () => true,
})

const makeKilo = (): KiloAdapter => ({
  health: async () => true,
  listSessions: async () => [],
  getSeedConfiguration: async () => ({ agent: "code", model: { providerID: "kilo", modelID: "kilo-7.5" } }),
  createJobSession: async () => ({ id: "ses_new", directory: "/wt" }),
  promptAsync: async () => {},
  abort: async () => {},
  delete: async () => {},
  subscribe: async () => async () => {},
  close: async () => {},
})

const makeWorktree = (info: WorktreeInfo | null): WorktreeManager => ({
  create: async () => ({ path: "/wt/test", branch: "factory/test/1", status: "clean", uniqueCommitCount: 0, headSha: "abc" }),
  inspect: async () => info,
  isOwned: () => true,
  remove: async () => true,
  listOwned: async () => info ? [info] : [],
})

const makeTracker = (alive: boolean): ProcessTracker => ({
  registerServer: () => {},
  registerSession: () => {},
  isOwned: () => alive,
  ownedProcesses: () => [],
  unregister: () => {},
})

describe("production recovery reconciler", () => {
  test("clean worktree with no commits in RETRY_WAIT retries", async () => {
    const reconciler = createRecoveryReconciler(makeBackend(), makeKilo(), makeWorktree(null), makeTracker(false))
    const job = makeJob("test:1", "RETRY_WAIT")
    const results = await reconciler.reconcile([job])
    expect(results[0].action).toBe("retry")
  })

  test("dirty worktree enters recovery", async () => {
    const worktree: WorktreeInfo = { path: "/wt/test", branch: "factory/test/1", status: "dirty", uniqueCommitCount: 0, headSha: "abc" }
    const reconciler = createRecoveryReconciler(makeBackend(), makeKilo(), makeWorktree(worktree), makeTracker(true))
    const job = makeJob("test:1", "RESULT_READY")
    const results = await reconciler.reconcile([job])
    expect(results[0].action).toBe("recover")
  })

  test("valid unique commits ready for integration", async () => {
    const worktree: WorktreeInfo = { path: "/wt/test", branch: "factory/test/1", status: "clean", uniqueCommitCount: 2, headSha: "abc" }
    const reconciler = createRecoveryReconciler(makeBackend(), makeKilo(), makeWorktree(worktree), makeTracker(true))
    const job = makeJob("test:1", "RESULT_READY")
    const results = await reconciler.reconcile([job])
    expect(results[0].action).toBe("integrate")
  })

  test("missing worktree retries within budget", async () => {
    const reconciler = createRecoveryReconciler(makeBackend(), makeKilo(), makeWorktree(null), makeTracker(false))
    const job = makeJob("test:1", "LEASED")
    const results = await reconciler.reconcile([job])
    expect(results[0].action).toBe("retry")
  })

  test("session died while running quarantines", async () => {
    const worktree: WorktreeInfo = { path: "/wt/test", branch: "factory/test/1", status: "clean", uniqueCommitCount: 0, headSha: "abc" }
    const reconciler = createRecoveryReconciler(makeBackend(), makeKilo(), makeWorktree(worktree), makeTracker(false))
    const job = makeJob("test:1", "RUNNING")
    const results = await reconciler.reconcile([job])
    expect(results[0].action).toBe("quarantine")
  })

  test("already closed bead is noop", async () => {
    const worktree: WorktreeInfo = { path: "/wt/test", branch: "factory/test/1", status: "clean", uniqueCommitCount: 1, headSha: "abc" }
    const reconciler = createRecoveryReconciler(makeBackend(), makeKilo(), makeWorktree(worktree), makeTracker(true))
    const job = makeJob("test:1", "CLOSED")
    const results = await reconciler.reconcile([job])
    expect(results[0].action).toBe("noop")
  })
})
