// The projects of the period, for the squad and the repositories picked: their life and figures (projectRows() of
// domain/projects.js), worked out once per stats, range, squad and repositories, the share of the team their authors
// are, and what they add up to; and the repositories of the projects of the period, for the repository filter.

import { projectRows, projectsOf, projectSummary } from '../domain/projects.js'
import { inSelection } from './contributors.js'
import { isCurrent, mePeople } from './people.js'
import { periodRange } from './selection.js'
import { activeSquad, scopedRecords, squadKey } from './squads.js'
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
 */

// The projects whose span meets the period, for the squad picked and the pull requests of some repositories (null for
// all of them), worked out once per stats, range, squad and repositories: shown, those of the repositories picked on the
// page; all, those of every repository, which the repository filter lists.
/**
 * @param {'shown' | 'all'} slot
 * @param {Set<string> | null} selection
 * @returns {{ rows: ProjectPeriod[], summary: ReturnType<typeof projectSummary> }}
 */
function periodProjects(slot, selection) {
  const range = periodRange()
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
/** @returns {{ rows: ProjectPeriod[], summary: ReturnType<typeof projectSummary> }} */
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
