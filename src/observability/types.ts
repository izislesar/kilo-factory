export type LogLevel = "info" | "warn" | "error"

export type StructuredEvent = {
  timestamp: string
  level: LogLevel
  type: string
  jobId?: string
  message: string
  data?: Record<string, unknown>
}

export type EventLogger = {
  log(event: Omit<StructuredEvent, "timestamp">): void
  events(filter?: { jobId?: string; level?: LogLevel }): StructuredEvent[]
}

export type StatusView = {
  role: string
  state: string
  explanation: string
  sessionID?: string
  worktree?: string
  attempts: number
  lastFailure?: string
}
