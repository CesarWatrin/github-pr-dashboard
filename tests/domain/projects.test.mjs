// Tests of the projects of the records (site/domain/projects.js): their life, their status, their span within a range,
// their figures. Every project, repository, person and figure here is made up.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { MIN_PROJECT_CODE, projectLife, projectRows, projectsOf, projectSummary, REUSED_AFTER_DAYS, spanInRange } from '../../site/domain/projects.js'
import { projectSeries } from '../../site/domain/projects/series.js'
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

// A name taken up again: red-heron delivered in January 2025 in one repository, then a project of the same name started
// in June 2025 in another, nothing of the first left open and nothing done on it meanwhile.
const HERON_MERGE = record({
  repo: 'web',
  number: 31,
  author: 'alice',
  kind: 'integration',
  project: 'red-heron',
  projectMerge: true,
  createdAt: at('2025-01-08T09:00:00Z'),
  mergedAt: at('2025-01-10T09:00:00Z'),
})
const HERON_CODE = [
  record({ repo: 'web', number: 30, author: 'alice', project: 'red-heron', createdAt: at('2025-01-06T09:00:00Z'), mergedAt: at('2025-01-07T09:00:00Z') }),
  record({ repo: 'web', number: 32, author: 'bob', project: 'red-heron', createdAt: at('2025-01-07T09:00:00Z'), mergedAt: at('2025-01-08T08:00:00Z') }),
]
const HERON = [...HERON_CODE, HERON_MERGE]
const HERON_AGAIN = [
  record({ repo: 'api', number: 40, author: 'dan', project: 'red-heron', createdAt: at('2025-06-02T09:00:00Z'), mergedAt: at('2025-06-03T09:00:00Z') }),
  record({ repo: 'api', number: 41, author: 'erin', project: 'red-heron', createdAt: at('2025-06-09T09:00:00Z') }),
]

describe('projectsOf', () => {
  test('groups the pull requests of people by project, whatever the repository', () => {
    const projects = projectsOf(ALL)
    assert.deepEqual(projects.map((project) => project.key), ['paper-kite', 'quiet-otter', 'blue-falcon'])
    const kite = projects[0]
    assert.deepEqual([kite.name, kite.run, kite.runs], ['paper-kite', 1, 1])
    assert.deepEqual(new Set(kite.records.map((pr) => pr.repo)), new Set(['web', 'api']))
    // The bot's pull request stays out.
    assert.equal(kite.records.length, KITE.length)
  })

  test('a name taken up again once its project was over is another project', () => {
    const projects = projectsOf([...HERON_AGAIN, ...HERON])
    assert.deepEqual(
      projects.map(({ key, name, run, runs }) => [key, name, run, runs]),
      [
        ['red-heron', 'red-heron', 1, 2],
        ['red-heron#2', 'red-heron', 2, 2],
      ],
    )
    assert.deepEqual(projects[0].records, HERON)
    assert.deepEqual(projects[1].records, HERON_AGAIN)
  })

  test('a pause with a pull request of it still open is the same project', () => {
    // The merge of its branch, opened in January, merged once the work went on in June.
    const waiting = { ...HERON_MERGE, mergedAt: at('2025-06-20T09:00:00Z') }
    const [project, ...others] = projectsOf([...HERON_CODE, waiting, ...HERON_AGAIN])
    assert.equal(others.length, 0)
    assert.equal(project.records.length, 5)
  })

  test('a pull request closed without a merge left it open until it was closed', () => {
    const merge = { ...HERON_MERGE, mergedAt: null, closed: true }
    // Closed in June, after the work went on.
    assert.equal(projectsOf([...HERON_CODE, { ...merge, closedAt: at('2025-06-05T09:00:00Z') }, ...HERON_AGAIN]).length, 1)
    // Closed in January.
    assert.equal(projectsOf([...HERON_CODE, { ...merge, closedAt: at('2025-01-10T09:00:00Z') }, ...HERON_AGAIN]).length, 2)
    // Without its closing time, published before the sync gave it: as of its last event, its opening.
    assert.equal(projectsOf([...HERON_CODE, merge, ...HERON_AGAIN]).length, 2)
  })

  test('a shorter pause, or an activity during it, is the same project', () => {
    // Opened 72 days after the last merge, within REUSED_AFTER_DAYS.
    assert.ok(REUSED_AFTER_DAYS > 72)
    assert.equal(projectsOf([...HERON, { ...HERON_AGAIN[0], createdAt: at('2025-03-23T09:00:00Z') }]).length, 1)
    // A comment in March on the merge of January: the project moved then, 77 days before June.
    const commented = { ...HERON_MERGE, interventions: [['bob', at('2025-03-17T09:00:00Z'), 'COMMENTED', 1]] }
    assert.equal(projectsOf([...HERON_CODE, commented, ...HERON_AGAIN]).length, 1)
  })

  test('a project with fewer than MIN_PROJECT_CODE code pull requests is none, its name taken up again or not', () => {
    assert.equal(MIN_PROJECT_CODE, 2)
    // A project branch made by mistake: one pull request, and the merge of the branch, closed.
    const mistake = [HERON_CODE[0], { ...HERON_MERGE, mergedAt: null, closed: true, closedAt: at('2025-01-09T09:00:00Z') }]
    assert.deepEqual(projectsOf(mistake), [])
    // Taken up again in June: the project of June is the only one of its name.
    assert.deepEqual(
      projectsOf([...mistake, ...HERON_AGAIN]).map(({ key, run, runs, records }) => [key, run, runs, records.length]),
      [['red-heron', 1, 1, 2]],
    )
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

  test('cut at the end of the range, and its pace within it', () => {
    const otter = row('quiet-otter')
    assert.equal(otter.span.cutEnd, true)
    assert.equal(otter.span.to, SPRING.end / 60_000)
    // Two code pull requests opened over the three weeks or so from its start to the end of May.
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

  test('the projects of a name taken up again, each with its own life and the others’ start and end', () => {
    /** @type {TimeRange} */
    const year = { start: parisMidnight('2025-01-01'), end: parisMidnight('2026-01-01'), bucket: 'month' }
    const [first, second] = projectRows([...HERON, ...HERON_AGAIN], year, { now: NOW })
    assert.deepEqual([first.key, first.status, first.start, first.end], ['red-heron', 'delivered', at('2025-01-06T09:00:00Z'), at('2025-01-10T09:00:00Z')])
    assert.deepEqual([second.key, second.start, second.merges, second.repos], ['red-heron#2', at('2025-06-02T09:00:00Z'), [], [['api', 2]]])
    assert.deepEqual(first.namesakes, [{ start: second.start, end: second.end, status: second.status }])
    assert.deepEqual(second.namesakes, [{ start: first.start, end: first.end, status: 'delivered' }])
    // A squad that only took part in the second sees it alone, still told apart from the first.
    const squad = projectRows(HERON_AGAIN.filter((pr) => pr.author === 'dan'), year, { all: [...HERON, ...HERON_AGAIN], now: NOW })
    assert.deepEqual(
      squad.map((row) => [row.key, row.code, row.start]),
      [['red-heron#2', 1, at('2025-06-02T09:00:00Z')]],
    )
  })
})

describe('projectSummary', () => {
  test('living and started within the range, ongoing now, delivered within the range, their code, and the medians of the delivered ones', () => {
    const rows = projectRows(ALL, SPRING, { now: NOW })
    // paper-kite and quiet-otter, both started within the range; blue-falcon was over before it.
    assert.deepEqual(projectSummary(rows, SPRING), {
      active: 2,
      started: 2,
      ongoing: 1,
      delivered: 1,
      code: 5,
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

describe('projectSeries', () => {
  test('month by month, the projects living, started and delivered', () => {
    /** @type {TimeRange} */
    const range = { start: parisMidnight('2026-03-01'), end: parisMidnight('2026-06-01'), bucket: 'month' }
    // paper-kite lives from March to its delivery in May; quiet-otter starts in May.
    assert.deepEqual(projectSeries(projectRows(ALL, range, { now: NOW }), range), [
      { key: '2026-03', partial: false, active: 1, started: 1, delivered: 0 },
      { key: '2026-04', partial: false, active: 1, started: 0, delivered: 0 },
      { key: '2026-05', partial: false, active: 2, started: 1, delivered: 1 },
    ])
  })

  test('week by week, a bucket the range does not cover whole is partial', () => {
    const points = projectSeries(projectRows(ALL, SPRING, { now: NOW }), { ...SPRING, start: parisMidnight('2026-03-04') })
    assert.deepEqual([points[0].key, points[0].partial, points[0].active, points.at(-1).partial], ['2026-03-02', true, 1, false])
  })
})

