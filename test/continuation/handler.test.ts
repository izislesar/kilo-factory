import { describe, expect, test } from "bun:test"
import { BoundedIdleHandler } from "../../src/continuation/handler"

const freshState = () => ({ count: 0, lastSha: "base_sha", progressRecorded: false })

describe("BoundedIdleHandler", () => {
  test("session.idle is observation, not completion", () => {
    const handler = new BoundedIdleHandler({ maxContinuations: 3, continuationPrompt: "Continue." }, freshState())
    const decision = handler.decide({ sessionID: "ses_1", currentSha: "base_sha", dirty: false })

    expect(decision).toBe("continue")
  })

  test("resets counter when progress is observed", () => {
    const handler = new BoundedIdleHandler({ maxContinuations: 3, continuationPrompt: "Continue." }, freshState())
    handler.recordProgress("new_sha")
    const decision = handler.decide({ sessionID: "ses_1", currentSha: "new_sha", dirty: false })

    expect(decision).toBe("wait")
    expect(handler.getState().count).toBe(0)
  })

  test("quarantines after exceeding max continuations", () => {
    const handler = new BoundedIdleHandler({ maxContinuations: 2, continuationPrompt: "Continue." }, freshState())

    handler.decide({ sessionID: "ses_1", currentSha: "base_sha", dirty: false })
    handler.decide({ sessionID: "ses_1", currentSha: "base_sha", dirty: false })
    const decision = handler.decide({ sessionID: "ses_1", currentSha: "base_sha", dirty: false })

    expect(decision).toBe("quarantine")
  })

  test("does not inject duplicate continuation while budget remains", () => {
    const handler = new BoundedIdleHandler({ maxContinuations: 3, continuationPrompt: "Continue." }, freshState())

    const first = handler.decide({ sessionID: "ses_1", currentSha: "base_sha", dirty: false })
    const second = handler.decide({ sessionID: "ses_1", currentSha: "base_sha", dirty: false })

    expect(first).toBe("continue")
    expect(second).toBe("continue")
    expect(handler.getState().count).toBe(2)
  })

  test("continuation budget is configurable", () => {
    const handler = new BoundedIdleHandler({ maxContinuations: 1, continuationPrompt: "Go." }, freshState())

    handler.decide({ sessionID: "ses_1", currentSha: "base_sha", dirty: false })
    const decision = handler.decide({ sessionID: "ses_1", currentSha: "base_sha", dirty: false })

    expect(decision).toBe("quarantine")
  })

  test("dirty work with new SHA is treated as progress", () => {
    const handler = new BoundedIdleHandler({ maxContinuations: 3, continuationPrompt: "Continue." }, freshState())

    const decision = handler.decide({ sessionID: "ses_1", currentSha: "new_sha", dirty: true })

    expect(decision).toBe("wait")
  })
})
