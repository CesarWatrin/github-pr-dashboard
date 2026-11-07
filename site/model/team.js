// Each person's figures over the period (team page, person dialog), and who reviews whom.

import { median } from '../domain/math.js'
import { reviewNetwork } from '../domain/team.js'
import { sumOf } from '../lib/math.js'
import { authorRows, reviewerRows, selectedEntries } from './contributors.js'
import { displayName, isCurrent, withoutFormer } from './people.js'
import { stackOf, stackType } from './repositories.js'
import { currentPeriod } from './selection.js'
import { state } from './state.js'

// People and repositories listed in the dialog, the busiest first.
export const PERSON_TOP = 3
// Fewest people of a stack to compare a person with: under it, the dialog compares with the whole team.
export const MIN_PEERS = 3

// The review network of the period over the repositories selected on the page.
/** @returns {ReviewNetwork} */
export function currentNetwork() {
  const period = currentPeriod()
  const selection = state.repos.collaboration
  if (state.networkCache?.period !== period || state.networkCache.selection !== selection) {
    state.networkCache = { period, selection, network: reviewNetwork(withoutFormer(period), selection) }
  }

  return state.networkCache.network
}

// Everyone who wrote or reviewed code over the period in the repositories selected on the page, most code pull requests
// first, then by name: what each person wrote, then what they reviewed. The stack comes from their code pull requests,
// else from the ones they reviewed.
// What a person wrote and reviewed, added up over the repositories selected.
/** @typedef {{ login: string, code: number, merged: number, timesToMerge: number[], reviewed: number, comments: number }} TeamTotals */

/** @param {{ withFormer?: boolean }} [options] */
export function teamRows({ withFormer = false } = {}) {
  const period = currentPeriod()
  // The people who left only have a row for their own dialog, opened from the former people of the team page.
  /** @param {{ login: string }} person */
  const kept = ({ login }) => withFormer || isCurrent(login)
  /** @type {Map<string, TeamTotals>} */
  const rows = new Map()
  /** @param {string} login */
  const row = (login) => {
    if (!rows.has(login)) {
      rows.set(login, { login, code: 0, merged: 0, timesToMerge: [], reviewed: 0, comments: 0 })
    }

    return /** @type {TeamTotals} */ (rows.get(login))
  }
  for (const person of period.authors.filter(kept)) {
    const parts = selectedEntries(person, 'team').map(([, stats]) => stats)
    const code = sumOf(parts, 'code')
    if (code > 0) {
      Object.assign(row(person.login), {
        code,
        merged: sumOf(parts, 'merged'),
        timesToMerge: parts.flatMap((stats) => stats.timesToMergeHours),
      })
    }
  }
  for (const person of period.reviewers.filter(kept)) {
    const parts = selectedEntries(person, 'team').map(([, stats]) => stats)
    const reviewed = sumOf(parts, 'prs')
    if (reviewed > 0) {
      Object.assign(row(person.login), { reviewed, comments: sumOf(parts, 'comments') })
    }
  }
  const reviewersOf = new Map(reviewNetwork(withoutFormer(period), state.repos.team).authors.map((author) => [author.login, author.reviewers]))
  // The stack is the person's own, over every repository: the selection only narrows the figures.
  /**
   * @template {string} Key
   * @param {{ login: string, repos: Record<string, Record<Key, number>> }[]} people
   * @param {Key} key
   * @returns {Map<string, [repo: string, count: number][]>}
   */
  const perRepo = (people, key) =>
    new Map(
      people.map((person) => [
        person.login,
        Object.entries(person.repos).map(([repo, stats]) => /** @type {[repo: string, count: number]} */ ([repo, stats[key]])),
      ]),
    )
  const codeRepos = perRepo(period.authors, 'code')
  const reviewedRepos = perRepo(period.reviewers, 'prs')
  /** @param {string} login */
  const stackFor = (login) => {
    const code = codeRepos.get(login) ?? []

    return stackOf(code.some(([, prs]) => prs > 0) ? code : (reviewedRepos.get(login) ?? []))
  }

  return [...rows.values()]
    .map((totals) => ({
      login: totals.login,
      code: totals.code,
      merged: totals.code ? totals.merged : null,
      medianTimeToMergeHours: median(totals.timesToMerge),
      reviewed: totals.reviewed,
      commentsPerPr: totals.reviewed ? totals.comments / totals.reviewed : null,
      reviewers: totals.code ? (reviewersOf.get(totals.login) ?? 0) : null,
      stack: stackFor(totals.login),
    }))
    .sort((a, b) => b.code - a.code || displayName(a.login).localeCompare(displayName(b.login), 'fr'))
}

// The details of a person over the period and the repositories selected on the team page, with those of their peers:
// the people of the same stack, or the whole team when the stack has too few people to compare with.
/**
 * A row of teamRows(): a person's figures over the period.
 * @typedef {ReturnType<typeof teamRows>[number]} TeamRow
 */

/** @param {TeamRow} row */
export function personDetails(row) {
  const { login } = row
  const period = currentPeriod()
  const network = reviewNetwork(withoutFormer(period), state.repos.team)
  /**
   * @template {{ login: string }} Row
   * @param {Row[]} rows
   * @returns {Map<string, Row>}
   */
  const byLogin = (rows) => new Map(rows.map((other) => [other.login, other]))
  const authors = byLogin(authorRows('team'))
  const reviewers = byLogin(reviewerRows('team'))
  const networkAuthors = byLogin(network.authors)
  /** @param {TeamRow} other */
  const detailsOf = (other) => ({
    row: other,
    author: authors.get(other.login),
    reviewer: reviewers.get(other.login),
    network: networkAuthors.get(other.login),
  })
  const team = teamRows()
  const type = stackType(row.stack.counts)
  const sameStack = team.filter((other) => stackType(other.stack.counts)?.key === type?.key)
  const peers = type && sameStack.length >= MIN_PEERS ? sameStack : team
  const author = period.authors.find((person) => person.login === login)
  /**
   * @param {ReviewNetwork['pairs']} pairs
   * @param {'author' | 'reviewer'} key
   * @returns {[login: string, prs: number][]}
   */
  const top = (pairs, key) => pairs.slice(0, PERSON_TOP).map((pair) => [pair[key], pair.prs])

  return {
    ...detailsOf(row),
    peers: { label: peers === team ? 'de l’équipe' : /** @type {{ label: string }} */ (type).label, details: peers.map(detailsOf) },
    reviewedBy: top(network.pairs.filter((pair) => pair.author === login), 'reviewer'),
    reviews: top(network.pairs.filter((pair) => pair.reviewer === login), 'author'),
    codeRepos: author
      ? selectedEntries(author, 'team')
          .filter(([, stats]) => stats.code > 0)
          .map(([repo, stats]) => /** @type {[repo: string, code: number]} */ ([repo, stats.code]))
          .sort((a, b) => b[1] - a[1])
          .slice(0, PERSON_TOP)
      : [],
  }
}
