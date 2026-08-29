export type IntegrationResult = {
  ok: boolean
  error?: string
  mainSha?: string
}

export type IntegrationPipeline = {
  integrate(candidateBranch: string, validationCommand: string): Promise<IntegrationResult>
}
