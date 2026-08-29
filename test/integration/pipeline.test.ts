import { describe, expect, test } from "bun:test"
import { validateIntegration, IntegrationError } from "../../src/integration/pipeline"

describe("integration validation", () => {
  test("rejects empty candidate branch", () => {
    expect(() => validateIntegration("", "echo ok")).toThrow(IntegrationError)
  })

  test("rejects empty validation command", () => {
    expect(() => validateIntegration("feature-branch", "")).toThrow(IntegrationError)
  })

  test("accepts valid inputs", () => {
    expect(() => validateIntegration("feature-branch", "make test")).not.toThrow()
  })
})
