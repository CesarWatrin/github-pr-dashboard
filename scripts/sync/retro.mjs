// The year in review (« Rétrospective », site/retro.html), as the sync publishes it apart from the stats: only what its
// slides show, worked out once from the stats, for the people of RETRO_YEAR still in the team and for the whole team.
// Never the records: the team that reads it does not see the dashboard. publish.mjs encrypts it with the key of
// RETRO_KEY, which the link of the year in review carries.

import { acsOf } from '../../site/domain/acs.js'
import { projectRows } from '../../site/domain/projects.js'
import { activityBounds, hasLeft } from '../../site/domain/team.js'
import { MINUTE_MS } from '../../site/domain/time.js'
import { activePeople, personYear, RETRO_YEAR, teamYear, yearRange } from '../../site/domain/wrapped.js'

// What the slides list: the first projects, the busiest repositories (the first one, then three more).
export const SHOWN_PROJECTS = 5
export const SHOWN_REPOS = 4

/** @typedef {{ start: number, end: number }} YearRange */

// The projects worked on within the year, each delivered or not within it, by a person or by everyone: delivered first,
// then the most code pull requests of the year.
/**
 * @param {ReturnType<typeof projectRows>} rows the projects whose life meets the year
 * @param {YearRange} range
 * @param {string | null} login
 */
function yearProjects(rows, range, login) {
  const within = (/** @type {number | null} */ at) => at !== null && at * MINUTE_MS >= range.start && at * MINUTE_MS < range.end

  return rows
    .map((row) => ({
      name: row.name,
      status: row.status,
      delivered: row.status === 'delivered' && within(row.deliveredAt),
      code: login ? (row.authors.find((author) => author.login === login)?.code ?? 0) : row.code,
    }))
    .filter((project) => project.code > 0)
    .sort((a, b) => Number(b.delivered) - Number(a.delivered) || b.code - a.code || a.name.localeCompare(b.name))
}

// What the slides read of the projects: how many, how many delivered, the first few (only the delivered ones for the
// team, whose slide is about them).
/**
 * @param {ReturnType<typeof yearProjects>} projects
 * @param {boolean} deliveredOnly
 */
const projectFigures = (projects, deliveredOnly) => ({
  projects: projects.length,
  delivered: projects.filter((project) => project.delivered).length,
  projectList: projects
    .filter((project) => !deliveredOnly || project.delivered)
    .slice(0, SHOWN_PROJECTS)
    .map(({ name, status, delivered }) => ({ name, status, delivered })),
})

/**
 * @param {Stats} stats
 * @param {number} [year]
 * @returns {Retro | null} null before the year starts
 */
export function retroOf(stats, year = RETRO_YEAR) {
  const now = Date.parse(stats.generatedAt)
  const range = yearRange(year, now)
  if (!range) {
    return null
  }
  const records = stats.pullRequests
  const bounds = activityBounds(records)
  /** @type {(login: string) => string} */
  const nameOf = (login) => stats.people[login] ?? login
  const people = [...activePeople(records, range)].filter((login) => !hasLeft(bounds, login, now)).sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
  const rows = projectRows(records, { ...range, bucket: 'month' }, { now })
  const acs = acsOf(records)
  /** @type {(login: string | null) => number} */
  const yearAcs = (login) =>
    acs.filter((ac) => ac.deliveredAt !== null && ac.deliveredAt * MINUTE_MS >= range.start && ac.deliveredAt * MINUTE_MS < range.end && (!login || ac.authors.includes(login)))
      .length
  /** @type {Set<string>} */
  const named = new Set()

  const persons = people.map((login) => {
    const { year: _year, weekdays: _weekdays, repos, reviewedBy, reviewedMost, ...figures } = personYear(records, login, year, range)
    for (const other of [login, reviewedBy[0]?.login, reviewedMost[0]?.login]) {
      if (other) {
        named.add(other)
      }
    }

    return {
      ...figures,
      repos: repos.slice(0, SHOWN_REPOS),
      reviewedBy: reviewedBy[0] ?? null,
      reviewedMost: reviewedMost[0] ?? null,
      ...projectFigures(yearProjects(rows, range, login), false),
      acs: yearAcs(login),
    }
  })
  const { year: _year, weekdays: _weekdays, busiestWeekday: _weekday, biggest: _biggest, repos, ...team } = teamYear(records, year, range)

  return {
    org: stats.org,
    year,
    generatedAt: stats.generatedAt,
    names: Object.fromEntries([...named].filter((login) => nameOf(login) !== login).map((login) => [login, nameOf(login)])),
    people: persons,
    team: { ...team, repos: repos.slice(0, SHOWN_REPOS), ...projectFigures(yearProjects(rows, range, null), true), acs: yearAcs(null) },
  }
}
