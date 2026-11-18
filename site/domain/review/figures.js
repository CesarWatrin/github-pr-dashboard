// The figures of each person of the annual review, from their tallies: the months they count over, what they delivered
// month by month with how sure that is, how their pull requests flowed, how they reviewed, the rhythm of their weeks.

import { median } from '../math.js'
import { bootstrapInterval, mean } from './statistics.js'
import { workingDaysOf } from './calendar.js'

// Enough to judge: months of activity, and code pull requests over them.
export const MIN_MONTHS = 4
export const MIN_CODE = 10
// The share of hotfixes among the code pull requests that makes a person a profile of maintenance (TMA), or a mixed one.
export const TMA_SHARE = 0.5
export const MIXED_SHARE = 0.3
// Someone who arrived by this day of a month counts it.
const ARRIVAL_DAY = 5

/** @typedef {'Build' | 'Mixte' | 'TMA'} Profile */
/** @typedef {import('./tallies.js').PersonTally} PersonTally */

// When a person stands in the week: the share of their actions on working hours (9 to 18, Monday to Friday), on the
// edges of the day (7 to 9, 18 to 21), at night, on weekends; the hours of their typical day; each hour of the week.
/** @param {PersonTally} tally */
function rhythmOf(tally) {
  const total = tally.grid.flat().reduce((sum, count) => sum + count, 0) || 1
  let work = 0
  let edges = 0
  let night = 0
  let weekend = 0
  tally.grid.forEach((hours, weekday) =>
    hours.forEach((count, hour) => {
      if (weekday >= 5) {
        weekend += count
      } else if (hour >= 9 && hour < 18) {
        work += count
      } else if ((hour >= 7 && hour < 9) || (hour >= 18 && hour < 21)) {
        edges += count
      } else {
        night += count
      }
    }),
  )

  return { work: work / total, edges: edges / total, night: night / total, weekend: weekend / total, grid: tally.grid }
}

/**
 * @param {PersonTally} tally
 * @param {{ months: string[], first: string, last: string }} span the months of the review, the first and last days of
 *   activity of the person
 */
export function personFigures(tally, { months, first, last }) {
  const arrival = first.slice(0, 7)
  const active = months.filter((month) => (month > arrival || (month === arrival && Number(first.slice(8)) <= ARRIVAL_DAY)) && month <= last.slice(0, 7))
  const hotfixShare = tally.code ? tally.hotfixes / tally.code : 0
  /** @type {Profile} */
  const profile = hotfixShare >= TMA_SHARE ? 'TMA' : hotfixShare >= MIXED_SHARE ? 'Mixte' : 'Build'
  const units = active.map((month) => tally.months[month].units)
  const hotfixes = active.map((month) => tally.months[month].hotfixes)
  const reviews = active.map((month) => tally.months[month].reviews)
  const merged = active.map((month) => tally.months[month].merged)
  const seed = [...tally.login].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7)
  // What a profile delivers: hotfixes for the TMA, units of work for the others.
  const delivered = profile === 'TMA' ? hotfixes : units
  const unitsMean = mean(units)
  const activeMonths = new Set(active)
  const availableDays = active.reduce((total, month) => total + workingDaysOf(month), 0)
  const activeDays = [...tally.days].filter((day) => activeMonths.has(day.slice(0, 7))).length
  const variation = unitsMean ? Math.sqrt(mean(units.map((value) => (value - unitsMean) ** 2))) / unitsMean : 0

  return {
    login: tally.login,
    first,
    months: active.length,
    evaluated: active.length >= MIN_MONTHS && tally.code >= MIN_CODE,
    profile,
    hotfixShare,
    categories: tally.categories,
    category: /** @type {Category} */ (Object.entries(tally.categories).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'other'),
    code: tally.code,
    merged: tally.merged,
    hotfixes: tally.hotfixes,
    added: tally.added,
    deleted: tally.deleted,
    effort: tally.effort,
    projects: tally.projects.size,
    acs: tally.acs.size,
    // Month by month, over the months of the review: null before the person arrived.
    series: months.map((month) => (activeMonths.has(month) ? tally.months[month] : null)),
    unitsMean,
    hotfixesMean: mean(hotfixes),
    mergedMean: mean(merged),
    deliveredMean: mean(delivered),
    deliveredInterval: bootstrapInterval(delivered, { seed }),
    reviewsMean: mean(reviews),
    reviewsInterval: bootstrapInterval(reviews, { seed: seed + 1 }),
    variation,
    mergeHours: median(tally.mergeHours),
    hotfixMergeHours: median(tally.hotfixMergeHours),
    firstReviewHours: median(tally.firstReviewHours),
    size: median(tally.sizes),
    unreviewedShare: tally.merged ? tally.unreviewed / tally.merged : 0,
    closedShare: tally.code ? tally.closed / tally.code : 0,
    failedShare: tally.merged ? tally.failed / tally.merged : 0,
    reviewed: tally.reviewed,
    commentsPerReview: tally.reviewed ? tally.reviewComments / tally.reviewed : 0,
    silentShare: tally.approvals ? tally.silentApprovals / tally.approvals : null,
    changesRequested: tally.changesRequested,
    reviewHours: median(tally.reviewHours),
    mergesOfOthers: tally.mergesOfOthers,
    availableDays,
    activeDays,
    presence: availableDays ? activeDays / availableDays : 0,
    unitsPerDay: activeDays ? units.reduce((total, value) => total + value, 0) / activeDays : 0,
    rhythm: rhythmOf(tally),
  }
}

/** @typedef {ReturnType<typeof personFigures>} PersonFigures */
