import type { KiloClient } from "@kilocode/sdk/v2/client"

export type { KiloClient }

export type KiloServerOptions = {
  url: string
  directory: string
  username?: string
  password?: string
}

export type SessionReference = {
  id: string
  directory: string
}

export type ModelSelection = {
  providerID: string
  modelID: string
  variant?: string
}

export type SeedConfiguration = {
  agent: string
  model: ModelSelection
}

export type PromptRequest = {
  parts: Array<{ type: "text"; text: string }>
}

export type KiloSessionEvent = {
  type: string
  sessionID?: string
  error?: unknown
}

export interface KiloAdapter {
  health(): Promise<boolean>
  listSessions(directory: string): Promise<SessionReference[]>
  getSeedConfiguration(sessionID: string, directory: string): Promise<SeedConfiguration>
  createJobSession(directory: string, seed: SeedConfiguration, title?: string): Promise<SessionReference>
  promptAsync(session: SessionReference, request: PromptRequest): Promise<void>
  abort(session: SessionReference): Promise<void>
  delete(session: SessionReference): Promise<void>
  subscribe(
    session: SessionReference,
    handler: (event: KiloSessionEvent) => void,
  ): Promise<() => Promise<void>>
  close(): Promise<void>
}
