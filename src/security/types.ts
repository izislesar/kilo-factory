export type ProcessOwnership = {
  pid: number
  type: "server" | "session"
  sessionId?: string
  directory?: string
  startedAt?: string
  runID?: string
}

export type ShutdownResult = {
  stopped: number
  orphaned: number
  failed: string[]
}

export type ProcessTracker = {
  registerServer(pid: number, directory: string): void
  registerSession(pid: number, sessionId: string): void
  isOwned(pid: number): boolean
  ownedProcesses(): ProcessOwnership[]
  unregister(pid: number): void
}

export type ServerLifecycle = {
  shutdown(tracker: ProcessTracker, options?: { timeoutMs?: number }): Promise<ShutdownResult>
}
