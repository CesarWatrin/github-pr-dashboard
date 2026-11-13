// What the address of the page holds besides its page, so that a link leads someone to the same place: the filters
// (period or picked days, comparison, squad, search, repositories picked, statuses of the projects, month and person of
// the report, person picked for the reviews over time) and the card or the timeline of a pull request open. No DOM: shell/url-state.js reads and writes the address.

import { COMPARISONS, CUSTOM_PERIOD, NO_COMPARISON, PERIODS } from './periods.js'
import { state } from './state.js'

/** @typedef {'person' | 'repo' | 'project' | 'squad'} CardKind */
/** @type {CardKind[]} */
const CARD_KINDS = ['person', 'repo', 'project', 'squad']
const PROJECT_STATUSES = ['ongoing', 'stalled', 'abandoned', 'delivered']
const DAY = /^\d{4}-\d{2}-\d{2}$/
const MONTH = /^\d{4}-\d{2}$/

// The query of the address for the state of the page: the period always, the rest only when it is not the default.
/**
 * @param {string} route
 * @returns {string}
 */
export function urlQueryOf(route) {
  const params = new URLSearchParams()
  params.set('period', state.period)
  if (state.period === CUSTOM_PERIOD && state.range) {
    params.set('from', state.range.from)
    params.set('to', state.range.to)
  }
  if (state.compare !== NO_COMPARISON) {
    params.set('compare', state.compare)
  }
  if (state.squad) {
    params.set('squad', state.squad)
  }
  if (state.query) {
    params.set('q', state.query)
  }
  for (const [name, selection] of Object.entries(state.repos)) {
    if (selection) {
      params.set(`repos-${name}`, [...selection].sort().join(','))
    }
  }
  if (state.projectStatuses) {
    params.set('statuses', PROJECT_STATUSES.filter((status) => state.projectStatuses?.has(status)).join(','))
  }
  if (route === 'report' && state.reportMonth) {
    params.set('month', state.reportMonth)
  }
  if (route === 'report' && state.reportPerson) {
    params.set('member', state.reportPerson)
  }
  if (route === 'reviewers' && state.person) {
    params.set('person', state.person)
  }
  if (state.openCard) {
    params.set('card', `${state.openCard.kind}:${state.openCard.key}`)
  }
  if (state.openPullRequest) {
    params.set('pr', state.openPullRequest)
  }

  return params.toString()
}

// Sets the state of the page from the query of an address, a shared link leading to the same place whatever the viewer
// had picked: what it does not say goes back to the defaults (no comparison, no squad, no search, every repository and
// status, the current month, the whole team on the report, the busiest reviewer), what it says wrong is left aside (a period of none, days the wrong way round). Returns the
// card and the timeline of a pull request to open once the stats are there.
/**
 * @param {string} query
 * @returns {{ card: { kind: CardKind, key: string } | null, pullRequest: string | null }}
 */
export function applyUrlQuery(query) {
  const params = new URLSearchParams(query)
  const period = params.get('period')
  if (period && (period in PERIODS || period === CUSTOM_PERIOD)) {
    state.period = period
  }
  const [from, to] = [params.get('from'), params.get('to')]
  if (period === CUSTOM_PERIOD && from && to && DAY.test(from) && DAY.test(to) && from <= to) {
    state.range = { from, to }
  }
  const compare = params.get('compare')
  state.compare = compare && compare in COMPARISONS ? compare : NO_COMPARISON
  state.squad = params.get('squad') ?? ''
  state.query = (params.get('q') ?? '').trim().toLowerCase()
  for (const name of /** @type {(keyof State['repos'])[]} */ (Object.keys(state.repos))) {
    const list = params.get(`repos-${name}`)
    state.repos[name] = list === null ? null : new Set(list.split(',').filter(Boolean))
  }
  const statuses = params.get('statuses')
  state.projectStatuses = statuses === null ? null : new Set(statuses.split(',').filter((status) => PROJECT_STATUSES.includes(status)))
  const month = params.get('month')
  state.reportMonth = month && MONTH.test(month) ? month : null
  state.reportPerson = params.get('member') || null
  state.person = params.get('person') || null
  const [kind, ...key] = (params.get('card') ?? '').split(':')
  const pullRequest = params.get('pr')

  return {
    card: CARD_KINDS.includes(/** @type {CardKind} */ (kind)) && key.join(':') ? { kind: /** @type {CardKind} */ (kind), key: key.join(':') } : null,
    pullRequest: pullRequest && /^[^#]+#\d+$/.test(pullRequest) ? pullRequest : null,
  }
}
