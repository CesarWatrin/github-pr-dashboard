// Tests of what the pages read of the AC (site/model/acs.js): worked out once per list of records, for the squad picked,
// over the period and the period compared, and those of a person and of a squad. Every AC, squad, repository and person
// here is made up.
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'

import { acBreakdown, acChart, acsFor, acTotals, anyAc, comparedAcTotals, currentAcs, personAcs, squadAcs } from '../../site/model/acs.js'
import { state } from '../../site/model/state.js'
import { minutes, record, useStats } from './stats.mjs'

const BOUTIQUE = { name: 'Boutique', members: ['ada', 'cleo'] }
const records = [
  record('ada', '2026-05-04T09:00:00Z', { ac: 'feature/csv-export', mergedAt: minutes('2026-05-05T09:00:00Z'), lines: 40 }),
  record('ben', '2026-05-20T09:00:00Z', { repo: 'api', ac: 'feat/dark-mode', mergedAt: minutes('2026-05-21T09:00:00Z'), lines: 400 }),
  record('cleo', '2026-06-01T09:00:00Z', { ac: 'feature/quick-search' }),
  record('ada', '2026-06-08T09:00:00Z'),
]

beforeEach(() => {
  useStats({ squads: [BOUTIQUE], pullRequests: records })
  // The page reads the hash of its address: a made-up one, all the model needs.
  Object.defineProperty(globalThis, 'location', { value: { hash: '#/ac' }, configurable: true, writable: true })
})
afterEach(() => {
  delete globalThis.location
})

describe('the AC of the page', () => {
  test('worked out once per list of records', () => {
    assert.deepEqual(currentAcs().map((ac) => ac.key), ['csv-export', 'dark-mode', 'quick-search'])
    assert.equal(acsFor(state.stats.pullRequests), currentAcs())
    assert.equal(anyAc(), true)
    useStats({ pullRequests: records.filter((pr) => !pr.ac) })
    assert.equal(anyAc(), false)
  })

  test('what they add up to over the period, with the share of the code pull requests they are', () => {
    const totals = acTotals()
    assert.deepEqual([totals.started, totals.delivered, totals.open, totals.code, totals.codeShare], [3, 2, 1, 3, 3 / 4])
    assert.equal(comparedAcTotals(), null)
  })

  test('month by month, and those delivered by repository, person, squad and size', () => {
    const may = acChart().find((point) => point.key === '2026-05')
    assert.deepEqual([may.started, may.delivered], [2, 2])
    const { repos, people, squads, sizes } = acBreakdown()
    assert.deepEqual(repos, [['api', 1], ['web', 1]])
    assert.deepEqual(people.map(([login]) => login), ['ada', 'ben'])
    assert.deepEqual(squads, [['Boutique', 1]])
    assert.deepEqual(sizes, [0, 1, 1, 0, 0])
  })

  test('a squad picked counts its own, a person and a squad theirs', () => {
    assert.deepEqual([personAcs('ada').delivered, personAcs('cleo').started, personAcs('ben').delivered], [1, 1, 1])
    assert.deepEqual([squadAcs(BOUTIQUE).started, squadAcs(BOUTIQUE).delivered], [2, 1])
    state.squad = 'Boutique'
    assert.deepEqual(currentAcs().map((ac) => ac.key), ['csv-export', 'quick-search'])
  })
})
