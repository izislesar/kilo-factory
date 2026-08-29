export type RoleConfig = {
  name: string
  instructions?: string
}

export type ValidationConfig = {
  command: string
  timeoutSeconds?: number
}

export type ProjectConfig = {
  version: 1
  mainBranch: string
  roles: RoleConfig[]
  validation?: ValidationConfig
  beads?: {
    database?: string
  }
}
