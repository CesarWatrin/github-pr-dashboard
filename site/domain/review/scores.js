// The four marks of each person of the annual review, from 0 to 100, as ranks among the people evaluated: productivity
// (all their work together, hotfixWorthOf()), efficiency, collaboration and importance; the overall mark, a head of squad also
// judged on the results of their squad; and the level that follows.

import { median } from '../math.js'
import { bootstrapInterval, mean, rankShares } from './statistics.js'
import { seedOf } from './figures.js'

// A reviewer someone depends on reviews at least this share of their code pull requests, among those with enough.
export const DEPENDENCY_SHARE = 0.3
export const DEPENDENCY_MIN_CODE = 10
// A repository rests on a person who wrote at least this share of its code pull requests, among those with enough.
export const OWNER_SHARE = 0.4
export const OWNER_MIN_CODE = 10
// How many of the authors a person reviews the most count for how focused their reviews are.
export const REVIEWED_MOST = 3
// What a hotfix is worth in units of work when nothing tells it: one, a pull request of 100 lines.
export const DEFAULT_HOTFIX_WORTH = 1

/** @typedef {import('./tallies.js').MonthTally} MonthTally */

// What a hotfix is worth in units of work, so that everyone is judged on all their work together (projects, AC, TMA and
// the rest): a month of the TMA as much as a month of building. The median units a month of the projects, the AC and the
// rest of those outside the TMA, for the median hotfixes a month of those in it (profile TMA); DEFAULT_HOTFIX_WORTH
// without either.
/** @param {Pick<PersonFigures, 'profile' | 'workMean'>[]} people */
export function hotfixWorthOf(people) {
  const tma = people.filter((person) => person.profile === 'TMA')
  const others = people.filter((person) => person.profile !== 'TMA')
  const hotfixes = median(tma.map((person) => person.workMean.tma)) ?? 0
  const units = median(others.map(({ workMean }) => workMean.projects + workMean.acs + workMean.rest)) ?? 0

  return hotfixes && units ? units / hotfixes : DEFAULT_HOTFIX_WORTH
}

// What a person delivered each month they count, in units of work: their projects, AC and the rest, and their hotfixes
// at what they are worth (hotfixWorthOf()); null before their arrival.
/**
 * @param {Pick<PersonFigures, 'series'>} person
 * @param {number} hotfixWorth
 */
export const deliveredSeriesOf = (person, hotfixWorth) =>
  person.series.map((month) => (month ? month.work.projects + month.work.acs + month.work.rest + hotfixWorth * month.work.tma : null))

// A share of pull requests merged without any review from which the level stays at « meets expectations » at most.
export const UNREVIEWED_LIMIT = 0.25
// The overall marks from which a person's level is exceptional, above or meeting expectations; below them, under.
export const EXCEPTIONAL_FROM = 72
export const ABOVE_FROM = 58
export const MEETS_FROM = 42
// Heads of squad: a squad that leads from this mark, or lags under that one.
export const SQUAD_LEADS_FROM = 60
export const SQUAD_LAGS_UNDER = 40

/** @typedef {'exceptional' | 'above' | 'meets' | 'below'} Verdict */
/** @typedef {import('./figures.js').PersonFigures} PersonFigures */

/**
 * Ranks each person on a figure among a group, 0 to 100 once weighed.
 * @template {object} T
 * @param {T[]} group
 * @param {(item: T) => number | null} read
 * @param {{ lowerIsBetter?: boolean }} [options]
 */
function ranks(group, read, { lowerIsBetter = false } = {}) {
  const shares = rankShares(group.map(read))

  return new Map(group.map((item, index) => [item, lowerIsBetter ? 1 - shares[index] : shares[index]]))
}

/**
 * @template {object} T
 * @param {[Map<T, number>, number][]} parts
 * @param {T} item
 */
const weigh = (parts, item) => Math.round(100 * parts.reduce((total, [rank, weight]) => total + weight * (rank.get(item) ?? 0.5), 0))

/**
 * @param {PersonFigures[]} evaluated
 * @param {{ tallies: ReturnType<typeof import('./tallies.js').reviewTallies>, current: Set<string> }} context
 */
export function scorePeople(evaluated, { tallies, current }) {
  // What a person delivers a month, all their work together.
  const hotfixWorth = hotfixWorthOf(evaluated)
  const delivery = evaluated.map((person) => {
    const deliveredSeries = deliveredSeriesOf(person, hotfixWorth)
    const delivered = deliveredSeries.flatMap((month) => (month === null ? [] : [month]))
    const deliveredMean = mean(delivered)
    const { projects, tma, acs, rest } = person.workMean

    return {
      deliveredSeries,
      deliveredMean,
      deliveredInterval: bootstrapInterval(delivered, { seed: seedOf(person.login) }),
      // What each kind of work adds to it a month, in units.
      deliveredParts: { projects, tma: hotfixWorth * tma, acs, rest },
      // How much it changes from one month to the next, against its mean.
      variation: deliveredMean ? Math.sqrt(mean(delivered.map((value) => (value - deliveredMean) ** 2))) / deliveredMean : 0,
      deliveredPerDay: person.activeDays ? (deliveredMean * delivered.length) / person.activeDays : 0,
    }
  })
  const totalDelivered = evaluated.reduce((total, person, index) => total + delivery[index].deliveredMean * person.months, 0) || 1
  // Where a person weighs in the team: whom they review, which repositories rest on them, their share of everything.
  const people = evaluated.map((person, index) => {
    const tally = /** @type {import('./tallies.js').PersonTally} */ (tallies.people.get(person.login))
    const dependents = Object.entries(tally.reviewedAuthors)
      .filter(([author, count]) => current.has(author) && (tallies.authorCode[author] ?? 0) >= DEPENDENCY_MIN_CODE && count / tallies.authorCode[author] >= DEPENDENCY_SHARE)
      .map(([author, count]) => ({ login: author, share: count / tallies.authorCode[author] }))
      .sort((a, b) => b.share - a.share)
    const owned = Object.entries(tallies.repositoryAuthors)
      .map(([repo, authors]) => ({ repo, total: Object.values(authors).reduce((sum, count) => sum + count, 0), mine: authors[person.login] ?? 0 }))
      .filter(({ total, mine }) => total >= OWNER_MIN_CODE && mine / total >= OWNER_SHARE)
      .map(({ repo, total, mine }) => ({ repo, share: mine / total }))
      .sort((a, b) => b.share - a.share)

    // Whom they review the most: their three most reviewed authors, and the share of their reviews these take.
    const reviewedMost = Object.entries(tally.reviewedAuthors)
      .sort((a, b) => b[1] - a[1])
      .slice(0, REVIEWED_MOST)
      .map(([login, count]) => ({ login, share: tally.reviewed ? count / tally.reviewed : 0 }))

    return {
      ...person,
      ...delivery[index],
      dependents,
      owned,
      reviewedMost,
      reviewFocus: reviewedMost.reduce((total, author) => total + author.share, 0),
      breadth: Object.values(tally.repos).filter((count) => count >= 5).length,
      codeShare: (delivery[index].deliveredMean * person.months) / totalDelivered,
      reviewShare: tallies.reviewPairs ? person.reviewed / tallies.reviewPairs : 0,
      hotfixTeamShare: tallies.hotfixes ? person.hotfixes / tallies.hotfixes : 0,
    }
  })

  // Productivity, against the whole team: what they deliver a month, all their work together, then how many pull
  // requests they merge; above or below the team when the whole confidence interval is.
  const deliveredMedian = /** @type {number} */ (median(people.map((person) => person.deliveredMean)))
  const productivity = /** @type {[Map<object, number>, number][]} */ ([
    [ranks(people, (person) => person.deliveredMean), 0.75],
    [ranks(people, (person) => person.mergedMean), 0.25],
  ])
  /** @param {{ deliveredInterval: [number, number] }} person */
  const standingOf = ({ deliveredInterval: [low, high] }) =>
    /** @type {'above' | 'below' | 'within'} */ (low > deliveredMedian ? 'above' : high < deliveredMedian ? 'below' : 'within')

  const efficiency = /** @type {[Map<object, number>, number][]} */ ([
    [ranks(people, (person) => person.mergeHours, { lowerIsBetter: true }), 0.3],
    [ranks(people, (person) => person.closedShare, { lowerIsBetter: true }), 0.2],
    [ranks(people, (person) => person.unreviewedShare, { lowerIsBetter: true }), 0.25],
    [ranks(people, (person) => person.failedShare, { lowerIsBetter: true }), 0.1],
    [ranks(people, (person) => person.variation, { lowerIsBetter: true }), 0.15],
  ])
  const collaboration = /** @type {[Map<object, number>, number][]} */ ([
    [ranks(people, (person) => person.reviewsMean), 0.45],
    [ranks(people, (person) => person.commentsPerReview), 0.2],
    [ranks(people, (person) => person.dependents.length), 0.2],
    [ranks(people, (person) => person.reviewHours, { lowerIsBetter: true }), 0.15],
  ])
  const importance = /** @type {[Map<object, number>, number][]} */ ([
    [ranks(people, (person) => person.codeShare), 0.2],
    [ranks(people, (person) => person.hotfixTeamShare), 0.1],
    [ranks(people, (person) => person.reviewShare), 0.25],
    [ranks(people, (person) => person.dependents.length), 0.15],
    [ranks(people, (person) => person.owned.length), 0.15],
    [ranks(people, (person) => person.projects + person.acs), 0.1],
    [ranks(people, (person) => person.mergesOfOthers), 0.05],
  ])

  return {
    delivery: { median: deliveredMedian, hotfixWorth },
    people: people.map((person) => ({
      ...person,
      standing: standingOf(person),
      deliveredVsTeam: person.deliveredMean / (deliveredMedian || 1),
      marks: {
        productivity: weigh(productivity, person),
        efficiency: weigh(efficiency, person),
        collaboration: weigh(collaboration, person),
        importance: weigh(importance, person),
      },
    })),
  }
}

/** @typedef {ReturnType<typeof scorePeople>['people'][number]} ScoredPerson */

// The results of each squad over the months, per member evaluated: what they deliver, how much they review, how fast
// and how carefully their pull requests merge; and its mark, as ranks among the squads.
/**
 * @param {Squad[]} squads
 * @param {ScoredPerson[]} people
 */
export function squadResults(squads, people) {
  const rows = squads
    .map((squad) => {
      const members = people.filter((person) => squad.members.includes(person.login))
      const merged = members.reduce((total, person) => total + person.merged, 0)

      return {
        name: squad.name,
        lead: squad.lead ?? null,
        members: members.length,
        unitsPerMember: mean(members.map((person) => person.deliveredMean)),
        reviewsPerMember: mean(members.map((person) => person.reviewsMean)),
        mergeHours: median(members.flatMap((person) => (typeof person.mergeHours === 'number' ? [person.mergeHours] : []))),
        unreviewedShare: merged ? members.reduce((total, person) => total + person.unreviewedShare * person.merged, 0) / merged : 0,
        hotfixShare: members.reduce((total, person) => total + person.hotfixes, 0) / Math.max(1, members.reduce((total, person) => total + person.code, 0)),
      }
    })
    .filter((row) => row.members > 0)
  const parts = /** @type {[Map<object, number>, number][]} */ ([
    [ranks(rows, (row) => row.unitsPerMember), 0.4],
    [ranks(rows, (row) => row.reviewsPerMember), 0.25],
    [ranks(rows, (row) => row.unreviewedShare, { lowerIsBetter: true }), 0.2],
    [ranks(rows, (row) => row.mergeHours, { lowerIsBetter: true }), 0.15],
  ])

  return rows.map((row) => ({ ...row, mark: weigh(parts, row) }))
}

/** @typedef {ReturnType<typeof squadResults>[number]} SquadResult */

// The overall mark and the level: productivity weighs most, but for a head of squad, whose role takes them away
// from the code and whose squad then counts for a quarter. Too many merges without review cap the level.
/**
 * @param {ScoredPerson} person
 * @param {SquadResult | null} squad the squad the person heads, if any
 */
export function overallOf(person, squad) {
  const { productivity, efficiency, collaboration, importance } = person.marks
  const overall = Math.round(
    squad
      ? 0.15 * productivity + 0.25 * collaboration + 0.25 * importance + 0.1 * efficiency + 0.25 * squad.mark
      : 0.35 * productivity + 0.25 * collaboration + 0.25 * importance + 0.15 * efficiency,
  )
  /** @type {Verdict} */
  let verdict = overall >= EXCEPTIONAL_FROM ? 'exceptional' : overall >= ABOVE_FROM ? 'above' : overall >= MEETS_FROM ? 'meets' : 'below'
  const process = person.unreviewedShare >= UNREVIEWED_LIMIT
  if (process && (verdict === 'exceptional' || verdict === 'above')) {
    verdict = 'meets'
  }

  return { overall, verdict, process }
}
