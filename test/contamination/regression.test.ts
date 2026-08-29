import { describe, expect, test } from "bun:test"
import { ContextBuilderImpl } from "../../src/context/builder"
import { validateCompletion } from "../../src/plugin/contract"
import type { JobIdentity } from "../../src/plugin/types"

const currentJob: JobIdentity = {
  jobId: "kilo-factory-005:3",
  bead: "kilo-factory-005",
  generation: 3,
  role: "core",
}

describe("context contamination regression", () => {
  test("old task IDs in seed history cannot override current job identity", () => {
    const builder = new ContextBuilderImpl("CONTRACT", "INSTRUCTIONS", "ROLE")
    const context = builder.build(
      currentJob,
      "Current acceptance",
      ["kilo-factory-001:1", "kilo-factory-002:2"],
      ["Old comment about kilo-factory-003"],
    )

    expect(context.jobEnvelope.jobId).toBe("kilo-factory-005:3")
    expect(context.jobEnvelope.bead).toBe("kilo-factory-005")
    expect(context.jobEnvelope.generation).toBe(3)
  })

  test("wrong-generation completion is rejected", () => {
    expect(() =>
      validateCompletion(
        {
          jobId: "kilo-factory-005:1",
          generation: 1,
          summary: "Stale",
          checks: [],
          risks: [],
          baseSha: "a",
          headSha: "b",
          dirty: false,
        },
        "kilo-factory-005",
        3,
      ),
    ).toThrow("Stale generation")
  })

  test("recovery preserves exact current job identity", () => {
    const builder = new ContextBuilderImpl("CONTRACT", "INSTRUCTIONS", "ROLE")

    const context1 = builder.build(currentJob, "Acceptance", [], [])
    const context2 = builder.build(currentJob, "Acceptance", [], [])

    expect(context1.jobEnvelope).toEqual(context2.jobEnvelope)
    expect(context1.jobEnvelope.jobId).toBe("kilo-factory-005:3")
  })

  test("unrelated active tasks are absent from generated job context", () => {
    const builder = new ContextBuilderImpl("CONTRACT", "INSTRUCTIONS", "ROLE")
    const context = builder.build(currentJob, "Acceptance", [], [])

    const contextStr = JSON.stringify(context)
    expect(contextStr).toContain("kilo-factory-005")
    expect(contextStr).not.toMatch(/kilo-factory-00[1-4]/)
    expect(contextStr).not.toMatch(/kilo-factory-00[6-9]/)
  })

  test("current job id and generation are authoritative and machine-owned", () => {
    const builder = new ContextBuilderImpl("CONTRACT", "INSTRUCTIONS", "ROLE")
    const context = builder.build(currentJob, "Acceptance", [], [])

    expect(context.jobEnvelope.jobId).toBe("kilo-factory-005:3")
    expect(context.jobEnvelope.generation).toBe(3)
  })
})
