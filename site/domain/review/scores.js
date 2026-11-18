// The four marks of each person of the annual review, from 0 to 100, as ranks among the people evaluated: productivity
// (among those of the same profile), efficiency, collaboration and importance; the overall mark, a head of squad also
// judged on the results of their squad; and the recommendation that follows.

import { median } from '../math.js'
import { mean, rankShares } from './statistics.js'

// A reviewer someone depends on reviews at least this share of their code pull requests, among those with enough.
export const DEPENDENCY_SHARE = 0.3
export const DEPENDENCY_MIN_CODE = 10
// A repository rests on a person who wrote at least this share of its code pull requests, among those with enough.
export const OWNER_SHARE = 0.4
export const OWNER_MIN_CODE = 10
// How many of the authors a person reviews the most count for how focused their reviews are.
export const REVIEWED_MOST = 3
// A share of pull requests merged without any review from which no reward is recommended until it is mended.
export const UNREVIEWED_LIMIT = 0.25
// The overall marks from which a reward is recommended, a priority one, or under which the person needs support.
export const PRIORITY_FROM = 72
export const REWARD_FROM = 58
export const SUPPORT_UNDER = 42
// Heads of squad: a squad that leads from this mark, or lags under that one.
export const SQUAD_LEADS_FROM = 60
export const SQUAD_LAGS_UNDER = 40

/** @typedef {'priority' | 'reward' | 'steady' | 'support'} Verdict */
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
  // Where a person weighs in the team: whom they review, which repositories rest on them, their share of everything.
  const totalUnits = evaluated.reduce((total, person) => total + person.unitsMean * person.months, 0) || 1
  const people = evaluated.map((person) => {
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
      dependents,
      owned,
      reviewedMost,
      reviewFocus: reviewedMost.reduce((total, author) => total + author.share, 0),
      breadth: Object.values(tally.repos).filter((count) => count >= 5).length,
      codeShare: (person.unitsMean * person.months) / totalUnits,
      reviewShare: tallies.reviewPairs ? person.reviewed / tallies.reviewPairs : 0,
      hotfixTeamShare: tallies.hotfixes ? person.hotfixes / tallies.hotfixes : 0,
    }
  })

  // Productivity, among those of the same profile: what they deliver a month, then how many pull requests they merge.
  /** @type {Map<string, { delivered: number, units: number, hotfixes: number, count: number }>} */
  const profiles = new Map()
  /** @type {Map<object, number>} */
  const productivity = new Map()
  /** @type {Map<object, 'above' | 'below' | 'within'>} */
  const standing = new Map()
  for (const profile of new Set(people.map((person) => person.profile))) {
    const group = people.filter((person) => person.profile === profile)
    const delivered = /** @type {number} */ (median(group.map((person) => person.deliveredMean)))
    profiles.set(profile, {
      delivered,
      units: /** @type {number} */ (median(group.map((person) => person.unitsMean))),
      hotfixes: /** @type {number} */ (median(group.map((person) => person.hotfixesMean))),
      count: group.length,
    })
    const parts = /** @type {[Map<object, number>, number][]} */ ([
      [ranks(group, (person) => person.deliveredMean), 0.75],
      [ranks(group, (person) => person.mergedMean), 0.25],
    ])
    for (const person of group) {
      productivity.set(person, weigh(parts, person))
      const [low, high] = person.deliveredInterval
      standing.set(person, low > delivered ? 'above' : high < delivered ? 'below' : 'within')
    }
  }

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
    profiles: Object.fromEntries(profiles),
    people: people.map((person) => ({
      ...person,
      standing: /** @type {'above' | 'below' | 'within'} */ (standing.get(person)),
      deliveredVsProfile: person.deliveredMean / (/** @type {{ delivered: number }} */ (profiles.get(person.profile)).delivered || 1),
      marks: {
        productivity: /** @type {number} */ (productivity.get(person)),
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
        unitsPerMember: mean(members.map((person) => person.unitsMean)),
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

// The overall mark and the recommendation: productivity weighs most, but for a head of squad, whose role takes them away
// from the code and whose squad then counts for a quarter. Too many merges without review hold any reward back.
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
  let verdict = overall >= PRIORITY_FROM ? 'priority' : overall >= REWARD_FROM ? 'reward' : overall >= SUPPORT_UNDER ? 'steady' : 'support'
  const process = person.unreviewedShare >= UNREVIEWED_LIMIT
  if (process && (verdict === 'priority' || verdict === 'reward')) {
    verdict = 'steady'
  }

  return { overall, verdict, process }
}
