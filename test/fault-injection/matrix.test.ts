import { describe, expect, test } from "bun:test"
import { createRecoveryReconciler } from "../../src/recovery/reconciler"
import { SqliteStateStore } from "../../src/state/sqlite"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { ProcessTrackerImpl } from "../../src/security/processTracker"
import { BoundedIdleHandler } from "../../src/continuation/handler"
import { validateCompletion, ContractError } from "../../src/plugin/contract"
import type { CompletionPayload } from "../../src/plugin/types"
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

describe("fault-injection matrix", () => {
  describe("worker/session death cannot silently complete", () => {
    test("missing worktree retries within budget", async () => {
      const tracker = new ProcessTrackerImpl()
      const reconciler = createRecoveryReconciler(makeBackend(), makeKilo(), new SqliteStateStore(join(tmpdir(), `kilo-rec-${Date.now()}.db`)), makeWorktree(null), tracker)
      const job = makeJob("test:1", "LEASED")
      const results = await reconciler.reconcile([job])
      expect(results[0].action).toBe("retry")
    })
  })

  describe("stale generation results rejected", () => {
    test("wrong generation completion is rejected", () => {
      const payload: CompletionPayload = {
        jobId: "test:1",
        generation: 1,
        summary: "Stale result",
        checks: [],
        risks: [],
        baseSha: "a",
        headSha: "b",
        dirty: false,
      }
      expect(() => validateCompletion(payload, "test", 2)).toThrow(ContractError)
    })
  })

  describe("provider/model error or session error event", () => {
    test("idle handler quarantines after bounded retries", () => {
      const handler = new BoundedIdleHandler(
        { maxContinuations: 2, continuationPrompt: "Continue." },
        { count: 0, lastSha: "base", progressRecorded: false },
      )
      handler.decide({ sessionID: "s1", currentSha: "base", dirty: false })
      handler.decide({ sessionID: "s1", currentSha: "base", dirty: false })
      const decision = handler.decide({ sessionID: "s1", currentSha: "base", dirty: false })
      expect(decision).toBe("quarantine")
    })
  })

  describe("unrelated Kilo server/process exists during stop", () => {
    test("process tracker only tracks owned processes", () => {
      const tracker = new ProcessTrackerImpl()
      tracker.registerServer(12345, "/repo")
      expect(tracker.isOwned(12345)).toBe(true)
      expect(tracker.isOwned(99999)).toBe(false)
    })
  })

  describe("invariant: no unbounded redispatch", () => {
    test("idle handler has finite continuation budget", () => {
      const handler = new BoundedIdleHandler(
        { maxContinuations: 5, continuationPrompt: "Go." },
        { count: 0, lastSha: "base", progressRecorded: false },
      )
      for (let i = 0; i < 10; i++) {
        handler.decide({ sessionID: "s1", currentSha: "base", dirty: false })
      }
      expect(handler.getState().count).toBeLessThanOrEqual(5)
    })
  })
})
