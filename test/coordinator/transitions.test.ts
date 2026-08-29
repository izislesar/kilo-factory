import { describe, expect, test } from "bun:test"
import { canTransition, legalTransitions, assertTransition, IllegalTransitionError } from "../../src/coordinator/transitions"

describe("job state transitions", () => {
  test("READY can transition to LEASED", () => {
    expect(canTransition("READY", "LEASED")).toBe(true)
  })

  test("READY cannot transition directly to RUNNING", () => {
    expect(canTransition("READY", "RUNNING")).toBe(false)
  })

  test("RUNNING can transition to RESULT_READY", () => {
    expect(canTransition("RUNNING", "RESULT_READY")).toBe(true)
  })

  test("CLOSED has no legal transitions", () => {
    expect(legalTransitions("CLOSED")).toEqual([])
  })

  test("QUARANTINED is terminal", () => {
    expect(canTransition("QUARANTINED", "READY")).toBe(false)
  })

  test("assertTransition throws on illegal transition", () => {
    expect(() => assertTransition("READY", "RUNNING")).toThrow(IllegalTransitionError)
  })

  test("assertTransition allows legal transition", () => {
    expect(() => assertTransition("READY", "LEASED")).not.toThrow()
  })

  test("RETRY_WAIT can return to LEASED for retry", () => {
    expect(canTransition("RETRY_WAIT", "LEASED")).toBe(true)
  })

  test("RETRY_WAIT can be quarantined", () => {
    expect(canTransition("RETRY_WAIT", "QUARANTINED")).toBe(true)
  })
})
