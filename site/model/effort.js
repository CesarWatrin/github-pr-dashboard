// Where the code effort goes (domain/effort.js), as the pages read it: over the period for the squad picked, against the
// period compared, bucket by bucket, for each squad and the whole organization, for each person still in the team, and
// for one person or one squad (their dialogs). Worked out once per stats, range and squad. A pull request is of a project
// when the projects page counts it (projectKeyOf(): a branch made by mistake makes none).

import { effortByAuthor, effortOf, effortSeries } from '../domain/effort.js'
import { displayName, isCurrent } from './people.js'
import { projectKeyOf } from './projects.js'
import { comparedRange, periodRange } from './selection.js'
import { scopedRecords, squadKey, squadRecords, squadsOf } from './squads.js'
import { loadedStats } from './state.js'

/** @typedef {import('../domain/effort.js').EffortSummary} EffortSummary */

/** @type {import('../domain/effort.js').OnProject} */
const onProject = (pr) => projectKeyOf(pr) !== null
const options = { onProject }

// What the pages read, worked out once per stats and key (what it is, its range, its squad).
/** @type {WeakMap<Stats, Map<string, unknown>>} */
const efforts = new WeakMap()
/**
 * @template T
 * @param {string} key
 * @param {() => T} compute
 * @returns {T}
 */
function once(key, compute) {
  const stats = loadedStats()
  if (!efforts.has(stats)) {
    efforts.set(stats, new Map())
  }
  const cache = /** @type {Map<string, unknown>} */ (efforts.get(stats))
  if (!cache.has(key)) {
    cache.set(key, compute())
  }

  return /** @type {T} */ (cache.get(key))
}

/** @type {(range: Pick<TimeRange, 'start' | 'end'> & { bucket?: Bucket }) => string} */
const rangeKey = (range) => `${range.start}:${range.end}:${range.bucket ?? ''}`

// Where the effort of the period goes, for the squad picked.
/** @returns {EffortSummary} */
export const currentEffort = () => once(`period:${squadKey()}:${rangeKey(periodRange())}`, () => effortOf(scopedRecords(), periodRange(), options))

// The same over the period compared, null without one.
/** @returns {EffortSummary | null} */
export function comparedEffort() {
  const range = comparedRange()

  return range ? once(`compared:${squadKey()}:${rangeKey(range)}`, () => effortOf(scopedRecords(), range, options)) : null
}

// Bucket by bucket over the period, for the squad picked.
/** @returns {import('../domain/effort.js').EffortPoint[]} */
export const effortChart = () => once(`series:${squadKey()}:${rangeKey(periodRange())}`, () => effortSeries(scopedRecords(), periodRange(), options))

// Each squad over the period, in the order of SQUADS, whatever squad is picked: the pull requests its members opened; and
// the whole organization.
/** @returns {{ squads: (EffortSummary & { name: string })[], organization: EffortSummary }} */
export function squadEfforts() {
  const range = periodRange()

  return once(`squads:${rangeKey(range)}`, () => ({
    squads: squadsOf().map((squad) => ({ name: squad.name, ...effortOf(squadRecords(squad), range, options) })),
    organization: effortOf(loadedStats().pullRequests, range, options),
  }))
}

// Each author of the period, for the squad picked.
/** @returns {Map<string, EffortSummary>} */
const authorEfforts = () => once(`authors:${squadKey()}:${rangeKey(periodRange())}`, () => effortByAuthor(scopedRecords(), periodRange(), options))

// Every person still in the team who opened code pull requests over the period, for the squad picked, the busiest
// first.
/** @returns {(EffortSummary & { login: string })[]} */
export const peopleEfforts = () =>
  [...authorEfforts()]
    .filter(([login]) => isCurrent(login))
    .map(([login, effort]) => ({ login, ...effort }))
    .sort((a, b) => b.code - a.code || displayName(a.login).localeCompare(displayName(b.login), 'fr'))

// Where the effort of a person goes over the period: their dialog. Null without any code pull request.
/** @type {(login: string) => EffortSummary | null} */
export const personEffort = (login) => authorEfforts().get(login) ?? null

// Where the effort of a squad goes over the period, whatever squad is picked: its dialog.
/** @type {(squad: Squad) => EffortSummary} */
export const squadEffort = (squad) => once(`squad:${squad.name}:${rangeKey(periodRange())}`, () => effortOf(squadRecords(squad), periodRange(), options))
