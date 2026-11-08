// Tests of the projects of the period (site/model/projects.js): worked out once per stats, period, squad and
// repositories, the share of the team their authors are, and the repositories the filter lists. Every project, squad,
// repository and person here is made up.
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'

import { anyProject, currentProjects, projectRepoCounts } from '../../site/model/projects.js'
import { state } from '../../site/model/state.js'
import { record, useStats } from './stats.mjs'

const records = [
  record('ada', '2026-05-04T09:00:00Z', { project: 'paper-kite', mergedAt: Date.parse('2026-05-05T09:00:00Z') / 60_000, mergedBy: 'ada' }),
  record('ben', '2026-05-20T09:00:00Z', { repo: 'api', project: 'paper-kite' }),
  record('cleo', '2026-06-01T09:00:00Z'),
  record('ada', '2026-06-08T09:00:00Z', { repo: 'mobile', project: 'quiet-otter' }),
  record('ben', '2026-06-09T09:00:00Z', { repo: 'mobile', project: 'quiet-otter' }),
  // A project branch made by mistake: a single pull request, no project.
  record('cleo', '2026-06-10T09:00:00Z', { project: 'stray-branch' }),
]

beforeEach(() => {
  useStats({ squads: [{ name: 'Boutique', members: ['ada', 'cleo'] }], pullRequests: records })
  state.repos.projects = null
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

  test('the repositories picked: the projects with pull requests there, and their figures there', () => {
    state.repos.projects = new Set(['api'])
    const { rows } = currentProjects()
    assert.deepEqual(
      rows.map((row) => [row.name, row.code, row.people]),
      [['paper-kite', 1, 1]],
    )
    // Its life is still the whole project's: it started with Ada's pull request on web.
    assert.equal(rows[0].start, Date.parse('2026-05-04T09:00:00Z') / 60_000)
  })

  test('the filter lists every repository of the projects of the period, whatever those picked', () => {
    state.repos.projects = new Set(['api'])
    assert.deepEqual([...projectRepoCounts()].sort(), [
      ['api', 1],
      ['mobile', 2],
      ['web', 1],
    ])
  })

  test('whether the stats know any project at all, one with a few code pull requests', () => {
    assert.equal(anyProject(), true)
    useStats({ pullRequests: records.filter((pr) => pr.project === 'stray-branch') })
    assert.equal(anyProject(), false)
    useStats({ pullRequests: records.filter((pr) => !pr.project) })
    assert.equal(anyProject(), false)
  })
})
