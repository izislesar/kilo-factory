export type CapabilityCheck = {
  name: string
  ok: boolean
  detail?: string
}

export type VersionGuardResult = {
  ok: boolean
  version: string
  capabilities: CapabilityCheck[]
  errors: string[]
}

export type VersionGuard = {
  check(): Promise<VersionGuardResult>
  assert(): Promise<void>
}

export class VersionGuardError extends Error {
  constructor(
    public readonly result: VersionGuardResult,
  ) {
    super(`Kilo version/capability check failed: ${result.errors.join("; ")}`)
  }
}
