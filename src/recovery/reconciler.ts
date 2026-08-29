import type { JobObservation, Reconciler, ReconciliationAction } from "./types"

export function determineAction(observation: JobObservation): ReconciliationAction {
  if (observation.beadStatus === "closed") {
    return "noop"
  }

  if (!observation.worktreeExists || observation.worktreeStatus === "missing") {
    return "quarantine"
  }

  if (observation.worktreeStatus === "dirty") {
    return "recover"
  }

  if (observation.uniqueCommits > 0) {
    return "noop"
  }

  return "retry"
}

export class ReconcilerImpl implements Reconciler {
  async reconcile(observations: JobObservation[]): Promise<ReconciliationAction[]> {
    return observations.map(determineAction)
  }
}

export function createReconciler(): Reconciler {
  return new ReconcilerImpl()
}
