import { spawn } from "node:child_process"
import type { BeadsBackend, BeadsIssue, ReadyFilter } from "./types"

type ExecResult = { stdout: string; stderr: string; exitCode: number }

type ExecFn = (command: string[], input?: string) => Promise<ExecResult>

export class BeadsCliBackend implements BeadsBackend {
  private binary: string
  private execFn: ExecFn

  constructor(binary = "bd", execFn?: ExecFn) {
    this.binary = binary
    this.execFn = execFn ?? this.defaultExec.bind(this)
  }

  private defaultExec(command: string[], input?: string): Promise<ExecResult> {
    return new Promise((resolve) => {
      const child = spawn(this.binary, command, { stdio: ["pipe", "pipe", "pipe"] })
      let stdout = ""
      let stderr = ""
      child.stdout.on("data", (data) => {
        stdout += data.toString()
      })
      child.stderr.on("data", (data) => {
        stderr += data.toString()
      })
      child.on("close", (exitCode) => {
        resolve({ stdout, stderr, exitCode: exitCode ?? 1 })
      })
      if (input) {
        child.stdin.write(input)
        child.stdin.end()
      }
    })
  }

  private parseIssues(json: string): BeadsIssue[] {
    try {
      const parsed = JSON.parse(json)
      if (!Array.isArray(parsed)) return []
      return parsed
    } catch {
      return []
    }
  }

  private parseIssue(json: string): BeadsIssue | null {
    try {
      return JSON.parse(json) as BeadsIssue
    } catch {
      return null
    }
  }

  async ready(filter: ReadyFilter = {}): Promise<BeadsIssue[]> {
    const { stdout } = await this.execFn(["ready", "--json"])
    const issues = this.parseIssues(stdout)
    if (filter.excludeEpics) {
      return issues.filter((issue) => issue.issue_type !== "epic")
    }
    return issues
  }

  async show(issueId: string): Promise<BeadsIssue | null> {
    const { stdout, exitCode } = await this.execFn(["show", issueId, "--json"])
    if (exitCode !== 0) return null
    return this.parseIssue(stdout)
  }

  async claim(issueId: string): Promise<boolean> {
    const { exitCode } = await this.execFn(["update", issueId, "--claim"])
    return exitCode === 0
  }

  async update(issueId: string, changes: Record<string, unknown>): Promise<boolean> {
    const args = ["update", issueId]
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined) continue
      args.push(`--${key}`)
      if (typeof value !== "boolean") args.push(String(value))
    }
    const { exitCode } = await this.execFn(args)
    return exitCode === 0
  }

  async close(issueId: string, reason?: string): Promise<boolean> {
    const args = ["close", issueId]
    if (reason) args.push("--reason", reason)
    const { exitCode } = await this.execFn(args)
    return exitCode === 0
  }
}

export function createBeadsBackend(binary?: string): BeadsBackend {
  return new BeadsCliBackend(binary)
}
