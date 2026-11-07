// What the authors wrote over the range, counted on the pull requests they opened in it, whenever these were merged:
// per person and repository, so that the page can add them up over any selection of repositories; who reviewed them;
// the cycle of each code pull request.

import { getOrCreate, median, rate, round, sum } from '../math.js'
import { workHoursBetween } from '../time.js'
import { cycleOf } from './cycle.js'
import { sizeOf } from './sizes.js'

// What a person opened in a repository over the range.
/**
 * @typedef {{ opened: number, code: number, release: number, integration: number, merged: number, closedUnmerged: number,
 *   unreviewed: number, hotfix: number, reviewed: number, timesToMerge: number[], timesToFirstReview: number[], sizes: number[],
 *   added: number, deleted: number }} AuthorTally
 */

/**
 * @param {import('./series.js').Series} series
 * @param {{ sizes: ReturnType<typeof import('./sizes.js').sizeTally>, hotfixes: ReturnType<typeof import('./hotfixes.js').hotfixTally> }} tallies
 */
export function authorTally(series, { sizes, hotfixes }) {
  /** @type {Map<string, Map<string, AuthorTally>>} */
  const authors = new Map()
  /** @type {({ repo: string, bucket: string, size: number } & ReturnType<typeof cycleOf>)[]} */
  const cycles = []
  let mergedWithFailedChecks = 0
  // Who reviews whom: each distinct reviewer of a code pull request opened in the range counts once for the pair of its
  // author and that reviewer, whenever the review came.
  /** @type {Map<string, { author: string, reviewer: string, repos: Map<string, number> }>} */
  const pairs = new Map()

  /**
   * @param {string} login
   * @param {string} repo
   * @returns {AuthorTally}
   */
  const author = (login, repo) =>
    getOrCreate(getOrCreate(authors, login, () => new Map()), repo, () => ({
      opened: 0,
      code: 0,
      release: 0,
      integration: 0,
      merged: 0,
      closedUnmerged: 0,
      unreviewed: 0,
      hotfix: 0,
      reviewed: 0,
      timesToMerge: [],
      timesToFirstReview: [],
      sizes: [],
      added: 0,
      deleted: 0,
    }))
  /**
   * @param {string} authorLogin
   * @param {string} reviewerLogin
   * @param {string} repo
   */
  const addPair = (authorLogin, reviewerLogin, repo) => {
    const pair = getOrCreate(pairs, `${authorLogin}\n${reviewerLogin}`, () => ({
      author: authorLogin,
      reviewer: reviewerLogin,
      repos: new Map(),
    }))
    pair.repos.set(repo, (pair.repos.get(repo) ?? 0) + 1)
  }
  const stats = () => [...authors.values()].flatMap((perRepository) => [...perRepository.values()])

  return {
    // A pull request of a person opened in the range, whatever its kind.
    /** @param {PullRequestRecord} pr */
    addOpened(pr) {
      author(pr.author, pr.repo)[pr.kind]++
      author(pr.author, pr.repo).opened++
      series.bump(pr.createdAt, 'opened')
    },
    // A code pull request of a person opened in the range.
    /** @param {PullRequestRecord} pr */
    addCode(pr) {
      cycles.push({ repo: pr.repo, bucket: series.bucketKey(pr.createdAt), size: sizeOf(pr.lines), ...cycleOf(pr) })
      const tally = author(pr.author, pr.repo)
      if (pr.hotfix) {
        tally.hotfix++
        hotfixes.add(pr)
      }
      if (pr.interventions.length > 0) {
        tally.timesToFirstReview.push(workHoursBetween(pr.createdAt, pr.interventions[0][1]))
      }
      // The sync already leaves the author out of the interventions: checked again, an author never reviews itself.
      const prReviewers = new Set(pr.interventions.map(([login]) => login).filter((login) => login !== pr.author))
      if (prReviewers.size > 0) {
        tally.reviewed++
      }
      for (const login of prReviewers) {
        addPair(pr.author, login, pr.repo)
      }
      if (pr.mergedAt !== null) {
        const timeToMerge = workHoursBetween(pr.createdAt, pr.mergedAt)
        tally.merged++
        tally.timesToMerge.push(timeToMerge)
        tally.sizes.push(pr.lines)
        tally.added += pr.lines - (pr.deleted ?? 0)
        tally.deleted += pr.deleted ?? 0
        if (pr.interventions.length === 0) {
          tally.unreviewed++
        }
        if (pr.checksFailed) {
          mergedWithFailedChecks++
        }
        sizes.add(pr, timeToMerge)
      } else if (pr.closed) {
        tally.closedUnmerged++
      }
    },
    // The code pull requests a person opened over the range, every repository.
    /** @param {string} login */
    codeOf: (login) =>
      [.../** @type {Map<string, AuthorTally>} */ (authors.get(login)).values()].reduce((total, tally) => total + tally.code, 0),
    totals() {
      const all = stats()
      const merged = sum(all, 'merged')
      const code = sum(all, 'code')

      return {
        opened: sum(all, 'opened'),
        merged,
        medianTimeToMergeHours: round(median(all.flatMap((tally) => tally.timesToMerge)), 1),
        medianSize: round(median(all.flatMap((tally) => tally.sizes))),
        added: sum(all, 'added'),
        deleted: sum(all, 'deleted'),
        hotfixShare: code ? round(sum(all, 'hotfix') / code, 3) : null,
        unreviewedShare: merged ? round(sum(all, 'unreviewed') / merged, 3) : null,
        checksFailedShare: rate(mergedWithFailedChecks, merged),
      }
    },
    // Durations and sizes stay as lists: medians cannot be added up across repositories.
    authors: () =>
      [...authors].map(([login, perRepository]) => ({
        login,
        repos: Object.fromEntries(
          [...perRepository].map(([repo, tally]) => [
            repo,
            {
              code: tally.code,
              release: tally.release,
              integration: tally.integration,
              merged: tally.merged,
              closedUnmerged: tally.closedUnmerged,
              unreviewed: tally.unreviewed,
              reviewed: tally.reviewed,
              timesToFirstReviewHours: tally.timesToFirstReview.map((hours) => round(hours, 1)),
              timesToMergeHours: tally.timesToMerge.map((hours) => round(hours, 1)),
              sizes: tally.sizes,
              added: tally.added,
              deleted: tally.deleted,
            },
          ]),
        ),
      })),
    reviewPairs: () =>
      [...pairs.values()].map(({ author: authorLogin, reviewer: reviewerLogin, repos }) => ({
        author: authorLogin,
        reviewer: reviewerLogin,
        repos: Object.fromEntries(repos),
      })),
    // One entry per code pull request opened in the range, for the cycle page to add up over any repositories.
    cycles: () => cycles,
  }
}
