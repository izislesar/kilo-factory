import { describe, expect, test, beforeAll } from "bun:test"
import { RestKiloAdapter } from "../../src/kilo/RestKiloAdapter"
import type { SeedConfiguration, KiloSessionEvent } from "../../src/kilo/types"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const seedSessionID = process.env.KILO_CONTRACT_SEED_SESSION_ID
const kiloBin = process.env.KILO_BIN ?? "kilo"
const repository = process.cwd()

let serverUrl: string
let password: string
let serverProcess: ReturnType<typeof Bun.spawn>
let tempRoot: string
let worktreeA: string
let worktreeB: string

async function spawnServer(cwd: string): Promise<{ url: string; password: string }> {
  const pw = crypto.randomUUID()
  const child = Bun.spawn({
    cmd: [kiloBin, "serve", "--hostname", "127.0.0.1", "--port", "0", "--print-logs", "--log-level", "WARN"],
    cwd,
    env: {
      ...process.env,
      KILO_SERVER_USERNAME: "kilo",
      KILO_SERVER_PASSWORD: pw,
    },
    stdout: "pipe",
    stderr: "pipe",
  })
  const output = child.stdout
  const reader = output.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let url: string | undefined
  while (!url) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const match = buffer.match(/kilo server listening on (http:\/\/127\.0\.0.1:\d+)/)
    if (match) url = match[1]
  }
  void (async () => {
    while (true) {
      const { done } = await reader.read()
      if (done) break
    }
  })()
  serverProcess = child
  return { url: url ?? "", password: pw }
}

async function spawnServerInRepository() {
  const result = await spawnServer(repository)
  serverUrl = result.url
  password = result.password
}

const describeIfServer = seedSessionID ? describe : describe.skip

beforeAll(async () => {
  if (!seedSessionID) return
  await spawnServerInRepository()
  tempRoot = await mkdtemp(join(tmpdir(), "kilo-factory-contract-"))
  worktreeA = join(tempRoot, "worktree-a")
  worktreeB = join(tempRoot, "worktree-b")
  await mkdir(worktreeA)
  const init = Bun.spawnSync({ cmd: ["git", "init", "--initial-branch=main"], cwd: worktreeA })
  if (init.exitCode !== 0) throw new Error("git init failed")
  await Bun.write(join(worktreeA, "README.md"), "# contract fixture\n")
  Bun.spawnSync({ cmd: ["git", "add", "README.md"], cwd: worktreeA })
  Bun.spawnSync({
    cmd: ["git", "-c", "user.name=Test", "-c", "user.email=test@invalid", "commit", "-m", "init"],
    cwd: worktreeA,
  })
})

async function stopServerContract() {
  if (serverProcess) {
    serverProcess.kill("SIGTERM")
    await serverProcess.exited.catch(() => undefined)
  }
  if (tempRoot) await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined)
}

describeIfServer("RestKiloAdapter contract", () => {
  test("connects to a real local Kilo server", async () => {
    const adapter = new RestKiloAdapter({ url: serverUrl, directory: repository, username: "kilo", password })
    expect(await adapter.health()).toBe(true)
  })

  test("creates a job session with seed configuration", async () => {
    const adapter = new RestKiloAdapter({ url: serverUrl, directory: worktreeA, username: "kilo", password })
    const seed: SeedConfiguration = { agent: "code", model: { providerID: "openai", modelID: "gpt-5.6-sol", variant: "xhigh" } }
    const session = await adapter.createJobSession(worktreeA, seed, "contract test job")

    expect(session.id.startsWith("ses")).toBe(true)
    await adapter.delete(session)
    await adapter.close()
  })

  test("receives events via subscribe", async () => {
    const adapter = new RestKiloAdapter({ url: serverUrl, directory: worktreeA, username: "kilo", password })
    const seed: SeedConfiguration = { agent: "code", model: { providerID: "openai", modelID: "gpt-5.6-sol" } }
    const session = await adapter.createJobSession(worktreeA, seed, "event test")

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
