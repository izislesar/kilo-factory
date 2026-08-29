export type JobIdentity = {
  jobId: string
  bead: string
  generation: number
  role: string
}

export type CompletionPayload = {
  jobId: string
  generation: number
  summary: string
  checks: string[]
  risks: string[]
  baseSha: string
  headSha: string
  dirty: boolean
}

export type BlockPayload = {
  jobId: string
  generation: number
  reason: string
  class: "transient" | "persistent" | "external"
}

export type PluginContext = {
  isFactorySession: boolean
  identity?: JobIdentity
}
