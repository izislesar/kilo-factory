import { describe, expect, test, beforeEach } from "bun:test"
import { GitWorktreeManager } from "../../src/worktree/manager"

describe("GitWorktreeManager", () => {
  test("branch name is unique per job and generation", () => {
    const manager = new GitWorktreeManager("/repo", "/worktrees")
    const branch = manager.branchFor("kilo-factory-001", 1)
    expect(branch).toBe("factory/kilo-factory-001/1")
  })

  test("isOwned recognizes factory branches", () => {
    const manager = new GitWorktreeManager("/repo", "/worktrees")
    expect(manager.isOwned("factory/kilo-factory-001/1")).toBe(true)
    expect(manager.isOwned("main")).toBe(false)
    expect(manager.isOwned("feature/my-feature")).toBe(false)
  })

  test("isOwned returns false for empty or malformed branch", () => {
    const manager = new GitWorktreeManager("/repo", "/worktrees")
    expect(manager.isOwned("")).toBe(false)
    expect(manager.isOwned("factory/")).toBe(false)
    expect(manager.isOwned("factory/kilo-factory-001")).toBe(false)
  })
})
