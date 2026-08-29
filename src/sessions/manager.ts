import type { RoleSession } from "./types"

type RoleConfig = {
  name: string
  serverUrl: string
}

export class SessionManager {
  private roles: RoleConfig[]

  constructor(roles: RoleConfig[]) {
    this.roles = roles
  }

  listRoles(): RoleSession[] {
    return this.roles.map((role) => ({
      role: role.name,
      serverUrl: role.serverUrl,
      directory: process.cwd(),
      attachCommand: this.buildAttachCommand(role),
    }))
  }

  attachInstructions(roleName: string): string {
    const role = this.roles.find((r) => r.name === roleName)
    if (!role) throw new Error(`Unknown role: ${roleName}`)
    return this.buildAttachCommand(role)
  }

  private buildAttachCommand(role: RoleConfig): string {
    return `kilo attach ${role.serverUrl} --dir ${process.cwd()}`
  }
}
