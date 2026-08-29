import { describe, expect, test } from "bun:test"
import { ReconcilerImpl, determineAction } from "../../src/recovery/reconciler"
import { ProcessTrackerImpl } from "../../src/security/processTracker"
import { BoundedIdleHandler } from "../../src/continuation/handler"
import { validateCompletion, ContractError } from "../../src/plugin/contract"
import type { JobObservation } from "../../src/recovery/types"
import type { CompletionPayload } from "../../src/plugin/types"

describe("fault-injection matrix", () => {
  describe("1. kill coordinator while job is running", () => {
    test("recovery reconciler handles missing worktree", () => {
      const reconciler = new ReconcilerImpl()
      const observation: JobObservation = {
        jobId: "test:1",
        generation: 1,
        worktreeExists: false,
        worktreeStatus: "missing",
        uniqueCommits: 0,
        beadStatus: "in_progress",
      }
      expect(determineAction(observation)).toBe("quarantine")
    })
  })

  describe("4. stale old-generation result arrives after reassignment", () => {
    test("stale generation completion is rejected", () => {
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

  describe("5. duplicate completion event", () => {
    test("idempotent completion validation", () => {
      const payload: CompletionPayload = {
        jobId: "test:1",
        generation: 1,
        summary: "Done",
        checks: [],
        risks: [],
        baseSha: "a",
        headSha: "b",
        dirty: false,
      }
      expect(() => validateCompletion(payload, "test", 1)).not.toThrow()
      expect(() => validateCompletion(payload, "test", 1)).not.toThrow()
    })
  })

  describe("6. job worktree left dirty", () => {
    test("dirty work enters bounded recovery", () => {
      const observation: JobObservation = {
        jobId: "test:1",
        generation: 1,
        worktreeExists: true,
        worktreeStatus: "dirty",
        uniqueCommits: 0,
        beadStatus: "in_progress",
      }
      expect(determineAction(observation)).toBe("recover")
    })
  })

  describe("7. clean unique commit without completion manifest", () => {
    test("unique commits preserved as candidate", () => {
      const observation: JobObservation = {
        jobId: "test:1",
        generation: 1,
        worktreeExists: true,
        worktreeStatus: "clean",
        uniqueCommits: 2,
        beadStatus: "in_progress",
      }
      expect(determineAction(observation)).toBe("noop")
    })
  })

  describe("10. provider/model error or session error event", () => {
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

    test("idle handler resets on progress", () => {
      const handler = new BoundedIdleHandler(
        { maxContinuations: 2, continuationPrompt: "Continue." },
        { count: 0, lastSha: "base", progressRecorded: false },
      )

      handler.decide({ sessionID: "s1", currentSha: "base", dirty: false })
      handler.recordProgress("new_sha")
      const decision = handler.decide({ sessionID: "s1", currentSha: "new_sha", dirty: false })

      expect(decision).toBe("wait")
      expect(handler.getState().count).toBe(0)
    })
  })

  describe("14. unrelated Kilo server/process exists during stop", () => {
    test("process tracker only tracks owned processes", () => {
      const tracker = new ProcessTrackerImpl()
      tracker.registerServer(111, "/repo")

      expect(tracker.isOwned(111)).toBe(true)
      expect(tracker.isOwned(999)).toBe(false)
    })

    test("unregistered process is not owned", () => {
      const tracker = new ProcessTrackerImpl()
      expect(tracker.isOwned(12345)).toBe(false)
    })
  })

  describe("16. two roles become ready simultaneously", () => {
    test("independent reconciliations do not interfere", async () => {
      const reconciler = new ReconcilerImpl()
      const obs1: JobObservation = {
        jobId: "a:1", generation: 1, worktreeExists: true, worktreeStatus: "clean", uniqueCommits: 1, beadStatus: "in_progress",
      }
      const obs2: JobObservation = {
        jobId: "b:1", generation: 1, worktreeExists: true, worktreeStatus: "clean", uniqueCommits: 1, beadStatus: "in_progress",
      }

      const actions = await reconciler.reconcile([obs1, obs2])
      expect(actions).toEqual(["noop", "noop"])
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

  describe("invariant: no stale result integrated", () => {
    test("wrong generation rejected even with valid SHA", () => {
      const payload: CompletionPayload = {
        jobId: "test:5",
        generation: 5,
        summary: "Looks valid but wrong gen",
        checks: ["all good"],
        risks: [],
        baseSha: "aaa",
        headSha: "bbb",
        dirty: false,
      }
      expect(() => validateCompletion(payload, "test", 6)).toThrow("Stale generation")
    })
  })
})
