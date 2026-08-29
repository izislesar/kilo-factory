import { describe, expect, test } from "bun:test"
import { validateCompletion, validateBlock } from "../../src/plugin/contract"
import type { CompletionPayload, BlockPayload } from "../../src/plugin/types"

describe("plugin contract", () => {
  test("accepts completion for matching job and generation", () => {
    const payload: CompletionPayload = {
      jobId: "kilo-factory-001:1",
      generation: 1,
      summary: "Done",
      checks: [],
      risks: [],
      baseSha: "abc",
      headSha: "def",
      dirty: false,
    }
    expect(() => validateCompletion(payload, "kilo-factory-001", 1)).not.toThrow()
  })

  test("rejects completion for wrong job", () => {
    const payload: CompletionPayload = {
      jobId: "kilo-factory-002:1",
      generation: 1,
      summary: "Done",
      checks: [],
      risks: [],
      baseSha: "abc",
      headSha: "def",
      dirty: false,
    }
    expect(() => validateCompletion(payload, "kilo-factory-001", 1)).toThrow("Job mismatch")
  })

  test("rejects completion for stale generation", () => {
    const payload: CompletionPayload = {
      jobId: "kilo-factory-001:1",
      generation: 1,
      summary: "Done",
      checks: [],
      risks: [],
      baseSha: "abc",
      headSha: "def",
      dirty: false,
    }
    expect(() => validateCompletion(payload, "kilo-factory-001", 2)).toThrow("Stale generation")
  })

  test("accepts block for matching job and generation", () => {
    const payload: BlockPayload = {
      jobId: "kilo-factory-001:1",
      generation: 1,
      reason: "Need input",
      class: "external",
    }
    expect(() => validateBlock(payload, "kilo-factory-001", 1)).not.toThrow()
  })

  test("rejects block for wrong job", () => {
    const payload: BlockPayload = {
      jobId: "kilo-factory-002:1",
      generation: 1,
      reason: "Need input",
      class: "external",
    }
    expect(() => validateBlock(payload, "kilo-factory-001", 1)).toThrow("Job mismatch")
  })
})
