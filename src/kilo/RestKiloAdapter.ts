import type {
  KiloAdapter,
  KiloServerOptions,
  KiloSessionEvent,
  ModelSelection,
  PromptRequest,
  SeedConfiguration,
  SessionReference,
} from "./types"

type SessionRecord = {
  id: string
  directory: string
  agent?: string
  model?: { id?: string; modelID?: string; providerID?: string; variant?: string }
}

export class KiloAdapterError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message)
  }
}

export class RestKiloAdapter implements KiloAdapter {
  private readonly options: KiloServerOptions
  private readonly subscribers = new Map<string, { controller: AbortController; promise: Promise<void> }>()
  private lastEventIDs = new Map<string, string>()
  private closed = false

  constructor(options: KiloServerOptions) {
    this.options = options
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {}
    if (this.options.username) {
      headers.authorization = `Basic ${Buffer.from(`${this.options.username}:${this.options.password}`).toString("base64")}`
    }
    return headers
  }

  private url(path: string, directory?: string): string {
    const base = new URL(path, this.options.url)
    if (directory) base.searchParams.set("directory", directory)
    return base.toString()
  }

  private directoryHeaders(directory: string): Record<string, string> {
    return { "x-kilo-directory": directory }
  }

  private async expectOk(response: Response, context: string): Promise<void> {
    if (!response.ok) {
      const body = await response.text().catch(() => "")
      throw new KiloAdapterError(`${context} failed with ${response.status}: ${body}`, response.status)
    }
  }

  async health(): Promise<boolean> {
    try {
      const response = await fetch(this.url("/global/health"), { headers: this.headers() })
      return response.ok
    } catch {
      return false
    }
  }

  async listSessions(directory: string): Promise<SessionReference[]> {
    const response = await fetch(this.url("/session", directory), { headers: this.headers() })
    await this.expectOk(response, "listSessions")
    const sessions = (await response.json()) as SessionRecord[]
    return sessions.map((session) => ({ id: session.id, directory }))
  }

  async getSeedConfiguration(sessionID: string, directory: string): Promise<SeedConfiguration> {
    const response = await fetch(this.url(`/session/${sessionID}`, directory), { headers: this.headers() })
    await this.expectOk(response, "getSeedConfiguration")
    const session = (await response.json()) as SessionRecord
    if (!session.agent || !session.model?.providerID || !(session.model?.id ?? session.model?.modelID)) {
      throw new Error(`Seed session ${sessionID} is missing required agent/model configuration`)
    }
    return {
      agent: session.agent,
      model: {
        providerID: session.model.providerID,
        modelID: session.model.id ?? session.model.modelID!,
        variant: session.model.variant,
      },
    }
  }

  async createJobSession(directory: string, seed: SeedConfiguration, title?: string): Promise<SessionReference> {
    const body: Record<string, unknown> = {
      agent: seed.agent,
      model: {
        providerID: seed.model.providerID,
        id: seed.model.modelID,
        variant: seed.model.variant,
      },
    }
    if (title) body.title = title
    const response = await fetch(this.url("/session"), {
      method: "POST",
      headers: { ...this.headers(), ...this.directoryHeaders(directory), "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    await this.expectOk(response, "createJobSession")
    const session = (await response.json()) as SessionRecord
    return { id: session.id, directory }
  }

  async promptAsync(session: SessionReference, request: PromptRequest): Promise<void> {
    const response = await fetch(this.url(`/session/${session.id}/prompt_async`), {
      method: "POST",
      headers: { ...this.headers(), ...this.directoryHeaders(session.directory), "content-type": "application/json" },
      body: JSON.stringify({ parts: request.parts }),
    })
    await this.expectOk(response, "promptAsync")
  }

  async abort(session: SessionReference): Promise<void> {
    const response = await fetch(this.url(`/session/${session.id}/abort`), {
      method: "POST",
      headers: { ...this.headers(), ...this.directoryHeaders(session.directory) },
    })
    await this.expectOk(response, "abort")
  }

  async delete(session: SessionReference): Promise<void> {
    await this.unsubscribe(session)
    const response = await fetch(this.url(`/session/${session.id}`, session.directory), {
      method: "DELETE",
      headers: { ...this.headers() },
    })
    await this.expectOk(response, "delete")
  }

  async subscribe(session: SessionReference, handler: (event: KiloSessionEvent) => void): Promise<() => Promise<void>> {
    await this.unsubscribe(session)
    const controller = new AbortController()
    const promise = this.runSubscription(session, handler, controller)
    this.subscribers.set(session.id, { controller, promise })
    return () => this.unsubscribe(session)
  }

  private async unsubscribe(session: SessionReference): Promise<void> {
    const existing = this.subscribers.get(session.id)
    if (!existing) return
    this.subscribers.delete(session.id)
    existing.controller.abort()
    await existing.promise.catch(() => undefined)
  }

  private async runSubscription(
    session: SessionReference,
    handler: (event: KiloSessionEvent) => void,
    controller: AbortController,
  ): Promise<void> {
    let attempt = 0
    while (!controller.signal.aborted && !this.closed) {
      try {
        await this.streamEvents(session, handler, controller)
        attempt = 0
      } catch (error) {
        if (controller.signal.aborted || this.closed) return
        attempt += 1
        const backoff = Math.min(1000 * 2 ** attempt, 30_000)
        await new Promise((resolve) => setTimeout(resolve, backoff))
      }
    }
  }

  private async streamEvents(
    session: SessionReference,
    handler: (event: KiloSessionEvent) => void,
    controller: AbortController,
  ): Promise<void> {
    const response = await fetch(this.url("/global/event"), {
      headers: this.headers(),
      signal: controller.signal,
    })
    if (!response.ok || !response.body) throw new KiloAdapterError(`SSE stream failed: ${response.status}`, response.status)
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    const onAbort = () => {
      reader.cancel().catch(() => undefined)
    }
    controller.signal.addEventListener("abort", onAbort, { once: true })
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) return
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() ?? ""
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          const event = JSON.parse(line.slice(6)) as {
            id?: string
            payload?: { type?: string; properties?: { sessionID?: string }; error?: unknown }
          }
          if (!event.payload || event.payload.properties?.sessionID !== session.id) continue
          const eventID = event.id
          if (eventID && this.lastEventIDs.get(session.id) === eventID) continue
          if (eventID) this.lastEventIDs.set(session.id, eventID)
          handler({
            type: event.payload.type ?? "unknown",
            sessionID: event.payload.properties?.sessionID,
            error: event.payload.error,
          })
        }
      }
    } finally {
      controller.signal.removeEventListener("abort", onAbort)
      await reader.cancel().catch(() => undefined)
    }
  }

  async close(): Promise<void> {
    this.closed = true
    const closings = [...this.subscribers.keys()].map((id) =>
      this.unsubscribe({ id, directory: this.options.directory }),
    )
    await Promise.all(closings)
  }
}

export function createKiloAdapter(options: KiloServerOptions): KiloAdapter {
  return new RestKiloAdapter(options)
}
