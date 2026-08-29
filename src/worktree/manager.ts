import { spawnSync } from "node:child_process"
import type { WorktreeInfo, WorktreeManager, WorktreeStatus } from "./types"

const BRANCH_PREFIX = "factory/"

export class GitWorktreeManager implements WorktreeManager {
  private repoPath: string
  private worktreeRoot: string

  constructor(repoPath: string, worktreeRoot: string) {
    this.repoPath = repoPath
    this.worktreeRoot = worktreeRoot
  }

  branchFor(jobId: string, generation: number): string {
    return `${BRANCH_PREFIX}${jobId}/${generation}`
  }

  isOwned(branch: string): boolean {
    if (!branch.startsWith(BRANCH_PREFIX)) return false
    const parts = branch.slice(BRANCH_PREFIX.length).split("/")
    return parts.length === 2 && parts[0].length > 0 && /^\d+$/.test(parts[1])
  }

  private run(args: string[], cwd?: string): string {
    const result = spawnSync("git", args, { cwd: cwd ?? this.repoPath, encoding: "utf8" })
    if (result.status !== 0) {
      throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`)
    }
    return result.stdout
  }

  async create(baseSha: string, jobId: string, generation: number): Promise<WorktreeInfo> {
    const branch = this.branchFor(jobId, generation)
    const path = `${this.worktreeRoot}/${jobId}/${generation}`
    this.run(["worktree", "add", "-b", branch, path, baseSha])
    return { path, branch, status: "clean", uniqueCommitCount: 0, headSha: baseSha }
  }

  async inspect(path: string): Promise<WorktreeInfo | null> {
    try {
      const output = this.run(["worktree", "list", "--porcelain"])
      const entries = output.split("\n\n").filter(Boolean)
      for (const entry of entries) {
        const lines = entry.split("\n")
        const worktreePath = lines[0]?.replace(/^worktree /, "")
        if (worktreePath !== path) continue
        const branchLine = lines.find((l) => l.startsWith("branch "))
        const branch = branchLine?.replace(/^branch refs\/heads\//, "") ?? ""
        const headLine = lines.find((l) => l.startsWith("HEAD "))
        const headSha = headLine?.replace(/^HEAD /, "") ?? ""
        const status = await this.status(path)
        const uniqueCommitCount = await this.uniqueCommitCount(branch)
        return { path, branch, status, uniqueCommitCount, headSha }
      }
      return null
    } catch {
      return null
    }
  }

  async status(path: string): Promise<WorktreeStatus> {
    try {
      const output = this.run(["status", "--porcelain"], path)
      return output.trim().length > 0 ? "dirty" : "clean"
    } catch {
      return "unknown"
    }
  }

  private async uniqueCommitCount(branch: string): Promise<number> {
    try {
      const output = this.run(["rev-list", "--count", `${branch}`, "--not", "main"])
      return parseInt(output.trim(), 10) || 0
    } catch {
      return 0
    }
  }

  async remove(path: string): Promise<boolean> {
    const info = await this.inspect(path)
    if (!info || !this.isOwned(info.branch)) return false
    if (info.status === "dirty") return false
    try {
      this.run(["worktree", "remove", "--force", path])
      return true
    } catch {
      return false
    }
  }

  async listOwned(): Promise<WorktreeInfo[]> {
    const output = this.run(["worktree", "list", "--porcelain"])
    const entries = output.split("\n\n").filter(Boolean)
    const owned: WorktreeInfo[] = []
    for (const entry of entries) {
      const lines = entry.split("\n")
      const path = lines[0]?.replace(/^worktree /, "")
      const branchLine = lines.find((l) => l.startsWith("branch "))
      const branch = branchLine?.replace(/^branch refs\/heads\//, "") ?? ""
      if (!this.isOwned(branch) || !path) continue
      const headLine = lines.find((l) => l.startsWith("HEAD "))
      const headSha = headLine?.replace(/^HEAD /, "") ?? ""
      const status = await this.status(path)
      const uniqueCommitCount = await this.uniqueCommitCount(branch)
      owned.push({ path, branch, status, uniqueCommitCount, headSha })
    }
    return owned
  }
}

export function createWorktreeManager(repoPath: string, worktreeRoot: string): WorktreeManager {
  return new GitWorktreeManager(repoPath, worktreeRoot)
}
