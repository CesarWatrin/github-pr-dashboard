// Pairs and circles of review: from who reviews whom (reviewNetwork() of team.js), how much of the reviews are returned
// (A reviews B, B reviews A), how much the busiest pairs take, how many reviewers do most of the work, and the circles of
// people who mostly review each other; for each circle, how long its pull requests wait for their first review against
// the rest of the team, to tell a circle that waits.

import { percentile } from './math.js'

// How many pairs make the « busiest pairs ».
export const TOP_PAIRS = 8
// A pair is one-sided when one reviews the other at least ONE_SIDED_MIN times, and gets back at most ONE_SIDED_SHARE of
// it.
export const ONE_SIDED_MIN = 20
export const ONE_SIDED_SHARE = 0.25
// Reviews are missing between two people when one reviews at most MISSING_SHARE of what they would if they reviewed the
// pull requests of each repository as the team writes them, and so few that chance makes it unlikely: at most
// MISSING_CHANCE (a Poisson law of the expected count). The test follows the period: 0 reviews out of 7 expected over a
// month say something, 0 out of 2 do not.
export const MISSING_SHARE = 0.4
export const MISSING_CHANCE = 0.05
// The main reviewers of an author, and the reviews an author needs for their spread to say something.
export const MAIN_REVIEWERS = 3
// Reviewers suggested for someone: up to SUGGESTIONS of those who review at most SUGGEST_SHARE of what they would, chance
// making it unlikely (SUGGEST_CHANCE).
export const SUGGESTIONS = 3
export const SUGGEST_SHARE = 0.5
export const SUGGEST_CHANCE = 0.1
export const SPREAD_MIN = 20
// An author is reviewed by few people when their effective reviewers are at most this share of the median of their
// group (their stack): front developers, fewer, are reviewed by fewer people than back ones.
export const NARROW_SHARE = 0.8
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
    // Pairs where one reviews the other a lot and gets little back, the busiest first.
    oneSided: twoWays
      .filter((pair) => pair.firstReviews >= ONE_SIDED_MIN && pair.secondReviews <= ONE_SIDED_SHARE * pair.firstReviews)
      .sort((a, b) => b.firstReviews - a.firstReviews || a.first.localeCompare(b.first)),
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

// What each reviewer would review of each author: if, in each repository they review, they spread their reviews over
// the pull requests of the others as these are reviewed. Per repository, so that someone who only reviews the back is
// not expected to review the front. Against what they did review, and how many reviews they give, their load.
/**
 * @param {{ author: string, reviewer: string, repos: Record<string, number> }[]} pairs who reviewed whom, per repository
 */
export function reviewExpectations(pairs) {
  /** @type {Map<string, Map<string, number>>} */
  const given = new Map()
  /** @type {Map<string, Map<string, number>>} */
  const received = new Map()
  /** @type {Map<string, number>} */
  const totals = new Map()
  /** @type {Map<string, number>} */
  const actual = new Map()
  /** @type {(map: Map<string, Map<string, number>>, login: string, repo: string, count: number) => void} */
  const add = (map, login, repo, count) => {
    if (!map.has(login)) {
      map.set(login, new Map())
    }
    const own = /** @type {Map<string, number>} */ (map.get(login))
    own.set(repo, (own.get(repo) ?? 0) + count)
  }
  for (const { author, reviewer, repos } of pairs) {
    if (author === reviewer) {
      continue
    }
    for (const [repo, count] of Object.entries(repos)) {
      add(given, reviewer, repo, count)
      add(received, author, repo, count)
      totals.set(repo, (totals.get(repo) ?? 0) + count)
      actual.set(`${reviewer}\n${author}`, (actual.get(`${reviewer}\n${author}`) ?? 0) + count)
    }
  }
  /** @type {(reviewer: string, author: string) => number} */
  const expected = (reviewer, author) => {
    let count = 0
    for (const [repo, reviews] of given.get(reviewer) ?? []) {
      // The reviews of the repository the reviewer could have given: all but those of their own pull requests.
      const others = (totals.get(repo) ?? 0) - (received.get(reviewer)?.get(repo) ?? 0)
      count += others > 0 ? (reviews * (received.get(author)?.get(repo) ?? 0)) / others : 0
    }

    return count
  }
  /** @type {(reviewer: string) => number} */
  const load = (reviewer) => [...(given.get(reviewer)?.values() ?? [])].reduce((sum, count) => sum + count, 0)

  return {
    reviewers: [...given.keys()],
    authors: [...received.keys()],
    expected,
    actual: (/** @type {string} */ reviewer, /** @type {string} */ author) => actual.get(`${reviewer}\n${author}`) ?? 0,
    load,
    medianLoad: percentile([...given.keys()].map(load), 0.5) ?? 1,
  }
}

/** @typedef {ReturnType<typeof reviewExpectations>} ReviewExpectations */

// The chance of seeing at most `count` events when `expected` are expected at random (the Poisson law).
/**
 * @param {number} count
 * @param {number} expected
 */
export function chanceOfAtMost(count, expected) {
  let term = Math.exp(-expected)
  let total = 0
  for (let index = 0; index <= count; index++) {
    total += term
    term *= expected / (index + 1)
  }

  return Math.min(1, total)
}

// The reviews missing between two people: those of a reviewer reviewed at most MISSING_SHARE of what they would, too
// few for chance (MISSING_CHANCE); the widest gaps first.
/** @param {ReviewExpectations} expectations */
export function missingReviews({ reviewers, authors, expected, actual }) {
  const missing = []
  for (const reviewer of reviewers) {
    for (const author of authors) {
      if (author === reviewer) {
        continue
      }
      const wanted = expected(reviewer, author)
      const done = actual(reviewer, author)
      if (done <= MISSING_SHARE * wanted && chanceOfAtMost(done, wanted) <= MISSING_CHANCE) {
        missing.push({ reviewer, author, actual: done, expected: wanted })
      }
    }
  }

  return missing.sort((a, b) => b.expected - b.actual - (a.expected - a.actual) || a.reviewer.localeCompare(b.reviewer))
}

// Who could review some people more, by their appetite: the reviewers who already review the repositories they write
// in, yet review them at most SUGGEST_SHARE of what they would, too few for chance (SUGGEST_CHANCE); the widest gap first,
// weighed down for the busiest reviewers (by the square root of their load against the median one), so that the work
// spreads rather than piling up on the same few. Up to SUGGESTIONS of them.
/**
 * @param {ReviewExpectations} expectations
 * @param {string[]} people the authors to find reviewers for, together
 */
export function suggestReviewers({ reviewers, expected, actual, load, medianLoad }, people) {
  const own = new Set(people)

  return reviewers
    .filter((reviewer) => !own.has(reviewer))
    .map((reviewer) => {
      const wanted = people.reduce((sum, author) => sum + expected(reviewer, author), 0)
      const done = people.reduce((sum, author) => sum + actual(reviewer, author), 0)

      return { reviewer, actual: done, expected: wanted, score: (wanted - done) / Math.sqrt(Math.max(load(reviewer), 1) / Math.max(medianLoad, 1)) }
    })
    .filter(({ actual: done, expected: wanted }) => done <= SUGGEST_SHARE * wanted && chanceOfAtMost(done, wanted) <= SUGGEST_CHANCE)
    .sort((a, b) => b.score - a.score || a.reviewer.localeCompare(b.reviewer))
    .slice(0, SUGGESTIONS)
}

// How widely each author is reviewed: the effective number of their reviewers (one over the sum of the squared shares of
// their reviews: ten reviewers who share them evenly make ten, two who do nine tenths of them hardly more than two),
// and their MAIN_REVIEWERS main reviewers with their share; the least spread first, among the authors with at least
// SPREAD_MIN reviews. How long they wait tells nothing of it: someone who asks the same people in private does not wait.
// Each author is set against the median of their group (groupOf: their stack, say), narrow when at most NARROW_SHARE of
// it; the least spread for their group first.
/**
 * @param {Pair[]} pairs
 * @param {(login: string) => string} [groupOf]
 */
export function reviewSpread(pairs, groupOf = () => '') {
  /** @type {Map<string, { reviewer: string, prs: number }[]>} */
  const byAuthor = new Map()
  for (const { author, reviewer, prs } of pairs) {
    if (author !== reviewer && prs > 0) {
      byAuthor.set(author, [...(byAuthor.get(author) ?? []), { reviewer, prs }])
    }
  }

  return [...byAuthor]
    .map(([author, reviewers]) => {
      const received = reviewers.reduce((sum, { prs }) => sum + prs, 0)
      const sorted = reviewers.sort((a, b) => b.prs - a.prs || a.reviewer.localeCompare(b.reviewer))
      const main = sorted.slice(0, MAIN_REVIEWERS).map(({ reviewer, prs }) => ({ login: reviewer, share: prs / received }))

      return {
        author,
        received,
        reviewers: reviewers.length,
        effective: 1 / reviewers.reduce((sum, { prs }) => sum + (prs / received) ** 2, 0),
        mainShare: main.reduce((sum, { share }) => sum + share, 0),
        main,
      }
    })
    .filter((spread) => spread.received >= SPREAD_MIN)
    .map((spread, _index, all) => {
      const group = groupOf(spread.author)
      const median = /** @type {number} */ (percentile(all.filter((other) => groupOf(other.author) === group).map((other) => other.effective), 0.5))

      return { ...spread, group, groupMedian: median, vsGroup: spread.effective / median, narrow: spread.effective <= NARROW_SHARE * median }
    })
    .sort((a, b) => a.vsGroup - b.vsGroup || a.author.localeCompare(b.author))
}

/** @typedef {ReturnType<typeof reviewCircles>} ReviewCircles */
