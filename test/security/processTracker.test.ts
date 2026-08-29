import { describe, expect, test } from "bun:test"
import { ProcessTrackerImpl } from "../../src/security/processTracker"

describe("ProcessTracker", () => {
  test("tracks registered server processes", () => {
    const tracker = new ProcessTrackerImpl()
    tracker.registerServer(12345, "/repo")

    expect(tracker.isOwned(12345)).toBe(true)
    expect(tracker.isOwned(99999)).toBe(false)
  })

  test("tracks registered session processes", () => {
    const tracker = new ProcessTrackerImpl()
    tracker.registerSession(12345, "ses_1")

    const owned = tracker.ownedProcesses()
    expect(owned.length).toBe(1)
    expect(owned[0].type).toBe("session")
    expect(owned[0].sessionId).toBe("ses_1")
  })

  test("unregister removes process ownership", () => {
    const tracker = new ProcessTrackerImpl()
    tracker.registerServer(12345, "/repo")
    tracker.unregister(12345)

    expect(tracker.isOwned(12345)).toBe(false)
  })

  test("lists all owned processes", () => {
    const tracker = new ProcessTrackerImpl()
    tracker.registerServer(111, "/repo-a")
    tracker.registerSession(222, "ses_1")
    tracker.registerSession(333, "ses_2")

    const owned = tracker.ownedProcesses()
    expect(owned.length).toBe(3)
  })
})
