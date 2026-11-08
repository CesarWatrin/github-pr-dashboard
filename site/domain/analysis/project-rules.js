// The rules of the analysis about the projects (domain/projects.js): those that stalled, and the time the delivered ones
// waited between the end of their code and their delivery.

import { CLEAR, FEW, found, median, round } from './measures.js'
import { MIN_DELIVERED_PROJECTS, MIN_PROJECTS, SLOW_INTEGRATION_HOURS, STALLED_PROJECTS_HIGH_SHARE, TOP_ROWS } from './thresholds.js'
/** @import { Context, ProjectRow } from './measures.js' */

// What a finding tells of a project: what names it (its key, its name and the month it started when the name served
// several projects), its status, its last activity, its code pull requests still open and its integration.
/** @param {ProjectRow} row */
const projectFacts = ({ key, name, runs, start, status, lastActivity, open, integrationHours }) => ({
  key,
  name,
  runs,
  start,
  status,
  lastActivity,
  open,
  integrationHours,
})

// The projects of the range that stalled at the last sync (STALLED_AFTER_DAYS without anything done, not delivered), over
// MIN_PROJECTS projects at least: a priority from half of them. The longest stalled first.
/** @param {Context} context */
export function stalledProjectsRule({ projects }) {
  const { rows } = projects()
  if (rows.length < MIN_PROJECTS) {
    return FEW
  }
  const stalled = rows.filter((row) => row.status === 'stalled')
  if (stalled.length === 0) {
    return CLEAR
  }
  const share = stalled.length / rows.length

  return found(share >= STALLED_PROJECTS_HIGH_SHARE ? 'high' : 'watch', {
    count: stalled.length,
    total: rows.length,
    share: round(share, 3),
    open: stalled.reduce((total, row) => total + row.open, 0),
    projects: stalled
      .toSorted((a, b) => a.lastActivity - b.lastActivity)
      .slice(0, TOP_ROWS)
      .map(projectFacts),
  })
}

// The integration of the projects delivered within the range, from their last code pull request merged to the last merge
// of their branch, in working hours: slow from SLOW_INTEGRATION_HOURS in median, over MIN_DELIVERED_PROJECTS at least.
// The slowest first.
/** @param {Context} context */
export function integrationRule({ projects }) {
  const timed = projects().delivered.filter((row) => row.integrationHours !== null)
  if (timed.length < MIN_DELIVERED_PROJECTS) {
    return FEW
  }
  const medianHours = /** @type {number} */ (median(timed.map((row) => /** @type {number} */ (row.integrationHours))))
  if (medianHours < SLOW_INTEGRATION_HOURS) {
    return CLEAR
  }

  return found('watch', {
    count: timed.length,
    medianHours: round(medianHours),
    projects: timed
      .toSorted((a, b) => Number(b.integrationHours) - Number(a.integrationHours))
      .slice(0, TOP_ROWS)
      .map(projectFacts),
  })
}
