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
}

export type NewJob = Omit<JobRecord, "attempts" | "createdAt" | "updatedAt"> & {
  attempts?: number
}

export type JobUpdate = Partial<Omit<JobRecord, "jobId" | "createdAt">>

export type UpdateOptions = {
  expectedGeneration?: number
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
    this.db.exec(
      `INSERT OR IGNORE INTO schema_version (key, value) VALUES ('version', 1)`,
    )
  }

  async upsertJob(job: NewJob): Promise<void> {
    const now = new Date().toISOString()
    const existing = this.db
      .query<{ created_at: string }, [string]>("SELECT created_at FROM jobs WHERE job_id = ?")
      .get(job.jobId)
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
  }

  async updateJob(jobId: string, update: JobUpdate, options: UpdateOptions = {}): Promise<void> {
    if (options.expectedGeneration !== undefined) {
      const current = this.db
        .query<{ generation: number }, [string]>("SELECT generation FROM jobs WHERE job_id = ?")
        .get(jobId)
      if (!current || current.generation !== options.expectedGeneration) {
        throw new Error(
          `stale generation: expected ${options.expectedGeneration} but found ${current?.generation ?? "none"}`,
        )
      }
    }
    const fields: string[] = []
    const values: unknown[] = []
    for (const [key, value] of Object.entries(update)) {
      if (value === undefined) continue
      const column = toSnakeCase(key)
      fields.push(`${column} = ?`)
      values.push(value)
    }
    if (fields.length === 0) return
    fields.push("updated_at = ?")
    values.push(new Date().toISOString())
    values.push(jobId)
    this.db.query(`UPDATE jobs SET ${fields.join(", ")} WHERE job_id = ?`).run(...(values as never[]))
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

function toSnakeCase(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
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
