// The squads of the stats, and the one picked in the filters: the pull requests the pages count.

import { computePeriod } from '../domain/period.js'
import { currentRoute, ROUTES } from './routes.js'
import { loadedStats, state } from './state.js'

// The squads of the stats (SQUADS of the sync), none without them. The one picked in the filters scopes the pages to the
// pull requests its members opened; the pages without filters (the report, the badges, « Mes PR ») never are.
/** @type {() => Squad[]} */
export const squadsOf = () => state.stats?.squads ?? []

/** @returns {Squad | null} */
export function activeSquad() {
  if (!state.squad || ROUTES[currentRoute()].filters === false) {
    return null
  }

  return squadsOf().find((squad) => squad.name === state.squad) ?? null
}

/** @type {() => string} */
export const squadKey = () => activeSquad()?.name ?? ''
// The pull requests the page counts: those of the squad picked, else all of them.
/** @type {() => PullRequestRecord[]} */
export const scopedRecords = () => squadRecords(activeSquad())
// Whether a person belongs to the squad picked, always true without one.
/** @type {(login: string) => boolean} */
export const inSquad = (login) => activeSquad()?.members.includes(login) ?? true

// The pull requests the members of a squad opened, worked out once per stats; all of them without a squad.
/**
 * @param {Squad | null} squad
 * @returns {PullRequestRecord[]}
 */
export function squadRecords(squad) {
  const stats = loadedStats()
  if (!squad) {
    return stats.pullRequests
  }
  if (state.squadRecordsCache?.stats !== stats) {
    state.squadRecordsCache = { stats, records: new Map() }
  }
  const { records } = state.squadRecordsCache
  if (!records.has(squad.name)) {
    const members = new Set(squad.members)
    records.set(
      squad.name,
      stats.pullRequests.filter((pr) => members.has(pr.author)),
    )
  }

  return /** @type {PullRequestRecord[]} */ (records.get(squad.name))
}

// The stats of a squad, '*' for the whole organization, over a range, worked out once per stats, squad and range.
/**
 * @param {string} name
 * @param {PullRequestRecord[]} records
 * @param {TimeRange} range
 * @returns {PeriodStats}
 */
export function squadPeriod(name, records, range) {
  if (state.squadPeriodsCache?.stats !== state.stats) {
    state.squadPeriodsCache = { stats: state.stats, periods: new Map() }
  }
  const { periods } = state.squadPeriodsCache
  const key = `${name}:${range.start}:${range.end}:${range.bucket}`
  if (!periods.has(key)) {
    periods.set(key, computePeriod(records, range))
  }

  return /** @type {PeriodStats} */ (periods.get(key))
}
