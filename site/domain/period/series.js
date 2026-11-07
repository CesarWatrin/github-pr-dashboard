// The buckets of a range: the instants it covers, the bucket of each, and what happened in each bucket of the series.

import { bucketOfDay, bucketsOf } from '../buckets.js'
import { MINUTE_MS, parisDay } from '../time.js'

// What happened in a bucket of the series.
/**
 * @typedef {{ key: string, opened: number, merged: number, comments: number, approvals: number, releases: number,
 *   hotfixes: number, deployments: number, corrective: number }} BucketCounts
 */
/** @typedef {Exclude<keyof BucketCounts, 'key'>} BucketField */
/** @typedef {ReturnType<typeof rangeSeries>} Series */

// The series of the range [start, end), in milliseconds; the instants it takes are in minutes since the epoch.
/** @param {TimeRange} range */
export function rangeSeries({ start, end, bucket }) {
  const startAt = Math.floor(start / MINUTE_MS)
  const endAt = Math.ceil(end / MINUTE_MS)
  const keys = bucketsOf(start, end, bucket)
  /** @type {Map<string, BucketCounts>} */
  const buckets = new Map(
    keys.map(({ key }) => [
      key,
      { key, opened: 0, merged: 0, comments: 0, approvals: 0, releases: 0, hotfixes: 0, deployments: 0, corrective: 0 },
    ]),
  )
  /** @param {number} at */
  const bucketKey = (at) => bucketOfDay(parisDay(at * MINUTE_MS), bucket)

  return {
    bucket,
    keys,
    bucketKey,
    /**
     * @param {number | null} at
     * @returns {at is number}
     */
    inRange: (at) => at !== null && at >= startAt && at < endAt,
    /**
     * @param {number} at
     * @param {BucketField} field
     * @param {number} [amount]
     */
    bump(at, field, amount = 1) {
      const counts = buckets.get(bucketKey(at))
      if (counts) {
        counts[field] += amount
      }
    },
    points: () => keys.map(({ key, partial }) => ({ .../** @type {BucketCounts} */ (buckets.get(key)), partial })),
  }
}
