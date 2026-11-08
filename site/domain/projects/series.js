// The projects bucket by bucket over a range, for the chart of the overview: how many lived, started and were delivered
// in each bucket.

import { bucketOfDay, bucketsOf } from '../buckets.js'
import { MINUTE_MS, parisDay } from '../time.js'

/**
 * For each bucket of a range (day, week or month, in Paris days), oldest first: the projects whose span, from their
 * start to their end (projectLife()), meets the bucket (active), those that started in it, and those delivered in it.
 * partial: the range does not cover the whole bucket.
 * @param {{ start: number, end: number, deliveredAt: number | null }[]} rows
 * @param {TimeRange} range
 */
export function projectSeries(rows, { start, end, bucket }) {
  /** @param {number} at */
  const bucketOf = (at) => bucketOfDay(parisDay(at * MINUTE_MS), bucket)
  const spans = rows.map((row) => ({
    from: bucketOf(row.start),
    to: bucketOf(row.end),
    delivered: row.deliveredAt === null ? null : bucketOf(row.deliveredAt),
  }))

  // The keys of the buckets sort as their days do: 'YYYY-MM-DD' for days and weeks (their Monday), 'YYYY-MM' for months.
  return bucketsOf(start, end, bucket).map(({ key, partial }) => ({
    key,
    partial,
    active: spans.filter((span) => span.from <= key && span.to >= key).length,
    started: spans.filter((span) => span.from === key).length,
    delivered: spans.filter((span) => span.delivered === key).length,
  }))
}

/** @typedef {ReturnType<typeof projectSeries>[number]} ProjectPoint */
