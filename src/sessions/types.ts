export type RoleSession = {
  role: string
  serverUrl: string
  directory: string
  attachCommand: string
}

export type SessionManager = {
  listRoles(): RoleSession[]
  attachInstructions(role: string): string
}
