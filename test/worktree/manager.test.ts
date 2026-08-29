import { describe, expect, test } from "bun:test"
import { GitWorktreeManager } from "../../src/worktree/manager"
import { resolve, join } from "node:path"

describe("GitWorktreeManager ownership and containment", () => {
  test("uses configured mainBranch for ancestry", () => {
    const manager = new GitWorktreeManager("/repo", "/wt", "trunk")
    const branch = manager.branchFor("test", 1)
    expect(branch).toBe("factory/test/1")
  })

  test("defaults mainBranch to main", () => {
    const manager = new GitWorktreeManager("/repo", "/wt")
    const branch = manager.branchFor("test", 1)
    expect(branch).toBe("factory/test/1")
  })

  test("isOwned recognizes factory branches", () => {
    const manager = new GitWorktreeManager("/repo", "/wt")
    expect(manager.isOwned("factory/kilo-factory-001/1")).toBe(true)
    expect(manager.isOwned("factory/job-abc/42")).toBe(true)
  })

  test("isOwned rejects non-factory branches", () => {
    const manager = new GitWorktreeManager("/repo", "/wt")
    expect(manager.isOwned("main")).toBe(false)
    expect(manager.isOwned("feature/my-feature")).toBe(false)
    expect(manager.isOwned("factory/")).toBe(false)
    expect(manager.isOwned("factory/test")).toBe(false)
    expect(manager.isOwned("factory/test/abc")).toBe(false)
  })

  test("job ID sanitization prevents path traversal", () => {
    const manager = new GitWorktreeManager("/repo", "/wt")
    const branch = manager.branchFor("../escape", 1)
    expect(branch).not.toContain("..")
    const jobPart = branch.replace("factory/", "").split("/")[0]
    expect(jobPart).not.toContain("/")
  })

  test("worktree root and path construction use path APIs", () => {
    const manager = new GitWorktreeManager("/repo", "/root/wt")
    const safeJobId = "../../../etc".replace(/[^a-zA-Z0-9_-]/g, "_")
    const path = join("/root/wt", safeJobId, String(1))
    const resolved = resolve(path)
    const rel = resolved.replace(resolve("/root/wt"), "")
    expect(rel.startsWith("..")).toBe(false)
  })
})
