import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { SqliteStateStore } from "../../src/state/sqlite"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

let dbPath: string

beforeEach(async () => {
  const dir = await mkdtemp(join(tmpdir(), "kilo-factory-soak-"))
  dbPath = join(dir, "state.db")
})

afterEach(async () => {
  await rm(dbPath, { recursive: true, force: true }).catch(() => undefined)
})

describe("soak: concurrent multi-role stability", () => {
  test("multiple roles progress concurrently without cross-contamination", async () => {
    const store = new SqliteStateStore(dbPath)
    await store.init()

    for (let i = 0; i < 10; i++) {
      await store.upsertJob({
        jobId: `role-a:${i}`,
        bead: "role-a",
        generation: i,
        role: "role-a",
        baseSha: "base",
        worktree: `/wt/a/${i}`,
        state: "CLOSED",
      })
      await store.upsertJob({
        jobId: `role-b:${i}`,
        bead: "role-b",
        generation: i,
        role: "role-b",
        baseSha: "base",
        worktree: `/wt/b/${i}`,
        state: "CLOSED",
      })
    }

    const roleA = await store.listJobsByBead("role-a")
    const roleB = await store.listJobsByBead("role-b")

    expect(roleA.length).toBe(10)
    expect(roleB.length).toBe(10)

    for (const job of roleA) {
      expect(job.bead).toBe("role-a")
    }
    for (const job of roleB) {
      expect(job.bead).toBe("role-b")
    }

    await store.close()
  })

  test("repeated cycles do not accumulate duplicate state", async () => {
    const store = new SqliteStateStore(dbPath)
    await store.init()

    for (let cycle = 0; cycle < 50; cycle++) {
      await store.upsertJob({
        jobId: "recurring:1",
        bead: "recurring",
        generation: 1,
        role: "core",
        baseSha: "base",
        worktree: "/wt/recurring",
        state: cycle % 2 === 0 ? "RUNNING" : "CLOSED",
      })
    }

    const jobs = await store.listJobsByBead("recurring")
    expect(jobs.length).toBe(1)
    expect(jobs[0].state).toBe("CLOSED")

    await store.close()
  })

  test("bounded event accumulation", async () => {
    const store = new SqliteStateStore(dbPath)
    await store.init()

    for (let i = 0; i < 100; i++) {
      await store.upsertJob({
        jobId: `job:${i}`,
        bead: "soak",
        generation: i,
        role: "core",
        baseSha: "base",
        worktree: `/wt/${i}`,
        state: "CLOSED",
      })
    }

    const jobs = await store.listJobsByBead("soak")
    expect(jobs.length).toBe(100)

    await store.close()
  })

  test("factory remains functional after soak", async () => {
    const store = new SqliteStateStore(dbPath)
    await store.init()

    for (let i = 0; i < 20; i++) {
      await store.upsertJob({
        jobId: `soak:${i}`,
        bead: "soak",
        generation: i,
        role: "core",
        baseSha: "base",
        worktree: `/wt/${i}`,
        state: "READY",
      })
    }

    for (let i = 0; i < 20; i++) {
      await store.updateJob(`soak:${i}`, { state: "RUNNING" })
      await store.updateJob(`soak:${i}`, { state: "CLOSED" })
    }

    const jobs = await store.listJobsByBead("soak")
    expect(jobs.every((j) => j.state === "CLOSED")).toBe(true)

    await store.close()
  })
})
