import { describe, expect, test } from "bun:test"
import { createRecoveryReconciler } from "../../src/recovery/reconciler"
import { SqliteStateStore } from "../../src/state/sqlite"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { BoundedIdleHandler } from "../../src/continuation/handler"
import { createIntegrationPipeline } from "../../src/integration/pipeline"
import type { JobRecord } from "../../src/state"
import type { BeadsBackend } from "../../src/beads/types"
import type { KiloAdapter } from "../../src/kilo/types"
import type { WorktreeManager, WorktreeInfo } from "../../src/worktree/types"

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
  branchFor: (jobId: string, gen: number) => `factory/${jobId}/${gen}`,
})

describe("adversarial recovery acceptance", () => {
  describe("worker/session death cannot silently complete", () => {
    test("missing worktree retries within budget", async () => {
      const reconciler = createRecoveryReconciler(makeBackend(), makeKilo(), new SqliteStateStore(join(tmpdir(), `kilo-rec-${Date.now()}.db`)), makeWorktree(null), {
        registerServer: () => {}, registerSession: () => {},
        isOwned: () => false, ownedProcesses: () => [], unregister: () => {},
      })
      const job = makeJob("test:1", "LEASED")
      const results = await reconciler.reconcile([job])
      expect(results[0].action).toBe("retry")
    })

    test("session death during dirty work enters recovery", async () => {
      const worktree: WorktreeInfo = { path: "/wt/test", branch: "factory/test/1", status: "dirty", uniqueCommitCount: 0, headSha: "abc" }
      const reconciler = createRecoveryReconciler(makeBackend(), makeKilo(), new SqliteStateStore(join(tmpdir(), `kilo-rec-${Date.now()}.db`)), makeWorktree(worktree), {
        registerServer: () => {}, registerSession: () => {},
        isOwned: () => true, ownedProcesses: () => [], unregister: () => {},
      })
      const job = makeJob("test:1", "RESULT_READY")
      const results = await reconciler.reconcile([job])
      expect(results[0].action).toBe("recover")
    })
  })

  describe("interrupted verification cannot partially promote", () => {
    test("integration validates before promotion", async () => {
      const pipeline = createIntegrationPipeline("main")
      const r1 = await pipeline.integrate("", "echo ok")
      expect(r1.ok).toBe(false)
      const r2 = await pipeline.integrate("branch", "")
      expect(r2.ok).toBe(false)
    })
  })

  describe("recovery remains bounded", () => {
    test("idle handler has finite retry budget", () => {
      const handler = new BoundedIdleHandler(
        { maxContinuations: 3, continuationPrompt: "Continue." },
        { count: 0, lastSha: "base", progressRecorded: false },
      )
      for (let i = 0; i < 100; i++) {
        handler.decide({ sessionID: "s1", currentSha: "base", dirty: false })
      }
      expect(handler.getState().count).toBeLessThanOrEqual(3)
    })

    test("quarantine is terminal", () => {
      const handler = new BoundedIdleHandler(
        { maxContinuations: 1, continuationPrompt: "Go." },
        { count: 0, lastSha: "base", progressRecorded: false },
      )
      handler.decide({ sessionID: "s1", currentSha: "base", dirty: false })
      const decision = handler.decide({ sessionID: "s1", currentSha: "base", dirty: false })
      expect(decision).toBe("quarantine")
    })
  })
})
