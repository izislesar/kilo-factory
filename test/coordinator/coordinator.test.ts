import { describe, expect, test, beforeEach } from "bun:test"
import { Coordinator } from "../../src/coordinator/coordinator"
import type { BeadsBackend, BeadsIssue } from "../../src/beads/types"
import type { KiloAdapter, SeedConfiguration } from "../../src/kilo/types"
import { SqliteStateStore } from "../../src/state/sqlite"
import type { WorktreeManager, WorktreeInfo } from "../../src/worktree/types"
import type { ProjectConfig } from "../../src/config/types"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const seedConfig: SeedConfiguration = {
  agent: "code",
  model: { providerID: "openai", modelID: "gpt-5.6-sol", variant: "xhigh" },
}

const makeIssue = (id: string): BeadsIssue => ({
  id,
  title: `Issue ${id}`,
  description: "Test",
  status: "open",
  priority: 0,
  issue_type: "task",
  dependencies: [],
  dependency_count: 0,
  dependent_count: 0,
})

function makeBackend(overrides: Partial<BeadsBackend> = {}): BeadsBackend {
  return {
    ready: async () => [],
    show: async () => null,
    claim: async () => true,
    update: async () => true,
    close: async () => true,
    ...overrides,
  }
}

function makeKilo(overrides: Partial<KiloAdapter> = {}): KiloAdapter {
  return {
    health: async () => true,
    listSessions: async () => [],
    getSeedConfiguration: async () => seedConfig,
    createJobSession: async () => ({ id: "ses_new", directory: "/tmp/wt" }),
    promptAsync: async () => {},
    abort: async () => {},
    delete: async () => {},
    subscribe: async () => async () => {},
    close: async () => {},
    ...overrides,
  }
}

function makeWorktree(overrides: Partial<WorktreeManager> = {}): WorktreeManager {
  const info: WorktreeInfo = {
    path: "/tmp/wt",
    branch: "factory/test/1",
    status: "clean",
    uniqueCommitCount: 0,
    headSha: "abc123",
  }
  return {
    create: async () => info,
    inspect: async () => info,
    isOwned: () => true,
    remove: async () => true,
    listOwned: async () => [info],
    ...overrides,
  }
}

let dbPath: string
let state: SqliteStateStore

beforeEach(async () => {
  const dir = await mkdtemp(join(tmpdir(), "kilo-coord-"))
  dbPath = join(dir, "state.db")
  state = new SqliteStateStore(dbPath)
  await state.init()
})

describe("Coordinator", () => {
  test("assigns monotonically increasing generation", async () => {
    const issues = [makeIssue("kilo-factory-001")]
    const beads = makeBackend({ ready: async () => issues })
    const kilo = makeKilo()
    const worktree = makeWorktree()

    const coordinator = new Coordinator({
      beads,
      kilo,
      state,
      worktree,
      repoPath: "/repo",
      worktreeRoot: "/wt",
      config: { version: 1, mainBranch: "main", roles: [{ name: "core" }] },
    })

    process.env.KILO_SEED_SESSION_ID = "ses_seed"
    await coordinator.reconcile()

    const jobs1 = await state.listJobsByBead("kilo-factory-001")
    expect(jobs1[0]?.generation).toBe(1)

    await coordinator.reconcile()

    const jobs2 = await state.listJobsByBead("kilo-factory-001")
    expect(jobs2[0]?.generation).toBe(1)

    delete process.env.KILO_SEED_SESSION_ID
  })

  test("does not create duplicate assignments on repeated reconcile", async () => {
    const issues = [makeIssue("kilo-factory-001")]
    const beads = makeBackend({ ready: async () => issues })
    const kilo = makeKilo()
    const worktree = makeWorktree()

    const coordinator = new Coordinator({
      beads,
      kilo,
      state,
      worktree,
      repoPath: "/repo",
      worktreeRoot: "/wt",
      config: { version: 1, mainBranch: "main", roles: [{ name: "core" }] },
    })

    process.env.KILO_SEED_SESSION_ID = "ses_seed"
    await coordinator.reconcile()
    await coordinator.reconcile()
    await coordinator.reconcile()

    const jobs = await state.listJobsByBead("kilo-factory-001")
    expect(jobs.length).toBe(1)

    delete process.env.KILO_SEED_SESSION_ID
  })

  test("quarantines after exceeding max attempts", async () => {
    const issues = [makeIssue("kilo-factory-001")]
    const beads = makeBackend({ ready: async () => issues })
    const kilo = makeKilo()
    const worktree = makeWorktree()

    const coordinator = new Coordinator({
      beads,
      kilo,
      state,
      worktree,
      repoPath: "/repo",
      worktreeRoot: "/wt",
      config: { version: 1, mainBranch: "main", roles: [{ name: "core" }] },
      maxAttempts: 2,
    })

    await state.upsertJob({
      jobId: "kilo-factory-001:1",
      bead: "kilo-factory-001",
      generation: 1,
      role: "test",
      baseSha: "abc",
      worktree: "/wt",
      state: "RETRY_WAIT",
      attempts: 2,
    })

    await coordinator.reconcile()

    const job = await state.getJob("kilo-factory-001:1")
    expect(job?.state).toBe("QUARANTINED")
  })
})
