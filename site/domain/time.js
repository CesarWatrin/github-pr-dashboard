// Paris days and working time: every day, bucket and "today" of the dashboard is a Paris day, and every delay counts
// working hours only. Shared by the sync and the page.

export const TIMEZONE = 'Europe/Paris'
export const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
export const MINUTE_MS = 60_000

const parisDayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
// Paris is always a whole number of hours away from UTC: the day only depends on the UTC hour.
/** @type {Map<number, string>} */
const parisDays = new Map()

// The Paris day ('YYYY-MM-DD') of an instant: milliseconds since the epoch, or an ISO date.
/**
 * @param {number | string | Date} value
 * @returns {string}
 */
export function parisDay(value) {
  const hour = Math.floor(new Date(value).getTime() / HOUR_MS)
  if (!parisDays.has(hour)) {
    parisDays.set(hour, parisDayFormat.format(hour * HOUR_MS))
  }

  return /** @type {string} */ (parisDays.get(hour))
}

/**
 * @param {string} day
 * @param {number} days
 */
export function addDays(day, days) {
  return new Date(Date.parse(`${day}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

// The instant a Paris day starts: the first UTC hour that already falls on that day.
/** @param {string} day */
export function parisMidnight(day) {
  let time = Date.parse(`${day}T00:00:00Z`) - 3 * HOUR_MS
  while (parisDay(time) < day) {
    time += HOUR_MS
  }

  return time
}

// Working time, the only time every delay of the dashboard counts: Monday to Friday, from 9 to 18, Paris time. A pull
// request opened on Friday evening and reviewed on Monday morning has not waited the weekend.
export const WORK_DAY_HOURS = 9
const WORK_START_HOUR = 9
const WORK_DAYS_A_WEEK = 5

/** @param {string} day */
const isWorkDay = (day) => ![0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay())
/** @param {string} day */
const dayNumber = (day) => Date.parse(`${day}T00:00:00Z`) / DAY_MS

// The working minutes of a Paris day between two instants, in minutes since the epoch. Clocks only change on Sundays:
// a working day always starts nine hours after its midnight.
/**
 * @param {string} day
 * @param {number} from
 * @param {number} to
 */
function workMinutesOf(day, from, to) {
  if (!isWorkDay(day)) {
    return 0
  }
  const start = parisMidnight(day) / MINUTE_MS + WORK_START_HOUR * 60

  return Math.max(0, Math.min(to, start + WORK_DAY_HOURS * 60) - Math.max(from, start))
}

// The working hours between two instants, in minutes since the epoch.
/**
 * @param {number} from
 * @param {number} to
 */
export function workHoursBetween(from, to) {
  if (to <= from) {
    return 0
  }
  const first = parisDay(from * MINUTE_MS)
  const last = parisDay(to * MINUTE_MS)
  if (first === last) {
    return workMinutesOf(first, from, to) / 60
  }
  let minutes = workMinutesOf(first, from, to) + workMinutesOf(last, from, to)
  // The days in between are whole: seven of them in a row always hold five working days.
  const weeks = Math.floor((dayNumber(last) - dayNumber(first) - 1) / 7)
  minutes += weeks * WORK_DAYS_A_WEEK * WORK_DAY_HOURS * 60
  for (let day = addDays(first, 1 + weeks * 7); day < last; day = addDays(day, 1)) {
    minutes += isWorkDay(day) ? WORK_DAY_HOURS * 60 : 0
  }

  return minutes / 60
}
