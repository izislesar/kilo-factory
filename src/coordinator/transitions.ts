import type { JobState } from "../state"

export const JOB_STATES: JobState[] = [
  "READY",
  "LEASED",
  "RUNNING",
  "RESULT_READY",
  "REVIEWING",
  "INTEGRATING",
  "VALIDATING",
  "COMMITTED",
  "CLOSED",
  "RETRY_WAIT",
  "RECOVERING",
  "QUARANTINED",
  "BLOCKED_EXTERNAL",
]

const TRANSITIONS: Record<JobState, JobState[]> = {
  READY: ["LEASED", "QUARANTINED"],
  LEASED: ["RUNNING", "QUARANTINED", "RECOVERING"],
  RUNNING: ["RESULT_READY", "RETRY_WAIT", "RECOVERING", "QUARANTINED"],
  RESULT_READY: ["REVIEWING", "QUARANTINED"],
  REVIEWING: ["INTEGRATING", "RETRY_WAIT", "QUARANTINED"],
  INTEGRATING: ["VALIDATING", "QUARANTINED"],
  VALIDATING: ["COMMITTED", "RETRY_WAIT", "QUARANTINED"],
  COMMITTED: ["CLOSED"],
  CLOSED: [],
  RETRY_WAIT: ["LEASED", "QUARANTINED"],
  RECOVERING: ["RUNNING", "RESULT_READY", "QUARANTINED"],
  QUARANTINED: [],
  BLOCKED_EXTERNAL: ["READY", "QUARANTINED"],
}

export function canTransition(from: JobState, to: JobState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false
}

export function legalTransitions(from: JobState): JobState[] {
  return TRANSITIONS[from] ?? []
}

export class IllegalTransitionError extends Error {
  constructor(
    public readonly from: JobState,
    public readonly to: JobState,
  ) {
    super(`Illegal transition: ${from} -> ${to}`)
  }
}

export function assertTransition(from: JobState, to: JobState): void {
  if (!canTransition(from, to)) {
    throw new IllegalTransitionError(from, to)
  }
}
