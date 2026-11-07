// The rules of the analysis that set the second half of the range against the first: what drifts, what improves.

import { computePeriod } from '../period.js'
import { DAY_MS } from '../time.js'
import { CLEAR, DRIFT_METRICS, FEW, found, median, round } from './measures.js'
import { DRIFT_POINTS, DRIFT_RATIO, DRIFT_SHARE_RATIO, MIN_HALF_PRS, MINUTE_MS, SETTLE_DAYS } from './thresholds.js'
/** @import { Context, DriftMetric, Halves } from './measures.js' */

// The figures of DRIFT_METRICS over one half of the range.
/**
 * @param {PullRequestRecord[]} records
 * @param {{ start: number, end: number }} range
 */
function halfFigures(records, range) {
  const period = computePeriod(records, { ...range, bucket: 'month' })

  return {
    merged: period.totals.merged,
    medianSize: period.totals.medianSize,
    pickupHours: round(median(period.cycles.map((cycle) => cycle.pickup).filter((hours) => hours !== null))),
    timeToMergeHours: period.totals.medianTimeToMergeHours,
    unreviewedShare: period.totals.unreviewedShare,
    hotfixShare: period.totals.hotfixShare,
    checksFailedShare: period.totals.checksFailedShare,
  }
}

// How one figure moved from the first half to the second: 1 worse, -1 better, 0 not enough to tell.
/**
 * @param {DriftMetric} metric
 * @param {number | null} before
 * @param {number | null} after
 */
function driftOf(metric, before, after) {
  if (before === null || after === null) {
    return 0
  }
  const [low, high] = before <= after ? [before, after] : [after, before]
  const moved =
    metric.kind === 'median'
      ? high - low >= metric.minimum && (low === 0 || high / low >= DRIFT_RATIO)
      : high - low >= DRIFT_POINTS && (low === 0 || high / low >= DRIFT_SHARE_RATIO)

  return moved ? Math.sign(after - before) : 0
}

// The second half of the range against the first, its last SETTLE_DAYS aside: what got worse (drift), and apart what
// got better (progress).
/** @param {{ records: PullRequestRecord[], start: number, end: number }} range */
export function halves({ records, start, end }) {
  const settled = end - SETTLE_DAYS * DAY_MS
  if (settled <= start) {
    return null
  }
  const middle = start + Math.round((settled - start) / 2 / MINUTE_MS) * MINUTE_MS
  const first = halfFigures(records, { start, end: middle })
  const second = halfFigures(records, { start: middle, end: settled })
  if (first.merged < MIN_HALF_PRS || second.merged < MIN_HALF_PRS) {
    return null
  }
  const moves = DRIFT_METRICS.map((metric) => ({
    key: metric.key,
    before: first[metric.key],
    after: second[metric.key],
    way: driftOf(metric, first[metric.key], second[metric.key]),
  }))

  return { middle, moves }
}


// The figures that moved one way: 1 worse, -1 better.
/**
 * @param {Halves} split
 * @param {number} way
 */
const movesOf = (split, way) =>
  split.moves.filter((move) => move.way === way).map(({ key, before, after }) => ({ key, before, after }))

/** @param {Context} context */
export function driftRule(context) {
  const split = context.halves()
  if (!split) {
    return FEW
  }
  const worse = movesOf(split, 1)
  if (worse.length === 0) {
    return CLEAR
  }

  return found(worse.length >= 2 ? 'high' : 'watch', { middle: split.middle, metrics: worse })
}

/** @param {Context} context */
export function progressRule(context) {
  const split = context.halves()
  if (!split) {
    return FEW
  }
  const better = movesOf(split, -1)
  if (better.length === 0) {
    return CLEAR
  }

  return found('good', { middle: split.middle, metrics: better })
}
