// DORA: deployments, the delay of code to production, the corrective deployments (hotfixes and reverts, the rework
// rate) and their own delay (the time to restore); and the calendar of the deployments.

import { getOrCreate, median, rate, round, sum } from '../math.js'
import { workHoursBetween } from '../time.js'

// The deployments of a repository, and the delays of its code and of its corrective deployments.
/** @typedef {{ deployments: number, corrective: number, leadTimes: number[], restoreTimes: number[] }} DeliveryTally */

/** @param {import('./series.js').Series} series */
export function deliveryTally(series) {
  /** @type {Map<string, DeliveryTally>} */
  const delivery = new Map()
  /** @param {string} repo */
  const deliveryOf = (repo) => getOrCreate(delivery, repo, () => ({ deployments: 0, corrective: 0, leadTimes: [], restoreTimes: [] }))
  // The deployments of each repository per bucket, as [deployments, corrective ones], for the calendar of deployments.
  /** @type {Map<string, Map<string, [number, number]>>} */
  const calendar = new Map()

  return {
    // A deployment merged in the range.
    /** @param {PullRequestRecord & { mergedAt: number }} pr */
    addDeployment(pr) {
      const stats = deliveryOf(pr.repo)
      const cell = getOrCreate(getOrCreate(calendar, pr.repo, () => new Map()), series.bucketKey(pr.mergedAt), () => [0, 0])
      stats.deployments++
      cell[0]++
      series.bump(pr.mergedAt, 'deployments')
      if (pr.hotfix || pr.revert) {
        stats.corrective++
        cell[1]++
        stats.restoreTimes.push(workHoursBetween(pr.createdAt, pr.mergedAt))
        series.bump(pr.mergedAt, 'corrective')
      }
    },
    // A code pull request, which counts when it reached production in the range.
    /** @param {PullRequestRecord} pr */
    addLeadTime(pr) {
      if (series.inRange(pr.deployedAt ?? null)) {
        deliveryOf(pr.repo).leadTimes.push(workHoursBetween(pr.createdAt, /** @type {number} */ (pr.deployedAt)))
      }
    },
    result: () => ({
      delivery: deliveryStats([...delivery].map(([repo, stats]) => ({ repo, ...stats }))),
      // Per repository with deployments, one [deployments, corrective ones] per bucket of the series.
      deploymentCalendar: [...calendar].map(([repo, perBucket]) => ({
        repo,
        buckets: series.keys.map(({ key }) => perBucket.get(key) ?? [0, 0]),
      })),
    }),
  }
}

/** @param {({ repo: string } & DeliveryTally)[]} repositories */
function deliveryStats(repositories) {
  /** @param {DeliveryTally[]} rows */
  const summary = (rows) => ({
    deployments: sum(rows, 'deployments'),
    corrective: sum(rows, 'corrective'),
    medianLeadTimeHours: round(median(rows.flatMap((row) => row.leadTimes)), 1),
    reworkRate: rate(sum(rows, 'corrective'), sum(rows, 'deployments')),
    medianRestoreHours: round(median(rows.flatMap((row) => row.restoreTimes)), 1),
  })

  return {
    ...summary(repositories),
    repositories: repositories
      .filter((row) => row.deployments > 0 || row.leadTimes.length > 0)
      .map((row) => ({ repo: row.repo, ...summary([row]) })),
  }
}
