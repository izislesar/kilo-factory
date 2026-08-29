export type ContinuationPolicy = {
  maxContinuations: number
  continuationPrompt: string
}

export type ContinuationState = {
  count: number
  lastSha: string
  progressRecorded: boolean
}

export type IdleEvent = {
  sessionID: string
  currentSha: string
  dirty: boolean
}

export type IdleDecision = "continue" | "wait" | "recover" | "quarantine"

export type IdleHandler = {
  decide(event: IdleEvent): IdleDecision
  recordProgress(sha: string): void
  getState(): ContinuationState
}

export class BoundedIdleHandler implements IdleHandler {
  private policy: ContinuationPolicy
  private state: ContinuationState

  constructor(policy: ContinuationPolicy, initialState: ContinuationState) {
    this.policy = policy
    this.state = initialState
  }

  decide(event: IdleEvent): IdleDecision {
    const hasShaProgress = event.currentSha !== this.state.lastSha

    if (hasShaProgress || this.state.progressRecorded) {
      this.state.lastSha = event.currentSha
      this.state.count = 0
      this.state.progressRecorded = false
      return "wait"
    }

    if (this.state.count >= this.policy.maxContinuations) {
      return "quarantine"
    }

    this.state.count += 1
    return "continue"
  }

  recordProgress(sha: string): void {
    this.state.lastSha = sha
    this.state.count = 0
    this.state.progressRecorded = true
  }

  getState(): ContinuationState {
    return { ...this.state }
  }
}

export function createIdleHandler(policy: ContinuationPolicy, initialState: ContinuationState): IdleHandler {
  return new BoundedIdleHandler(policy, initialState)
}
