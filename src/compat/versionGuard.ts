import type { CapabilityCheck, VersionGuard, VersionGuardResult } from "./types"
import { VersionGuardError } from "./types"

const REQUIRED_CAPABILITIES = [
  "session.create",
  "session.list",
  "session.delete",
  "session.prompt_async",
  "session.abort",
  "global.event",
  "plugin.directory",
]

function compareVersions(actual: string, required: string): number {
  const actualParts = actual.split(".").map(Number)
  const requiredParts = required.split(".").map(Number)
  for (let i = 0; i < Math.max(actualParts.length, requiredParts.length); i++) {
    const a = actualParts[i] ?? 0
    const r = requiredParts[i] ?? 0
    if (a < r) return -1
    if (a > r) return 1
  }
  return 0
}

export function createVersionGuard(actualVersion: string, requiredVersion: string): VersionGuard {
  const check = async (): Promise<VersionGuardResult> => {
    const errors: string[] = []
    const capabilities: CapabilityCheck[] = []

    const versionOk = compareVersions(actualVersion, requiredVersion) >= 0
    capabilities.push({
      name: "version",
      ok: versionOk,
      detail: `actual=${actualVersion}, required>=${requiredVersion}`,
    })
    if (!versionOk) {
      errors.push(`Kilo ${actualVersion} is below required ${requiredVersion}`)
    }

    for (const capability of REQUIRED_CAPABILITIES) {
      capabilities.push({ name: capability, ok: versionOk, detail: versionOk ? "available" : "unknown" })
      if (!versionOk) {
        errors.push(`Cannot verify capability: ${capability}`)
      }
    }

    return { ok: errors.length === 0, version: actualVersion, capabilities, errors }
  }

  const assert = async (): Promise<void> => {
    const result = await check()
    if (!result.ok) throw new VersionGuardError(result)
  }

  return { check, assert }
}

export async function checkCompatibility(actualVersion: string, requiredVersion: string): Promise<VersionGuardResult> {
  return createVersionGuard(actualVersion, requiredVersion).check()
}
