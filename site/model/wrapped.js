// What the year in review shows (« Rétrospective », domain/wrapped.js): the years of the data, the year shown, the people
// of that year still in the team, and a person's or the team's year with its projects, AC and badges, worked out once
// per stats, year and person.

import { projectRows } from '../domain/projects.js'
import { MINUTE_MS, parisDay } from '../domain/time.js'
import { activePeople, dataYears, personYear, teamYear, yearBadges, yearRange } from '../domain/wrapped.js'
import { acsFor } from './acs.js'
import { BADGES, badgeStandings } from './badges.js'
import { displayName, isCurrent } from './people.js'
import { loadedStats, state } from './state.js'

/** @typedef {import('../domain/wrapped.js').PersonYear} PersonYear */
/** @typedef {import('../domain/wrapped.js').TeamYear} TeamYear */
/** @typedef {{ key: string, name: string, status: string, delivered: boolean, code: number }} YearProject */
/** @typedef {(typeof BADGES)[number] & { months: string[] }} YearBadge */

// The last sync: the year in review stops there.
const lastSync = () => Date.parse(loadedStats().generatedAt)

// The years the data covers, the latest first.
export const wrappedYears = () => dataYears(Date.parse(loadedStats().windowStart), lastSync())

// The year shown: the one asked for (state.wrappedYear) when the data covers it, else the current one, or the one before
// in January, when the current one has barely begun.
/** @returns {number} */
export function wrappedYear() {
  const years = wrappedYears()
  if (state.wrappedYear !== null && years.includes(state.wrappedYear)) {
    return state.wrappedYear
  }
  const today = parisDay(lastSync())

  return today.slice(5, 7) === '01' && years.length > 1 ? years[1] : years[0]
}

/** @type {(year: number) => { start: number, end: number }} */
const rangeOf = (year) => /** @type {{ start: number, end: number }} */ (yearRange(year, lastSync()))

// The people still in the team who did anything over the year, by name.
/** @type {(year: number) => string[]} */
export const wrappedPeople = (year) =>
  [...activePeople(loadedStats().pullRequests, rangeOf(year))]
    .filter(isCurrent)
    .sort((a, b) => displayName(a).localeCompare(displayName(b)))

// The projects of the year, from those whose life meets it: each the code pull requests opened over the year (by the
// person, when one is given), and whether it was delivered within the year.
/**
 * @param {number} year
 * @param {string | null} login
 * @returns {YearProject[]}
 */
function yearProjects(year, login) {
  const range = rangeOf(year)
  const within = (/** @type {number | null} */ at) => at !== null && at * MINUTE_MS >= range.start && at * MINUTE_MS < range.end

  return projectRows(loadedStats().pullRequests, { ...range, bucket: 'month' }, { now: lastSync() })
    .map((row) => ({
      key: row.key,
      name: row.name,
      status: row.status,
      delivered: row.status === 'delivered' && within(row.deliveredAt),
      code: login ? (row.authors.find((author) => author.login === login)?.code ?? 0) : row.code,
    }))
    .filter((project) => project.code > 0)
    .sort((a, b) => Number(b.delivered) - Number(a.delivered) || b.code - a.code || a.name.localeCompare(b.name))
}

// The AC delivered within the year, by the person when one is given.
/** @type {(year: number, login: string | null) => number} */
function yearAcs(year, login) {
  const range = rangeOf(year)

  return acsFor(loadedStats().pullRequests).filter(
    (ac) => ac.deliveredAt !== null && ac.deliveredAt * MINUTE_MS >= range.start && ac.deliveredAt * MINUTE_MS < range.end && (!login || ac.authors.includes(login)),
  ).length
}

/** @type {WeakMap<Stats, Map<string, unknown>>} */
const cache = new WeakMap()
/**
 * @template T
 * @param {string} key
 * @param {() => T} work
 * @returns {T}
 */
function cached(key, work) {
  const stats = loadedStats()
  if (!cache.has(stats)) {
    cache.set(stats, new Map())
  }
  const byKey = /** @type {Map<string, unknown>} */ (cache.get(stats))
  if (!byKey.has(key)) {
    byKey.set(key, work())
  }

  return /** @type {T} */ (byKey.get(key))
}

// A person's year: their figures (personYear()), their projects, the AC they delivered, and the badges they won over its
// months.
/** @type {(login: string, year: number) => PersonYear & { projects: YearProject[], acs: number, badges: YearBadge[] }} */
export const wrappedPerson = (login, year) =>
  cached(`person:${login}:${year}`, () => ({
    ...personYear(loadedStats().pullRequests, login, year, rangeOf(year)),
    projects: yearProjects(year, login),
    acs: yearAcs(year, login),
    badges: yearBadges(badgeStandings().leaders, login, year).flatMap(({ key, months }) => {
      const badge = BADGES.find((other) => other.key === key)

      return badge ? [{ ...badge, months }] : []
    }),
  }))

// The team's year: its figures (teamYear()), its projects and the AC delivered.
/** @type {(year: number) => TeamYear & { projects: YearProject[], acs: number }} */
export const wrappedTeam = (year) =>
  cached(`team:${year}`, () => ({
    ...teamYear(loadedStats().pullRequests, year, rangeOf(year)),
    projects: yearProjects(year, null),
    acs: yearAcs(year, null),
  }))
