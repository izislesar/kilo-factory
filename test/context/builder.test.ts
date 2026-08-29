import { describe, expect, test } from "bun:test"
import { ContextBuilderImpl } from "../../src/context/builder"
import type { JobIdentity } from "../../src/plugin/types"

const job: JobIdentity = {
  jobId: "kilo-factory-001:1",
  bead: "kilo-factory-001",
  generation: 1,
  role: "core",
}

describe("ContextBuilder", () => {
  test("includes exact job identity and generation", () => {
    const builder = new ContextBuilderImpl("CONTRACT", "INSTRUCTIONS", "ROLE")
    const context = builder.build(job, "Do the thing", ["dep1"], ["comment1"])

    expect(context.jobEnvelope.jobId).toBe("kilo-factory-001:1")
    expect(context.jobEnvelope.bead).toBe("kilo-factory-001")
    expect(context.jobEnvelope.generation).toBe(1)
  })

  test("separates stable contract from dynamic job context", () => {
    const builder = new ContextBuilderImpl("STABLE", "PROJ", "ROLE")
    const context = builder.build(job, "Acceptance", [], [])

    expect(context.contract).toBe("STABLE")
    expect(context.projectInstructions).toBe("PROJ")
    expect(context.roleContract).toBe("ROLE")
    expect(context.jobEnvelope.acceptance).toBe("Acceptance")
  })

  test("does not include unrelated bead IDs", () => {
    const builder = new ContextBuilderImpl("C", "P", "R")
    const context = builder.build(job, "Acc", ["kilo-factory-002:1"], [])

    const contextStr = JSON.stringify(context)
    expect(contextStr).toContain("kilo-factory-001:1")
    expect(contextStr).not.toContain("kilo-factory-003")
    expect(contextStr).not.toContain("kilo-factory-004")
  })

  test("includes only current job's dependencies and comments", () => {
    const builder = new ContextBuilderImpl("C", "P", "R")
    const context = builder.build(job, "Acc", ["dep-a", "dep-b"], ["note-1"])

    expect(context.jobEnvelope.dependencies).toEqual(["dep-a", "dep-b"])
    expect(context.jobEnvelope.comments).toEqual(["note-1"])
  })

  test("repository context is separate from job identity", () => {
    const builder = new ContextBuilderImpl("C", "P", "R")
    const context = builder.build(job, "Acc", [], [], ["file.ts", "other.ts"])

    expect(context.repositoryContext).toEqual(["file.ts", "other.ts"])
    expect(context.jobEnvelope.jobId).toBe("kilo-factory-001:1")
  })
})
