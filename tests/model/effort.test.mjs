// Tests of what the pages read of where the code effort goes (site/model/effort.js): for the squad picked, over the
// period and the period compared, bucket by bucket, per squad and per person still in the team. Every squad, project,
// AC, repository and person here is made up.
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'

import { comparedEffort, currentEffort, effortChart, peopleEfforts, personEffort, squadEffort, squadEfforts } from '../../site/model/effort.js'
import { state } from '../../site/model/state.js'
import { record, useStats } from './stats.mjs'

const BOUTIQUE = { name: 'Boutique', members: ['ada', 'cleo'] }
const records = [
  // A project of two code pull requests, and a project branch of a single one, made by mistake: the rest.
  record('ada', '2026-05-04T09:00:00Z', { project: 'blue-kite' }),
  record('ben', '2026-05-05T09:00:00Z', { project: 'blue-kite' }),
  record('ben', '2026-05-06T09:00:00Z', { project: 'stray-branch' }),
  // A hotfix, an AC, and a code pull request of none of them.
  record('ben', '2026-06-01T09:00:00Z', { hotfix: true }),
  record('cleo', '2026-06-02T09:00:00Z', { ac: 'feature/csv-export' }),
  record('ada', '2026-06-08T09:00:00Z'),
  // Someone who left the team in January: their pull request still counts, they no longer show.
  record('dan', '2026-01-12T09:00:00Z', { hotfix: true }),
  // A hotfix of the year before.
  record('ben', '2025-03-10T09:00:00Z', { hotfix: true }),
]

beforeEach(() => {
  useStats({ squads: [BOUTIQUE], pullRequests: records })
  // The page reads the hash of its address: a made-up one, all the model needs.
  Object.defineProperty(globalThis, 'location', { value: { hash: '#/effort' }, configurable: true, writable: true })
})
afterEach(() => {
  delete globalThis.location
})

describe('where the effort goes, as the pages read it', () => {
  test('over the period, a project being one the projects page counts', () => {
    const effort = currentEffort()
    assert.deepEqual(effort.counts, { projects: 2, tma: 2, acs: 1, rest: 2 })
    assert.deepEqual([effort.build, effort.run], [3, 2])
  })

  test('against the period compared, once one is picked', () => {
    assert.equal(comparedEffort(), null)
    state.compare = 'previous'
    assert.deepEqual(comparedEffort().counts, { projects: 0, tma: 1, acs: 0, rest: 0 })
  })

  test('month by month', () => {
    const may = effortChart().find((point) => point.key === '2026-05')
    assert.deepEqual(may.counts, { projects: 2, tma: 0, acs: 0, rest: 1 })
  })

  test('per squad, whatever squad is picked, and the whole organization', () => {
    state.squad = 'Boutique'
    const { squads, organization } = squadEfforts()
    assert.deepEqual(squads.map((squad) => [squad.name, squad.code]), [['Boutique', 3]])
    assert.equal(organization.code, 7)
    assert.deepEqual(squadEffort(BOUTIQUE).counts, { projects: 1, tma: 0, acs: 1, rest: 1 })
  })

  test('per person still in the team, the busiest first, and for the squad picked', () => {
    assert.deepEqual(peopleEfforts().map((person) => person.login), ['ben', 'ada', 'cleo'])
    assert.deepEqual(personEffort('ben').counts, { projects: 1, tma: 1, acs: 0, rest: 1 })
    assert.equal(personEffort('eve'), null)
    state.squad = 'Boutique'
    assert.deepEqual(currentEffort().counts, { projects: 1, tma: 0, acs: 1, rest: 1 })
    assert.deepEqual(peopleEfforts().map((person) => person.login), ['ada', 'cleo'])
  })
})
