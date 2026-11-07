// What the filters select: the range of the period, its stats and its CI (worked out once per data and range), the
// range compared to, and the search.

import { computeCi } from '../domain/ci.js'
import { comparisonRange } from '../domain/comparison.js'
import { computePeriod } from '../domain/period.js'
import { addDays, DAY_MS, parisDay, parisMidnight } from '../domain/time.js'
import { dayDate } from '../lib/dates.js'
import { rangeLongFormat } from '../lib/format.js'
import { CUSTOM_PERIOD, DAY_BUCKET_MAX_DAYS, PERIODS, WEEK_BUCKET_MAX_DAYS } from './periods.js'
import { scopedRecords, squadKey } from './squads.js'
import { loadedStats, state } from './state.js'

// Days that can be picked: from the start of the synced data to the day of the last sync.
/** @returns {{ min: string, max: string }} */
export function dateBounds() {
  const stats = loadedStats()

  return { min: parisDay(stats.windowStart), max: parisDay(stats.generatedAt) }
}

// Picked days kept within the bounds, or null when none of them is left.
/**
 * @param {DayRange | null} range
 * @returns {DayRange | null}
 */
export function clampRange(range) {
  if (!range) {
    return null
  }
  const { min, max } = dateBounds()
  const from = range.from < min ? min : range.from
  const to = range.to > max ? max : range.to

  return from <= to ? { from, to } : null
}

// Whether the synced data covers a preset period: the years before the last one come back a month per sync.
/** @param {string} key */
export function periodAvailable(key) {
  const stats = loadedStats()

  return Date.parse(stats.windowStart) <= Date.parse(stats.generatedAt) - PERIODS[key].days * DAY_MS
}

// Time span of the period shown, in milliseconds, and the buckets of its charts.
/** @returns {TimeRange} */
export function periodRange() {
  const stats = loadedStats()
  const lastSync = Date.parse(stats.generatedAt)
  if (state.period !== CUSTOM_PERIOD) {
    const { days, bucket } = PERIODS[state.period]

    return { start: lastSync - days * DAY_MS, end: lastSync, bucket }
  }
  const { from, to } = /** @type {DayRange} */ (state.range)
  const days = (dayDate(to).getTime() - dayDate(from).getTime()) / DAY_MS + 1

  return {
    start: Math.max(parisMidnight(from), Date.parse(stats.windowStart)),
    end: Math.min(parisMidnight(addDays(to, 1)), lastSync),
    bucket: days <= DAY_BUCKET_MAX_DAYS ? 'day' : days <= WEEK_BUCKET_MAX_DAYS ? 'week' : 'month',
  }
}

/** @returns {PeriodStats} */
export function currentPeriod() {
  const range = periodRange()
  const stats = loadedStats()
  const key = `${range.start}:${range.end}:${range.bucket}:${squadKey()}`
  if (state.periodCache?.stats !== stats || state.periodCache.key !== key) {
    state.periodCache = { stats, key, period: computePeriod(scopedRecords(), range) }
  }

  return state.periodCache.period
}

// When the CI runs start: GitHub forgets them after about 13 months, so they only go back to when the sync started
// keeping them, the start of the synced data at most. Stats published before it come without one.
/** @type {() => number} */
export const ciStart = () => Date.parse(loadedStats().ciStart ?? loadedStats().windowStart)

// The range of the CI for a range of the period: cut to the runs the sync keeps, so that no chart starts with empty
// buckets.
/**
 * @param {TimeRange} range
 * @returns {TimeRange}
 */
export function ciRange(range) {
  return { ...range, start: Math.max(range.start, ciStart()) }
}

/** @returns {CiStats} */
export function currentCi() {
  const range = ciRange(periodRange())
  const stats = loadedStats()
  const key = `${range.start}:${range.end}:${range.bucket}`
  if (state.ciCache?.stats !== stats || state.ciCache.key !== key) {
    state.ciCache = { stats, key, ci: computeCi(stats.ci ?? [], range) }
  }

  return state.ciCache.ci
}

// The range the period is compared to: null without a comparison, or when the synced data does not cover it.
/** @param {string} [mode] */
export function comparedRange(mode = state.compare) {
  return comparisonRange(periodRange(), mode, Date.parse(loadedStats().windowStart))
}

// The stats of the range compared to, worked out once per range and data; null without one.
/** @returns {PeriodStats | null} */
export function comparedPeriod() {
  const range = comparedRange()
  if (!range) {
    return null
  }
  const stats = loadedStats()
  const key = `${range.start}:${range.end}:${range.bucket}:${squadKey()}`
  if (state.comparisonCache?.stats !== stats || state.comparisonCache.key !== key) {
    state.comparisonCache = { stats, key, period: computePeriod(scopedRecords(), range) }
  }

  return state.comparisonCache.period
}

// The CI of the range compared to: null when the runs the sync keeps do not cover it whole.
/** @returns {CiStats | null} */
export function comparedCi() {
  const range = comparedRange()
  if (!range || range.start < ciStart()) {
    return null
  }
  const stats = loadedStats()
  const key = `${range.start}:${range.end}:${range.bucket}`
  if (state.comparisonCiCache?.stats !== stats || state.comparisonCiCache.key !== key) {
    state.comparisonCiCache = { stats, key, ci: computeCi(stats.ci ?? [], range) }
  }

  return state.comparisonCiCache.ci
}

/** @type {(count: number, range: { start: number, end: number }) => number} */
export const perWeek = (count, { start, end }) => Math.round((10 * count) / ((end - start) / DAY_MS / 7)) / 10

/** @returns {string} */
export function periodTitle() {
  if (state.period !== CUSTOM_PERIOD) {
    return PERIODS[state.period].title
  }
  const range = /** @type {DayRange} */ (state.range)

  return rangeLongFormat.formatRange(dayDate(range.from), dayDate(range.to))
}

/** @type {(...texts: string[]) => boolean} */
export const matchesQuery = (...texts) => !state.query || texts.some((text) => text.toLowerCase().includes(state.query))
