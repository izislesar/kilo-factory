export class IntegrationError extends Error {}

export function validateIntegration(candidateBranch: string, validationCommand: string): void {
  if (!candidateBranch.trim()) {
    throw new IntegrationError("Candidate branch is required")
  }
  if (!validationCommand.trim()) {
    throw new IntegrationError("Validation command is required")
  }
}
