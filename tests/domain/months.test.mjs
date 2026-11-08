// Tests of the monthly figures: badges and trends (site/domain/months.js). Every repository, person and figure here is made up.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  lastMonthSummary,
  monthlyActivity,
  monthlyLeaders,
  monthsTouched,
  monthYearBefore,
  rollingMedian,
} from '../../site/domain/months.js'
import { parisMidnight } from '../../site/domain/time.js'
import { at, record } from './records.mjs'

describe('monthlyActivity', () => {
  const records = [
    // A hotfix of Ana's in March, reviewed twice by Ben in March, with comments, then once in April, and merged in
    // April: its lines count in April.
    record({
      repo: 'web',
      number: 30,
      author: 'ana',
      hotfix: true,
      createdAt: at('2026-03-30T09:00:00Z'),
      mergedAt: at('2026-04-01T12:00:00Z'),
      lines: 40,
      deleted: 15,
      interventions: [
        ['ben', at('2026-03-30T10:00:00Z'), 'COMMENTED', 2],
        ['ben', at('2026-03-31T10:00:00Z'), 'APPROVED', 1],
        ['ben', at('2026-04-01T10:00:00Z'), 'COMMENTED', 1],
      ],
    }),
    // Opened at 23:30 UTC on the 31st of March: already April in Paris.
    record({ repo: 'web', number: 31, author: 'ana', createdAt: at('2026-03-31T23:30:00Z') }),
    // Releases and bot pull requests do not count, nor do the reviews they get.
    record({
      repo: 'web',
      number: 32,
      author: 'ana',
      kind: 'release',
      createdAt: at('2026-03-10T09:00:00Z'),
      mergedAt: at('2026-03-10T12:00:00Z'),
      lines: 500,
      interventions: [['ben', at('2026-03-10T10:00:00Z'), 'APPROVED', 0]],
    }),
    record({ repo: 'web', number: 33, author: 'renovate', bot: true, createdAt: at('2026-03-11T09:00:00Z') }),
    // A merge of a branch into another counts among the pull requests Ana opened in March, and nowhere else.
    record({
      repo: 'web',
      number: 34,
      author: 'ana',
      kind: 'integration',
      createdAt: at('2026-03-12T09:00:00Z'),
      mergedAt: at('2026-03-12T10:00:00Z'),
      lines: 3000,
      interventions: [['ben', at('2026-03-12T09:30:00Z'), 'APPROVED', 1]],
    }),
  ]
  const activity = monthlyActivity(records)

  test('code pull requests and hotfixes count in the Paris month opened, their lines in that of the merge', () => {
    assert.deepEqual(Object.fromEntries(activity.get('ana')), {
      '2026-03': { code: 1, hotfixes: 1, reviewed: 0, comments: 0, added: 0, deleted: 0, opened: 2, projects: 0, acs: 0 },
      '2026-04': { code: 1, hotfixes: 0, reviewed: 0, comments: 0, added: 25, deleted: 15, opened: 1, projects: 0, acs: 0 },
    })
  })

  test('a pull request counts once a month for its reviewer, comments all count', () => {
    assert.deepEqual(Object.fromEntries(activity.get('ben')), {
      '2026-03': { code: 0, hotfixes: 0, reviewed: 1, comments: 3, added: 0, deleted: 0, opened: 0, projects: 0, acs: 0 },
      '2026-04': { code: 0, hotfixes: 0, reviewed: 1, comments: 1, added: 0, deleted: 0, opened: 0, projects: 0, acs: 0 },
    })
  })

  test('bots do not show', () => {
    assert.equal(activity.has('renovate'), false)
  })

  test('the code pull requests of a project count apart, those of a branch made by mistake do not', () => {
    const projects = monthlyActivity([
      // Two code pull requests of a project: a project. Its merge into develop is not code.
      record({ repo: 'web', number: 40, author: 'cleo', project: 'paper-kite', createdAt: at('2026-03-02T09:00:00Z') }),
      record({ repo: 'api', number: 41, author: 'cleo', project: 'paper-kite', createdAt: at('2026-03-09T09:00:00Z') }),
      record({ repo: 'web', number: 42, author: 'cleo', kind: 'integration', project: 'paper-kite', projectMerge: true, createdAt: at('2026-03-20T09:00:00Z') }),
      // A single pull request on a project branch tells nothing of a project.
      record({ repo: 'web', number: 43, author: 'cleo', project: 'blue-falcon', createdAt: at('2026-03-10T09:00:00Z') }),
    ])
    assert.deepEqual([projects.get('cleo').get('2026-03').projects, projects.get('cleo').get('2026-03').code], [2, 3])
  })

  test('the code pull requests of an AC count apart', () => {
    const acs = monthlyActivity([
      record({ repo: 'web', number: 50, author: 'dan', ac: 'feature/csv-export', createdAt: at('2026-03-02T09:00:00Z') }),
      record({ repo: 'web', number: 51, author: 'dan', createdAt: at('2026-03-03T09:00:00Z') }),
    ])
    assert.deepEqual([acs.get('dan').get('2026-03').acs, acs.get('dan').get('2026-03').code], [1, 2])
  })
})

describe('monthlyLeaders', () => {
  const history = {
    '2026-02': { alice: { code: 4, reviewed: 1 }, bob: { code: 4, reviewed: 3 } },
    '2026-01': { alice: { code: 2, reviewed: 0 }, carol: { code: 5, reviewed: 2 } },
    '2026-03': { bob: { code: 0, reviewed: 0 } },
  }

  test('the top of each month, oldest first, ties sharing it', () => {
    assert.deepEqual(monthlyLeaders(history, 'code'), [
      { month: '2026-01', value: 5, people: ['carol'] },
      { month: '2026-02', value: 4, people: ['alice', 'bob'] },
    ])
  })

  test('a month nobody did any of it has no leader', () => {
    assert.deepEqual(
      monthlyLeaders(history, 'reviewed').map(({ month }) => month),
      ['2026-01', '2026-02'],
    )
    assert.deepEqual(monthlyLeaders(history, 'hotfixes'), [])
  })
})

describe('monthly trends', () => {
  test('the same month a year earlier, across a new year too', () => {
    assert.equal(monthYearBefore('2026-03'), '2025-03')
    assert.equal(monthYearBefore('2026-01'), '2025-01')
  })

  test('the months a range touches, each whole, its end left out, in Paris time', () => {
    const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05']
    // From 15 February to 10 April included.
    assert.deepEqual(monthsTouched(months, { start: parisMidnight('2026-02-15'), end: parisMidnight('2026-04-11') }), ['2026-02', '2026-03', '2026-04'])
    // Up to the end of March: April is not touched.
    assert.deepEqual(monthsTouched(months, { start: parisMidnight('2026-03-01'), end: parisMidnight('2026-04-01') }), ['2026-03'])
    // A range starting before the first month keeps the months there are.
    assert.deepEqual(monthsTouched(months, { start: parisMidnight('2025-11-20'), end: parisMidnight('2026-01-05') }), ['2026-01'])
    assert.deepEqual(monthsTouched(months, { start: parisMidnight('2025-10-01'), end: parisMidnight('2025-12-01') }), [])
  })

  test('a rolling median waits for as many values as its size, in a row', () => {
    assert.deepEqual(rollingMedian([4, 1, 7, 2, 9], 3), [null, null, 4, 2, 7])
    assert.deepEqual(rollingMedian([4, 1], 3), [null, null])
  })

  test('a missing value breaks the run of a rolling median', () => {
    assert.deepEqual(rollingMedian([3, null, 5, 6, 1, 8], 3), [null, null, null, null, 5, 6])
  })

  // Fourteen whole months, from January 2025 to February 2026, each worth its number.
  const months = Array.from({ length: 14 }, (_, index) => ({
    month: index < 12 ? `2025-${String(index + 1).padStart(2, '0')}` : `2026-${String(index - 11).padStart(2, '0')}`,
    value: index + 1,
  }))

  test('the last month against the same month a year earlier and the median of the last twelve', () => {
    assert.deepEqual(lastMonthSummary(months), { month: '2026-02', value: 14, yearAgo: 2, yearMedian: 8.5 })
  })

  test('a series shorter than a year has nothing to set its last month against a year earlier', () => {
    assert.deepEqual(lastMonthSummary(months.slice(-6)), { month: '2026-02', value: 14, yearAgo: null, yearMedian: 11.5 })
  })

  test('months without the figure stay out of the median, and leave the year earlier empty', () => {
    const withGaps = months.map((point) => (point.month < '2025-07' ? { ...point, value: null } : point))
    assert.deepEqual(lastMonthSummary(withGaps), { month: '2026-02', value: 14, yearAgo: null, yearMedian: 10.5 })
    assert.equal(lastMonthSummary([]), null)
  })
})
