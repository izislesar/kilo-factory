import { describe, expect, test } from "bun:test"
import { EventLoggerImpl } from "../../src/observability/logger"

describe("EventLogger", () => {
  test("logs structured events with timestamp", () => {
    const logger = new EventLoggerImpl()
    logger.log({ level: "info", type: "job.created", message: "Job created" })

    const events = logger.events()
    expect(events.length).toBe(1)
    expect(events[0].timestamp).toBeDefined()
    expect(events[0].type).toBe("job.created")
  })

  test("filters events by job ID", () => {
    const logger = new EventLoggerImpl()
    logger.log({ level: "info", type: "job.created", jobId: "job:1", message: "Created" })
    logger.log({ level: "info", type: "job.created", jobId: "job:2", message: "Created" })

    const filtered = logger.events({ jobId: "job:1" })
    expect(filtered.length).toBe(1)
    expect(filtered[0].jobId).toBe("job:1")
  })

  test("filters events by level", () => {
    const logger = new EventLoggerImpl()
    logger.log({ level: "info", type: "test", message: "Info" })
    logger.log({ level: "error", type: "test", message: "Error" })

    const errors = logger.events({ level: "error" })
    expect(errors.length).toBe(1)
    expect(errors[0].level).toBe("error")
  })

  test("never logs secrets or credentials", () => {
    const logger = new EventLoggerImpl()
    logger.log({
      level: "info",
      type: "test",
      message: "Test",
      data: { password: "secret123", token: "abc", safe: "visible" },
    })

    const events = logger.events()
    const data = events[0].data
    expect(data?.password).toBe("[REDACTED]")
    expect(data?.token).toBe("[REDACTED]")
    expect(data?.safe).toBe("visible")
  })
})
