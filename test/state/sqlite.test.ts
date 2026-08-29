import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { SqliteStateStore } from "../../src/state/sqlite"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

let dbPath: string

beforeEach(async () => {
  const dir = await mkdtemp(join(tmpdir(), "kilo-factory-state-"))
  dbPath = join(dir, "state.db")
})

afterEach(async () => {
  await rm(dbPath, { recursive: true, force: true }).catch(() => undefined)
})

describe("SqliteStateStore", () => {
  test("creates and retrieves a job record", async () => {
    const store = new SqliteStateStore(dbPath)
    await store.init()

    await store.upsertJob({
      jobId: "kilo-factory-001:1",
      bead: "kilo-factory-001",
      generation: 1,
      role: "core",
      baseSha: "abc123",
      worktree: "/tmp/worktree",
      state: "READY",
    })

    const job = await store.getJob("kilo-factory-001:1")
    expect(job).not.toBeNull()
    expect(job?.bead).toBe("kilo-factory-001")
    expect(job?.generation).toBe(1)
    expect(job?.state).toBe("READY")
    expect(job?.attempts).toBe(0)
  })

  test("updates job state and increments attempts", async () => {
    const store = new SqliteStateStore(dbPath)
    await store.init()

    await store.upsertJob({
      jobId: "kilo-factory-001:1",
      bead: "kilo-factory-001",
      generation: 1,
      role: "core",
      baseSha: "abc123",
      worktree: "/tmp/worktree",
      state: "READY",
    })

    await store.updateJob("kilo-factory-001:1", { state: "RUNNING", attempts: 1 })
    const job = await store.getJob("kilo-factory-001:1")

    expect(job?.state).toBe("RUNNING")
    expect(job?.attempts).toBe(1)
  })

  test("fails on stale generation update", async () => {
    const store = new SqliteStateStore(dbPath)
    await store.init()

    await store.upsertJob({
      jobId: "kilo-factory-001:1",
      bead: "kilo-factory-001",
      generation: 2,
      role: "core",
      baseSha: "abc123",
      worktree: "/tmp/worktree",
      state: "READY",
    })

    await expect(
      store.updateJob(
        "kilo-factory-001:1",
        { state: "RUNNING" },
        { expectedGeneration: 1 },
      ),
    ).rejects.toThrow("stale generation")
  })

  test("stores failure classification", async () => {
    const store = new SqliteStateStore(dbPath)
    await store.init()

    await store.upsertJob({
      jobId: "kilo-factory-001:1",
      bead: "kilo-factory-001",
      generation: 1,
      role: "core",
      baseSha: "abc123",
      worktree: "/tmp/worktree",
      state: "READY",
    })

    await store.updateJob("kilo-factory-001:1", {
      state: "QUARANTINED",
      failureReason: "contradictory ownership",
    })

    const job = await store.getJob("kilo-factory-001:1")
    expect(job?.state).toBe("QUARANTINED")
    expect(job?.failureReason).toBe("contradictory ownership")
  })

  test("is project-local and survives restart", async () => {
    const store1 = new SqliteStateStore(dbPath)
    await store1.init()
    await store1.upsertJob({
      jobId: "kilo-factory-001:1",
      bead: "kilo-factory-001",
      generation: 1,
      role: "core",
      baseSha: "abc123",
      worktree: "/tmp/worktree",
      state: "READY",
    })
    await store1.close()

    const store2 = new SqliteStateStore(dbPath)
    await store2.init()
    const job = await store2.getJob("kilo-factory-001:1")
    expect(job?.jobId).toBe("kilo-factory-001:1")
    await store2.close()
  })
})
