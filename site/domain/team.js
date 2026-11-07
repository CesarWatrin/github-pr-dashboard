// The people of the records: who reviews whom, when each one first and last shows, the bus factor of a repository.

import { getOrCreate, round } from './math.js'

// What a review network reads of the stats of a period (computePeriod()): each author's pull requests per repository,
// and each reviewer's per author and repository.
/** @typedef {{ login: string, repos: Record<string, { code: number, reviewed: number }> }} NetworkAuthor */
/** @typedef {{ author: string, reviewer: string, repos: Record<string, number> }} ReviewPair */

// Who reviews whom over a selection of repositories (a Set, or null for all of them), from the stats of a period.
// pairs: how many pull requests of an author each reviewer intervened on, busiest first. authors: for each author of
// code pull requests, how many were reviewed, by how many distinct reviewers, and the share of them the main reviewer
// intervened on (the dependency on the main reviewer).
/**
 * @param {{ authors: NetworkAuthor[], reviewPairs: ReviewPair[] }} period
 * @param {Set<string> | null} [selection]
 */
export function reviewNetwork({ authors, reviewPairs }, selection = null) {
  /** @param {Record<string, number>} perRepository */
  const selected = (perRepository) =>
    Object.entries(perRepository).reduce((total, [repo, count]) => (selection && !selection.has(repo) ? total : total + count), 0)
  const pairs = reviewPairs
    .map(({ author, reviewer, repos }) => ({ author, reviewer, prs: selected(repos) }))
    .filter((pair) => pair.prs > 0)
    .sort((a, b) => b.prs - a.prs || a.author.localeCompare(b.author) || a.reviewer.localeCompare(b.reviewer))
  /** @type {Map<string, typeof pairs>} */
  const pairsByAuthor = new Map()
  for (const pair of pairs) {
    getOrCreate(pairsByAuthor, pair.author, () => []).push(pair)
  }
  /**
   * @param {NetworkAuthor['repos']} repos
   * @param {'code' | 'reviewed'} key
   */
  const pick = (repos, key) => Object.fromEntries(Object.entries(repos).map(([repo, stats]) => [repo, stats[key]]))

  return {
    pairs,
    authors: authors.flatMap(({ login, repos }) => {
      const code = selected(pick(repos, 'code'))
      if (code === 0) {
        return []
      }
      const reviewed = selected(pick(repos, 'reviewed'))
      // Pairs are sorted: the first one of an author is its main reviewer, alphabetical order breaking ties.
      const own = pairsByAuthor.get(login) ?? []

      return [
        {
          login,
          code,
          reviewed,
          reviewers: own.length,
          topReviewer: own[0]?.reviewer ?? null,
          topReviewerShare: reviewed ? round(own[0].prs / reviewed, 3) : null,
        },
      ]
    }),
  }
}

// The bus factor of a repository: the fewest people who together wrote at least half of its code pull requests. counts
// holds the pull requests of each person still in the team, total those of everyone, people who left included: 0 when
// those still in the team wrote less than half of them, null without any pull request.
/**
 * @param {number[]} counts
 * @param {number} total
 */
export function busFactor(counts, total) {
  if (total === 0) {
    return null
  }
  let written = 0
  for (const [index, count] of counts.toSorted((a, b) => b - a).entries()) {
    written += count
    if (2 * written >= total) {
      return index + 1
    }
  }

  return 0
}

// When each person first and last shows in the records, whatever the range: a pull request opened, a review or a
// comment, or a merge, as { first, last } in minutes since the epoch. Bot pull requests do not count for their author,
// but the people who review or merge them do. The records only cover the rolling window: a person already active at its
// start has been around for longer.
/** @param {PullRequestRecord[]} records */
export function activityBounds(records) {
  /** @type {Map<string, { first: number, last: number }>} */
  const bounds = new Map()
  /**
   * @param {string} login
   * @param {number} at
   */
  const seen = (login, at) => {
    const known = bounds.get(login)
    if (!known) {
      bounds.set(login, { first: at, last: at })
    } else {
      known.first = Math.min(known.first, at)
      known.last = Math.max(known.last, at)
    }
  }
  for (const pr of records) {
    if (!pr.bot) {
      seen(pr.author, pr.createdAt)
    }
    for (const [login, at] of pr.interventions) {
      seen(login, at)
    }
    if (pr.mergedBy && pr.mergedAt !== null) {
      seen(pr.mergedBy, pr.mergedAt)
    }
  }

  return bounds
}
