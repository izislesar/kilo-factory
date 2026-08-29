import { describe, expect, test, afterEach } from "bun:test"
import { DurableEventLogger } from "../../src/observability/logger"
import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

let logPath: string

afterEach(async () => {
  await rm(logPath, { force: true }).catch(() => undefined)
})

describe("DurableEventLogger", () => {
  test("logs structured events with timestamp", async () => {
    logPath = join(tmpdir(), `kilo-factory-test-${Date.now()}.log`)
    const logger = new DurableEventLogger(logPath)
    await logger.log({ level: "info", type: "job.created", message: "Job created" })

    const events = await logger.events()
    expect(events.length).toBe(1)
    expect(events[0].timestamp).toBeDefined()
    expect(events[0].type).toBe("job.created")
  })

  test("filters events by job ID", async () => {
    logPath = join(tmpdir(), `kilo-factory-test-${Date.now()}.log`)
    const logger = new DurableEventLogger(logPath)
    await logger.log({ level: "info", type: "job.created", jobId: "job:1", message: "Created" })
    await logger.log({ level: "info", type: "job.created", jobId: "job:2", message: "Created" })

    const filtered = await logger.events({ jobId: "job:1" })
    expect(filtered.length).toBe(1)
    expect(filtered[0].jobId).toBe("job:1")
  })

  test("filters events by level", async () => {
    logPath = join(tmpdir(), `kilo-factory-test-${Date.now()}.log`)
    const logger = new DurableEventLogger(logPath)
    await logger.log({ level: "info", type: "test", message: "Info" })
    await logger.log({ level: "error", type: "test", message: "Error" })

    const errors = await logger.events({ level: "error" })
    expect(errors.length).toBe(1)
    expect(errors[0].level).toBe("error")
  })

  test("never logs secrets or credentials", async () => {
    logPath = join(tmpdir(), `kilo-factory-test-${Date.now()}.log`)
    const logger = new DurableEventLogger(logPath)
    await logger.log({
      level: "info",
      type: "test",
      message: "Test",
      data: { password: "secret123", token: "abc", safe: "visible" },
    })

    const events = await logger.events()
    const data = events[0].data
    expect(data?.password).toBe("[REDACTED]")
    expect(data?.token).toBe("[REDACTED]")
    expect(data?.safe).toBe("visible")
  })

  test("redacts nested sensitive data", async () => {
    logPath = join(tmpdir(), `kilo-factory-test-${Date.now()}.log`)
    const logger = new DurableEventLogger(logPath)
    await logger.log({
      level: "info",
      type: "test",
      message: "Test",
      data: { config: { apiKey: "secret", nested: { token: "abc" } } },
    })

    const events = await logger.events()
    const data = events[0].data as Record<string, unknown>
    const config = data.config as Record<string, unknown>
    expect(config.apiKey).toBe("[REDACTED]")
    const nested = config.nested as Record<string, unknown>
    expect(nested.token).toBe("[REDACTED]")
  })

  test("events survive restart", async () => {
    logPath = join(tmpdir(), `kilo-factory-test-${Date.now()}.log`)
    const logger1 = new DurableEventLogger(logPath)
    await logger1.log({ level: "info", type: "test", message: "Persisted" })

    const logger2 = new DurableEventLogger(logPath)
    const events = await logger2.events()
    expect(events.length).toBe(1)
    expect(events[0].message).toBe("Persisted")
  })
})
