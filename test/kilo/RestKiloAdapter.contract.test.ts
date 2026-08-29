import { describe, expect, test } from "bun:test"
import { RestKiloAdapter } from "../../src/kilo/RestKiloAdapter"
import type { SeedConfiguration, KiloSessionEvent } from "../../src/kilo/types"

const seedSessionID = process.env.KILO_CONTRACT_SEED_SESSION_ID
const repository = process.env.KILO_CONTRACT_DIR ?? "/home/izislesar/Projects/kilo-factory"
const baseUrl = process.env.KILO_BASE_URL ?? "http://127.0.0.1:37273"

const describeIfServer = seedSessionID ? describe : describe.skip

describeIfServer("RestKiloAdapter hardened contract", () => {
  test("connects to live Kilo server", async () => {
    const adapter = new RestKiloAdapter({ url: baseUrl, directory: repository })
    expect(await adapter.health()).toBe(true)
    await adapter.close()
  })

  test("creates a job session with seed configuration", async () => {
    const adapter = new RestKiloAdapter({ url: baseUrl, directory: repository })
    const seed: SeedConfiguration = { agent: "code", model: { providerID: "openai", modelID: "gpt-5.6-sol", variant: "xhigh" } }
    const session = await adapter.createJobSession(repository, seed, "contract test job")

    expect(session.id.startsWith("ses")).toBe(true)
    expect(session.directory).toBe(repository)

    await adapter.delete(session)
    await adapter.close()
  })

  test("session created with correct directory in metadata", async () => {
    const adapter = new RestKiloAdapter({ url: baseUrl, directory: repository })
    const seed: SeedConfiguration = { agent: "code", model: { providerID: "openai", modelID: "gpt-5.6-sol", variant: "xhigh" } }
    const session = await adapter.createJobSession(repository, seed, "dir header test")

    const response = await fetch(`${baseUrl}/session/${session.id}?directory=${encodeURIComponent(repository)}`)
    expect(response.ok).toBe(true)
    const record = (await response.json()) as { directory: string }
    expect(record.directory).toBe(repository)

    await adapter.delete(session)
    await adapter.close()
  })

  test("HTTP failure on missing session read throws actionable error", async () => {
    const adapter = new RestKiloAdapter({ url: baseUrl, directory: repository })
    await expect(adapter.getSeedConfiguration("ses_does_not_exist", repository)).rejects.toThrow(/failed with 404/)
    await adapter.close()
  })

  test("HTTP failure on prompt to missing session throws actionable error", async () => {
    const adapter = new RestKiloAdapter({ url: baseUrl, directory: repository })
    await expect(
      adapter.promptAsync({ id: "ses_does_not_exist", directory: repository }, { parts: [{ type: "text", text: "hi" }] }),
    ).rejects.toThrow(/failed with 404/)
    await adapter.close()
  })

  test("HTTP failure on delete of missing session throws actionable error", async () => {
    const adapter = new RestKiloAdapter({ url: baseUrl, directory: repository })
    await expect(
      adapter.delete({ id: "ses_does_not_exist", directory: repository }),
    ).rejects.toThrow(/failed with 404/)
    await adapter.close()
  })

  test("receives events via subscribe", async () => {
    const adapter = new RestKiloAdapter({ url: baseUrl, directory: repository })
    const seed: SeedConfiguration = { agent: "code", model: { providerID: "openai", modelID: "gpt-5.6-sol" } }
    const session = await adapter.createJobSession(repository, seed, "event test")

    const events: KiloSessionEvent[] = []
    const stop = await adapter.subscribe(session, (event) => {
      events.push(event)
    })
    await adapter.promptAsync(session, { parts: [{ type: "text", text: "Reply OK." }] })

    const started = Date.now()
    while (!events.some((e) => e.type === "session.turn.open") && Date.now() - started < 30_000) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    await stop()

    expect(events.length).toBeGreaterThan(0)
    expect(events.some((e) => e.type === "session.turn.open")).toBe(true)
    await adapter.delete(session)
    await adapter.close()
  }, 60_000)
})
