// Tests of what the address of the page holds (site/model/url-state.js): the filters and the card open, written, then read
// back to the same place. Every squad, repository, person and project here is made up.
import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'

import { state } from '../../site/model/state.js'
import { applyUrlQuery, urlQueryOf } from '../../site/model/url-state.js'
import { useStats } from './stats.mjs'

beforeEach(() => {
  useStats()
  Object.assign(state, { repos: Object.fromEntries(Object.keys(state.repos).map((name) => [name, null])), projectStatuses: null, reportMonth: null, person: null, wrappedFor: null, wrappedTeam: false, wrappedYear: null, openCard: null, openPullRequest: null })
})

describe('the address of the page', () => {
  test('holds the period alone when nothing else is picked', () => {
    assert.equal(urlQueryOf('overview'), 'period=365d')
  })

  test('holds every filter picked and the card open, and leads back to them', () => {
    Object.assign(state, {
      period: 'custom',
      range: { from: '2026-03-01', to: '2026-03-31' },
      compare: 'previous',
      squad: 'Boutique & co',
      query: 'kite',
      projectStatuses: new Set(['stalled', 'ongoing']),
      reportMonth: '2026-02',
      openCard: { kind: 'project', key: 'paper-kite#2' },
      openPullRequest: 'web#42',
    })
    state.repos.projects = new Set(['web', 'api'])
    state.repos.team = new Set()
    const query = urlQueryOf('report')
    const saved = { ...state, repos: { ...state.repos } }

    // Someone else, who picked other things.
    useStats()
    Object.assign(state, { period: '30d', compare: 'year', squad: 'Atelier', query: 'other', projectStatuses: null })
    const open = applyUrlQuery(query)

    for (const key of ['period', 'range', 'compare', 'squad', 'query', 'projectStatuses', 'reportMonth']) {
      assert.deepEqual(state[key], saved[key], key)
    }
    assert.deepEqual([state.repos.projects, state.repos.team, state.repos.authors], [new Set(['api', 'web']), new Set(), null])
    assert.deepEqual(open, { card: { kind: 'project', key: 'paper-kite#2' }, pullRequest: 'web#42' })
  })

  test('says the month of the report on the report only', () => {
    state.reportMonth = '2026-02'
    assert.equal(new URLSearchParams(urlQueryOf('team')).has('month'), false)
  })

  test('says the person picked for the reviews over time on the reviewers page only, and leads back to them', () => {
    state.person = 'zoe-r'
    assert.equal(new URLSearchParams(urlQueryOf('reviewers')).get('person'), 'zoe-r')
    assert.equal(new URLSearchParams(urlQueryOf('team')).has('person'), false)
    const query = urlQueryOf('reviewers')
    state.person = null
    applyUrlQuery(query)
    assert.equal(state.person, 'zoe-r')
  })

  test('says whose year in review shows, or the team’s, and its year, on that page only, and leads back to them', () => {
    Object.assign(state, { wrappedFor: 'zoe-r', wrappedYear: 2025 })
    const query = urlQueryOf('wrapped')
    assert.deepEqual([...new URLSearchParams(query)].filter(([name]) => ['for', 'team', 'year'].includes(name)), [['for', 'zoe-r'], ['year', '2025']])
    assert.equal(new URLSearchParams(urlQueryOf('team')).has('for'), false)
    Object.assign(state, { wrappedFor: null, wrappedYear: null })
    applyUrlQuery(query)
    assert.deepEqual([state.wrappedFor, state.wrappedTeam, state.wrappedYear], ['zoe-r', false, 2025])
    applyUrlQuery('team=1&year=soon')
    assert.deepEqual([state.wrappedFor, state.wrappedTeam, state.wrappedYear], [null, true, null])
    applyUrlQuery('period=365d')
    assert.deepEqual([state.wrappedFor, state.wrappedTeam], [null, false])
  })

  test('what it does not say goes back to the defaults, what it says wrong is left aside', () => {
    Object.assign(state, { compare: 'year', squad: 'Atelier', query: 'kite', projectStatuses: new Set(['stalled']), person: 'zoe-r' })
    state.repos.projects = new Set(['web'])
    const open = applyUrlQuery('period=forever&compare=never&statuses=lost,delivered&month=soon&card=planet:mars&pr=web')
    assert.deepEqual([state.period, state.compare, state.squad, state.query, state.repos.projects], ['365d', 'none', '', '', null])
    assert.deepEqual([...state.projectStatuses], ['delivered'])
    assert.deepEqual([state.reportMonth, state.person], [null, null])
    assert.deepEqual(open, { card: null, pullRequest: null })
  })

  test('picked days the wrong way round keep the days the viewer had', () => {
    state.range = { from: '2026-01-01', to: '2026-01-31' }
    applyUrlQuery('period=custom&from=2026-03-31&to=2026-03-01')
    assert.deepEqual([state.period, state.range], ['custom', { from: '2026-01-01', to: '2026-01-31' }])
  })
})
