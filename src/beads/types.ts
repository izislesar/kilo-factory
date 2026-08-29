export type BeadsIssueType = "task" | "bug" | "feature" | "epic"

export type BeadsIssueStatus = "open" | "in_progress" | "closed" | "blocked"

export type BeadsDependency = {
  issue_id: string
  depends_on_id: string
  type: string
}

export type BeadsIssue = {
  id: string
  title: string
  description: string
  status: BeadsIssueStatus
  priority: number
  issue_type: string
  owner?: string
  assignee?: string
  dependencies: BeadsDependency[]
  dependency_count: number
  dependent_count: number
  parent?: string
  labels?: string[]
  notes?: string
  design?: string
}

export type ReadyFilter = {
  excludeEpics?: boolean
}

export interface BeadsBackend {
  ready(filter?: ReadyFilter): Promise<BeadsIssue[]>
  show(issueId: string): Promise<BeadsIssue | null>
  claim(issueId: string): Promise<boolean>
  update(issueId: string, changes: Record<string, unknown>): Promise<boolean>
  close(issueId: string, reason?: string): Promise<boolean>
  addComment?(issueId: string, comment: string): Promise<boolean>
}
