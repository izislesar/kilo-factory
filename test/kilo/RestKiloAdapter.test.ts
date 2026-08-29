import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { RestKiloAdapter } from "../../src/kilo/RestKiloAdapter"
import type { KiloServerOptions, SeedConfiguration, KiloSessionEvent } from "../../src/kilo/types"

const seed: SeedConfiguration = {
  agent: "code",
  model: { providerID: "openai", modelID: "gpt-5.6-sol", variant: "xhigh" },
}

function makeOptions(): KiloServerOptions {
  return { url: "http://127.0.0.1:41457", directory: "/tmp/test", username: "kilo", password: "secret" }
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

let originalFetch: typeof globalThis.fetch
let responses: Response[]
let callLog: { url: string; init?: RequestInit }[]

beforeEach(() => {
  originalFetch = globalThis.fetch
  responses = []
  callLog = []
  const stub = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    callLog.push({ url, init })
    const response = responses.shift()
    if (!response) throw new Error(`No stubbed response for ${url}`)
    return response
  }) as unknown as typeof fetch
  globalThis.fetch = stub
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("RestKiloAdapter", () => {
  test("health returns true when server is healthy", async () => {
    responses = [jsonResponse({ healthy: true })]
    const adapter = new RestKiloAdapter(makeOptions())

    expect(await adapter.health()).toBe(true)
  })

  test("health returns false when fetch fails", async () => {
    globalThis.fetch = (() => {
      throw new Error("connection refused")
    }) as unknown as typeof fetch
    const adapter = new RestKiloAdapter(makeOptions())

    expect(await adapter.health()).toBe(false)
  })

  test("listSessions scopes by directory", async () => {
    responses = [jsonResponse([{ id: "ses_1", directory: "/tmp/test" }])]
    const adapter = new RestKiloAdapter(makeOptions())

    const result = await adapter.listSessions("/tmp/test")

    expect(result).toEqual([{ id: "ses_1", directory: "/tmp/test" }])
    expect(callLog[0]?.url).toContain("directory=%2Ftmp%2Ftest")
  })

  test("createJobSession sends agent/model without overriding user selection", async () => {
    responses = [jsonResponse({ id: "ses_new", directory: "/tmp/test" })]
    const adapter = new RestKiloAdapter(makeOptions())

    const session = await adapter.createJobSession("/tmp/worktree", seed, "job title")

    expect(session).toEqual({ id: "ses_new", directory: "/tmp/worktree" })
    const body = JSON.parse(callLog[0]?.init?.body as string)
    expect(body.agent).toBe("code")
    expect(body.model).toEqual({ providerID: "openai", modelID: "gpt-5.6-sol", variant: "xhigh" })
    expect(body.title).toBe("job title")
  })

  test("promptAsync sends only parts without model overrides", async () => {
    responses = [new Response("", { status: 204 })]
    const adapter = new RestKiloAdapter(makeOptions())

    await adapter.promptAsync({ id: "ses_1", directory: "/tmp/test" }, { parts: [{ type: "text", text: "hi" }] })

    const body = JSON.parse(callLog[0]?.init?.body as string)
    expect(body.parts).toEqual([{ type: "text", text: "hi" }])
    expect(body.model).toBeUndefined()
    expect(body.providerID).toBeUndefined()
  })

  test("abort posts to abort endpoint", async () => {
    responses = [new Response("", { status: 200 })]
    const adapter = new RestKiloAdapter(makeOptions())

    await adapter.abort({ id: "ses_1", directory: "/tmp/test" })

    expect(callLog[0]?.url).toContain("/session/ses_1/abort")
    expect(callLog[0]?.init?.method).toBe("POST")
  })

  test("delete removes session", async () => {
    responses = [new Response("true")]
    const adapter = new RestKiloAdapter(makeOptions())

    await adapter.delete({ id: "ses_1", directory: "/tmp/test" })

    expect(callLog[0]?.url).toContain("/session/ses_1")
    expect(callLog[0]?.init?.method).toBe("DELETE")
  })

  test("subscribe deduplicates events by ID", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"id":"evt_1","payload":{"type":"session.idle","sessionID":"ses_1"}}\n\n'))
        controller.enqueue(new TextEncoder().encode('data: {"id":"evt_1","payload":{"type":"session.idle","sessionID":"ses_1"}}\n\n'))
        controller.close()
      },
    })
    responses = [new Response(stream, { status: 200 })]
    const adapter = new RestKiloAdapter(makeOptions())

    const events: string[] = []
    const stop = await adapter.subscribe({ id: "ses_1", directory: "/tmp/test" }, (event: KiloSessionEvent) => {
      events.push(event.type)
    })

    await new Promise((resolve) => setTimeout(resolve, 50))
    await stop()

    expect(events).toEqual(["session.idle"])
  })

  test("subscribe ignores events for other sessions", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"id":"evt_1","payload":{"type":"session.idle","sessionID":"ses_2"}}\n\n'))
        controller.close()
      },
    })
    responses = [new Response(stream, { status: 200 })]
    const adapter = new RestKiloAdapter(makeOptions())

    const events: string[] = []
    const stop = await adapter.subscribe({ id: "ses_1", directory: "/tmp/test" }, (event: KiloSessionEvent) => {
      events.push(event.type)
    })

    await new Promise((resolve) => setTimeout(resolve, 50))
    await stop()

    expect(events).toEqual([])
  })

  test("close aborts all subscriptions", async () => {
    let controllerAborted = false
    const stream = new ReadableStream({
      start(controller) {
        setTimeout(() => controller.close(), 5000)
      },
      cancel() {
        controllerAborted = true
      },
    })
    responses = [new Response(stream, { status: 200 })]
    const adapter = new RestKiloAdapter(makeOptions())

    await adapter.subscribe({ id: "ses_1", directory: "/tmp/test" }, () => {})
    await adapter.close()

    expect(controllerAborted).toBe(true)
    expect((adapter as unknown as { subscribers: Map<unknown, unknown> }).subscribers.size).toBe(0)
  })
})
