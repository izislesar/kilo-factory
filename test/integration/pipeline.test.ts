import { describe, expect, test } from "bun:test"
import { createIntegrationPipeline } from "../../src/integration/pipeline"

describe("integration pipeline", () => {
  test("rejects empty candidate branch", async () => {
    const pipeline = createIntegrationPipeline("main")
    const result = await pipeline.integrate("", "echo ok")
    expect(result.ok).toBe(false)
    expect(result.error).toContain("required")
  })

  test("rejects empty validation command", async () => {
    const pipeline = createIntegrationPipeline("main")
    const result = await pipeline.integrate("feature-branch", "")
    expect(result.ok).toBe(false)
    expect(result.error).toContain("required")
  })

  test("rejects non-existent branch", async () => {
    const pipeline = createIntegrationPipeline("main")
    const result = await pipeline.integrate("nonexistent-branch", "echo ok")
    expect(result.ok).toBe(false)
  })
})
