import { describe, expect, test } from "bun:test"
import { ProcessTrackerImpl } from "../../src/security/processTracker"
import { GitWorktreeManager } from "../../src/worktree/manager"
import { validateCompletion, ContractError } from "../../src/plugin/contract"
import type { CompletionPayload } from "../../src/plugin/types"

describe("security audit: destructive boundaries", () => {
  describe("destructive cleanup requires positive ownership", () => {
    test("process tracker only identifies explicitly registered PIDs", () => {
      const tracker = new ProcessTrackerImpl()
      tracker.registerServer(12345, "/repo")

      expect(tracker.isOwned(12345)).toBe(true)
      expect(tracker.isOwned(12346)).toBe(false)
      expect(tracker.isOwned(0)).toBe(false)
      expect(tracker.isOwned(-1)).toBe(false)
    })

    test("PID reuse safety: unregistered PID not owned after unregister", () => {
      const tracker = new ProcessTrackerImpl()
      tracker.registerServer(12345, "/repo")
      tracker.unregister(12345)

      expect(tracker.isOwned(12345)).toBe(false)
    })

    test("foreign Kilo processes not tracked", () => {
      const tracker = new ProcessTrackerImpl()
      expect(tracker.isOwned(99999)).toBe(false)
      expect(tracker.ownedProcesses()).toEqual([])
    })
  })

  describe("worktree ownership validation", () => {
    test("only factory branches are owned", () => {
      const manager = new GitWorktreeManager("/repo", "/wt")
      expect(manager.isOwned("factory/kilo-factory-001/1")).toBe(true)
      expect(manager.isOwned("main")).toBe(false)
      expect(manager.isOwned("feature/my-feature")).toBe(false)
      expect(manager.isOwned("factory/")).toBe(false)
    })

    test("malformed branch names rejected", () => {
      const manager = new GitWorktreeManager("/repo", "/wt")
      expect(manager.isOwned("")).toBe(false)
      expect(manager.isOwned("factory/")).toBe(false)
      expect(manager.isOwned("factory/kilo-factory-001")).toBe(false)
      expect(manager.isOwned("factory/kilo-factory-001/abc")).toBe(false)
    })
  })

  describe("stale/foreign completion cannot promote", () => {
    test("wrong generation rejected", () => {
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
      expect(() => validateCompletion(payload, "test", 2)).toThrow(ContractError)
    })

    test("wrong job rejected", () => {
      const payload: CompletionPayload = {
        jobId: "other:1",
        generation: 1,
        summary: "Done",
        checks: [],
        risks: [],
        baseSha: "a",
        headSha: "b",
        dirty: false,
      }
      expect(() => validateCompletion(payload, "test", 1)).toThrow("Job mismatch")
    })
  })

  describe("command injection prevention", () => {
    test("worktree branch names are validated format", () => {
      const manager = new GitWorktreeManager("/repo", "/wt")
      const branch = manager.branchFor("kilo-factory-001", 1)
      expect(branch).toBe("factory/kilo-factory-001/1")
      expect(branch).not.toContain(";")
      expect(branch).not.toContain("|")
      expect(branch).not.toContain("&")
    })
  })
})
