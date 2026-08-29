import { spawnSync } from "node:child_process"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import type { ProcessOwnership, ProcessTracker, ShutdownResult, ServerLifecycle } from "./types"

type StoredOwnership = {
  pid: number
  type: "server" | "session"
  sessionId?: string
  directory?: string
  startedAt: string
  runID: string
}

export class DurableProcessTracker implements ProcessTracker {
  private statePath: string
  private runID: string
  private cache = new Map<number, ProcessOwnership>()

  constructor(statePath: string, runID: string) {
    this.statePath = statePath
    this.runID = runID
  }

  private async load(): Promise<StoredOwnership[]> {
    try {
      const data = readFileSync(this.statePath, "utf8")
      return JSON.parse(data) as StoredOwnership[]
    } catch {
      return []
    }
  }

  private async save(records: StoredOwnership[]): Promise<void> {
    await mkdir(resolve(this.statePath, ".."), { recursive: true })
    await writeFile(this.statePath, JSON.stringify(records, null, 2))
  }

  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }

  private isOwnedProcess(pid: number): boolean {
    try {
      const cmdline = readFileSync(`/proc/${pid}/cmdline`, "utf8")
      return cmdline.includes("kilo") || cmdline.includes("factory")
    } catch {
      return false
    }
  }

  registerServer(pid: number, directory: string): void {
    this.cache.set(pid, { pid, type: "server", directory, startedAt: new Date().toISOString(), runID: this.runID })
  }

  registerSession(pid: number, sessionId: string): void {
    this.cache.set(pid, { pid, type: "session", sessionId, startedAt: new Date().toISOString(), runID: this.runID })
  }

  isOwned(pid: number): boolean {
    const record = this.cache.get(pid)
    if (!record) return false
    if (!this.isProcessAlive(pid)) {
      this.cache.delete(pid)
      return false
    }
    if (record.runID !== this.runID) {
      if (!this.isOwnedProcess(pid)) {
        this.cache.delete(pid)
        return false
      }
    }
    return true
  }

  ownedProcesses(): ProcessOwnership[] {
    return [...this.cache.values()].filter((record) => this.isOwned(record.pid))
  }

  unregister(pid: number): void {
    this.cache.delete(pid)
  }

  async persist(): Promise<void> {
    const records = this.ownedProcesses().map((p) => ({
      pid: p.pid,
      type: p.type,
      sessionId: p.sessionId,
      directory: p.directory,
      startedAt: p.startedAt ?? new Date().toISOString(),
      runID: p.runID ?? this.runID,
    }))
    await this.save(records)
  }

  async reconcile(): Promise<{ stale: number; active: number }> {
    const stored = await this.load()
    let stale = 0
    let active = 0
    for (const record of stored) {
      if (this.isProcessAlive(record.pid) && (record.runID === this.runID || this.isOwnedProcess(record.pid))) {
        active++
      } else {
        stale++
      }
    }
    return { stale, active }
  }
}

export class ServerLifecycleImpl implements ServerLifecycle {
  private timeoutMs: number

  constructor(timeoutMs = 10_000) {
    this.timeoutMs = timeoutMs
  }

  async shutdown(tracker: ProcessTracker, options: { timeoutMs?: number } = {}): Promise<ShutdownResult> {
    const timeout = options.timeoutMs ?? this.timeoutMs
    const result: ShutdownResult = { stopped: 0, orphaned: 0, failed: [] }

    const owned = tracker.ownedProcesses()
    for (const record of owned) {
      try {
        process.kill(record.pid, "SIGTERM")
        result.stopped++
      } catch {
        result.failed.push(`PID ${record.pid}: process already exited`)
      }
    }

    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      const stillAlive = owned.filter((r: ProcessOwnership) => {
        try {
          process.kill(r.pid, 0)
          return true
        } catch {
          return false
        }
      })
      if (stillAlive.length === 0) break
      await new Promise((resolve) => setTimeout(resolve, 200))
    }

    for (const record of owned) {
      try {
        process.kill(record.pid, 0)
        try {
          process.kill(record.pid, "SIGKILL")
          result.stopped++
        } catch {
          result.orphaned++
        }
      } catch {
        // Already dead
      }
    }

    return result
  }
}

export function createProcessTracker(statePath: string): DurableProcessTracker {
  const runID = crypto.randomUUID()
  return new DurableProcessTracker(statePath, runID)
}

export function createServerLifecycle(): ServerLifecycle {
  return new ServerLifecycleImpl()
}
