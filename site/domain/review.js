// The annual review of the team: over the last twelve whole months, each person still in the team with enough activity
// gets their figures, four marks, an overall mark and a recommendation for the end of the year, with their strengths and
// what to work on; the others are listed apart. Whether the people differ more than chance would make them is tested
// too. Pure: the page works it out from the records. Its parts live in review/.

import { median } from './math.js'
import { REVIEW_MONTHS, reviewMonths } from './review/calendar.js'
import { personFigures } from './review/figures.js'
import { notesOf, teamMedians } from './review/notes.js'
import { overallOf, scorePeople, squadResults } from './review/scores.js'
import { intraclassCorrelation, kruskalWallis } from './review/statistics.js'
import { reviewTallies } from './review/tallies.js'
import { activityBounds, hasLeft } from './team.js'
import { MINUTE_MS, parisDay } from './time.js'

export { REVIEW_MONTHS }

/**
 * @param {Pick<Stats, 'pullRequests' | 'repos' | 'generatedAt' | 'windowStart' | 'requiredApprovals'> & Partial<Pick<Stats, 'squads' | 'firstPullRequests'>>} stats
 */
export function teamReview(stats) {
  const now = Date.parse(stats.generatedAt)
  const months = reviewMonths(now, Date.parse(stats.windowStart))
  const tallies = reviewTallies(stats.pullRequests, months, stats.repos)
  const bounds = activityBounds(stats.pullRequests)
  const current = new Set([...bounds.keys()].filter((login) => !hasLeft(bounds, login, now)))

  const figures = [...tallies.people.values()]
    .filter((tally) => current.has(tally.login) && (tally.code > 0 || tally.reviewed > 0))
    .map((tally) => {
      const activity = /** @type {{ first: number, last: number }} */ (bounds.get(tally.login))
      const first = Math.min(activity.first, stats.firstPullRequests?.[tally.login] ?? Infinity)

      return personFigures(tally, { months, first: parisDay(first * MINUTE_MS), last: parisDay(activity.last * MINUTE_MS) })
    })
  const evaluated = figures.filter((person) => person.evaluated)
  const { people: scored, profiles } = scorePeople(evaluated, { tallies, current })
  const squads = squadResults(stats.squads ?? [], scored)
  const team = teamMedians(scored)

  const people = scored
    .map((person) => {
      const squad = squads.find((row) => row.lead === person.login) ?? null
      const profile = profiles[person.profile]

      return { ...person, squad, ...overallOf(person, squad), ...notesOf(person, team, { requiredApprovals: stats.requiredApprovals, profile, squad }) }
    })
    .sort((a, b) => b.overall - a.overall)

  // Do the people differ? On what they deliver a month, among those of a build profile, whose deliveries compare; on
  // what they review, among everyone.
  const builders = people.filter((person) => person.profile !== 'TMA')
  const units = builders.map((person) => person.series.flatMap((month) => (month ? [month.units] : [])))
  const reviews = people.map((person) => person.series.flatMap((month) => (month ? [month.reviews] : [])))
  const sortedUnits = builders.map((person) => person.unitsMean).sort((a, b) => a - b)
  const quantile = (/** @type {number} */ share) => sortedUnits[Math.round(share * (sortedUnits.length - 1))]
  /** @type {Record<string, ReturnType<typeof kruskalWallis> & { people: number }>} */
  const byCategory = {}
  for (const category of new Set(builders.map((person) => person.category))) {
    const group = builders.filter((person) => person.category === category)
    if (group.length >= 3) {
      byCategory[category] = { people: group.length, ...kruskalWallis(group.map((person) => person.series.flatMap((month) => (month ? [month.units] : [])))) }
    }
  }
  const differences =
    builders.length >= 3
      ? {
          units: kruskalWallis(units),
          reviews: kruskalWallis(reviews),
          unitsShare: intraclassCorrelation(units),
          reviewsShare: intraclassCorrelation(reviews),
          spread: quantile(0.15) > 0 ? quantile(0.85) / quantile(0.15) : null,
          byCategory,
        }
      : null
  const actions = people.reduce((total, person) => total + person.rhythm.grid.flat().reduce((sum, count) => sum + count, 0), 0)
  const workShare = actions
    ? people.reduce((total, person) => total + person.rhythm.work * person.rhythm.grid.flat().reduce((sum, count) => sum + count, 0), 0) / actions
    : null

  return {
    months,
    people,
    others: figures.filter((person) => !person.evaluated),
    squads,
    profiles,
    team,
    differences,
    workShare,
    medianOverall: median(people.map((person) => person.overall)),
  }
}

/** @typedef {ReturnType<typeof teamReview>} TeamReview */
/** @typedef {TeamReview['people'][number]} ReviewedPerson */
