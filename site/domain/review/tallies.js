// What each person did over the months of the annual review, from the records: the code pull requests they opened
// (counted on their month of opening), the reviews they gave, the merges of others' pull requests, and when they acted,
// for the rhythm of their weeks. People and bots aside, release and integration pull requests aside.

import { effortKind } from '../effort.js'
import { getOrCreate } from '../math.js'
import { MINUTE_MS, parisDay, workHoursBetween } from '../time.js'
import { parisClock } from './calendar.js'

// A pull request of 100 lines is one unit of work; the units grow with the logarithm of the lines, so that 10 lines are
// half a unit and 1 000 lines one and a half: generated or imported code does not swamp the rest.
const UNIT_LINES = 100
/** @param {number} lines */
export const workUnits = (lines) => Math.log2(1 + Math.max(0, lines)) / Math.log2(1 + UNIT_LINES)

// The code pull requests merged in a month: their units of work (units), and by kind of work (work, effortKind()): the
// units of the projects, the AC and the rest, and how many for the TMA, whose hotfixes count by number.
/** @typedef {{ units: number, work: import('../effort.js').EffortCounts, merged: number, hotfixes: number, reviews: number }} MonthTally */
/** @typedef {{ projects: number, tma: number, acs: number, rest: number }} EffortCounts */
/**
 * @typedef {{
 *   login: string, months: Record<string, MonthTally>, code: number, merged: number, unreviewed: number, closed: number,
 *   failed: number, hotfixes: number, mergeHours: number[], hotfixMergeHours: number[], firstReviewHours: number[],
 *   sizes: number[], added: number, deleted: number, categories: Record<string, number>, repos: Record<string, number>,
 *   projects: Set<string>, acs: Set<string>, effort: EffortCounts, reviewed: number, reviewComments: number,
 *   approvals: number, silentApprovals: number, changesRequested: number, remarked: number, reviewHours: number[], mergesOfOthers: number,
 *   reviewedAuthors: Record<string, number>, grid: number[][], days: Set<string>,
 * }} PersonTally
 */

/**
 * @param {string} login
 * @param {string[]} months
 * @returns {PersonTally}
 */
const blank = (login, months) => ({
  login,
  months: Object.fromEntries(months.map((month) => [month, { units: 0, work: { projects: 0, tma: 0, acs: 0, rest: 0 }, merged: 0, hotfixes: 0, reviews: 0 }])),
  code: 0,
  merged: 0,
  unreviewed: 0,
  closed: 0,
  failed: 0,
  hotfixes: 0,
  mergeHours: [],
  hotfixMergeHours: [],
  firstReviewHours: [],
  sizes: [],
  added: 0,
  deleted: 0,
  categories: {},
  repos: {},
  projects: new Set(),
  acs: new Set(),
  effort: { projects: 0, tma: 0, acs: 0, rest: 0 },
  reviewed: 0,
  reviewComments: 0,
  approvals: 0,
  silentApprovals: 0,
  changesRequested: 0,
  remarked: 0,
  reviewHours: [],
  mergesOfOthers: 0,
  reviewedAuthors: {},
  grid: Array.from({ length: 7 }, () => Array(24).fill(0)),
  days: new Set(),
})

/**
 * @param {PullRequestRecord[]} records
 * @param {string[]} months
 * @param {Record<string, RepositoryInfo>} repositories
 */
export function reviewTallies(records, months, repositories) {
  const inMonths = new Set(months)
  /** @type {Map<string, PersonTally>} */
  const people = new Map()
  /** @param {string} login */
  const person = (login) => getOrCreate(people, login, () => blank(login, months))
  /** @param {number} at minutes since the epoch */
  const monthOf = (at) => parisDay(at * MINUTE_MS).slice(0, 7)
  // When a person acted: a pull request opened, a review or a comment, a merge.
  /**
   * @param {string} login
   * @param {number} at
   */
  const acted = (login, at) => {
    if (!inMonths.has(monthOf(at))) {
      return
    }
    const tally = person(login)
    const { weekday, hour } = parisClock(at * MINUTE_MS)
    tally.grid[weekday][hour]++
    if (weekday < 5) {
      tally.days.add(parisDay(at * MINUTE_MS))
    }
  }
  /** @type {Record<string, Record<string, number>>} */
  const repositoryAuthors = {}
  /** @type {Record<string, number>} */
  const authorCode = {}
  let reviewPairs = 0
  let hotfixes = 0

  for (const pr of records) {
    if (pr.bot) {
      continue
    }
    acted(pr.author, pr.createdAt)
    for (const [login, at] of pr.interventions) {
      acted(login, at)
    }
    if (pr.mergedAt !== null && pr.mergedBy) {
      acted(pr.mergedBy, pr.mergedAt)
    }
    if (pr.kind !== 'code') {
      continue
    }
    // The reviews of a month: each pull request a person intervened on in it, once.
    const reviewedIn = new Set()
    for (const [login, at] of pr.interventions) {
      const month = monthOf(at)
      if (login !== pr.author && inMonths.has(month) && !reviewedIn.has(`${login}\n${month}`)) {
        reviewedIn.add(`${login}\n${month}`)
        person(login).months[month].reviews++
      }
    }
    if (pr.mergedAt !== null && pr.mergedBy && pr.mergedBy !== pr.author && inMonths.has(monthOf(pr.mergedAt))) {
      person(pr.mergedBy).mergesOfOthers++
    }
    const month = monthOf(pr.createdAt)
    if (!inMonths.has(month)) {
      continue
    }

    const author = person(pr.author)
    const category = repositories[pr.repo]?.category ?? 'other'
    author.code++
    author.categories[category] = (author.categories[category] ?? 0) + 1
    author.repos[pr.repo] = (author.repos[pr.repo] ?? 0) + 1
    const kind = effortKind(pr)
    author.effort[kind]++
    if (pr.project) {
      author.projects.add(pr.project)
    }
    if (pr.ac) {
      author.acs.add(pr.ac)
    }
    if (pr.hotfix) {
      author.hotfixes++
      hotfixes++
    }
    const authors = (repositoryAuthors[pr.repo] ??= {})
    authors[pr.author] = (authors[pr.author] ?? 0) + 1
    authorCode[pr.author] = (authorCode[pr.author] ?? 0) + 1
    if (pr.interventions.length > 0) {
      author.firstReviewHours.push(workHoursBetween(pr.createdAt, pr.interventions[0][1]))
    }
    if (pr.mergedAt !== null) {
      const hours = workHoursBetween(pr.createdAt, pr.mergedAt)
      author.merged++
      author.months[month].merged++
      author.months[month].units += workUnits(pr.lines)
      author.months[month].work[kind] += kind === 'tma' ? 1 : workUnits(pr.lines)
      author.sizes.push(pr.lines)
      author.added += pr.lines - (pr.deleted ?? 0)
      author.deleted += pr.deleted ?? 0
      author.mergeHours.push(hours)
      if (pr.interventions.length === 0) {
        author.unreviewed++
      }
      if (pr.checksFailed) {
        author.failed++
      }
      if (pr.hotfix) {
        author.months[month].hotfixes++
        author.hotfixMergeHours.push(hours)
      }
    } else if (pr.closed) {
      author.closed++
    }

    // Each reviewer of a pull request opened over the months, once, whenever they reviewed it.
    /** @type {Map<string, Intervention[]>} */
    const byReviewer = new Map()
    for (const intervention of pr.interventions) {
      if (intervention[0] !== pr.author) {
        getOrCreate(byReviewer, intervention[0], () => []).push(intervention)
      }
    }
    for (const [login, interventions] of byReviewer) {
      const reviewer = person(login)
      const comments = interventions.reduce((total, [, , , count]) => total + count, 0)
      reviewPairs++
      reviewer.reviewed++
      reviewer.reviewComments += comments
      reviewer.reviewedAuthors[pr.author] = (reviewer.reviewedAuthors[pr.author] ?? 0) + 1
      reviewer.reviewHours.push(workHoursBetween(pr.createdAt, interventions[0][1]))
      if (interventions.some(([, , stance]) => stance === 'APPROVED')) {
        reviewer.approvals++
        if (comments === 0) {
          reviewer.silentApprovals++
        }
      }
      const changes = interventions.some(([, , stance]) => stance === 'CHANGES_REQUESTED')
      if (changes) {
        reviewer.changesRequested++
      }
      // A remark asks for a change as « Request changes » does: the team asks for its changes either way.
      if (changes || comments > 0) {
        reviewer.remarked++
      }
    }
  }

  return { people, repositoryAuthors, authorCode, reviewPairs, hotfixes }
}
