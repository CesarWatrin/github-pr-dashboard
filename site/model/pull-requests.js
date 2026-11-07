// The pull requests of the records, by repository and number, and the approvals merging needs.

import { loadedStats } from './state.js'

/** @type {(pr: { repo: string, number: number }) => string} */
export const pullRequestId = (pr) => `${pr.repo}#${pr.number}`

// The record of a pull request, looked up in a map made once per stats.
/** @type {WeakMap<Stats, Map<string, PullRequestRecord>>} */
const pullRequestIndexes = new WeakMap()
/**
 * @param {string} repo
 * @param {number} number
 * @returns {PullRequestRecord | null}
 */
export function pullRequestOf(repo, number) {
  const stats = loadedStats()
  let index = pullRequestIndexes.get(stats)
  if (!index) {
    index = new Map(stats.pullRequests.map((pr) => [pullRequestId(pr), pr]))
    pullRequestIndexes.set(stats, index)
  }

  return index.get(`${repo}#${number}`) ?? null
}

// The approvals a pull request needs before it can be merged, as the sync publishes them: 1 when it does not.
/** @type {() => number} */
export const requiredApprovals = () => loadedStats().requiredApprovals ?? 1
