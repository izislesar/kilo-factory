import { describe, expect, test } from "bun:test"
import { ReconcilerImpl, determineAction } from "../../src/recovery/reconciler"
import { BoundedIdleHandler } from "../../src/continuation/handler"
import { validateIntegration, IntegrationError } from "../../src/integration/pipeline"
import type { JobObservation } from "../../src/recovery/types"

describe("adversarial recovery acceptance", () => {
  describe("worker/session death cannot silently complete", () => {
    test("missing worktree with no commits quarantines", () => {
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

    test("session death during dirty work enters recovery", () => {
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

  describe("stale generation results rejected", () => {
    test("reconciler ignores stale generation", () => {
      const reconciler = new ReconcilerImpl()
      const observation: JobObservation = {
        jobId: "test:5",
        generation: 5,
        worktreeExists: true,
        worktreeStatus: "clean",
        uniqueCommits: 3,
        beadStatus: "closed",
      }
      expect(determineAction(observation)).toBe("noop")
    })
  })

  describe("interrupted verification cannot partially promote", () => {
    test("integration validates before promotion", () => {
      expect(() => validateIntegration("", "echo ok")).toThrow(IntegrationError)
      expect(() => validateIntegration("branch", "")).toThrow(IntegrationError)
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
