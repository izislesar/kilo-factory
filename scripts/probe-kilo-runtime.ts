#!/usr/bin/env bun

import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"

type Json = Record<string, any>

type ServerHandle = {
  process: ReturnType<typeof Bun.spawn>
  url: string
  password: string
  logs: string[]
}

type EventStream = {
  events: Json[]
  stop: () => Promise<void>
  waitFor: (type: string, sessionID?: string, after?: number, timeoutMs?: number) => Promise<Json>
}

const seedSessionID = process.env.KILO_RUNTIME_SEED_SESSION_ID
const kiloBin = process.env.KILO_BIN ?? "kilo"
const repository = process.cwd()

if (!seedSessionID) {
  throw new Error(
    "KILO_RUNTIME_SEED_SESSION_ID is required; set it to the visible role session whose manually selected model must be verified",
  )
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function sameModel(left: Json | undefined, right: Json | undefined) {
  return (
    left?.providerID === right?.providerID &&
    (left?.id ?? left?.modelID) === (right?.id ?? right?.modelID) &&
    left?.variant === right?.variant
  )
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), timeoutMs)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function poll<T>(label: string, read: () => Promise<T | undefined>, timeoutMs = 30_000): Promise<T> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const result = await read()
    if (result !== undefined) return result
    await Bun.sleep(100)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

async function fetchBounded(input: string | URL, init: RequestInit = {}, timeoutMs = 30_000) {
  const timeout = AbortSignal.timeout(timeoutMs)
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout
  return fetch(input, { ...init, signal })
}

async function terminateProcess(process: ReturnType<typeof Bun.spawn>) {
  try {
    process.kill("SIGTERM")
  } catch {
    // The process may have exited between the caller's state check and kill.
  }
  try {
    return { exitCode: await withTimeout(process.exited, 30_000, "Kilo SIGTERM shutdown"), forced: false }
  } catch (error) {
    try {
      process.kill("SIGKILL")
    } catch {
      // Awaiting exited below still confirms that no owned child remains.
    }
    await withTimeout(process.exited, 5_000, "Kilo SIGKILL cleanup")
    return { exitCode: null, forced: true, error }
  }
}

async function collectOutput(
  stream: ReadableStream<Uint8Array> | number | undefined,
  logs: string[],
  onLine: (line: string) => void,
) {
  if (!stream || typeof stream === "number") return
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffered = ""
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const text = decoder.decode(value, { stream: true })
      buffered += text
      const lines = buffered.split(/\r?\n/)
      buffered = lines.pop() ?? ""
      for (const line of lines.filter(Boolean)) {
        logs.push(line)
        onLine(line)
      }
    }
  } finally {
    buffered += decoder.decode()
    if (buffered) {
      logs.push(buffered)
      onLine(buffered)
    }
  }
}

async function startServer(cwd: string, environment: Record<string, string | undefined> = {}): Promise<ServerHandle> {
  const password = crypto.randomUUID()
  const logs: string[] = []
  let announce: (url: string) => void
  let rejectAnnounce: (error: Error) => void
  const announced = new Promise<string>((resolve, reject) => {
    announce = resolve
    rejectAnnounce = reject
  })
  let announcedAlready = false
  const inspect = (text: string) => {
    const match = text.match(/kilo server listening on (http:\/\/127\.0\.0\.1:\d+)/)
    if (match && !announcedAlready) {
      announcedAlready = true
      announce(match[1])
    }
  }
  const child = Bun.spawn({
    cmd: [kiloBin, "serve", "--hostname", "127.0.0.1", "--port", "0", "--print-logs", "--log-level", "INFO"],
    cwd,
    env: {
      ...process.env,
      ...environment,
      KILO_SERVER_USERNAME: "kilo",
      KILO_SERVER_PASSWORD: password,
    },
    stdout: "pipe",
    stderr: "pipe",
  })
  void collectOutput(child.stdout, logs, inspect)
  void collectOutput(child.stderr, logs, inspect)
  void child.exited.then((code) => {
    if (!announcedAlready) rejectAnnounce(new Error(`Kilo exited before listening (code ${code})`))
  })

  try {
    const url = await withTimeout(announced, 30_000, "Kilo server startup")
    const server = { process: child, url, password, logs }
    await poll("Kilo health", async () => {
      try {
        const response = await fetchBounded(`${url}/global/health`, { headers: authHeaders(server) }, 2_000)
        return response.ok ? true : undefined
      } catch {
        return undefined
      }
    })
    return server
  } catch (error) {
    await terminateProcess(child)
    throw error
  }
}

function authHeaders(server: ServerHandle) {
  return { authorization: `Basic ${Buffer.from(`kilo:${server.password}`).toString("base64")}` }
}

async function request(
  server: ServerHandle,
  path: string,
  options: {
    method?: string
    directory?: string
    body?: Json
    expected?: number | number[]
    timeoutMs?: number
  } = {},
) {
  const method = options.method ?? "GET"
  const url = new URL(path, server.url)
  const headers: Record<string, string> = authHeaders(server)
  if (options.directory) {
    if (method === "GET" || method === "HEAD") url.searchParams.set("directory", options.directory)
    else headers["x-kilo-directory"] = options.directory
  }
  if (options.body !== undefined) headers["content-type"] = "application/json"
  let response: Response
  try {
    response = await fetchBounded(
      url,
      {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      },
      options.timeoutMs,
    )
  } catch (error) {
    throw new Error(`${method} ${url.pathname} failed`, { cause: error })
  }
  const text = await response.text()
  const expected = Array.isArray(options.expected) ? options.expected : [options.expected ?? 200]
  assert(
    expected.includes(response.status),
    `${method} ${url.pathname} returned ${response.status}, expected ${expected.join(" or ")}: ${text}`,
  )
  return text ? JSON.parse(text) : undefined
}

async function cleanupSessions(server: ServerHandle, sessions: Array<{ id: string; directory: string }>) {
  const pending = [...sessions]
  for (const session of pending) {
    await request(server, `/session/${session.id}`, {
      method: "DELETE",
      directory: session.directory,
      expected: [200, 404],
    })
  }
  for (const directory of new Set(pending.map((session) => session.directory))) {
    const listed = await request(server, "/session", { directory })
    const leaked = pending.filter(
      (session) => session.directory === directory && listed.some((candidate: Json) => candidate.id === session.id),
    )
    assert(leaked.length === 0, `Probe sessions remained after cleanup: ${leaked.map((session) => session.id).join(", ")}`)
  }
  sessions.length = 0
}

async function runFixtureCommand(command: string[], cwd: string) {
  const process = Bun.spawn({
    cmd: command,
    cwd,
    env: {
      ...processEnvWithoutGitVariables(),
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
      GIT_TERMINAL_PROMPT: "0",
    },
    stdout: "pipe",
    stderr: "pipe",
  })
  const stdout = new Response(process.stdout).text()
  const stderr = new Response(process.stderr).text()
  let exitCode: number
  try {
    exitCode = await withTimeout(process.exited, 10_000, command.join(" "))
  } catch (error) {
    process.kill("SIGKILL")
    await withTimeout(process.exited, 5_000, `${command[0]} fixture cleanup`)
    throw error
  }
  assert(exitCode === 0, `${command.join(" ")} failed: ${(await stderr).trim()}${(await stdout).trim()}`)
}

function processEnvWithoutGitVariables() {
  const environment = { ...process.env }
  for (const key of Object.keys(environment)) {
    if (key.startsWith("GIT_")) delete environment[key]
  }
  return environment
}

async function startEventStream(server: ServerHandle): Promise<EventStream> {
  const controller = new AbortController()
  const events: Json[] = []
  let notify: (() => void) | undefined
  const connectTimer = setTimeout(() => controller.abort(), 10_000)
  const response = await fetch(`${server.url}/global/event`, {
    headers: authHeaders(server),
    signal: controller.signal,
  }).finally(() => clearTimeout(connectTimer))
  assert(response.ok && response.body, `Global event stream returned ${response.status}`)

  const task = (async () => {
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffered = ""
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffered += decoder.decode(value, { stream: true })
      const lines = buffered.split(/\r?\n/)
      buffered = lines.pop() ?? ""
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue
        const event = JSON.parse(line.slice(6))
        events.push(event)
        notify?.()
        notify = undefined
      }
    }
  })().catch((error) => {
    if (error?.name !== "AbortError") throw error
  })

  return {
    events,
    async stop() {
      controller.abort()
      await task
    },
    async waitFor(type, sessionID, after = 0, timeoutMs = 30_000) {
      return withTimeout(
        (async () => {
          while (true) {
            const event = events.slice(after).find((candidate) => {
              const payload = candidate.payload
              return payload?.type === type && (!sessionID || payload?.properties?.sessionID === sessionID)
            })
            if (event) return event
            await new Promise<void>((resolve) => {
              notify = resolve
            })
          }
        })(),
        timeoutMs,
        `${type}${sessionID ? ` for ${sessionID}` : ""}`,
      )
    },
  }
}

async function stopServer(server: ServerHandle) {
  const terminated = await terminateProcess(server.process)
  const unavailable = await poll(
    "Kilo listener shutdown",
    async () => {
      try {
        await fetchBounded(`${server.url}/global/health`, { headers: authHeaders(server) }, 1_000)
        return undefined
      } catch {
        return true
      }
    },
    10_000,
  )
  assert(unavailable, "Kilo listener remained available after shutdown")
  assert(
    !terminated.forced,
    `Kilo did not exit within the SIGTERM grace period and required SIGKILL: ${String(terminated.error)}\n${server.logs
      .slice(-20)
      .join("\n")}`,
  )
  assert(
    terminated.exitCode === 0 || terminated.exitCode === 143,
    `Kilo exited unexpectedly after SIGTERM: ${terminated.exitCode}`,
  )
}

async function ambientSdkVersion() {
  const configRoot = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config")
  try {
    const manifest = JSON.parse(
      await readFile(join(configRoot, "kilo", "node_modules", "@kilocode", "sdk", "package.json"), "utf8"),
    )
    return manifest.version as string
  } catch {
    return undefined
  }
}

async function provePlugins(root: string) {
  const project = join(root, "plugin-project")
  const config = join(root, "plugin-config")
  const data = join(root, "plugin-data")
  const cache = join(root, "plugin-cache")
  const state = join(root, "plugin-state")
  const home = join(root, "plugin-home")
  const markers = join(root, "plugin-markers")
  const globalLoaded = join(markers, "global-loaded.json")
  const globalEvent = join(markers, "global-event.json")
  const projectLoaded = join(markers, "project-loaded.json")
  const projectEvent = join(markers, "project-event.json")
  await Promise.all([
    mkdir(join(config, "kilo", "plugin"), { recursive: true }),
    mkdir(join(config, "kilo", "node_modules"), { recursive: true }),
    mkdir(join(project, ".kilo", "plugin"), { recursive: true }),
    mkdir(join(project, ".kilo", "node_modules"), { recursive: true }),
    mkdir(data, { recursive: true }),
    mkdir(cache, { recursive: true }),
    mkdir(state, { recursive: true }),
    mkdir(home, { recursive: true }),
    mkdir(markers, { recursive: true }),
  ])

  const plugin = (id: string, loaded: string, event: string) => `
const server = async ({ directory }) => {
  await Bun.write(${JSON.stringify(loaded)}, JSON.stringify({ directory }))
  return {
    event: async ({ event: input }) => {
      if (input.type === "session.created") {
        await Bun.write(${JSON.stringify(event)}, JSON.stringify({ directory, type: input.type }))
      }
    },
  }
}
export default { id: ${JSON.stringify(id)}, server }
`
  await Promise.all([
    writeFile(join(config, "kilo", "plugin", "runtime-global.js"), plugin("runtime-global", globalLoaded, globalEvent)),
    writeFile(join(project, ".kilo", "plugin", "runtime-project.js"), plugin("runtime-project", projectLoaded, projectEvent)),
    writeFile(
      join(config, "kilo", "package-lock.json"),
      JSON.stringify({ packages: { "": { dependencies: { "@kilocode/plugin": "0.0.0" } } } }),
    ),
    writeFile(
      join(project, ".kilo", "package-lock.json"),
      JSON.stringify({ packages: { "": { dependencies: { "@kilocode/plugin": "0.0.0" } } } }),
    ),
  ])

  const server = await startServer(project, {
    HOME: home,
    XDG_CONFIG_HOME: config,
    XDG_DATA_HOME: data,
    XDG_CACHE_HOME: cache,
    XDG_STATE_HOME: state,
  })
  try {
    const session = await request(server, "/session", {
      method: "POST",
      directory: project,
      body: { title: "kilo-factory plugin capability probe" },
    })
    await poll("global and project plugin hooks", async () => {
      try {
        const values = await Promise.all(
          [globalLoaded, globalEvent, projectLoaded, projectEvent].map(async (path) => JSON.parse(await readFile(path, "utf8"))),
        )
        return values.every((value) => value.directory === project) ? values : undefined
      } catch {
        return undefined
      }
    }, 60_000)
    await request(server, `/session/${session.id}`, { method: "DELETE", directory: project })
  } finally {
    await stopServer(server)
  }
  return { globalDirectoryPlugin: true, projectDirectoryPlugin: true }
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "kilo-factory-runtime-"))
let primary: ServerHandle | undefined
let events: EventStream | undefined
let summary: Json | undefined
let failure: unknown
const sessions: Array<{ id: string; directory: string }> = []

try {
  const directoryA = join(temporaryRoot, "worktree-a")
  const directoryB = join(temporaryRoot, "worktree-b")
  await mkdir(directoryA)
  await runFixtureCommand(["git", "init", "--initial-branch=main"], directoryA)
  await writeFile(join(directoryA, "README.md"), "# Kilo runtime probe fixture\n")
  await runFixtureCommand(["git", "add", "README.md"], directoryA)
  await runFixtureCommand(
    [
      "git",
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "user.name=Kilo Runtime Probe",
      "-c",
      "user.email=runtime-probe@invalid",
      "commit",
      "-m",
      "fixture",
    ],
    directoryA,
  )
  await runFixtureCommand(["git", "worktree", "add", "-b", "runtime-probe-b", directoryB], directoryA)

  primary = await startServer(repository)
  const health = await request(primary, "/global/health")
  const seed = await request(primary, `/session/${seedSessionID}`, { directory: repository })
  assert(seed.id === seedSessionID, "Seed session could not be read from the local Kilo server")
  assert(seed.directory === repository, `Seed session belongs to ${seed.directory}, not ${repository}`)
  assert(seed.agent, "Seed session has no readable agent selection")
  assert(seed.model?.providerID && seed.model?.id, "Seed session has no readable provider/model selection")
  assert(seed.model?.variant, "Seed session has no readable reasoning variant")

  const seedMessages = await request(primary, `/session/${seedSessionID}/message`, { directory: repository })
  assert(seedMessages.length > 0, "Seed session has no conversation to characterize fork isolation")
  events = await startEventStream(primary)

  const fork = await request(primary, `/session/${seedSessionID}/fork`, {
    method: "POST",
    directory: directoryB,
    body: {},
  })
  sessions.push({ id: fork.id, directory: directoryB })
  assert(fork.directory === directoryB, "Fork ignored the target directory header")
  assert(sameModel(fork.model, seed.model), "Fork did not retain the seed model and variant in session metadata")
  const forkMessages = await request(primary, `/session/${fork.id}/message`, { directory: directoryB })
  const seedAfterFork = await request(primary, `/session/${seedSessionID}`, { directory: repository })
  assert(
    seedAfterFork.agent === seed.agent && sameModel(seedAfterFork.model, seed.model),
    "Seed configuration changed during the fork observation; rerun with a quiescent seed session",
  )
  assert(forkMessages.length > 0, "Fork did not contain the seed conversation history as observed")

  const unconfigured = await request(primary, "/session", {
    method: "POST",
    directory: directoryA,
    body: { title: "kilo-factory deterministic error probe" },
  })
  sessions.push({ id: unconfigured.id, directory: directoryA })
  const listedA = await request(primary, "/session", { directory: directoryA })
  const listedB = await request(primary, "/session", { directory: directoryB })
  assert(listedA.some((session: Json) => session.id === unconfigured.id), "Directory A listing omitted its session")
  assert(!listedA.some((session: Json) => session.id === fork.id), "Directory A listing leaked the directory B session")
  assert(listedB.some((session: Json) => session.id === fork.id), "Directory B listing omitted its session")
  assert(!listedB.some((session: Json) => session.id === unconfigured.id), "Directory B listing leaked the directory A session")
  const readBack = await request(primary, `/session/${unconfigured.id}`, { directory: directoryA })
  assert(readBack.directory === directoryA, "Session read-back lost its requested directory")
  const emptyMessages = await request(primary, `/session/${unconfigured.id}/message`, { directory: directoryA })
  assert(emptyMessages.length === 0, "Fresh session unexpectedly contained messages")

  let mark = events.events.length
  await request(primary, `/session/${fork.id}`, { method: "DELETE", directory: directoryB })
  sessions.splice(
    sessions.findIndex((session) => session.id === fork.id),
    1,
  )
  await events.waitFor("session.deleted", fork.id, mark)

  mark = events.events.length
  await request(primary, `/session/${unconfigured.id}/prompt_async`, {
    method: "POST",
    directory: directoryA,
    expected: 204,
    body: {
      model: { providerID: "kilo-runtime-probe-missing", modelID: "missing" },
      parts: [{ type: "text", text: "Trigger the expected provider error." }],
    },
  })
  const errorEvent = await events.waitFor("session.error", unconfigured.id, mark)
  assert(errorEvent.payload.properties.error, "session.error contained no structured error")
  await events.waitFor("session.idle", unconfigured.id, mark)

  const configured = await request(primary, "/session", {
    method: "POST",
    directory: directoryA,
    body: {
      title: "kilo-factory fresh configured session probe",
      agent: seed.agent,
      model: seed.model,
    },
  })
  sessions.push({ id: configured.id, directory: directoryA })
  assert(configured.agent === seed.agent, "Fresh session did not retain copied seed agent")
  assert(sameModel(configured.model, seed.model), "Fresh session did not retain copied seed model and variant")
  const configuredEmpty = await request(primary, `/session/${configured.id}/message`, { directory: directoryA })
  assert(configuredEmpty.length === 0, "Configured fresh session unexpectedly inherited seed messages")

  mark = events.events.length
  await request(primary, `/session/${configured.id}/prompt_async`, {
    method: "POST",
    directory: directoryA,
    expected: 204,
    body: {
      parts: [{ type: "text", text: "Reply with exactly KILO_RUNTIME_PROBE_OK and do not use tools." }],
    },
  })
  await events.waitFor("session.idle", configured.id, mark, 120_000)
  const messages = await request(primary, `/session/${configured.id}/message`, { directory: directoryA })
  const userMessage = messages.find((message: Json) => message.info.role === "user")
  const assistantMessage = messages.find((message: Json) => message.info.role === "assistant")
  assert(userMessage?.info.agent === seed.agent, "Prompt did not use the configured seed agent")
  assert(sameModel(userMessage?.info.model, seed.model), "Prompt did not use the configured seed model and variant")
  assert(assistantMessage?.info.agent === seed.agent, "Assistant response did not use the configured seed agent")
  assert(
    sameModel(
      {
        providerID: assistantMessage?.info.providerID,
        modelID: assistantMessage?.info.modelID,
        variant: assistantMessage?.info.variant,
      },
      seed.model,
    ),
    "Assistant response did not use the configured seed model and variant",
  )
  assert(assistantMessage?.info.path?.cwd === directoryA, "Assistant executed outside the requested directory")
  assert(assistantMessage?.info.path?.root === directoryA, "Assistant did not resolve the requested Git worktree root")
  assert(
    assistantMessage.parts.some((part: Json) => part.type === "text" && part.text === "KILO_RUNTIME_PROBE_OK"),
    "Configured session did not return the expected model response",
  )

  mark = events.events.length
  await request(primary, `/session/${configured.id}/prompt_async`, {
    method: "POST",
    directory: directoryA,
    expected: 204,
    body: {
      parts: [
        {
          type: "text",
          text: "Write a detailed 2000-word explanation of distributed consensus without using tools.",
        },
      ],
    },
  })
  const aborted = await request(primary, `/session/${configured.id}/abort`, {
    method: "POST",
    directory: directoryA,
  })
  assert(aborted === true, "Active session abort did not return true")
  await events.waitFor("session.idle", configured.id, mark, 30_000)

  mark = events.events.length
  await request(primary, `/session/${configured.id}/summarize`, {
    method: "POST",
    directory: directoryA,
    body: {
      providerID: seed.model.providerID,
      modelID: seed.model.id,
      auto: false,
    },
    timeoutMs: 120_000,
  })
  await events.waitFor("session.compacted", configured.id, mark, 120_000)
  await events.waitFor("session.idle", configured.id, mark, 120_000)
  const compactedMessages = await request(primary, `/session/${configured.id}/message`, { directory: directoryA })
  const compaction = compactedMessages.find((message: Json) => message.info.mode === "compaction")
  assert(compaction?.info.summary === true, "Compaction event had no persisted summary message")

  const durableState = { jobID: "kilo-runtime-probe", generation: 1 }
  const durableStatePath = join(temporaryRoot, "durable-factory-state.json")
  await writeFile(durableStatePath, JSON.stringify(durableState))
  await events.stop()
  events = undefined
  await stopServer(primary)
  primary = undefined
  primary = await startServer(repository)
  const persisted = await request(primary, `/session/${configured.id}`, { directory: directoryA })
  assert(persisted.id === configured.id, "Probe session did not survive Kilo server restart")
  const seedAfterRestart = await request(primary, `/session/${seedSessionID}`, { directory: repository })
  assert(
    seedAfterRestart.id === seed.id &&
      seedAfterRestart.agent === seed.agent &&
      sameModel(seedAfterRestart.model, seed.model),
    "Restart changed or removed the unrelated visible seed session",
  )
  assert(
    JSON.stringify(JSON.parse(await readFile(durableStatePath, "utf8"))) === JSON.stringify(durableState),
    "Kilo restart changed independent durable factory state",
  )

  events = await startEventStream(primary)
  mark = events.events.length
  await cleanupSessions(primary, sessions)
  await events.waitFor("session.deleted", configured.id, mark)
  await events.stop()
  events = undefined

  const pluginProof = await provePlugins(temporaryRoot)
  const ambientVersion = await ambientSdkVersion()
  summary = {
    kiloVersion: health.version,
    api: {
      authenticatedLoopbackServer: true,
      sessionCreateListReadAbortDelete: true,
      directoryHeaderAndQueryScoping: true,
      gitWorktreeScoping: true,
      restartPersistence: true,
      unrelatedSeedPreserved: true,
      durableFactoryStateUnaffected: true,
      gracefulSigterm: true,
    },
    events: {
      idle: true,
      error: true,
      deleted: true,
      compacted: true,
    },
    seed: {
      sessionID: seed.id,
      createdByKiloVersion: seed.version,
      agent: seed.agent,
      model: seed.model,
    },
    fork: {
      modelAndVariantRetainedInSessionMetadata: sameModel(fork.model, seed.model),
      sessionAgentRetained: fork.agent === seed.agent,
      copiedMessageCount: forkMessages.length,
      isolationDecision: "rejected: fork copies seed conversation",
    },
    freshSession: {
      copiedSeedConfiguration: true,
      inheritedMessageCount: configuredEmpty.length,
      responseDirectory: assistantMessage.info.path.cwd,
      isolationDecision: "selected: create empty session from seed agent/model read-back",
    },
    compaction: {
      eventObserved: true,
      persistedSummaryVariant: compaction.info.variant ?? null,
    },
    plugins: pluginProof,
    sdk: {
      ambientVersion: ambientVersion ?? null,
      matchesServer: ambientVersion === health.version,
      decision: "use proven REST now; package code must pin an SDK compatible with the detected Kilo version",
    },
  }
  await stopServer(primary)
  primary = undefined
} catch (error) {
  if (primary?.logs.length) {
    console.error("Recent Kilo logs:")
    console.error(primary.logs.slice(-40).join("\n"))
  }
  failure = error
} finally {
  const cleanupErrors: unknown[] = []
  const attemptCleanup = async (cleanup: () => Promise<void>) => {
    try {
      await cleanup()
    } catch (error) {
      cleanupErrors.push(error)
    }
  }
  if (events) {
    const stream = events
    events = undefined
    await attemptCleanup(() => withTimeout(stream.stop(), 5_000, "event stream cleanup"))
  }
  if (primary && (await Promise.race([primary.process.exited.then(() => true), Bun.sleep(0).then(() => false)]))) {
    primary = undefined
  }
  if (sessions.length > 0) {
    if (!primary) {
      await attemptCleanup(async () => {
        primary = await startServer(repository)
      })
    }
    if (primary) {
      try {
        await cleanupSessions(primary, sessions)
      } catch (initialError) {
        const unhealthy = primary
        primary = undefined
        await attemptCleanup(() => stopServer(unhealthy))
        try {
          primary = await startServer(repository)
          await cleanupSessions(primary, sessions)
        } catch (retryError) {
          cleanupErrors.push(
            new AggregateError([initialError, retryError], "Session cleanup failed before and after Kilo restart"),
          )
        }
      }
    }
  }
  if (primary) {
    const server = primary
    primary = undefined
    await attemptCleanup(() => stopServer(server))
  }
  await attemptCleanup(() => rm(temporaryRoot, { recursive: true, force: true }))
  if (cleanupErrors.length > 0) {
    failure = failure
      ? new AggregateError([failure, ...cleanupErrors], "Kilo runtime probe and cleanup failed")
      : new AggregateError(cleanupErrors, "Kilo runtime probe cleanup failed")
  }
}

if (failure) throw failure
assert(summary, "Kilo runtime probe produced no summary")
console.log(JSON.stringify(summary, null, 2))
