// The calendar of the annual review: its months, the French public holidays, the working days of a month, and where an
// instant falls in the week, Paris time.

import { DAY_MS, TIMEZONE, parisDay } from '../time.js'

const HOUR_MS = 3_600_000
// How many whole months the review covers.
export const REVIEW_MONTHS = 12

// The whole months before the one of `now`, the oldest first, those the data covers whole only.
/**
 * @param {number} now
 * @param {number} [dataStart]
 * @returns {string[]}
 */
export function reviewMonths(now, dataStart = -Infinity) {
  const [year, month] = parisDay(now).split('-').map(Number)
  const months = []
  for (let back = REVIEW_MONTHS; back >= 1; back--) {
    const date = new Date(Date.UTC(year, month - 1 - back, 1))
    const key = date.toISOString().slice(0, 7)
    if (Date.parse(`${key}-01T00:00:00Z`) >= dataStart) {
      months.push(key)
    }
  }

  return months
}

// Easter Sunday of a year (the anonymous Gregorian algorithm), as 'YYYY-MM-DD'.
/** @param {number} year */
function easter(year) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * @param {string} day
 * @param {number} days
 */
const shift = (day, days) => new Date(Date.parse(`${day}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)

// The French public holidays of a year: Easter Monday, Ascension Day and Whit Monday follow Easter.
/** @param {number} year */
export function frenchHolidays(year) {
  const sunday = easter(year)

  return new Set([
    ...['01-01', '05-01', '05-08', '07-14', '08-15', '11-01', '11-11', '12-25'].map((day) => `${year}-${day}`),
    shift(sunday, 1),
    shift(sunday, 39),
    shift(sunday, 50),
  ])
}

// The working days of a month: Monday to Friday, public holidays aside.
/** @param {string} month 'YYYY-MM' */
export function workingDaysOf(month) {
  const [year, number] = month.split('-').map(Number)
  const holidays = frenchHolidays(year)
  const days = new Date(Date.UTC(year, number, 0)).getUTCDate()
  let count = 0
  for (let day = 1; day <= days; day++) {
    const date = `${month}-${String(day).padStart(2, '0')}`
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
    if (weekday !== 0 && weekday !== 6 && !holidays.has(date)) {
      count++
    }
  }

  return count
}

const clockFormat = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, weekday: 'short', hour: '2-digit', hourCycle: 'h23' })
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
/** @type {Map<number, { weekday: number, hour: number }>} */
const clocks = new Map()

// Where an instant (milliseconds) falls in the week, Paris time: its day, 0 for Monday to 6 for Sunday, its hour and its
// minutes as a fraction of an hour. Paris is a whole number of hours away from UTC: the day and hour only depend on the
// UTC hour.
/** @param {number} time */
export function parisClock(time) {
  const hour = Math.floor(time / HOUR_MS)
  let clock = clocks.get(hour)
  if (!clock) {
    const parts = Object.fromEntries(clockFormat.formatToParts(hour * HOUR_MS).map((part) => [part.type, part.value]))
    clock = { weekday: WEEKDAYS.indexOf(parts.weekday), hour: Number(parts.hour) }
    clocks.set(hour, clock)
  }

  return { ...clock, time: clock.hour + (time % HOUR_MS) / HOUR_MS }
}
