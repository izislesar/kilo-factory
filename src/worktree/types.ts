export type WorktreeStatus = "clean" | "dirty" | "unknown"

export type WorktreeInfo = {
  path: string
  branch: string
  status: WorktreeStatus
  uniqueCommitCount: number
  headSha: string
}

export type WorktreeManager = {
  create(baseSha: string, jobId: string, generation: number): Promise<WorktreeInfo>
  inspect(path: string): Promise<WorktreeInfo | null>
  isOwned(path: string): boolean
  remove(path: string): Promise<boolean>
  listOwned(): Promise<WorktreeInfo[]>
}
