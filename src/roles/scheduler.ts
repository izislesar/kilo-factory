import type { ProjectConfig } from "../config/types"
import type { KiloAdapter, SeedConfiguration } from "../kilo/types"

export type RoleAssignment = {
  role: string
  seedSessionID: string
  model: SeedConfiguration["model"]
}

export type RoleScheduler = {
  assignRole(beadId: string, config: ProjectConfig): string
  getSeedForRole(role: string): SeedConfiguration | null
  addRoleSeed(role: string, sessionID: string, model: SeedConfiguration["model"]): void
}

export class ConfiguredRoleScheduler implements RoleScheduler {
  private roleSeeds = new Map<string, { sessionID: string; model: SeedConfiguration["model"] }>()
  private roleCapacity = new Map<string, number>()
  private maxConcurrentPerRole: number

  constructor(maxConcurrentPerRole = 2) {
    this.maxConcurrentPerRole = maxConcurrentPerRole
  }

  addRoleSeed(role: string, sessionID: string, model: SeedConfiguration["model"]): void {
    this.roleSeeds.set(role, { sessionID, model })
  }

  assignRole(beadId: string, config: ProjectConfig): string {
    const roles = config.roles
    if (roles.length === 0) throw new Error("No roles configured")

    let bestRole = roles[0].name
    let bestLoad = Infinity

    for (const role of roles) {
      const load = this.roleCapacity.get(role.name) ?? 0
      if (load < bestLoad && load < this.maxConcurrentPerRole) {
        bestLoad = load
        bestRole = role.name
      }
    }

    this.roleCapacity.set(bestRole, (this.roleCapacity.get(bestRole) ?? 0) + 1)
    return bestRole
  }

  getSeedForRole(role: string): SeedConfiguration | null {
    const entry = this.roleSeeds.get(role)
    if (!entry) return null
    return { agent: "code", model: entry.model }
  }

  releaseRole(role: string): void {
    const current = this.roleCapacity.get(role) ?? 0
    if (current > 0) this.roleCapacity.set(role, current - 1)
  }
}

export function createRoleScheduler(): RoleScheduler {
  return new ConfiguredRoleScheduler()
}
