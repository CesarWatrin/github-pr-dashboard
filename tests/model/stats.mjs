// Made-up stats for the tests of site/model/, set as the stats of the page: a few people and repositories over the
// three years of a window ending on Monday 15 June 2026.

import { state } from '../../site/model/state.js'

export const GENERATED_AT = '2026-06-15T10:00:00Z'
export const WINDOW_START = '2023-06-16T10:00:00Z'

/** @param {string} iso */
export const minutes = (iso) => Date.parse(iso) / 60_000

let number = 0
/**
 * @param {string} author
 * @param {string} createdAt
 * @param {Partial<PullRequestRecord>} [fields]
 * @returns {PullRequestRecord}
 */
export function record(author, createdAt, fields = {}) {
  return {
    repo: 'web',
    number: ++number,
    author,
    bot: false,
    kind: 'code',
    hotfix: false,
    production: false,
    createdAt: minutes(createdAt),
    mergedAt: null,
    closed: false,
    lines: 10,
    mergedBy: null,
    interventions: [],
    ...fields,
  }
}

// Sets fresh stats, so that every cache of the page starts again, and the choices of a viewer who picked nothing.
/** @param {Partial<Stats>} [fields] */
export function useStats(fields = {}) {
  state.stats = {
    org: 'example-org',
    build: null,
    generatedAt: GENERATED_AT,
    timezone: 'Europe/Paris',
    syncTrigger: null,
    requiredApprovals: 1,
    people: { ada: 'Ada Lune', ben: 'Ben Kerr' },
    repos: {},
    today: { date: GENERATED_AT.slice(0, 10), opened: 0, merged: 0, reviews: 0 },
    windowStart: WINDOW_START,
    pullRequests: [],
    firstPullRequests: {},
    ci: [],
    events: [],
    ...fields,
  }
  Object.assign(state, { period: '365d', range: null, compare: 'none', squad: '', query: '' })

  return state.stats
}
