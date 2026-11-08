// Tests of the projects of the records (site/domain/projects.js): their life, their status, their span within a range,
// their figures. Every project, repository, person and figure here is made up.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { projectLife, projectRows, projectSummary, recordsByProject, spanInRange, weeklyOpened } from '../../site/domain/projects.js'
import { DAY_MS, parisMidnight } from '../../site/domain/time.js'
import { at, record } from './records.mjs'

const NOW = Date.parse('2026-06-15T10:00:00Z')
// The weeks of March 2026 to the end of May, in Paris days.
/** @type {TimeRange} */
const SPRING = { start: parisMidnight('2026-03-02'), end: parisMidnight('2026-06-01'), bucket: 'week' }

// A project in two repositories, merged into the long-lived branch of each, the last on Tuesday 5 May.
const KITE = [
  record({
    repo: 'web',
    number: 1,
    author: 'alice',
    project: 'paper-kite',
    createdAt: at('2026-03-02T09:00:00Z'),
    mergedAt: at('2026-03-03T09:00:00Z'),
    lines: 120,
    deleted: 20,
    mergedBy: 'alice',
    interventions: [['bob', at('2026-03-02T15:00:00Z'), 'APPROVED', 0]],
  }),
  record({
    repo: 'api',
    number: 1,
    author: 'bob',
    project: 'paper-kite',
    createdAt: at('2026-04-06T09:00:00Z'),
    // The last feature merged into the project branch: Monday 4 May at 10:00 in Paris.
    mergedAt: at('2026-05-04T08:00:00Z'),
    lines: 40,
    deleted: 10,
    mergedBy: 'bob',
    interventions: [['carol', at('2026-04-07T09:00:00Z'), 'COMMENTED', 2]],
  }),
  // Stacked on the branch of the one before, closed without a merge.
  record({ repo: 'api', number: 2, author: 'carol', project: 'paper-kite', createdAt: at('2026-04-08T09:00:00Z'), closed: true }),
  record({
    repo: 'web',
    number: 2,
    author: 'alice',
    kind: 'integration',
    project: 'paper-kite',
    projectMerge: true,
    createdAt: at('2026-04-30T09:00:00Z'),
    mergedAt: at('2026-05-01T09:00:00Z'),
  }),
  // Tuesday 5 May at 11:00 in Paris: eight working hours on Monday, two on Tuesday after the last feature.
  record({
    repo: 'api',
    number: 3,
    author: 'bob',
    kind: 'integration',
    project: 'paper-kite',
    projectMerge: true,
    createdAt: at('2026-05-04T12:00:00Z'),
    mergedAt: at('2026-05-05T09:00:00Z'),
  }),
]

// A project still under way: a pull request open, reviewed lately.
const OTTER = [
  record({
    repo: 'mobile',
    number: 1,
    author: 'dan',
    project: 'quiet-otter',
    createdAt: at('2026-05-11T09:00:00Z'),
    mergedAt: at('2026-05-12T09:00:00Z'),
    lines: 30,
    deleted: 0,
    mergedBy: 'dan',
  }),
  record({
    repo: 'mobile',
    number: 2,
    author: 'erin',
    project: 'quiet-otter',
    createdAt: at('2026-05-20T09:00:00Z'),
    interventions: [['dan', at('2026-06-10T09:00:00Z'), 'COMMENTED', 1]],
  }),
]

// A project left aside since February, its branch never merged.
const FALCON = [
  record({ repo: 'web', number: 9, author: 'carol', project: 'blue-falcon', createdAt: at('2026-01-12T09:00:00Z') }),
  record({ repo: 'web', number: 10, author: 'carol', project: 'blue-falcon', createdAt: at('2026-02-09T09:00:00Z') }),
]

const OUTSIDE = [
  record({ repo: 'web', number: 20, author: 'alice', createdAt: at('2026-03-04T09:00:00Z') }),
  record({ repo: 'web', number: 21, author: 'dependabot', bot: true, project: 'paper-kite', createdAt: at('2026-03-05T09:00:00Z') }),
]

const ALL = [...KITE, ...OTTER, ...FALCON, ...OUTSIDE]

describe('recordsByProject', () => {
  test('groups the pull requests of people by project, whatever the repository', () => {
    const projects = recordsByProject(ALL)
    assert.deepEqual([...projects.keys()], ['paper-kite', 'quiet-otter', 'blue-falcon'])
    assert.deepEqual(new Set(projects.get('paper-kite').map((pr) => pr.repo)), new Set(['web', 'api']))
    // The bot's pull request stays out.
    assert.equal(projects.get('paper-kite').length, KITE.length)
  })
})

describe('projectLife', () => {
  test('delivered: its branch merged after its last pull request, the last merge ends it', () => {
    const life = projectLife(KITE, NOW)
    assert.equal(life.status, 'delivered')
    assert.equal(life.start, at('2026-03-02T09:00:00Z'))
    assert.deepEqual(life.merges, [
      { repo: 'web', number: 2, at: at('2026-05-01T09:00:00Z') },
      { repo: 'api', number: 3, at: at('2026-05-05T09:00:00Z') },
    ])
    assert.equal(life.deliveredAt, at('2026-05-05T09:00:00Z'))
    assert.equal(life.end, life.deliveredAt)
    assert.equal(life.mergeOpen, false)
  })

  test('its duration counts the calendar days from its first pull request to its end', () => {
    assert.equal(projectLife(KITE, NOW).days, (Date.parse('2026-05-05T09:00:00Z') - Date.parse('2026-03-02T09:00:00Z')) / DAY_MS)
  })

  test('the integration delay: working hours from the last feature merged before the last merge to that merge', () => {
    assert.equal(projectLife(KITE, NOW).integrationHours, 10)
    assert.equal(projectLife(OTTER, NOW).integrationHours, null)
  })

  test('ongoing: not merged, active within the last 30 days; it ends with its last activity', () => {
    const life = projectLife(OTTER, NOW)
    assert.equal(life.status, 'ongoing')
    assert.equal(life.deliveredAt, null)
    assert.equal(life.end, at('2026-06-10T09:00:00Z'))
  })

  test('stalled: not merged, nothing for 30 days', () => {
    const life = projectLife(FALCON, NOW)
    assert.equal(life.status, 'stalled')
    assert.equal(life.end, at('2026-02-09T09:00:00Z'))
    // The same project, looked at a week after its last pull request, was still under way.
    assert.equal(projectLife(FALCON, Date.parse('2026-02-16T09:00:00Z')).status, 'ongoing')
  })

  test('a pull request opened after the merge brings the project back to work', () => {
    const later = record({ repo: 'web', number: 3, author: 'alice', project: 'paper-kite', createdAt: at('2026-06-01T09:00:00Z') })
    const life = projectLife([...KITE, later], NOW)
    assert.equal(life.status, 'ongoing')
    assert.equal(life.deliveredAt, null)
    assert.equal(life.merges.length, 2)
    assert.equal(life.end, at('2026-06-01T09:00:00Z'))
  })

  test('a merge still open says so, and the project is not delivered yet', () => {
    const merge = record({ repo: 'mobile', number: 3, author: 'dan', kind: 'integration', project: 'quiet-otter', projectMerge: true, createdAt: at('2026-06-12T09:00:00Z') })
    const life = projectLife([...OTTER, merge], NOW)
    assert.equal(life.mergeOpen, true)
    assert.equal(life.status, 'ongoing')
  })
})

describe('spanInRange', () => {
  const range = { start: Date.parse('2026-03-01T00:00:00Z'), end: Date.parse('2026-04-01T00:00:00Z') }
  test('a span within the range stays whole', () => {
    assert.deepEqual(spanInRange({ start: at('2026-03-05T00:00:00Z'), end: at('2026-03-20T00:00:00Z') }, range), {
      from: at('2026-03-05T00:00:00Z'),
      to: at('2026-03-20T00:00:00Z'),
      cutStart: false,
      cutEnd: false,
    })
  })

  test('a span across an edge is cut there, and says so', () => {
    assert.deepEqual(spanInRange({ start: at('2026-02-10T00:00:00Z'), end: at('2026-03-10T00:00:00Z') }, range), {
      from: at('2026-03-01T00:00:00Z'),
      to: at('2026-03-10T00:00:00Z'),
      cutStart: true,
      cutEnd: false,
    })
    assert.deepEqual(spanInRange({ start: at('2026-02-10T00:00:00Z'), end: at('2026-04-10T00:00:00Z') }, range), {
      from: at('2026-03-01T00:00:00Z'),
      to: at('2026-04-01T00:00:00Z'),
      cutStart: true,
      cutEnd: true,
    })
  })

  test('a span before or after the range misses it', () => {
    assert.equal(spanInRange({ start: at('2026-01-01T00:00:00Z'), end: at('2026-02-01T00:00:00Z') }, range), null)
    assert.equal(spanInRange({ start: at('2026-04-01T00:00:00Z'), end: at('2026-04-03T00:00:00Z') }, range), null)
  })
})

describe('weeklyOpened', () => {
  test('counts the code pull requests opened each week of a span', () => {
    const from = at('2026-03-02T00:00:00Z')
    assert.deepEqual(weeklyOpened(KITE, from, at('2026-04-12T00:00:00Z')), [1, 0, 0, 0, 0, 2])
    // A span shorter than a week has one.
    assert.deepEqual(weeklyOpened(KITE, from, from + 10 * 60), [1])
  })
})

describe('projectRows', () => {
  const rows = projectRows(ALL, SPRING, { now: NOW })
  const row = (name) => rows.find((item) => item.name === name)

  test('the projects whose span meets the range, the earliest started first', () => {
    // blue-falcon stalled in February, before the range.
    assert.deepEqual(rows.map((item) => item.name), ['paper-kite', 'quiet-otter'])
  })

  test('their figures over the range, as computePeriod() counts them', () => {
    const kite = row('paper-kite')
    assert.deepEqual(
      [kite.code, kite.merged, kite.open, kite.added, kite.deleted],
      // Three code pull requests, two merged; the lines of the merged ones.
      [3, 2, 0, 100 + 30, 20 + 10],
    )
    assert.deepEqual(kite.authors, [
      { login: 'alice', code: 1, merged: 1, added: 100, deleted: 20 },
      { login: 'bob', code: 1, merged: 1, added: 30, deleted: 10 },
      { login: 'carol', code: 1, merged: 0, added: 0, deleted: 0 },
    ])
    // Whoever merged without reviewing is no reviewer.
    assert.deepEqual(kite.reviewers, [
      { login: 'bob', prs: 1, comments: 0 },
      { login: 'carol', prs: 1, comments: 2 },
    ])
    assert.deepEqual(kite.repos, [['api', 2], ['web', 1]])
    assert.equal(row('quiet-otter').open, 1)
  })

  test('cut at the end of the range, its weeks and its pace within it', () => {
    const otter = row('quiet-otter')
    assert.equal(otter.span.cutEnd, true)
    assert.equal(otter.span.to, SPRING.end / 60_000)
    // Two code pull requests opened over the three weeks from its start to the end of May.
    assert.deepEqual(otter.weeks, [1, 1, 0])
    assert.equal(otter.perWeek, 2 / ((SPRING.end / 60_000 - at('2026-05-11T09:00:00Z')) / (7 * 24 * 60)))
  })

  test('a squad’s figures, the life of the project still that of everyone', () => {
    const squad = ALL.filter((pr) => pr.author === 'bob')
    const [kite] = projectRows(squad, SPRING, { all: ALL, now: NOW })
    assert.equal(kite.name, 'paper-kite')
    assert.equal(kite.code, 1)
    assert.equal(kite.status, 'delivered')
    assert.equal(kite.start, at('2026-03-02T09:00:00Z'))
    // Every repository of the project, even one the squad did not touch over the range.
    assert.deepEqual(kite.repos, [['api', 1], ['web', 0]])
  })
})

describe('projectSummary', () => {
  test('ongoing now, delivered within the range, and the medians of the delivered ones', () => {
    const rows = projectRows(ALL, SPRING, { now: NOW })
    assert.deepEqual(projectSummary(rows, SPRING), {
      ongoing: 1,
      delivered: 1,
      medianDays: (Date.parse('2026-05-05T09:00:00Z') - Date.parse('2026-03-02T09:00:00Z')) / DAY_MS,
      medianIntegrationHours: 10,
    })
  })

  test('a project delivered after the range does not count as delivered within it', () => {
    const march = { start: parisMidnight('2026-03-02'), end: parisMidnight('2026-04-01') }
    const summary = projectSummary(projectRows(ALL, { ...march, bucket: 'week' }, { now: NOW }), march)
    assert.deepEqual([summary.delivered, summary.medianDays], [0, null])
  })
})
