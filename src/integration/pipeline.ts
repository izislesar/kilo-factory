import { spawnSync } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import type { IntegrationResult, IntegrationPipeline } from "./types"

export class ConfiguredIntegrationPipeline implements IntegrationPipeline {
  private mainBranch: string
  private repoPath: string
  private remote: string

  constructor(mainBranch = "main", repoPath = process.cwd(), remote = "origin") {
    this.mainBranch = mainBranch
    this.repoPath = resolve(repoPath)
    this.remote = remote
  }

  async integrate(candidateBranch: string, validationCommand: string): Promise<IntegrationResult> {
    if (!candidateBranch.trim()) {
      return { ok: false, error: "Candidate branch is required" }
    }
    if (!validationCommand.trim()) {
      return { ok: false, error: "Validation command is required" }
    }

    let integrationDir: string | undefined
    try {
      integrationDir = await mkdtemp(join(tmpdir(), "kilo-factory-integ-"))

      const cloneResult = spawnSync("git", ["clone", "--branch", this.mainBranch, "--single-branch", this.repoPath, integrationDir], {
        encoding: "utf8",
      })
      if (cloneResult.status !== 0) {
        return { ok: false, error: `Clone failed: ${cloneResult.stderr}` }
      }

      const fetchResult = spawnSync("git", ["fetch", this.remote, candidateBranch], { cwd: integrationDir, encoding: "utf8" })
      if (fetchResult.status !== 0) {
        return { ok: false, error: `Fetch failed: ${fetchResult.stderr}` }
      }

      const mergeResult = spawnSync("git", ["merge", "--no-ff", `${this.remote}/${candidateBranch}`, "-m", `Integrate ${candidateBranch}`], {
        cwd: integrationDir,
        encoding: "utf8",
      })
      if (mergeResult.status !== 0) {
        spawnSync("git", ["merge", "--abort"], { cwd: integrationDir, encoding: "utf8" })
        return { ok: false, error: `Merge conflict: ${mergeResult.stderr}` }
      }

      const validationResult = spawnSync("sh", ["-c", validationCommand], {
        cwd: integrationDir,
        encoding: "utf8",
        timeout: 300_000,
      })
      if (validationResult.status !== 0) {
        spawnSync("git", ["merge", "--abort"], { cwd: integrationDir, encoding: "utf8" })
        return { ok: false, error: `Validation failed: ${validationResult.stderr || validationResult.stdout}` }
      }

      const pushResult = spawnSync("git", ["push", this.remote, this.mainBranch], { cwd: integrationDir, encoding: "utf8" })
      if (pushResult.status !== 0) {
        return { ok: false, error: `Push failed: ${pushResult.stderr}` }
      }

      const headResult = spawnSync("git", ["rev-parse", "HEAD"], { cwd: integrationDir, encoding: "utf8" })
      const mainSha = headResult.stdout.trim()

      return { ok: true, mainSha }
    } catch (error) {
      return { ok: false, error: String(error) }
    } finally {
      if (integrationDir) {
        await rm(integrationDir, { recursive: true, force: true }).catch(() => undefined)
      }
    }
  }
}

export function createIntegrationPipeline(mainBranch?: string, repoPath?: string): IntegrationPipeline {
  return new ConfiguredIntegrationPipeline(mainBranch, repoPath)
}
