// Where the time of a code pull request goes, stage by stage, for the cycle page.

import { isMissing, round } from '../math.js'
import { workHoursBetween } from '../time.js'

// Where the time of a code pull request goes, in hours, each stage null when it did not go through it: waiting for a
// first look (pickup), from that first review or comment to the last approval before the merge, or to the merge
// without any (review), from that approval to the merge (merge), from the merge to production (deploy), and from the
// opening to the merge and to production. What comes after the merge does not count: the pull request was already in.
/** @param {PullRequestRecord} pr */
export function cycleOf(pr) {
  const merged = pr.mergedAt !== null
  // Read only once merged, as deployedAt once deployed.
  const mergedAt = /** @type {number} */ (pr.mergedAt)
  const before = merged ? pr.interventions.filter(([, at]) => at <= mergedAt) : pr.interventions
  const firstAt = before[0]?.[1] ?? null
  const approvedAt = before.findLast(([, , state]) => state === 'APPROVED')?.[1] ?? null
  const deployed = merged && !isMissing(pr.deployedAt)
  const deployedAt = /** @type {number} */ (pr.deployedAt)
  /**
   * @param {number} from
   * @param {number} to
   */
  const hours = (from, to) => round(workHoursBetween(from, to), 1)

  return {
    pickup: firstAt === null ? null : hours(pr.createdAt, firstAt),
    review: merged && firstAt !== null ? hours(firstAt, approvedAt ?? mergedAt) : null,
    merge: merged && approvedAt !== null ? hours(approvedAt, mergedAt) : null,
    deploy: deployed ? hours(mergedAt, deployedAt) : null,
    toMerge: merged ? hours(pr.createdAt, mergedAt) : null,
    toProduction: deployed ? hours(pr.createdAt, deployedAt) : null,
  }
}
