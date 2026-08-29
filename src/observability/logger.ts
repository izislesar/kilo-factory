import { appendFile, mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import type { LogLevel, StatusView, StructuredEvent } from "./types"

const SENSITIVE_KEYS = ["password", "token", "secret", "key", "credential", "auth", "apikey"]

function redact(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.some((s) => key.toLowerCase().includes(s))) {
      result[key] = "[REDACTED]"
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = redact(value as Record<string, unknown>)
    } else {
      result[key] = value
    }
  }
  return result
}

export class DurableEventLogger {
  private logPath: string
  private retentionLimit: number

  constructor(logPath: string, retentionLimit = 10_000) {
    this.logPath = resolve(logPath)
    this.retentionLimit = retentionLimit
  }

  async log(event: Omit<StructuredEvent, "timestamp">): Promise<void> {
    const entry: StructuredEvent = {
      ...event,
      timestamp: new Date().toISOString(),
      data: event.data ? redact(event.data) : undefined,
    }
    await mkdir(resolve(this.logPath, ".."), { recursive: true })
    await appendFile(this.logPath, JSON.stringify(entry) + "\n")
  }

  async events(filter?: { jobId?: string; level?: LogLevel }): Promise<StructuredEvent[]> {
    try {
      const { readFile } = await import("node:fs/promises")
      const content = await readFile(this.logPath, "utf8")
      const lines = content.split("\n").filter(Boolean)
      const events: StructuredEvent[] = []
      for (const line of lines.slice(-this.retentionLimit)) {
        try {
          const event = JSON.parse(line) as StructuredEvent
          if (filter?.jobId && event.jobId !== filter.jobId) continue
          if (filter?.level && event.level !== filter.level) continue
          events.push(event)
        } catch {
          // Skip malformed lines
        }
      }
      return events
    } catch {
      return []
    }
  }
}

export function createEventLogger(logPath: string): DurableEventLogger {
  return new DurableEventLogger(logPath)
}
