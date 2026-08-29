import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { RestKiloAdapter } from "../../src/kilo/RestKiloAdapter"
import { SqliteStateStore } from "../../src/state/sqlite"
import { ReconcilerImpl } from "../../src/recovery/reconciler"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

const seedSessionID = process.env.KILO_FULL_LIFECYCLE_SEED_ID ?? process.env.KILO_E2E_SEED_SESSION_ID
const kiloBin = process.env.KILO_BIN ?? "kilo"
const baseUrl = process.env.KILO_BASE_URL ?? "http://127.0.0.1:41457"
const serverPassword = process.env.KILO_SERVER_PASSWORD ?? ""

const describeIfLifecycle = seedSessionID ? describe : describe.skip

describeIfLifecycle("Full lifecycle: Beads -> coordinator -> session -> worktree -> result", () => {
  let fixtureDir: string
  let fixtureRepo: string
  let stateDbPath: string
  let adapter: RestKiloAdapter

  beforeAll(async () => {
    fixtureDir = join(tmpdir(), "kilo-factory-full-" + Date.now())
    fixtureRepo = join(fixtureDir, "repo")
    stateDbPath = join(fixtureDir, "state.db")

    await mkdir(fixtureRepo, { recursive: true })
    spawnSync("git", ["init", "--initial-branch=main"], { cwd: fixtureRepo })
    await writeFile(join(fixtureRepo, "README.md"), "# Full Lifecycle Fixture\n")
    spawnSync("git", ["add", "README.md"], { cwd: fixtureRepo })
    spawnSync("git", ["-c", "user.name=Test", "-c", "user.email=test@invalid", "commit", "-m", "init"], { cwd: fixtureRepo })

    adapter = new RestKiloAdapter({ url: baseUrl, directory: fixtureRepo, password: serverPassword })
  })

  afterAll(async () => {
    await rm(fixtureDir, { recursive: true, force: true }).catch(() => undefined)
  })

  test("1. Adapter connects to live Kilo", async () => {
    const healthy = await adapter.health()
    expect(healthy).toBe(true)
  })

  test("2. Seed session configuration readable", async () => {
    const seed = await adapter.getSeedConfiguration(seedSessionID!, fixtureRepo)
    expect(seed.agent).toBe("code")
    expect(seed.model.providerID).toBeDefined()
    expect(seed.model.modelID).toBeDefined()
  })

  test("3. Create fresh job session from seed config", async () => {
    const seed = await adapter.getSeedConfiguration(seedSessionID!, fixtureRepo)
    const session = await adapter.createJobSession(fixtureRepo, seed, "lifecycle test job")

    expect(session.id.startsWith("ses")).toBe(true)
    expect(session.directory).toBe(fixtureRepo)

    await adapter.delete(session)
  })

  test("4. SQLite state tracks job lifecycle", async () => {
    const state = new SqliteStateStore(stateDbPath)
    await state.init()

    await state.upsertJob({
      jobId: "test:1",
      bead: "test",
      generation: 1,
      role: "core",
      baseSha: "abc",
      worktree: "/wt/1",
      state: "READY",
    })

    await state.updateJob("test:1", { state: "LEASED" })
    await state.updateJob("test:1", { state: "RUNNING", sessionID: "ses_123" })
    await state.updateJob("test:1", { state: "RESULT_READY" })
    await state.updateJob("test:1", { state: "CLOSED" })

    const job = await state.getJob("test:1")
    expect(job?.state).toBe("CLOSED")
    expect(job?.sessionID).toBe("ses_123")

    await state.close()
  })

  test("5. Recovery reconciler handles live observations", async () => {
    const reconciler = new ReconcilerImpl()

    const observations = [
      { jobId: "a:1", generation: 1, worktreeExists: true, worktreeStatus: "clean" as const, uniqueCommits: 1, beadStatus: "in_progress" },
      { jobId: "b:1", generation: 1, worktreeExists: true, worktreeStatus: "dirty" as const, uniqueCommits: 0, beadStatus: "in_progress" },
      { jobId: "c:1", generation: 1, worktreeExists: false, worktreeStatus: "missing" as const, uniqueCommits: 0, beadStatus: "in_progress" },
    ]

    const actions = await reconciler.reconcile(observations)
    expect(actions).toEqual(["noop", "recover", "quarantine"])
  })

  test("6. Multiple sessions can coexist", async () => {
    const seed = await adapter.getSeedConfiguration(seedSessionID!, fixtureRepo)

    const session1 = await adapter.createJobSession(fixtureRepo, seed, "job-1")
    const session2 = await adapter.createJobSession(fixtureRepo, seed, "job-2")

    expect(session1.id).not.toBe(session2.id)

    await adapter.delete(session1)
    await adapter.delete(session2)
  })
})
