export type ReconciliationAction = "retry" | "recover" | "quarantine" | "noop"

export type JobObservation = {
  jobId: string
  generation: number
  worktreeExists: boolean
  worktreeStatus: "clean" | "dirty" | "missing"
  uniqueCommits: number
  beadStatus: string
}

export type Reconciler = {
  reconcile(observations: JobObservation[]): Promise<ReconciliationAction[]>
}
