import { describe, expect, test } from "bun:test"
import { determineAction, ReconcilerImpl } from "../../src/recovery/reconciler"
import type { JobObservation } from "../../src/recovery/types"

describe("crash recovery reconciler", () => {
  test("clean worktree with no commits can retry", () => {
    const observation: JobObservation = {
      jobId: "test:1",
      generation: 1,
      worktreeExists: true,
      worktreeStatus: "clean",
      uniqueCommits: 0,
      beadStatus: "in_progress",
    }
    expect(determineAction(observation)).toBe("retry")
  })

  test("dirty worktree enters bounded recovery", () => {
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

  test("clean unique commit is recovered as candidate", () => {
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

  test("missing worktree with in-progress bead is quarantined", () => {
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

  test("already closed bead needs no action", () => {
    const observation: JobObservation = {
      jobId: "test:1",
      generation: 1,
      worktreeExists: true,
      worktreeStatus: "clean",
      uniqueCommits: 1,
      beadStatus: "closed",
    }
    expect(determineAction(observation)).toBe("noop")
  })

  test("reconciler processes multiple observations", async () => {
    const reconciler = new ReconcilerImpl()
    const observations: JobObservation[] = [
      { jobId: "a:1", generation: 1, worktreeExists: true, worktreeStatus: "clean", uniqueCommits: 0, beadStatus: "in_progress" },
      { jobId: "b:1", generation: 1, worktreeExists: true, worktreeStatus: "dirty", uniqueCommits: 0, beadStatus: "in_progress" },
    ]

    const actions = await reconciler.reconcile(observations)

    expect(actions).toEqual(["retry", "recover"])
  })
})
