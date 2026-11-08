// What the rules of the analysis read, and how they measure it: medians, shares, the busiest rows, and what a rule says.

import { workHoursBetween } from '../time.js'
import { TOP_ROWS } from './thresholds.js'

// A code pull request merged, and the cycle of one (computePeriod()).
/** @typedef {PullRequestRecord & { mergedAt: number }} MergedRecord */
/** @typedef {PeriodStats['cycles'][number]} Cycle */
// The CI of the range, and one of its workflows, with a median and rates once it has runs.
/** @typedef {CiStats} Ci */
/** @typedef {Ci['workflows'][number] & { failureRate: number, medianSeconds: number }} BusyWorkflow */
// A project whose life meets the range, with its figures over it (domain/projects.js).
/** @typedef {import('../projects.js').ProjectRow} ProjectRow */
// What every rule reads: the code pull requests opened in the range and those merged, their cycles, the CI, who is still
// in the team, both halves of the range, the projects whose life meets it and those of them delivered within it, and the
// AC delivered within it, worked out on demand.
/**
 * @typedef {{ code: PullRequestRecord[], merged: MergedRecord[], cycles: Cycle[], ci: Ci,
 *   isCurrent: (login: string) => boolean, halves: () => Halves | null,
 *   projects: () => { rows: ProjectRow[], delivered: ProjectRow[] },
 *   acs: () => { delivered: import('../acs.js').Ac[] } }} Context
 */
/** @typedef {'high' | 'watch' | 'good'} Level */
// The two halves of the range, for the rules that set one against the other (analysis/drift-rules.js).
/** @typedef {NonNullable<ReturnType<typeof import('./drift-rules.js').halves>>} Halves */

// The stages up to the merge: what follows depends on when each repository deploys, not on the review.
/** @type {('pickup' | 'review' | 'merge')[]} */
export const STAGES = ['pickup', 'review', 'merge']
// The figures of each half that can drift, all better lower: medians with their smallest change worth telling.
/**
 * @typedef {{ key: 'medianSize' | 'pickupHours' | 'timeToMergeHours', kind: 'median', minimum: number }
 *   | { key: 'unreviewedShare' | 'hotfixShare' | 'checksFailedShare', kind: 'share' }} DriftMetric
 */
/** @type {DriftMetric[]} */
export const DRIFT_METRICS = [
  { key: 'medianSize', kind: 'median', minimum: 20 },
  { key: 'pickupHours', kind: 'median', minimum: 0.5 },
  { key: 'timeToMergeHours', kind: 'median', minimum: 1 },
  { key: 'unreviewedShare', kind: 'share' },
  { key: 'hotfixShare', kind: 'share' },
  { key: 'checksFailedShare', kind: 'share' },
]

/**
 * @param {number[]} values
 * @returns {number | null}
 */
export function median(values) {
  if (values.length === 0) {
    return null
  }
  const sorted = values.toSorted((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/**
 * @overload
 * @param {number} value
 * @param {number} [digits]
 * @returns {number}
 */
/**
 * @overload
 * @param {number | null} value
 * @param {number} [digits]
 * @returns {number | null}
 */
/**
 * @param {number | null} value
 * @param {number} [digits]
 */
export function round(value, digits = 1) {
  return value === null ? null : Number(value.toFixed(digits))
}
/**
 * @param {number} part
 * @param {number} total
 */
export const share = (part, total) => (total ? round(part / total, 3) : null)
/** @param {PullRequestRecord} pr */
const comments = (pr) => pr.interventions.reduce((total, [, , , count]) => total + count, 0)
/** @param {MergedRecord} pr */
const timeToMerge = (pr) => workHoursBetween(pr.createdAt, pr.mergedAt)
/** @param {PullRequestRecord} pr */
const pickup = (pr) => workHoursBetween(pr.createdAt, pr.interventions[0][1])
// The rows highest on a figure, a missing value counting as zero.
/**
 * @template {string} Key
 * @template {Record<Key, number | null>} Row
 * @param {Row[]} rows
 * @param {Key} by
 * @param {number} [count]
 */
export const top = (rows, by, count = TOP_ROWS) => rows.toSorted((a, b) => Number(b[by]) - Number(a[by])).slice(0, count)

/**
 * @template Value, Key
 * @param {Value[]} values
 * @param {(value: Value) => Key} keyOf
 */
export function groupBy(values, keyOf) {
  /** @type {Map<Key, Value[]>} */
  const groups = new Map()
  for (const value of values) {
    const key = keyOf(value)
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    /** @type {Value[]} */ (groups.get(key)).push(value)
  }

  return groups
}

/**
 * @template Value
 * @param {Value[]} values
 */
export function countBy(values) {
  /** @type {Map<Value, number>} */
  const counts = new Map()
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }

  return counts
}

/** @param {MergedRecord[]} prs */
export function sizeSummary(prs) {
  const lines = prs.reduce((total, pr) => total + pr.lines, 0)

  return {
    prs: prs.length,
    timeToMergeHours: round(median(prs.map(timeToMerge))),
    pickupHours: round(median(prs.map(pickup))),
    commentsPer100Lines: lines ? round((100 * prs.reduce((total, pr) => total + comments(pr), 0)) / lines, 2) : null,
  }
}

/** @type {{ status: 'few' }} */
export const FEW = { status: 'few' }
/** @type {{ status: 'clear' }} */
export const CLEAR = { status: 'clear' }
/**
 * @template {object} Facts
 * @param {Level} level
 * @param {Facts} facts
 * @returns {{ status: 'found', level: Level } & Facts}
 */
export const found = (level, facts) => ({ status: 'found', level, ...facts })
