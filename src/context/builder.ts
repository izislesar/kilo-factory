import type { JobIdentity } from "../plugin/types"

export type JobEnvelope = {
  jobId: string
  bead: string
  generation: number
  role: string
  acceptance: string
  dependencies: string[]
  comments: string[]
}

export type WorkerContext = {
  contract: string
  projectInstructions: string
  roleContract: string
  jobEnvelope: JobEnvelope
  repositoryContext: string[]
}

export type ContextBuilder = {
  build(
    job: JobIdentity,
    acceptance: string,
    dependencies: string[],
    comments: string[],
  ): WorkerContext
}

export class ContextBuilderImpl implements ContextBuilder {
  private contract: string
  private projectInstructions: string
  private roleContract: string

  constructor(contract: string, projectInstructions: string, roleContract: string) {
    this.contract = contract
    this.projectInstructions = projectInstructions
    this.roleContract = roleContract
  }

  build(
    job: JobIdentity,
    acceptance: string,
    dependencies: string[],
    comments: string[],
    repositoryContext: string[] = [],
  ): WorkerContext {
    return {
      contract: this.contract,
      projectInstructions: this.projectInstructions,
      roleContract: this.roleContract,
      jobEnvelope: {
        jobId: job.jobId,
        bead: job.bead,
        generation: job.generation,
        role: job.role,
        acceptance,
        dependencies,
        comments,
      },
      repositoryContext,
    }
  }
}

export function createContextBuilder(
  contract: string,
  projectInstructions: string,
  roleContract: string,
): ContextBuilder {
  return new ContextBuilderImpl(contract, projectInstructions, roleContract)
}
