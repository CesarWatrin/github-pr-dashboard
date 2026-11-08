// The year in review of a person or of the whole team (« Rétrospective »), from the records of a Paris calendar year:
// what they opened and merged, month by month and day of the week, where, the biggest pull request, who reviewed whom,
// the hotfixes, the deployments. Their projects, AC and badges come from domain/projects.js, domain/acs.js and the
// monthly history (model/wrapped.js). Pure, no DOM. Times in minutes since the epoch, ranges in milliseconds.

import { MINUTE_MS, parisDay, parisMidnight } from './time.js'

// The Paris calendar year, up to now while it goes on: null for a year still to come.
/**
 * @param {number} year
 * @param {number} now milliseconds
 * @returns {{ start: number, end: number } | null}
 */
export function yearRange(year, now) {
  const start = parisMidnight(`${year}-01-01`)

  return start > now ? null : { start, end: Math.min(parisMidnight(`${year + 1}-01-01`), now) }
}

// The years of the data, the latest first: those it covers from their first day, and the year of now whatever it covers
// (a year the data starts in the middle of would tell only part of it).
/**
 * @param {number} windowStart milliseconds
 * @param {number} now milliseconds
 * @returns {number[]}
 */
export function dataYears(windowStart, now) {
  const last = Number(parisDay(now).slice(0, 4))
  const first = Math.min(last, Number(parisDay(windowStart).slice(0, 4)) + (parisDay(windowStart).endsWith('-01-01') ? 0 : 1))

  return Array.from({ length: last - first + 1 }, (_, index) => last - index)
}

// The months of a year, 'YYYY-MM'.
/** @type {(year: number) => string[]} */
export const yearMonths = (year) => Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`)

// Monday first: 0 for Monday, 6 for Sunday, of a Paris day.
/** @type {(day: string) => number} */
const weekdayOf = (day) => (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7

/** @type {(at: number) => string} */
const dayOf = (at) => parisDay(at * MINUTE_MS)

// The key of the largest count, the first on a tie; null when all are 0.
/**
 * @template T
 * @param {[T, number][]} counts
 * @returns {T | null}
 */
function busiest(counts) {
  let best = null
  let most = 0
  for (const [key, count] of counts) {
    if (count > most) {
      best = key
      most = count
    }
  }

  return best
}

// Counts sorted, the largest first, then by key.
/** @type {(counts: Map<string, number>) => [string, number][]} */
const ranked = (counts) => [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))

/** @typedef {{ repo: string, number: number, lines: number, title: string | null }} BiggestPullRequest */

// What a list of code pull requests of a year adds up to: how many, merged, lines added and deleted by those merged, the
// hotfixes, month by month (the months begun within the range: a year going on stops at its current month) and per day
// of the week, the busiest month and day, per repository, and the biggest merged.
/**
 * @param {PullRequestRecord[]} code
 * @param {number} year
 * @param {{ start: number, end: number }} range
 */
function codeYear(code, year, range) {
  const merged = code.filter((pr) => pr.mergedAt !== null)
  const deleted = merged.reduce((total, pr) => total + (pr.deleted ?? 0), 0)
  /** @type {Map<string, number>} */
  const perMonth = new Map(yearMonths(year).filter((month) => parisMidnight(`${month}-01`) < range.end).map((month) => [month, 0]))
  const perWeekday = [0, 0, 0, 0, 0, 0, 0]
  /** @type {Map<string, number>} */
  const perRepo = new Map()
  for (const pr of code) {
    const day = dayOf(pr.createdAt)
    perMonth.set(day.slice(0, 7), (perMonth.get(day.slice(0, 7)) ?? 0) + 1)
    perWeekday[weekdayOf(day)]++
    perRepo.set(pr.repo, (perRepo.get(pr.repo) ?? 0) + 1)
  }
  const biggest = merged.reduce((best, pr) => (best === null || pr.lines > best.lines ? pr : best), /** @type {PullRequestRecord | null} */ (null))

  return {
    code: code.length,
    merged: merged.length,
    added: merged.reduce((total, pr) => total + pr.lines, 0) - deleted,
    deleted,
    hotfixes: code.filter((pr) => pr.hotfix).length,
    months: [...perMonth].map(([month, count]) => ({ month, code: count })),
    busiestMonth: busiest([...perMonth]),
    weekdays: perWeekday,
    busiestWeekday: busiest(perWeekday.map((count, day) => /** @type {[number, number]} */ ([day, count]))),
    repos: ranked(perRepo),
    /** @type {BiggestPullRequest | null} */
    biggest: biggest && { repo: biggest.repo, number: biggest.number, lines: biggest.lines, title: biggest.title ?? null },
  }
}

// The code pull requests of people opened within a range.
/**
 * @param {PullRequestRecord[]} records
 * @param {{ start: number, end: number }} range
 */
const codeWithin = (records, { start, end }) =>
  records.filter((pr) => pr.kind === 'code' && !pr.bot && pr.createdAt * MINUTE_MS >= start && pr.createdAt * MINUTE_MS < end)

/** @typedef {{ login: string, prs: number }} Pair */

// A person's year: their code pull requests (codeYear()); the pull requests of others they reviewed or commented on
// within the year, their comments, and whose they reviewed the most; who reviewed theirs the most; the days they opened
// one on.
/**
 * @param {PullRequestRecord[]} records
 * @param {string} login
 * @param {number} year
 * @param {{ start: number, end: number }} range
 */
export function personYear(records, login, year, range) {
  const within = (/** @type {number} */ at) => at * MINUTE_MS >= range.start && at * MINUTE_MS < range.end
  const own = codeWithin(records, range).filter((pr) => pr.author === login)
  /** @type {Map<string, number>} */
  const reviewedBy = new Map()
  for (const pr of own) {
    for (const reviewer of new Set(pr.interventions.map(([who]) => who).filter((who) => who !== login))) {
      reviewedBy.set(reviewer, (reviewedBy.get(reviewer) ?? 0) + 1)
    }
  }
  /** @type {Map<string, number>} */
  const reviewedOf = new Map()
  let reviewed = 0
  let comments = 0
  for (const pr of records) {
    if (pr.kind !== 'code' || pr.bot || pr.author === login) {
      continue
    }
    const mine = pr.interventions.filter(([who, at]) => who === login && within(at))
    if (mine.length > 0) {
      reviewed++
      comments += mine.reduce((total, [, , , count]) => total + count, 0)
      reviewedOf.set(pr.author, (reviewedOf.get(pr.author) ?? 0) + 1)
    }
  }
  /** @type {(counts: Map<string, number>) => Pair[]} */
  const pairs = (counts) => ranked(counts).map(([who, prs]) => ({ login: who, prs }))

  return {
    login,
    year,
    ...codeYear(own, year, range),
    days: new Set(own.map((pr) => dayOf(pr.createdAt))).size,
    reviewed,
    comments,
    reviewedBy: pairs(reviewedBy),
    reviewedMost: pairs(reviewedOf),
  }
}

/** @typedef {ReturnType<typeof personYear>} PersonYear */

// The team's year: every code pull request of people (codeYear()), the people who opened them, the pull requests
// reviewed by someone else and the comments left, the deployments to production, and who opened the most.
/**
 * @param {PullRequestRecord[]} records
 * @param {number} year
 * @param {{ start: number, end: number }} range
 */
export function teamYear(records, year, range) {
  const within = (/** @type {number} */ at) => at * MINUTE_MS >= range.start && at * MINUTE_MS < range.end
  const code = codeWithin(records, range)
  /** @type {Map<string, number>} */
  const perAuthor = new Map()
  for (const pr of code) {
    perAuthor.set(pr.author, (perAuthor.get(pr.author) ?? 0) + 1)
  }
  /** @type {Set<string>} */
  const reviewers = new Set()
  let reviewed = 0
  let comments = 0
  for (const pr of records) {
    if (pr.kind !== 'code' || pr.bot) {
      continue
    }
    const others = pr.interventions.filter(([who, at]) => who !== pr.author && within(at))
    if (others.length > 0) {
      reviewed++
      comments += others.reduce((total, [, , , count]) => total + count, 0)
      for (const [who] of others) {
        reviewers.add(who)
      }
    }
  }
  /** @type {Map<string, number>} */
  const deploymentsPerDay = new Map()
  for (const pr of records) {
    if (pr.deployment && pr.mergedAt !== null && within(pr.mergedAt)) {
      const day = dayOf(pr.mergedAt)
      deploymentsPerDay.set(day, (deploymentsPerDay.get(day) ?? 0) + 1)
    }
  }

  return {
    year,
    ...codeYear(code, year, range),
    people: perAuthor.size,
    reviewers: reviewers.size,
    reviewed,
    comments,
    deployments: [...deploymentsPerDay.values()].reduce((total, count) => total + count, 0),
    deploymentDays: deploymentsPerDay.size,
  }
}

/** @typedef {ReturnType<typeof teamYear>} TeamYear */

// The people who did anything over a year: opened a code pull request, or reviewed or commented on one of someone else.
/**
 * @param {PullRequestRecord[]} records
 * @param {{ start: number, end: number }} range
 * @returns {Set<string>}
 */
export function activePeople(records, range) {
  const within = (/** @type {number} */ at) => at * MINUTE_MS >= range.start && at * MINUTE_MS < range.end
  /** @type {Set<string>} */
  const people = new Set()
  for (const pr of records) {
    if (pr.kind !== 'code' || pr.bot) {
      continue
    }
    if (within(pr.createdAt)) {
      people.add(pr.author)
    }
    for (const [who, at] of pr.interventions) {
      if (who !== pr.author && within(at)) {
        people.add(who)
      }
    }
  }

  return people
}

// The badges a person won over the months of a year, from the leaders of each badge month by month (monthlyLeaders() of
// domain/months.js): for each, the months they were the top of the team.
/**
 * @param {Map<string, { month: string, people: string[] }[]>} leaders per badge key
 * @param {string} login
 * @param {number} year
 * @returns {{ key: string, months: string[] }[]}
 */
export function yearBadges(leaders, login, year) {
  return [...leaders]
    .map(([key, months]) => ({
      key,
      months: months.filter(({ month, people }) => month.startsWith(`${year}-`) && people.includes(login)).map(({ month }) => month),
    }))
    .filter(({ months }) => months.length > 0)
    .sort((a, b) => b.months.length - a.months.length)
}
