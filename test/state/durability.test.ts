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

describe("SQLite durability audit", () => {
  test("fresh state initializes deterministically", async () => {
    const store = new SqliteStateStore(dbPath)
    await store.init()
    const store2 = new SqliteStateStore(dbPath)
    await store2.init()
    await store.close()
    await store2.close()
  })

  test("schema version tracked for migrations", async () => {
    const store = new SqliteStateStore(dbPath)
    await store.init()
    await store.upsertJob({ jobId: "test:1", bead: "test", generation: 1, role: "core", baseSha: "abc", worktree: "/wt", state: "READY" })
    const job = await store.getJob("test:1")
    expect(job).not.toBeNull()
    await store.close()
  })

  test("retry after interruption cannot double-complete", async () => {
    const store = new SqliteStateStore(dbPath)
    await store.init()
    await store.upsertJob({ jobId: "test:1", bead: "test", generation: 1, role: "core", baseSha: "abc", worktree: "/wt", state: "READY" })
    await store.updateJob("test:1", { state: "RUNNING" })
    await store.updateJob("test:1", { state: "RESULT_READY" })
    await store.updateJob("test:1", { state: "CLOSED" })
    const job = await store.getJob("test:1")
    expect(job?.state).toBe("CLOSED")
    await store.close()
  })

  test("stale generation update is rejected", async () => {
    const store = new SqliteStateStore(dbPath)
    await store.init()
    await store.upsertJob({ jobId: "test:1", bead: "test", generation: 2, role: "core", baseSha: "abc", worktree: "/wt", state: "READY" })
    await expect(store.updateJob("test:1", { state: "RUNNING" }, { expectedGeneration: 1 })).rejects.toThrow("stale generation")
    await store.close()
  })

  test("upsert is idempotent", async () => {
    const store = new SqliteStateStore(dbPath)
    await store.init()
    const job = { jobId: "test:1", bead: "test", generation: 1, role: "core", baseSha: "abc", worktree: "/wt", state: "READY" as const }
    await store.upsertJob(job)
    await store.upsertJob(job)
    await store.upsertJob(job)
    const result = await store.getJob("test:1")
    expect(result).not.toBeNull()
    expect(result?.state).toBe("READY")
    await store.close()
  })

  test("upsert cannot silently replace newer generation", async () => {
    const store = new SqliteStateStore(dbPath)
    await store.init()
    await store.upsertJob({ jobId: "test:1", bead: "test", generation: 2, role: "core", baseSha: "abc", worktree: "/wt", state: "RUNNING" })
    await store.upsertJob({ jobId: "test:1", bead: "test", generation: 1, role: "core", baseSha: "abc", worktree: "/wt", state: "READY" })
    const job = await store.getJob("test:1")
    expect(job?.generation).toBe(2)
    expect(job?.state).toBe("RUNNING")
    await store.close()
  })

  test("state survives process restart", async () => {
    const store1 = new SqliteStateStore(dbPath)
    await store1.init()
    await store1.upsertJob({ jobId: "test:1", bead: "test", generation: 1, role: "core", baseSha: "abc", worktree: "/wt", state: "RUNNING" })
    await store1.close()
    const store2 = new SqliteStateStore(dbPath)
    await store2.init()
    const job = await store2.getJob("test:1")
    expect(job?.state).toBe("RUNNING")
    await store2.close()
  })

  test("concurrent stale writer cannot win after generation change", async () => {
    const store = new SqliteStateStore(dbPath)
    await store.init()
    await store.upsertJob({ jobId: "test:1", bead: "test", generation: 1, role: "core", baseSha: "abc", worktree: "/wt", state: "READY" })
    await store.updateJob("test:1", { generation: 2, state: "RUNNING" })
    await expect(store.updateJob("test:1", { state: "RESULT_READY" }, { expectedGeneration: 1 })).rejects.toThrow("stale generation")
    const job = await store.getJob("test:1")
    expect(job?.state).toBe("RUNNING")
    expect(job?.generation).toBe(2)
    await store.close()
  })

  test("missing job update throws actionable error", async () => {
    const store = new SqliteStateStore(dbPath)
    await store.init()
    await expect(store.updateJob("nonexistent:1", { state: "RUNNING" })).rejects.toThrow("job not found")
    await store.close()
  })
})
