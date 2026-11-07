// What the reviewers did over the range, whoever wrote the pull requests: their reviews, comments, approvals and merges,
// per person and repository, and over time.

import { getOrCreate, round, sum } from '../math.js'

// What a person reviewed in a repository over the range, the pull requests by key.
/**
 * @typedef {{ reviewed: Map<string, PullRequestRecord>, approvedPrs: Set<string>, silentApprovedPrs: Set<string>,
 *   comments: number, changesRequested: number, merges: number }} ReviewerTally
 */

/** @param {PullRequestRecord} pr */
const keyOf = (pr) => `${pr.repo}#${pr.number}`

/** @param {import('./series.js').Series} series */
export function reviewerTally(series) {
  /** @type {Map<string, Map<string, ReviewerTally>>} */
  const reviewers = new Map()
  /** @type {Map<string, Map<string, { prs: number, comments: number }>>} */
  const reviewerSeries = new Map()
  /** @type {Map<string, { repo: string, reviewed: Set<string>, comments: number }>} */
  const repositories = new Map()
  /** @type {Set<string>} */
  const reviewedPullRequests = new Set()

  /**
   * @param {string} login
   * @param {string} repo
   * @returns {ReviewerTally}
   */
  const reviewer = (login, repo) =>
    getOrCreate(getOrCreate(reviewers, login, () => new Map()), repo, () => ({
      reviewed: new Map(),
      approvedPrs: new Set(),
      silentApprovedPrs: new Set(),
      comments: 0,
      changesRequested: 0,
      merges: 0,
    }))
  /** @param {string} name */
  const repository = (name) => getOrCreate(repositories, name, () => ({ repo: name, reviewed: new Set(), comments: 0 }))
  const stats = () => [...reviewers.values()].flatMap((perRepository) => [...perRepository.values()])

  return {
    // A code pull request of a person: its merge in the range, and its reviews and comments in the range.
    /** @param {PullRequestRecord} pr */
    add(pr) {
      if (series.inRange(pr.mergedAt)) {
        series.bump(pr.mergedAt, 'merged')
        if (pr.mergedBy) {
          reviewer(pr.mergedBy, pr.repo).merges++
        }
      }

      const key = keyOf(pr)
      const commenters = new Set(pr.interventions.filter(([, , , comments]) => comments > 0).map(([login]) => login))
      for (const [login, at, state, comments] of pr.interventions) {
        if (!series.inRange(at)) {
          continue
        }
        const tally = reviewer(login, pr.repo)
        const repo = repository(pr.repo)
        const points = getOrCreate(reviewerSeries, login, () => new Map())
        const point = getOrCreate(points, series.bucketKey(at), () => ({ prs: 0, comments: 0 }))
        if (!tally.reviewed.has(key)) {
          tally.reviewed.set(key, pr)
          point.prs++
        }
        reviewedPullRequests.add(key)
        repo.reviewed.add(key)

        tally.comments += comments
        point.comments += comments
        repo.comments += comments
        series.bump(at, 'comments', comments)
        if (state === 'APPROVED') {
          series.bump(at, 'approvals')
          tally.approvedPrs.add(key)
          if (!commenters.has(login)) {
            tally.silentApprovedPrs.add(key)
          }
        } else if (state === 'CHANGES_REQUESTED') {
          tally.changesRequested++
        }
      }
    },
    totals() {
      const all = stats()
      const reviewerPrs = all.reduce((total, tally) => total + tally.reviewed.size, 0)
      const approvedPairs = all.reduce((total, tally) => total + tally.approvedPrs.size, 0)
      const silentPairs = all.reduce((total, tally) => total + tally.silentApprovedPrs.size, 0)

      return {
        reviewed: reviewedPullRequests.size,
        commentsPerPr: reviewerPrs ? round(sum(all, 'comments') / reviewerPrs, 2) : null,
        silentApprovalRate: approvedPairs ? round(silentPairs / approvedPairs, 3) : null,
      }
    },
    reviewers: () =>
      [...reviewers].map(([login, perRepository]) => ({
        login,
        repos: Object.fromEntries(
          [...perRepository].map(([repo, tally]) => [
            repo,
            {
              prs: tally.reviewed.size,
              comments: tally.comments,
              approved: tally.approvedPrs.size,
              silentApproved: tally.silentApprovedPrs.size,
              changesRequested: tally.changesRequested,
              merges: tally.merges,
              sizes: [...tally.reviewed.values()].map((pr) => pr.lines),
            },
          ]),
        ),
      })),
    reviewerSeries: () =>
      Object.fromEntries(
        [...reviewerSeries].map(([login, points]) => [
          login,
          series.keys.map(({ key }) => {
            const point = points.get(key)

            return point ? [point.prs, point.comments] : [0, 0]
          }),
        ]),
      ),
    repositories: () =>
      [...repositories.values()]
        .map((tally) => ({ repo: tally.repo, prs: tally.reviewed.size, comments: tally.comments }))
        .sort((a, b) => b.prs - a.prs),
  }
}
