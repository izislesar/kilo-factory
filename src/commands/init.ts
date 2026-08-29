import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { ProjectConfig } from "../config/types"

export type InitResult = {
  ok: boolean
  path?: string
  error?: string
}

const DEFAULT_CONFIG: ProjectConfig = {
  version: 1,
  mainBranch: "main",
  roles: [{ name: "factory-core" }],
}

export async function initProject(directory: string, config?: Partial<ProjectConfig>): Promise<InitResult> {
  try {
    const kiloDir = join(directory, ".kilo-factory")
    const configPath = join(kiloDir, "config.json")

    if (existsSync(configPath)) {
      return { ok: false, error: "Project already initialized", path: configPath }
    }

    await mkdir(kiloDir, { recursive: true })
    const fullConfig: ProjectConfig = {
      ...DEFAULT_CONFIG,
      ...config,
      version: 1,
    }
    await writeFile(configPath, JSON.stringify(fullConfig, null, 2))

    return { ok: true, path: configPath }
  } catch (error) {
    return { ok: false, error: String(error) }
  }
}

export async function loadProjectConfig(directory: string): Promise<ProjectConfig | null> {
  try {
    const configPath = join(directory, ".kilo-factory", "config.json")
    if (!existsSync(configPath)) return null
    const { readFile } = await import("node:fs/promises")
    const content = await readFile(configPath, "utf8")
    return JSON.parse(content) as ProjectConfig
  } catch {
    return null
  }
}
