import type { EventLogger, LogLevel, StructuredEvent } from "./types"

const SENSITIVE_KEYS = ["password", "token", "secret", "key", "credential", "auth"]

function redact(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.some((s) => key.toLowerCase().includes(s))) {
      result[key] = "[REDACTED]"
    } else {
      result[key] = value
    }
  }
  return result
}

export class EventLoggerImpl implements EventLogger {
  private stored: StructuredEvent[] = []

  log(event: Omit<StructuredEvent, "timestamp">): void {
    const entry: StructuredEvent = {
      ...event,
      timestamp: new Date().toISOString(),
      data: event.data ? redact(event.data) : undefined,
    }
    this.stored.push(entry)
  }

  events(filter?: { jobId?: string; level?: LogLevel }): StructuredEvent[] {
    return this.stored.filter((event) => {
      if (filter?.jobId && event.jobId !== filter.jobId) return false
      if (filter?.level && event.level !== filter.level) return false
      return true
    })
  }
}

export function createEventLogger(): EventLogger {
  return new EventLoggerImpl()
}
