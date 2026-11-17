// The counterparts of an open pull request: the pull requests of the same branch on another side (front end, back end,
// mobile app), such as the front end and the back end of one feature, developed side by side and merged together. « Mes PR » tells whether a
// pull request ready to merge still waits for them. Pure: the names of the branches, read from the snapshot, are all it
// needs; only the repository and number of each counterpart are published, never the branch.

import { DAY_MS } from '../../site/domain/time.js'
import { isBot } from './people.mjs'
import { LONG_LIVED_BRANCHES } from './projects.mjs'

// A branch name comes back long after: a pull request merged this many days or more before another of its branch was
// opened was another piece of work.
export const COUNTERPART_DAYS = 30

// Branches no single feature is developed on: the long-lived ones, releases, updates of dependencies.
/** @param {string} branch */
const sharedByChance = (branch) => LONG_LIVED_BRANCHES.includes(branch) || /^(release|dependabot\/|renovate\/)/.test(branch)

// The sides a feature goes across. A branch shared by repositories of one side, or by tooling, infrastructure or docs,
// is most often a change made everywhere at once (the CI, a dependency), each pull request merged on its own.
/** @type {Category[]} */
const SIDES = ['front', 'back', 'mobile']

// The pull requests of each branch, whatever the repository, those of bots aside, and the side of each repository.
/**
 * @param {SnapshotPullRequest[]} pullRequests
 * @param {(repo: string) => Category} categoryOf
 * @returns {CounterpartIndex}
 */
export function counterpartIndex(pullRequests, categoryOf) {
  /** @type {CounterpartIndex} */
  const index = { branches: new Map(), categoryOf }
  for (const pr of pullRequests) {
    if (!sharedByChance(pr.head) && !isBot(pr.author)) {
      index.branches.set(pr.head, [...(index.branches.get(pr.head) ?? []), pr])
    }
  }

  return index
}

// The counterparts of an open pull request, as [repository, number], by repository and number: the pull requests of its
// branch on another side, open, or merged less than COUNTERPART_DAYS before it was opened, or since. One closed without
// a merge is left out. None for a pull request merged or closed: nothing waits on it any more.
/**
 * @param {Pick<SnapshotPullRequest, 'repo' | 'head' | 'state' | 'createdAt'>} pr
 * @param {CounterpartIndex} index counterpartIndex() of the pull requests
 * @returns {[repo: string, number: number][]}
 */
export function counterpartsOf(pr, index) {
  const side = index.categoryOf(pr.repo)
  if (pr.state !== 'OPEN' || sharedByChance(pr.head) || !SIDES.includes(side)) {
    return []
  }
  const since = Date.parse(pr.createdAt) - COUNTERPART_DAYS * DAY_MS

  return (index.branches.get(pr.head) ?? [])
    .filter((other) => {
      const otherSide = index.categoryOf(other.repo)
      const lately = other.state === 'OPEN' || (other.state === 'MERGED' && typeof other.mergedAt === 'string' && Date.parse(other.mergedAt) > since)

      return otherSide !== side && SIDES.includes(otherSide) && lately
    })
    .sort((a, b) => a.repo.localeCompare(b.repo) || a.number - b.number)
    .map((other) => /** @type {[string, number]} */ ([other.repo, other.number]))
}
