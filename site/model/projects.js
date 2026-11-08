// The projects of the period, for the squad and the repositories picked: their life and figures (projectRows() of
// domain/projects.js), worked out once per stats, range, squad and repositories, the share of the team their authors
// are, and what they add up to; the repositories of the projects of the period, for the repository filter; and what the
// other pages read of them: the totals of the overview and of the period compared, the chart of the overview, the
// projects of each person and of each squad, and the project of a pull request.

import { projectRows, projectsOf, projectSummary } from '../domain/projects.js'
import { projectSeries } from '../domain/projects/series.js'
import { inSelection } from './contributors.js'
import { isCurrent, mePeople } from './people.js'
import { comparedPeriod, comparedRange, currentPeriod, periodRange } from './selection.js'
import { activeSquad, scopedRecords, squadKey, squadRecords } from './squads.js'
import { loadedStats, state } from './state.js'

// The people a project's authors are a share of: those of the squad picked, else the whole team, people who left aside.
/** @returns {string[]} */
function teamOf() {
  const squad = activeSquad()

  return squad ? squad.members.filter(isCurrent) : mePeople()
}

/**
 * A project of the period, and the share of the team (or of the squad picked) its authors still in it are.
 * @typedef {import('../domain/projects.js').ProjectRow & { people: number, teamShare: number | null }} ProjectPeriod
 * @typedef {ReturnType<typeof projectSummary>} ProjectSummary
 */

// The projects whose span meets a range (the period by default), for the squad picked and the pull requests of some
// repositories (null for all of them), worked out once per stats, range, squad and repositories: shown, those of the
// repositories picked on the projects page; all, those of every repository, which the repository filter, the overview
// and the dialogs read; team, those of the repositories picked on the team page; compared, those of the period compared.
/**
 * @param {'shown' | 'all' | 'team' | 'compared'} slot
 * @param {Set<string> | null} selection
 * @param {TimeRange} [range]
 * @returns {{ rows: ProjectPeriod[], summary: ProjectSummary }}
 */
function periodProjects(slot, selection, range = periodRange()) {
  const stats = loadedStats()
  const repos = selection ? [...selection].sort().join(',') : '*'
  const key = `${range.start}:${range.end}:${range.bucket}:${squadKey()}:${repos}`
  const cached = state.projectsCache?.[slot]
  if (cached?.stats === stats && cached.key === key) {
    return cached
  }
  const team = new Set(teamOf())
  const records = scopedRecords().filter((pr) => inSelection(selection, pr.repo))
  const rows = projectRows(records, range, { all: stats.pullRequests, now: Date.parse(stats.generatedAt) }).map((row) => ({
    ...row,
    people: row.authors.length,
    teamShare: team.size ? row.authors.filter((author) => team.has(author.login)).length / team.size : null,
  }))
  const entry = { stats, key, rows, summary: projectSummary(rows, range) }
  state.projectsCache = { ...state.projectsCache, [slot]: entry }

  return entry
}

// The projects whose span meets the period, the earliest started first, with their figures over the period for the
// squad and the repositories picked, and what they add up to (projectSummary()).
/** @returns {{ rows: ProjectPeriod[], summary: ProjectSummary }} */
export function currentProjects() {
  return periodProjects('shown', state.repos.projects)
}

// The repositories of the projects of the period, whatever the repositories picked, each with the code pull requests of
// these projects opened over the period: what the repository filter of the page lists.
/** @returns {Map<string, number>} */
export function projectRepoCounts() {
  /** @type {Map<string, number>} */
  const counts = new Map()
  for (const row of periodProjects('all', null).rows) {
    for (const [repo, code] of row.repos) {
      counts.set(repo, (counts.get(repo) ?? 0) + code)
    }
  }

  return counts
}

// The projects whose span meets the period, every repository, for the squad picked: the overview lists them.
export const projectsOfPeriod = () => periodProjects('all', null).rows

// The code pull requests people opened over a period, in every repository.
/** @type {(period: PeriodStats) => number} */
const codeOf = (period) => period.authors.reduce((total, person) => total + Object.values(person.repos).reduce((sum, stats) => sum + stats.code, 0), 0)

// What the projects (or the AC) of a range add up to, with the share of the code pull requests of the range they carry
// (codeShare).
/**
 * @template {{ code: number }} Summary
 * @param {Summary} summary
 * @param {PeriodStats} period
 */
export const withCodeShare = (summary, period) => {
  const code = codeOf(period)

  return { ...summary, codeShare: code ? summary.code / code : null }
}

// What the projects of the period add up to, every repository, for the squad picked: the tiles of the overview.
export const projectTotals = () => withCodeShare(periodProjects('all', null).summary, currentPeriod())

// The same over the period compared, null without one.
export function comparedProjectTotals() {
  const range = comparedRange()
  const period = comparedPeriod()

  return range && period ? withCodeShare(periodProjects('compared', null, range).summary, period) : null
}

// The projects of the period bucket by bucket, every repository, for the squad picked: the chart of the overview.
export const projectChart = () => projectSeries(periodProjects('all', null).rows, periodRange())

/**
 * A project a person or a squad wrote code for over the period, and how many code pull requests.
 * @typedef {{ row: ProjectPeriod, code: number }} ProjectShare
 */

// The projects each person wrote code for over the period, in the repositories picked on the team page, the busiest
// first: their cards and dialogs.
/** @type {WeakMap<ProjectPeriod[], Map<string, ProjectShare[]>>} */
const byAuthor = new WeakMap()
/** @type {(login: string) => ProjectShare[]} */
export function personProjects(login) {
  const { rows } = periodProjects('team', state.repos.team)
  if (!byAuthor.has(rows)) {
    /** @type {Map<string, ProjectShare[]>} */
    const people = new Map()
    for (const row of rows) {
      for (const author of row.authors) {
        people.set(author.login, [...(people.get(author.login) ?? []), { row, code: author.code }])
      }
    }
    for (const shares of people.values()) {
      shares.sort((a, b) => b.code - a.code || a.row.start - b.row.start)
    }
    byAuthor.set(rows, people)
  }

  return /** @type {Map<string, ProjectShare[]>} */ (byAuthor.get(rows)).get(login) ?? []
}

// The projects with code pull requests in a repository over the period, for the squad picked, the busiest there first:
// its dialog.
/** @type {(repo: string) => ProjectShare[]} */
export const repositoryProjects = (repo) =>
  periodProjects('all', null)
    .rows.flatMap((row) => {
      const code = row.repos.find(([other]) => other === repo)?.[1] ?? 0

      return code > 0 ? [{ row, code }] : []
    })
    .sort((a, b) => b.code - a.code || a.row.start - b.row.start)

// The projects the members of a squad wrote code for over the period, whatever squad is picked, the busiest first, each
// with the code pull requests of the squad; worked out once per stats, squad and range.
/** @type {WeakMap<Stats, Map<string, ProjectShare[]>>} */
const bySquad = new WeakMap()
/** @type {(squad: Squad) => ProjectShare[]} */
export function squadProjects(squad) {
  const stats = loadedStats()
  const range = periodRange()
  const key = `${squad.name}:${range.start}:${range.end}`
  if (!bySquad.has(stats)) {
    bySquad.set(stats, new Map())
  }
  const squads = /** @type {Map<string, ProjectShare[]>} */ (bySquad.get(stats))
  if (!squads.has(key)) {
    const rows = projectRows(squadRecords(squad), range, { all: stats.pullRequests, now: Date.parse(stats.generatedAt) })
    squads.set(
      key,
      rows
        .filter((row) => row.code > 0)
        .map((row) => ({ row: { ...row, people: row.authors.length, teamShare: null }, code: row.code }))
        .sort((a, b) => b.code - a.code || a.row.start - b.row.start),
    )
  }

  return /** @type {ProjectShare[]} */ (squads.get(key))
}

// The key of the project of each pull request (projectsOf(): a branch made by mistake has none), worked out once per stats.
/** @type {WeakMap<Stats, Map<PullRequestRecord, string>>} */
const projectKeys = new WeakMap()
/** @type {(pr: PullRequestRecord) => string | null} */
export function projectKeyOf(pr) {
  const stats = loadedStats()
  if (!projectKeys.has(stats)) {
    projectKeys.set(stats, new Map(projectsOf(stats.pullRequests).flatMap((project) => project.records.map((record) => [record, project.key]))))
  }

  return /** @type {Map<PullRequestRecord, string>} */ (projectKeys.get(stats)).get(pr) ?? null
}

// A project by its key, for its dialog opened from anywhere: among the projects of the period, every repository, for the
// squad picked, with the others to set it against; else over the whole data (whole), for a project the period misses.
/**
 * @param {string} key
 * @returns {{ row: ProjectPeriod, rows: ProjectPeriod[], whole: boolean } | null}
 */
export function projectOf(key) {
  const { rows } = periodProjects('all', null)
  const row = rows.find((other) => other.key === key)
  if (row) {
    return { row, rows, whole: false }
  }
  const stats = loadedStats()
  const whole = projectRows(stats.pullRequests, { start: Date.parse(stats.windowStart), end: Date.parse(stats.generatedAt), bucket: 'month' }, { now: Date.parse(stats.generatedAt) }).map(
    (other) => ({ ...other, people: other.authors.length, teamShare: null }),
  )
  const found = whole.find((other) => other.key === key)

  return found ? { row: found, rows: whole, whole: true } : null
}

// Whether the stats know any project at all (projectsOf(): one with a few code pull requests), whatever the period:
// without, the page says how a project is found.
/** @type {WeakMap<Stats, boolean>} */
const anyProjects = new WeakMap()
/** @returns {boolean} */
export function anyProject() {
  const stats = loadedStats()
  if (!anyProjects.has(stats)) {
    anyProjects.set(stats, projectsOf(stats.pullRequests).length > 0)
  }

  return /** @type {boolean} */ (anyProjects.get(stats))
}
