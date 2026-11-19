// Pairs and circles of review: from who reviews whom (reviewNetwork() of team.js), how much of the reviews are returned
// (A reviews B, B reviews A), how much the busiest pairs take, how many reviewers do most of the work, and the circles of
// people who mostly review each other; for each circle, how long its pull requests wait for their first review against
// the rest of the team, to tell a circle that waits.

import { percentile } from './math.js'

// How many pairs make the « busiest pairs ».
export const TOP_PAIRS = 8
// The share of the reviews the fewest reviewers are counted for.
export const COVERAGE = 0.8
// A person takes part in the circles from this many reviews, given and received: fewer tell nothing of whom they read.
export const MIN_CIRCLE_REVIEWS = 5
// A circle waits when its pull requests wait this many times longer for a first review than those of the rest of the
// team (the ninth decile of each), with at least MIN_WAITS first reviews to go on.
export const WAITING_FACTOR = 2
export const MIN_WAITS = 10
const ROUNDS = 30
// A tie makes a circle when it is this many times the average tie.
export const STRONG_TIE = 2

/** @typedef {{ author: string, reviewer: string, prs: number }} Pair */
/** @typedef {{ median: number | null, slowest: number | null, count: number }} Wait */

// The first review of a list of waits, in working hours: its median, and the ninth decile, which only the slowest tenth
// of the pull requests pass.
/**
 * @param {number[]} hours
 * @returns {Wait}
 */
const waitOf = (hours) => ({ median: percentile(hours, 0.5), slowest: percentile(hours, 0.9), count: hours.length })

/**
 * @param {Pair[]} pairs how many pull requests of each author each reviewer intervened on
 * @param {Map<string, number[]>} firstReviews the working hours each author's pull requests waited for a first review
 */
export function reviewCircles(pairs, firstReviews) {
  /** @type {Map<string, Map<string, number>>} */
  const given = new Map()
  /** @type {Map<string, number>} */
  const activity = new Map()
  let total = 0
  for (const { author, reviewer, prs } of pairs) {
    if (author === reviewer || prs <= 0) {
      continue
    }
    if (!given.has(reviewer)) {
      given.set(reviewer, new Map())
    }
    const own = /** @type {Map<string, number>} */ (given.get(reviewer))
    own.set(author, (own.get(author) ?? 0) + prs)
    activity.set(author, (activity.get(author) ?? 0) + prs)
    activity.set(reviewer, (activity.get(reviewer) ?? 0) + prs)
    total += prs
  }
  /** @type {(reviewer: string, author: string) => number} */
  const reviews = (reviewer, author) => given.get(reviewer)?.get(author) ?? 0

  // Each pair of people once, both ways: the first one the one who reviews the other the most.
  /** @type {Map<string, { first: string, second: string, firstReviews: number, secondReviews: number }>} */
  const both = new Map()
  for (const [reviewer, authors] of given) {
    for (const author of authors.keys()) {
      const [a, b] = [reviewer, author].sort()
      if (!both.has(`${a}\n${b}`)) {
        const [ab, ba] = [reviews(a, b), reviews(b, a)]
        both.set(`${a}\n${b}`, ab >= ba ? { first: a, second: b, firstReviews: ab, secondReviews: ba } : { first: b, second: a, firstReviews: ba, secondReviews: ab })
      }
    }
  }
  const twoWays = [...both.values()].sort(
    (x, y) => y.firstReviews + y.secondReviews - (x.firstReviews + x.secondReviews) || x.first.localeCompare(y.first) || x.second.localeCompare(y.second),
  )
  const returned = twoWays.reduce((sum, pair) => sum + 2 * pair.secondReviews, 0)
  const busiest = twoWays.slice(0, TOP_PAIRS).reduce((sum, pair) => sum + pair.firstReviews + pair.secondReviews, 0)

  // The fewest reviewers who do COVERAGE of the reviews.
  const byReviewer = [...given.values()].map((authors) => [...authors.values()].reduce((sum, count) => sum + count, 0)).sort((a, b) => b - a)
  let covered = 0
  let reviewersForCoverage = 0
  for (const count of byReviewer) {
    if (covered >= COVERAGE * total) {
      break
    }
    covered += count
    reviewersForCoverage++
  }

  return {
    total,
    reciprocity: total ? returned / total : null,
    pairs: twoWays,
    topPairsShare: total ? busiest / total : null,
    reviewersForCoverage,
    reviewers: given.size,
    ...circlesOf({ activity, reviews, firstReviews }),
  }
}

// The circles: people who review each other more than they review the rest, by label propagation over the reviews both
// ways, each weighed against how busy both people are, so that the busiest reviewers do not pull everyone in. The order
// of the people and the ties are fixed: the same reviews always give the same circles.
/**
 * @param {{ activity: Map<string, number>, reviews: (reviewer: string, author: string) => number, firstReviews: Map<string, number[]> }} context
 */
function circlesOf({ activity, reviews, firstReviews }) {
  const people = [...activity].filter(([, count]) => count >= MIN_CIRCLE_REVIEWS).map(([login]) => login).sort()
  /** @type {(a: string, b: string) => number} */
  const strength = (a, b) => (reviews(a, b) + reviews(b, a)) / Math.sqrt((activity.get(a) ?? 1) * (activity.get(b) ?? 1))
  // Only the strong ties make circles: those well above the average tie between two people who review each other at all.
  // Weak ones would join everyone into one circle.
  const strengths = people.flatMap((a, index) => people.slice(index + 1).map((b) => strength(a, b))).filter((value) => value > 0)
  const threshold = STRONG_TIE * (strengths.reduce((sum, value) => sum + value, 0) / (strengths.length || 1))
  /** @type {(a: string, b: string) => number} */
  const tie = (a, b) => {
    const value = strength(a, b)

    return value >= threshold ? value : 0
  }
  /** @type {Map<string, string>} */
  const label = new Map(people.map((login) => [login, login]))
  for (let round = 0; round < ROUNDS; round++) {
    let changed = false
    for (const login of people) {
      /** @type {Map<string, number>} */
      const scores = new Map()
      for (const other of people) {
        const weight = other === login ? 0 : tie(login, other)
        if (weight > 0) {
          const key = /** @type {string} */ (label.get(other))
          scores.set(key, (scores.get(key) ?? 0) + weight)
        }
      }
      const best = [...scores].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0]
      if (best && best !== label.get(login)) {
        label.set(login, best)
        changed = true
      }
    }
    if (!changed) {
      break
    }
  }
  /** @type {Map<string, string[]>} */
  const groups = new Map()
  for (const login of people) {
    const key = /** @type {string} */ (label.get(login))
    groups.set(key, [...(groups.get(key) ?? []), login])
  }

  const team = waitOf(people.flatMap((login) => firstReviews.get(login) ?? []))
  const circles = [...groups.values()]
    .map((members) => {
      const inside = new Set(members)
      let received = 0
      let fromInside = 0
      for (const author of members) {
        for (const reviewer of activity.keys()) {
          const count = reviews(reviewer, author)
          received += count
          fromInside += inside.has(reviewer) ? count : 0
        }
      }
      const wait = waitOf(members.flatMap((login) => firstReviews.get(login) ?? []))
      // Against the rest of the team: a circle that weighs much would otherwise hide in its own figures.
      const rest = waitOf(people.filter((login) => !inside.has(login)).flatMap((login) => firstReviews.get(login) ?? []))

      return {
        members,
        received,
        insideShare: received ? fromInside / received : null,
        firstReview: wait,
        rest,
        waiting:
          wait.count >= MIN_WAITS &&
          typeof wait.slowest === 'number' &&
          typeof rest.slowest === 'number' &&
          wait.slowest > WAITING_FACTOR * Math.max(rest.slowest, 1),
      }
    })
    .sort((a, b) => b.members.length - a.members.length || b.received - a.received || a.members[0].localeCompare(b.members[0]))

  return { circles, team }
}

/** @typedef {ReturnType<typeof reviewCircles>} ReviewCircles */
