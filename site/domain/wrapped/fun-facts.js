// The fun facts of a year in review (domain/wrapped.js), from its code pull requests: the smallest merged, the quickest
// to merge and the one that waited the longest, the most discussed, the earliest and the latest opened in the day, the
// merges of a Friday evening, and the longest run of working days with a pull request opened. Pure, no DOM. Times in
// minutes since the epoch, durations in minutes on the calendar.

import { addDays, MINUTE_MS, parisDay, TIMEZONE } from '../time.js'

const DAY_MINUTES = 24 * 60
// The day of the fun facts starts at 5: a pull request opened at 1 in the night is the latest of its day, not the
// earliest of the next one.
export const DAY_STARTS_AT = 5 * 60
// A merge on a Friday from this time, Paris time, is one of a Friday evening.
export const FRIDAY_EVENING = 16 * 60

const timeFormat = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

// The time of day of an instant, Paris time, in minutes since midnight.
/** @type {(at: number) => number} */
export function parisTimeOfDay(at) {
  const [hours, minutes] = timeFormat.format(at * MINUTE_MS).split(':').map(Number)

  return hours * 60 + minutes
}

/** @type {(day: string) => number} */
const weekday = (day) => new Date(`${day}T12:00:00Z`).getUTCDay()
/** @type {(day: string) => boolean} */
const isWorkDay = (day) => ![0, 6].includes(weekday(day))

// The smallest of a list, null when it is empty (Math.min() over a spread would break on a long list).
/** @type {(values: number[]) => number | null} */
const least = (values) => values.reduce((best, value) => (best === null || value < best ? value : best), /** @type {number | null} */ (null))
/** @type {(values: number[]) => number | null} */
const most = (values) => values.reduce((best, value) => (best === null || value > best ? value : best), /** @type {number | null} */ (null))

/**
 * What the code pull requests of a year make fun to tell. smallest: the fewest lines of one merged, lines changed at all;
 * fastest and slowest: the least and the most time on the calendar from its opening to its merge; discussed: the most
 * comments of other people on one; earliest and latest: the earliest and the latest time of day one was opened, Paris
 * time, the day starting at DAY_STARTS_AT; fridays: those merged on a Friday from FRIDAY_EVENING. Null when none tells.
 * @param {PullRequestRecord[]} code
 */
export function funFacts(code) {
  const merged = code.filter((pr) => pr.mergedAt !== null)
  /** @type {(pr: PullRequestRecord) => number} */
  const mergedAt = (pr) => /** @type {number} */ (pr.mergedAt)
  const waits = merged.map((pr) => mergedAt(pr) - pr.createdAt)
  const comments = code.map((pr) => pr.interventions.filter(([who]) => who !== pr.author).reduce((total, [, , , count]) => total + count, 0))
  // Shifted so that the day starts at DAY_STARTS_AT, and back.
  const opened = code.map((pr) => (parisTimeOfDay(pr.createdAt) - DAY_STARTS_AT + DAY_MINUTES) % DAY_MINUTES)
  /** @type {(shifted: number | null) => number | null} */
  const unshift = (shifted) => (shifted === null ? null : (shifted + DAY_STARTS_AT) % DAY_MINUTES)
  const discussed = most(comments)

  return {
    smallest: least(merged.map((pr) => pr.lines).filter((lines) => lines > 0)),
    fastest: least(waits),
    slowest: most(waits),
    discussed: discussed ? discussed : null,
    earliest: unshift(least(opened)),
    latest: unshift(most(opened)),
    fridays: merged.filter((pr) => weekday(parisDay(mergedAt(pr) * MINUTE_MS)) === 5 && parisTimeOfDay(mergedAt(pr)) >= FRIDAY_EVENING).length,
  }
}

/** @typedef {ReturnType<typeof funFacts>} FunFacts */

/** @type {(day: string) => string} */
function nextWorkDay(day) {
  let next = addDays(day, 1)
  while (!isWorkDay(next)) {
    next = addDays(next, 1)
  }

  return next
}

// The longest run of working days in a row among Paris days ('YYYY-MM-DD'): a Monday follows the Friday before it, a day
// of a weekend neither counts nor breaks a run.
/** @type {(days: Iterable<string>) => number} */
export function longestStreak(days) {
  let longest = 0
  let run = 0
  /** @type {string | null} */
  let previous = null
  for (const day of [...new Set(days)].filter(isWorkDay).sort()) {
    run = previous !== null && nextWorkDay(previous) === day ? run + 1 : 1
    longest = Math.max(longest, run)
    previous = day
  }

  return longest
}
