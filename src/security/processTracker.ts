import type { ProcessOwnership, ProcessTracker } from "./types"

export class ProcessTrackerImpl implements ProcessTracker {
  private processes = new Map<number, ProcessOwnership>()

  registerServer(pid: number, directory: string): void {
    this.processes.set(pid, { pid, type: "server", directory })
  }

  registerSession(pid: number, sessionId: string): void {
    this.processes.set(pid, { pid, type: "session", sessionId })
  }

  isOwned(pid: number): boolean {
    return this.processes.has(pid)
  }

  ownedProcesses(): ProcessOwnership[] {
    return [...this.processes.values()]
  }

  unregister(pid: number): void {
    this.processes.delete(pid)
  }
}

export function createProcessTracker(): ProcessTracker {
  return new ProcessTrackerImpl()
}
