// The page starts a quick sync on its own once the data it shows gets old: GitHub drops most scheduled runs, so the
// cron alone leaves them hours behind. It goes through the dispatch token of the stats, like the sync button, and never
// doubles a run: one queued or going is waited for, and one started a moment ago, from any page, is left to publish.

// How old the data may get before a page that shows starts a sync, how long after a run started no other is started,
// and how long a page waits between two tries.
export const AUTO_SYNC_AFTER_MS = 10 * 60_000
// Statuses of a workflow run that is not done yet.
export const ACTIVE_RUN_STATUSES = ['requested', 'queued', 'pending', 'waiting', 'in_progress']

// A run of the workflow, as GitHub lists them (workflow_runs).
/** @typedef {{ status: string, created_at: string }} WorkflowRun */

// Whether data generated at that time (ISO) is old enough, at now (milliseconds), for a sync.
/**
 * @param {string} generatedAt
 * @param {number} now
 */
export const dataStale = (generatedAt, now) => now - Date.parse(generatedAt) > AUTO_SYNC_AFTER_MS

// What to do about the recent runs of the workflow (GitHub's workflow_runs), at now (milliseconds): 'wait' for one
// queued or going, 'start' one when none started within AUTO_SYNC_AFTER_MS, else 'skip': the run just done publishes
// within a minute, or it failed and the next one waits for it to get that old.
/**
 * @param {WorkflowRun[]} runs
 * @param {number} now
 * @returns {'wait' | 'skip' | 'start'}
 */
export function autoSyncAction(runs, now) {
  if (runs.some((run) => ACTIVE_RUN_STATUSES.includes(run.status))) {
    return 'wait'
  }

  return runs.some((run) => now - Date.parse(run.created_at) < AUTO_SYNC_AFTER_MS) ? 'skip' : 'start'
}
