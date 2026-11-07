// The sizes of the code pull requests merged: how long each size takes to merge, and how many comments it gets.

import { median, round } from '../math.js'

// Upper bounds (excluded) of the pull request size buckets, in changed lines.
export const SIZE_BUCKETS = [10, 100, 500, 1000, Infinity]

/** @param {number} lines */
export const sizeOf = (lines) => SIZE_BUCKETS.findIndex((max) => lines < max)

export function sizeTally() {
  /** @type {{ max: number, prs: number, comments: number, timesToMerge: number[] }[]} */
  const sizes = SIZE_BUCKETS.map((max) => ({ max, prs: 0, comments: 0, timesToMerge: [] }))

  return {
    // A code pull request merged, opened in the range.
    /**
     * @param {PullRequestRecord} pr
     * @param {number} timeToMerge
     */
    add(pr, timeToMerge) {
      const size = sizes[sizeOf(pr.lines)]
      size.prs++
      size.timesToMerge.push(timeToMerge)
      size.comments += pr.interventions.reduce((total, [, , , comments]) => total + comments, 0)
    },
    result: () =>
      sizes.map((bucket) => ({
        max: Number.isFinite(bucket.max) ? bucket.max : null,
        prs: bucket.prs,
        medianTimeToMergeHours: round(median(bucket.timesToMerge), 1),
        commentsPerPr: bucket.prs ? round(bucket.comments / bucket.prs, 2) : null,
      })),
  }
}
