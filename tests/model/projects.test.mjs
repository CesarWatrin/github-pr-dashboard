// Tests of the projects of the period (site/model/projects.js): worked out once per stats, period and squad, and the
// share of the team their authors are. Every project, squad and person here is made up.
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'

import { anyProject, currentProjects } from '../../site/model/projects.js'
import { state } from '../../site/model/state.js'
import { record, useStats } from './stats.mjs'

const records = [
  record('ada', '2026-05-04T09:00:00Z', { project: 'paper-kite', mergedAt: Date.parse('2026-05-05T09:00:00Z') / 60_000, mergedBy: 'ada' }),
  record('ben', '2026-05-20T09:00:00Z', { repo: 'api', project: 'paper-kite' }),
  record('cleo', '2026-06-01T09:00:00Z'),
  record('ada', '2026-06-08T09:00:00Z', { repo: 'mobile', project: 'quiet-otter' }),
]

beforeEach(() => {
  useStats({ squads: [{ name: 'Boutique', members: ['ada', 'cleo'] }], pullRequests: records })
  // The page reads the hash of its address: a made-up one, all the model needs.
  Object.defineProperty(globalThis, 'location', { value: { hash: '#/projets' }, configurable: true, writable: true })
})
afterEach(() => {
  delete globalThis.location
})

describe('currentProjects', () => {
  test('the projects of the period, the earliest started first, worked out once', () => {
    const { rows, summary } = currentProjects()
    assert.deepEqual(rows.map((row) => row.name), ['paper-kite', 'quiet-otter'])
    assert.equal(currentProjects().rows, rows)
    assert.deepEqual([summary.ongoing, summary.delivered], [2, 0])
  })

  test('the people of a project, and the share of the team they are', () => {
    const [kite] = currentProjects().rows
    // Ada and Ben wrote it, among the three people of the team.
    assert.equal(kite.people, 2)
    assert.equal(kite.teamShare, 2 / 3)
  })

  test('a squad counts its own pull requests, a share of its own members', () => {
    state.squad = 'Boutique'
    const [kite] = currentProjects().rows
    assert.deepEqual([kite.code, kite.people, kite.teamShare], [1, 1, 1 / 2])
  })

  test('whether the stats know any project at all', () => {
    assert.equal(anyProject(), true)
    useStats({ pullRequests: records.filter((pr) => !pr.project) })
    assert.equal(anyProject(), false)
  })
})
