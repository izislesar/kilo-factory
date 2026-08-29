import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SqliteStateStore } from "../../src/state/sqlite"
import { createRecoveryReconciler } from "../../src/recovery/reconciler"
import type { WorktreeInfo } from "../../src/worktree/types"

let dbPath: string

const mockWorktree = (info: WorktreeInfo | null) => ({
  create: async (): Promise<WorktreeInfo> => info ?? { path: "/wt", branch: "factory/t/1", status: "clean" as const, uniqueCommitCount: 0, headSha: "abc" },
  inspect: async (): Promise<WorktreeInfo | null> => info,
  isOwned: () => true,
  remove: async () => true,
  listOwned: async () => info ? [info] : [],
  branchFor: (j: string, g: number) => `factory/${j}/${g}`,
})

const mockKilo = () => ({
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

const mockBeads = () => ({
  ready: async () => [],
  show: async () => null,
  claim: async () => true,
  update: async () => true,
  close: async () => true,
})

const mockTracker = (alive: boolean) => ({
  registerServer: () => {},
  registerSession: () => {},
  isOwned: () => alive,
  ownedProcesses: () => [],
  unregister: () => {},
})

beforeEach(async () => {
  const dir = await mkdtemp(join(tmpdir(), "kilo-crash-"))
  dbPath = join(dir, "state.db")
})

afterEach(async () => {
  await rm(dbPath, { force: true }).catch(() => undefined)
})

describe("crash restart lifecycle acceptance", () => {
  test("recovery after lease: job is retried within budget", async () => {
    const state = new SqliteStateStore(dbPath)
    await state.init()
    await state.upsertJob({ jobId: "test:1", bead: "test", generation: 1, role: "core", baseSha: "abc", worktree: "/wt/test/1", state: "RETRY_WAIT", attempts: 0 })

    const reconciler = createRecoveryReconciler(mockBeads(), mockKilo(), state, mockWorktree(null), mockTracker(false))
    const results = await reconciler.reconcileAndAct(await state.listJobsByBead("test"))

    expect(results[0].action).toBe("retry")
    expect((await state.getJob("test:1"))?.attempts).toBe(1)
    await state.close()
  })

  test("recovery after completion: RESULT_READY with commits resumes", async () => {
    const state = new SqliteStateStore(dbPath)
    await state.init()
    await state.upsertJob({ jobId: "test:1", bead: "test", generation: 1, role: "core", baseSha: "abc", worktree: "/wt/test/1", state: "RESULT_READY", sessionID: "ses_123", attempts: 0 })

    const worktree: WorktreeInfo = { path: "/wt/test/1", branch: "factory/test/1", status: "clean", uniqueCommitCount: 2, headSha: "def" }
    const reconciler = createRecoveryReconciler(mockBeads(), mockKilo(), state, mockWorktree(worktree), mockTracker(true))
    const results = await reconciler.reconcileAndAct(await state.listJobsByBead("test"))

    expect(results[0].action).toBe("integrate")
    await state.close()
  })

  test("recovery is deterministic and idempotent", async () => {
    const state = new SqliteStateStore(dbPath)
    await state.init()
    await state.upsertJob({ jobId: "test:1", bead: "test", generation: 1, role: "core", baseSha: "abc", worktree: "/wt/test/1", state: "RETRY_WAIT", attempts: 0 })

    const reconciler = createRecoveryReconciler(mockBeads(), mockKilo(), state, mockWorktree(null), mockTracker(false))

    await reconciler.reconcileAndAct(await state.listJobsByBead("test"))
    const results2 = await reconciler.reconcileAndAct(await state.listJobsByBead("test"))

    expect(results2[0].action).toBe("retry")
    expect((await state.getJob("test:1"))?.attempts).toBe(2)
    await state.close()
  })

  test("session death while running quarantines", async () => {
    const state = new SqliteStateStore(dbPath)
    await state.init()
    await state.upsertJob({ jobId: "test:1", bead: "test", generation: 1, role: "core", baseSha: "abc", worktree: "/wt/test/1", state: "RUNNING", sessionID: "ses_123", attempts: 0 })

    const worktree: WorktreeInfo = { path: "/wt/test/1", branch: "factory/test/1", status: "clean", uniqueCommitCount: 0, headSha: "abc" }
    const reconciler = createRecoveryReconciler(mockBeads(), mockKilo(), state, mockWorktree(worktree), mockTracker(false))
    const results = await reconciler.reconcileAndAct(await state.listJobsByBead("test"))

    expect(results[0].action).toBe("quarantine")
    await state.close()
  })
})
