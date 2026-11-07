// Tests of the squad picked in the filters (site/model/squads.js): what it scopes, and where. Every squad and person
// here is made up.
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'

import { activeSquad, inSquad, scopedRecords, squadKey } from '../../site/model/squads.js'
import { state } from '../../site/model/state.js'
import { record, useStats } from './stats.mjs'

const records = [record('ada', '2026-06-01T09:00:00Z'), record('ben', '2026-06-02T09:00:00Z'), record('cleo', '2026-06-03T09:00:00Z')]

beforeEach(() => {
  useStats({ squads: [{ name: 'Boutique', members: ['ada', 'cleo'], lead: 'ada' }], pullRequests: records })
  /** @type {any} */ (globalThis).location = { hash: '#/' }
})
afterEach(() => {
  delete globalThis.location
})

describe('the squad picked', () => {
  test('scopes the pages with filters to the pull requests of its members', () => {
    state.squad = 'Boutique'
    assert.equal(squadKey(), 'Boutique')
    assert.deepEqual(scopedRecords().map((pr) => pr.author), ['ada', 'cleo'])
    assert.equal(inSquad('ada'), true)
    assert.equal(inSquad('ben'), false)
  })

  test('scopes nothing on the pages without filters, such as the monthly report', () => {
    state.squad = 'Boutique'
    location.hash = '#/bilan'
    assert.equal(activeSquad(), null)
    assert.equal(scopedRecords(), records)
  })

  test('scopes nothing once the stats no longer have it', () => {
    state.squad = 'Paiement'
    assert.equal(activeSquad(), null)
    assert.equal(inSquad('ben'), true)
  })
})
