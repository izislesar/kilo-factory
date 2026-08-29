import type { CompletionPayload, BlockPayload } from "./types"

export class ContractError extends Error {}

export function validateCompletion(payload: CompletionPayload, expectedJob: string, expectedGeneration: number): void {
  const [jobId] = payload.jobId.split(":")
  if (jobId !== expectedJob) {
    throw new ContractError(`Job mismatch: payload is for ${payload.jobId}, expected ${expectedJob}:${expectedGeneration}`)
  }
  if (payload.generation !== expectedGeneration) {
    throw new ContractError(`Stale generation: payload is generation ${payload.generation}, current is ${expectedGeneration}`)
  }
}

export function validateBlock(payload: BlockPayload, expectedJob: string, expectedGeneration: number): void {
  const [jobId] = payload.jobId.split(":")
  if (jobId !== expectedJob) {
    throw new ContractError(`Job mismatch: payload is for ${payload.jobId}, expected ${expectedJob}:${expectedGeneration}`)
  }
  if (payload.generation !== expectedGeneration) {
    throw new ContractError(`Stale generation: payload is generation ${payload.generation}, current is ${expectedGeneration}`)
  }
}
