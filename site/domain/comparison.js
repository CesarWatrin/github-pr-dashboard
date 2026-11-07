// The range a period is compared to: the one right before, or the same days a year earlier.

import { addDays, DAY_MS, parisDay, parisMidnight } from './time.js'

// What a period can be compared to: the range of the same length right before it ('previous'), or the same Paris days
// and hours one year earlier ('year'). A range of whole Paris days moves by whole days, whatever the changes of time
// in between. Null for another mode, or when the data does not cover it: the window counts years of 365 days, so the
// same days three calendar years earlier may start one day before the data, and the range then starts with the data.
/**
 * @param {TimeRange} range
 * @param {string} mode
 * @param {number} dataStart
 * @returns {TimeRange | null}
 */
export function comparisonRange({ start, end, bucket }, mode, dataStart) {
  /** @type {TimeRange} */
  let range
  if (mode === 'previous') {
    const firstDay = parisDay(start)
    const wholeDays = parisMidnight(firstDay) === start && parisMidnight(parisDay(end)) === end
    const earlierStart = wholeDays ? parisMidnight(addDays(firstDay, -Math.round((end - start) / DAY_MS))) : start - (end - start)
    range = { start: earlierStart, end: start, bucket }
  } else if (mode === 'year') {
    range = { start: yearEarlier(start), end: yearEarlier(end), bucket }
  } else {
    return null
  }
  if (range.start < dataStart - DAY_MS) {
    return null
  }

  return { ...range, start: Math.max(range.start, dataStart) }
}

// Whether two ranges cover the same days, within one: the year before 12 months is the 12 months before, a 29 February
// between them aside. Null, a range the data does not cover, matches nothing.
/**
 * @param {TimeRange | null} a
 * @param {TimeRange | null} b
 */
export function sameDays(a, b) {
  return a !== null && b !== null && Math.abs(a.start - b.start) <= DAY_MS && Math.abs(a.end - b.end) <= DAY_MS
}

// Whether the range a period is compared to, before it, shares more than a day with it: the same period last year of
// a period longer than a year takes back part of it, and both sides would count the same pull requests.
/**
 * @param {TimeRange} range
 * @param {TimeRange | null} compared
 */
export function overlapsPeriod(range, compared) {
  return compared !== null && compared.end - range.start > DAY_MS
}

// The same time of the same Paris day, one year earlier: 29 February falls on the 28th.
/** @param {number} time */
function yearEarlier(time) {
  const day = parisDay(time)
  const [year, month, date] = day.split('-')
  const earlier = `${Number(year) - 1}-${month}-${month === '02' && date === '29' ? '28' : date}`

  return parisMidnight(earlier) + (time - parisMidnight(day))
}
