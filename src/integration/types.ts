export type IntegrationResult = {
  ok: boolean
  error?: string
}

export type IntegrationPipeline = {
  integrate(candidateBranch: string, validationCommand: string): Promise<IntegrationResult>
}
