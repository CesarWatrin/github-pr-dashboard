// The pull requests of the records, by repository and number, and the approvals merging needs.

import { state } from './state.js'

export const pullRequestId = (pr) => `${pr.repo}#${pr.number}`

// The record of a pull request, looked up in a map made once per stats.
const pullRequestIndexes = new WeakMap()
export function pullRequestOf(repo, number) {
  let index = pullRequestIndexes.get(state.stats)
  if (!index) {
    index = new Map(state.stats.pullRequests.map((pr) => [pullRequestId(pr), pr]))
    pullRequestIndexes.set(state.stats, index)
  }

  return index.get(`${repo}#${number}`) ?? null
}

// The approvals a pull request needs before it can be merged, as the sync publishes them: 1 when it does not.
export const requiredApprovals = () => state.stats.requiredApprovals ?? 1
