// The AC of the stats (acsOf() of domain/acs.js), worked out once per list of records (the stats, or a squad's), and what
// the pages read of them over the period, for the squad picked: what they add up to (and over the period compared), bucket
// by bucket, those delivered by repository, person, squad and size; and those of a person and of a squad.

import { acSeries, acSizes, acsOf, acSummary, deliveredBy } from '../domain/acs.js'
import { isCurrent } from './people.js'
import { withCodeShare } from './projects.js'
import { comparedPeriod, comparedRange, currentPeriod, periodRange } from './selection.js'
import { scopedRecords, squadRecords, squadsOf } from './squads.js'
import { loadedStats } from './state.js'

// The busiest repositories and people the page shows.
export const AC_TOP = 10

/** @typedef {import('../domain/acs.js').Ac} Ac */

// The AC of a list of records, worked out once per list: the stats keep theirs, and each squad its own (squadRecords()).
/** @type {WeakMap<PullRequestRecord[], Ac[]>} */
const acsByRecords = new WeakMap()
/** @type {(records: PullRequestRecord[]) => Ac[]} */
export function acsFor(records) {
  if (!acsByRecords.has(records)) {
    acsByRecords.set(records, acsOf(records))
  }

  return /** @type {Ac[]} */ (acsByRecords.get(records))
}

// The AC of the pull requests the page counts: those of the squad picked, else all of them.
export const currentAcs = () => acsFor(scopedRecords())

// What the AC of the period add up to, for the squad picked, with the share of the code pull requests they are.
export const acTotals = () => withCodeShare(acSummary(currentAcs(), periodRange()), currentPeriod())

// The same over the period compared, null without one.
export function comparedAcTotals() {
  const range = comparedRange()
  const period = comparedPeriod()

  return range && period ? withCodeShare(acSummary(currentAcs(), range), period) : null
}

// The AC started and delivered bucket by bucket over the period.
export const acChart = () => acSeries(currentAcs(), periodRange())

// Those delivered over the period, the most first: by repository and by person still in the team (AC_TOP of each), by
// squad (each counting the AC of its members' pull requests), and by size (the buckets of the dashboard, smallest first).
export function acBreakdown() {
  const acs = currentAcs()
  const range = periodRange()

  return {
    repos: deliveredBy(acs, range, (ac) => ac.repos).slice(0, AC_TOP),
    people: deliveredBy(acs, range, (ac) => ac.authors.filter(isCurrent)).slice(0, AC_TOP),
    squads: squadsOf()
      .map((squad) => /** @type {[string, number]} */ ([squad.name, acSummary(acsFor(squadRecords(squad)), range).delivered]))
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    sizes: acSizes(acs, range),
  }
}

// What the AC of a person add up to over the period: those they opened a pull request of.
/** @type {(login: string) => import('../domain/acs.js').AcSummary} */
export const personAcs = (login) =>
  acSummary(
    currentAcs().filter((ac) => ac.authors.includes(login)),
    periodRange(),
  )

// What the AC of a squad add up to over the period, whatever squad is picked: those of its members' pull requests.
/** @type {(squad: Squad) => import('../domain/acs.js').AcSummary} */
export const squadAcs = (squad) => acSummary(acsFor(squadRecords(squad)), periodRange())

// Whether the stats know any AC at all, whatever the period: without, the page says how one is found.
/** @type {WeakMap<Stats, boolean>} */
const anyAcs = new WeakMap()
/** @returns {boolean} */
export function anyAc() {
  const stats = loadedStats()
  if (!anyAcs.has(stats)) {
    anyAcs.set(stats, acsFor(stats.pullRequests).length > 0)
  }

  return /** @type {boolean} */ (anyAcs.get(stats))
}
