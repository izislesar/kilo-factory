import { existsSync } from "node:fs"
import { mkdir, writeFile, symlink, readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { homedir } from "node:os"
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

async function getPluginSourcePath(): Promise<string> {
  const distPlugin = join(import.meta.dir, "..", "dist", "plugin.js")
  if (existsSync(distPlugin)) return distPlugin
  const modulePlugin = join(process.cwd(), "dist", "plugin.js")
  if (existsSync(modulePlugin)) return modulePlugin
  return "/usr/lib/kilo-factory/dist/plugin.js"
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

export async function enablePlugin(directory: string): Promise<InitResult> {
  try {
    const pluginDir = join(homedir(), ".config", "kilo", "plugin")
    await mkdir(pluginDir, { recursive: true })

    const target = join(pluginDir, "kilo-factory.js")
    const source = await getPluginSourcePath()

    if (existsSync(target)) {
      return { ok: false, error: "Plugin already enabled", path: target }
    }

    await symlink(source, target)
    return { ok: true, path: target }
  } catch (error) {
    return { ok: false, error: String(error) }
  }
}

export async function loadProjectConfig(directory: string): Promise<ProjectConfig | null> {
  try {
    const configPath = join(directory, ".kilo-factory", "config.json")
    if (!existsSync(configPath)) return null
    const content = await readFile(configPath, "utf8")
    return JSON.parse(content) as ProjectConfig
  } catch {
    return null
  }
}
