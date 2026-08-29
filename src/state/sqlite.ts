import { Database } from "bun:sqlite"

export type JobState =
  | "READY"
  | "LEASED"
  | "RUNNING"
  | "RESULT_READY"
  | "REVIEWING"
  | "INTEGRATING"
  | "VALIDATING"
  | "COMMITTED"
  | "CLOSED"
  | "RETRY_WAIT"
  | "RECOVERING"
  | "QUARANTINED"
  | "BLOCKED_EXTERNAL"

export type JobRecord = {
  jobId: string
  bead: string
  generation: number
  role: string
  baseSha: string
  worktree: string
  state: JobState
  sessionID?: string
  attempts: number
  failureReason?: string
  createdAt: string
  updatedAt: string
  headSha?: string
  mainSha?: string
}

export type NewJob = Omit<JobRecord, "attempts" | "createdAt" | "updatedAt"> & {
  attempts?: number
}

export type JobUpdate = Partial<Omit<JobRecord, "jobId" | "createdAt">>

export type UpdateOptions = {
  expectedGeneration?: number
}

const CURRENT_SCHEMA_VERSION = 1

const COLUMN_MAP: Record<string, string> = {
  jobId: "job_id",
  bead: "bead",
  generation: "generation",
  role: "role",
  baseSha: "base_sha",
  worktree: "worktree",
  state: "state",
  sessionID: "session_id",
  attempts: "attempts",
  failureReason: "failure_reason",
  createdAt: "created_at",
  updatedAt: "updated_at",
}

export class SqliteStateStore {
  private db: Database

  constructor(path: string) {
    this.db = new Database(path)
  }

  async init(): Promise<void> {
    this.db.exec("PRAGMA journal_mode = WAL")
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        job_id TEXT PRIMARY KEY,
        bead TEXT NOT NULL,
        generation INTEGER NOT NULL,
        role TEXT NOT NULL,
        base_sha TEXT NOT NULL,
        worktree TEXT NOT NULL,
        state TEXT NOT NULL,
        session_id TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        failure_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        key TEXT PRIMARY KEY,
        value INTEGER NOT NULL
      )
    `)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS control (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)
    this.db.exec(
      `INSERT OR IGNORE INTO control (key, value, updated_at) VALUES ('mode', 'running', '${new Date().toISOString()}')`,
    )
    this.migrate()
  }

  async getControl(key: string): Promise<string | null> {
    const row = this.db.query<{ value: string }, [string]>("SELECT value FROM control WHERE key = ?").get(key)
    return row?.value ?? null
  }

  async setControl(key: string, value: string): Promise<void> {
    this.db.query(
      `INSERT OR REPLACE INTO control (key, value, updated_at) VALUES (?, ?, ?)`,
    ).run(key, value, new Date().toISOString())
  }

  private migrate(): void {
    const row = this.db
      .query<{ value: number }, []>("SELECT value FROM schema_version WHERE key = 'version'")
      .get()
    const current = row?.value ?? 0
    if (current < CURRENT_SCHEMA_VERSION) {
      this.db.transaction(() => {
        this.db.exec(`INSERT OR REPLACE INTO schema_version (key, value) VALUES ('version', ${CURRENT_SCHEMA_VERSION})`)
      })()
    }
  }

  async upsertJob(job: NewJob): Promise<void> {
    const now = new Date().toISOString()
    this.db.transaction(() => {
      const existing = this.db
        .query<{ created_at: string; generation: number }, [string]>("SELECT created_at, generation FROM jobs WHERE job_id = ?")
        .get(job.jobId)

      if (existing && existing.generation > job.generation) {
        return
      }

      const createdAt = existing?.created_at ?? now
      this.db
        .query(
          `INSERT OR REPLACE INTO jobs
           (job_id, bead, generation, role, base_sha, worktree, state, session_id, attempts, failure_reason, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          job.jobId,
          job.bead,
          job.generation,
          job.role,
          job.baseSha,
          job.worktree,
          job.state,
          job.sessionID ?? null,
          job.attempts ?? 0,
          job.failureReason ?? null,
          createdAt,
          now,
        )
    })()
  }

  async updateJob(jobId: string, update: JobUpdate, options: UpdateOptions = {}): Promise<void> {
    const fields: string[] = []
    const values: unknown[] = []
    for (const [key, value] of Object.entries(update)) {
      if (value === undefined) continue
      const column = COLUMN_MAP[key]
      if (!column) continue
      fields.push(`${column} = ?`)
      values.push(value)
    }
    if (fields.length === 0) return

    fields.push("updated_at = ?")
    values.push(new Date().toISOString())
    values.push(jobId)

    if (options.expectedGeneration !== undefined) {
      values.push(options.expectedGeneration)
    }

    const whereClause = options.expectedGeneration !== undefined
      ? "WHERE job_id = ? AND generation = ?"
      : "WHERE job_id = ?"

    const sql = `UPDATE jobs SET ${fields.join(", ")} ${whereClause}`
    const result = this.db.query(sql).run(...(values as never[]))

    if (result.changes === 0) {
      if (options.expectedGeneration !== undefined) {
        throw new Error(`stale generation: no row updated for ${jobId} with generation ${options.expectedGeneration}`)
      }
      throw new Error(`job not found: ${jobId}`)
    }
  }

  async getJob(jobId: string): Promise<JobRecord | null> {
    const row = this.db
      .query<Record<string, unknown>, [string]>(
        `SELECT job_id, bead, generation, role, base_sha, worktree, state, session_id, attempts, failure_reason, created_at, updated_at
         FROM jobs WHERE job_id = ?`,
      )
      .get(jobId)
    return row ? fromRow(row) : null
  }

  async listJobsByBead(beadId: string): Promise<JobRecord[]> {
    if (beadId === "__all__") {
      const rows = this.db
        .query<Record<string, unknown>, []>(
          `SELECT job_id, bead, generation, role, base_sha, worktree, state, session_id, attempts, failure_reason, created_at, updated_at
           FROM jobs ORDER BY updated_at DESC`,
        )
        .all()
      return rows.map(fromRow)
    }
    const rows = this.db
      .query<Record<string, unknown>, [string]>(
        `SELECT job_id, bead, generation, role, base_sha, worktree, state, session_id, attempts, failure_reason, created_at, updated_at
         FROM jobs WHERE bead = ? ORDER BY generation DESC`,
      )
      .all(beadId)
    return rows.map(fromRow)
  }

  async close(): Promise<void> {
    this.db.close()
  }
}

function fromRow(row: Record<string, unknown>): JobRecord {
  return {
    jobId: row.job_id as string,
    bead: row.bead as string,
    generation: row.generation as number,
    role: row.role as string,
    baseSha: row.base_sha as string,
    worktree: row.worktree as string,
    state: row.state as JobState,
    sessionID: row.session_id as string | undefined,
    attempts: row.attempts as number,
    failureReason: row.failure_reason as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function createStateStore(path: string): SqliteStateStore {
  return new SqliteStateStore(path)
}
