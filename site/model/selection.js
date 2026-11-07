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
import { state } from './state.js'

// Days that can be picked: from the start of the synced data to the day of the last sync.
export function dateBounds() {
  return { min: parisDay(state.stats.windowStart), max: parisDay(state.stats.generatedAt) }
}

// Picked days kept within the bounds, or null when none of them is left.
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
export function periodAvailable(key) {
  return Date.parse(state.stats.windowStart) <= Date.parse(state.stats.generatedAt) - PERIODS[key].days * DAY_MS
}

// Time span of the period shown, in milliseconds, and the buckets of its charts.
export function periodRange() {
  const lastSync = Date.parse(state.stats.generatedAt)
  if (state.period !== CUSTOM_PERIOD) {
    const { days, bucket } = PERIODS[state.period]

    return { start: lastSync - days * DAY_MS, end: lastSync, bucket }
  }
  const { from, to } = state.range
  const days = (dayDate(to).getTime() - dayDate(from).getTime()) / DAY_MS + 1

  return {
    start: Math.max(parisMidnight(from), Date.parse(state.stats.windowStart)),
    end: Math.min(parisMidnight(addDays(to, 1)), lastSync),
    bucket: days <= DAY_BUCKET_MAX_DAYS ? 'day' : days <= WEEK_BUCKET_MAX_DAYS ? 'week' : 'month',
  }
}

export function currentPeriod() {
  const range = periodRange()
  const key = `${range.start}:${range.end}:${range.bucket}:${squadKey()}`
  if (state.periodCache?.stats !== state.stats || state.periodCache.key !== key) {
    state.periodCache = { stats: state.stats, key, period: computePeriod(scopedRecords(), range) }
  }

  return state.periodCache.period
}

// When the CI runs start: GitHub forgets them after about 13 months, so they only go back to when the sync started
// keeping them, the start of the synced data at most. Stats published before it come without one.
export const ciStart = () => Date.parse(state.stats.ciStart ?? state.stats.windowStart)

// The range of the CI for a range of the period: cut to the runs the sync keeps, so that no chart starts with empty
// buckets.
export function ciRange(range) {
  return { ...range, start: Math.max(range.start, ciStart()) }
}

export function currentCi() {
  const range = ciRange(periodRange())
  const key = `${range.start}:${range.end}:${range.bucket}`
  if (state.ciCache?.stats !== state.stats || state.ciCache.key !== key) {
    state.ciCache = { stats: state.stats, key, ci: computeCi(state.stats.ci ?? [], range) }
  }

  return state.ciCache.ci
}

// The range the period is compared to: null without a comparison, or when the synced data does not cover it.
export function comparedRange(mode = state.compare) {
  return comparisonRange(periodRange(), mode, Date.parse(state.stats.windowStart))
}

// The stats of the range compared to, worked out once per range and data; null without one.
export function comparedPeriod() {
  const range = comparedRange()
  if (!range) {
    return null
  }
  const key = `${range.start}:${range.end}:${range.bucket}:${squadKey()}`
  if (state.comparisonCache?.stats !== state.stats || state.comparisonCache.key !== key) {
    state.comparisonCache = { stats: state.stats, key, period: computePeriod(scopedRecords(), range) }
  }

  return state.comparisonCache.period
}

// The CI of the range compared to: null when the runs the sync keeps do not cover it whole.
export function comparedCi() {
  const range = comparedRange()
  if (!range || range.start < ciStart()) {
    return null
  }
  const key = `${range.start}:${range.end}:${range.bucket}`
  if (state.comparisonCiCache?.stats !== state.stats || state.comparisonCiCache.key !== key) {
    state.comparisonCiCache = { stats: state.stats, key, ci: computeCi(state.stats.ci ?? [], range) }
  }

  return state.comparisonCiCache.ci
}

export const perWeek = (count, { start, end }) => Math.round((10 * count) / ((end - start) / DAY_MS / 7)) / 10

export function periodTitle() {
  if (state.period !== CUSTOM_PERIOD) {
    return PERIODS[state.period].title
  }

  return rangeLongFormat.formatRange(dayDate(state.range.from), dayDate(state.range.to))
}

export const matchesQuery = (...texts) => !state.query || texts.some((text) => text.toLowerCase().includes(state.query))
