// Tests of the monthly report of one person (site/model/person-report.js, monthStats() of site/model/months.js for a
// person): their own pull requests, their reviews of anyone's, their projects, partners and badges. Every person,
// repository, project and figure here is made up.
import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'

import { monthStats } from '../../site/model/months.js'
import { arrivalMonth, personBadges, personDuos, personMonth, personRepositories } from '../../site/model/person-report.js'
import { minutes, record, useStats } from './stats.mjs'

beforeEach(() => {
  useStats({
    people: { ada: 'Ada Lune', ben: 'Ben Kerr', cleo: 'Cleo Pax' },
    firstPullRequests: { ada: minutes('2025-11-03T09:00:00Z') },
    pullRequests: [
      // April: Ada starts a project, two code pull requests of it.
      record('ada', '2026-04-07T09:00:00Z', { project: 'paper-kite' }),
      record('ada', '2026-04-08T09:00:00Z', { project: 'paper-kite' }),
      // May: two of Ada's, reviewed by Ben and Cleo; one of Ben's, which Ada reviews and merges, on the project.
      record('ada', '2026-05-04T09:00:00Z', {
        lines: 30,
        deleted: 10,
        mergedAt: minutes('2026-05-05T09:00:00Z'),
        mergedBy: 'ben',
        interventions: [['ben', minutes('2026-05-04T13:00:00Z'), 'APPROVED', 2]],
      }),
      record('ada', '2026-05-06T09:00:00Z', { repo: 'api', interventions: [['cleo', minutes('2026-05-06T10:00:00Z'), 'CHANGES_REQUESTED', 1]] }),
      record('ben', '2026-05-07T09:00:00Z', {
        project: 'paper-kite',
        mergedAt: minutes('2026-05-08T09:00:00Z'),
        mergedBy: 'ada',
        interventions: [['ada', minutes('2026-05-07T10:00:00Z'), 'APPROVED', 0]],
      }),
      // June: everyone still in the team.
      ...['ada', 'ben', 'cleo'].map((login) => record(login, '2026-06-10T09:00:00Z')),
    ],
  })
})

describe('the report of a person', () => {
  test('counts the pull requests they opened, and their reviews of anyone’s, apart from the team’s', () => {
    const may = personMonth('2026-05', 'ada')
    assert.deepEqual([may.period.totals.opened, may.period.totals.merged, may.period.totals.added, may.period.totals.deleted], [2, 1, 20, 10])
    assert.deepEqual(may.reviews, { prs: 1, comments: 0, approved: 1, changesRequested: 0, merges: 1 })
    assert.equal(may.ci, null)
    assert.equal(monthStats('2026-05').period.totals.opened, 3)
  })

  test('keeps the projects worked on in the month, not those only worked on before', () => {
    assert.deepEqual(monthStats('2026-05').projects.rows.map((row) => row.name), ['paper-kite'])
    assert.deepEqual(monthStats('2026-05', 'ben').projects.rows.map((row) => row.name), ['paper-kite'])
    assert.deepEqual(monthStats('2026-05', 'ada').projects.rows, [])
    assert.deepEqual(monthStats('2026-04', 'ada').projects.rows.map((row) => row.name), ['paper-kite'])
  })

  test('names their busiest repositories and who they reviewed with, the most first', () => {
    assert.deepEqual(personRepositories('2026-05', 'ada'), { code: [['api', 1], ['web', 1]], reviews: [['web', 1]] })
    assert.deepEqual(personDuos('2026-05', 'ada'), { reviewedBy: [['ben', 1], ['cleo', 1]], reviewed: [['ben', 1]] })
  })

  test('gives their figure of each badge, and whether they led the team on it', () => {
    const badges = Object.fromEntries(personBadges('2026-05', 'ada', false).map(({ badge, value, leads }) => [badge.key, [value, leads]]))
    assert.deepEqual(badges.opened, [2, true])
    assert.deepEqual(badges.comments, [0, false])
    const ongoing = Object.fromEntries(personBadges('2026-06', 'ben', true).map(({ badge, value, leads }) => [badge.key, [value, leads]]))
    assert.deepEqual(ongoing.opened, [1, true])
  })

  test('starts from the first month a person shows in, when it is known', () => {
    assert.equal(arrivalMonth('ada'), '2025-11')
    assert.equal(arrivalMonth('ben'), '2026-05')
    assert.equal(arrivalMonth('nobody'), null)
  })
})
