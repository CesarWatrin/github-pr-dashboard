// The rules of the analysis about the CI: workflows that fail often, and slow ones.

import { CLEAR, FEW, found, top } from './measures.js'
import { FAILURE_RATE, MIN_RUNS, SLOW_MEDIAN_SECONDS } from './thresholds.js'
/** @import { BusyWorkflow, Context } from './measures.js' */

// Workflows that fail often: a broken job or flaky tests, a run in five or more.
/** @param {Context} context */
export function failingWorkflowsRule({ ci }) {
  const busy = /** @type {BusyWorkflow[]} */ (ci.workflows.filter((workflow) => workflow.runs >= MIN_RUNS))
  if (busy.length === 0) {
    return FEW
  }
  const failing = busy
    .filter((workflow) => workflow.failureRate >= FAILURE_RATE)
    .map(({ repo, workflow, runs, failureRate }) => ({
      repo,
      workflow,
      runs,
      failureRate,
      failed: Math.round(runs * failureRate),
    }))
  if (failing.length === 0) {
    return CLEAR
  }

  return found(failing.some((workflow) => workflow.failureRate >= 0.4) ? 'high' : 'watch', {
    workflows: top(failing, 'failed'),
    count: failing.length,
    checked: busy.length,
  })
}

// Workflows whose median run takes SLOW_MEDIAN_SECONDS or more: the median, as a run waiting for an approval or a
// runner would stretch the slowest ones.
/** @param {Context} context */
export function slowWorkflowsRule({ ci }) {
  const busy = /** @type {BusyWorkflow[]} */ (ci.workflows.filter((workflow) => workflow.runs >= MIN_RUNS))
  if (busy.length === 0) {
    return FEW
  }
  const slow = busy
    .filter((workflow) => workflow.medianSeconds >= SLOW_MEDIAN_SECONDS)
    .map(({ repo, workflow, runs, medianSeconds }) => ({ repo, workflow, runs, medianSeconds }))
  if (slow.length === 0) {
    return CLEAR
  }

  return found(slow.some((workflow) => workflow.medianSeconds >= 2 * SLOW_MEDIAN_SECONDS) ? 'high' : 'watch', {
    workflows: top(slow, 'medianSeconds'),
    count: slow.length,
    checked: busy.length,
  })
}
