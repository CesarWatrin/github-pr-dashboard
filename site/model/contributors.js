// The rows of the authors and reviewers, over the repositories selected on a page.

import { median } from '../domain/math.js'
import { roundedMedian, sumOf } from '../lib/math.js'
import { isFormer } from './people.js'
import { stackOf } from './repositories.js'
import { currentPeriod } from './selection.js'
import { state } from './state.js'

const TOP_REPOS_PER_REVIEWER = 3

/** @type {(selection: Set<string> | null | undefined, repo: string) => boolean} */
export const inSelection = (selection, repo) => !selection || selection.has(repo)

// The sync script sends each person's figures per repository: rows add them up over the selected ones.
/**
 * @template RepoStats
 * @param {{ repos: Record<string, RepoStats> }} person
 * @param {string} name the table or page whose repository filter applies
 * @returns {[repo: string, stats: RepoStats][]}
 */
export function selectedEntries(person, name) {
  return Object.entries(person.repos).filter(([repo]) => inSelection(state.repos[name], repo))
}

// The rows of the authors table, over the repositories selected on a page: the table's own by default. Like every list
// of people, it leaves out those who left the team.
/** @param {string} [name] */
export function authorRows(name = 'authors') {
  return currentPeriod().authors.flatMap((person) => {
    if (isFormer(person.login)) {
      return []
    }
    const entries = selectedEntries(person, name)
    const parts = entries.map(([, stats]) => stats)
    if (parts.length === 0) {
      return []
    }
    const merged = sumOf(parts, 'merged')
    const decided = merged + sumOf(parts, 'closedUnmerged')

    return [
      {
        login: person.login,
        code: sumOf(parts, 'code'),
        stack: stackOf(entries.map(([repo, stats]) => [repo, stats.code])),
        release: sumOf(parts, 'release'),
        integration: sumOf(parts, 'integration'),
        mergeRate: decided ? Math.round((100 * merged) / decided) : null,
        unreviewedRate: merged ? sumOf(parts, 'unreviewed') / merged : null,
        medianTimeToFirstReviewHours: median(parts.flatMap((stats) => stats.timesToFirstReviewHours)),
        medianTimeToMergeHours: median(parts.flatMap((stats) => stats.timesToMergeHours)),
        medianSize: roundedMedian(parts.flatMap((stats) => stats.sizes)),
        added: sumOf(parts, 'added'),
        deleted: sumOf(parts, 'deleted'),
      },
    ]
  })
}

/** @param {string} [name] */
export function reviewerRows(name = 'reviewers') {
  return currentPeriod().reviewers.flatMap((person) => {
    if (isFormer(person.login)) {
      return []
    }
    const entries = selectedEntries(person, name)
    const parts = entries.map(([, stats]) => stats)
    const prs = sumOf(parts, 'prs')
    const merges = sumOf(parts, 'merges')
    if (prs === 0 && merges === 0) {
      return []
    }
    const approved = sumOf(parts, 'approved')

    return [
      {
        login: person.login,
        prs,
        stack: stackOf(entries.map(([repo, stats]) => [repo, stats.prs])),
        commentsPerPr: prs ? sumOf(parts, 'comments') / prs : null,
        silentApprovalRate: approved ? sumOf(parts, 'silentApproved') / approved : null,
        changesRequested: sumOf(parts, 'changesRequested'),
        medianSize: roundedMedian(parts.flatMap((stats) => stats.sizes)),
        merges,
        topRepos: entries
          .filter(([, stats]) => stats.prs > 0)
          .map(([repo, stats]) => /** @type {[repo: string, prs: number]} */ ([repo, stats.prs]))
          .sort((a, b) => b[1] - a[1])
          .slice(0, TOP_REPOS_PER_REVIEWER),
      },
    ]
  })
}
