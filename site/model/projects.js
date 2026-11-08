// The projects of the period, for the squad picked: their life and figures (projectRows() of domain/projects.js),
// worked out once per stats, range and squad, the share of the team their authors are, and what they add up to.

import { projectRows, projectSummary } from '../domain/projects.js'
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

// The projects whose span meets the period, the earliest started first, with their figures over the period for the
// squad picked, and what they add up to (projectSummary()).
/** @returns {{ rows: ProjectPeriod[], summary: ReturnType<typeof projectSummary> }} */
export function currentProjects() {
  const range = periodRange()
  const stats = loadedStats()
  const key = `${range.start}:${range.end}:${range.bucket}:${squadKey()}`
  if (state.projectsCache?.stats !== stats || state.projectsCache.key !== key) {
    const team = new Set(teamOf())
    const rows = projectRows(scopedRecords(), range, { all: stats.pullRequests, now: Date.parse(stats.generatedAt) }).map((row) => ({
      ...row,
      people: row.authors.length,
      teamShare: team.size ? row.authors.filter((author) => team.has(author.login)).length / team.size : null,
    }))
    state.projectsCache = { stats, key, rows, summary: projectSummary(rows, range) }
  }

  return { rows: state.projectsCache.rows, summary: state.projectsCache.summary }
}

// Whether the stats know any project at all, whatever the period: without, the page says how a project is found.
/** @type {WeakMap<Stats, boolean>} */
const anyProjects = new WeakMap()
/** @returns {boolean} */
export function anyProject() {
  const stats = loadedStats()
  if (!anyProjects.has(stats)) {
    anyProjects.set(stats, stats.pullRequests.some((pr) => pr.project))
  }

  return /** @type {boolean} */ (anyProjects.get(stats))
}
