// Tests of the stats computed for a date range. Every repository, person and figure here is made up.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { DAY_MS, addDays, computeCi, computePeriod, parisDay, parisMidnight } from '../site/period.js'

const at = (iso) => Date.parse(iso) / 60_000
const iso = (time) => new Date(time * 60_000).toISOString()

// A week of Paris days, Monday 2 to Sunday 8 March 2026.
const WEEK = { start: parisMidnight('2026-03-02'), end: parisMidnight('2026-03-09'), bucket: 'day' }

function record(fields) {
  return {
    bot: false,
    kind: 'code',
    hotfix: false,
    production: false,
    mergedAt: null,
    closed: false,
    lines: 10,
    mergedBy: null,
    interventions: [],
    ...fields,
  }
}

const RECORDS = [
  // Reviewed then merged by someone else, shipped with the release of the 4th.
  record({
    repo: 'web',
    number: 1,
    author: 'alice',
    createdAt: at('2026-03-02T09:00:00Z'),
    mergedAt: at('2026-03-02T15:00:00Z'),
    lines: 50,
    mergedBy: 'bob',
    interventions: [['bob', at('2026-03-02T10:00:00Z'), 'APPROVED', 0]],
    deployedAt: at('2026-03-04T12:00:00Z'),
  }),
  // Merged by its author without any review, with a failed check.
  record({
    repo: 'web',
    number: 2,
    author: 'alice',
    createdAt: at('2026-03-03T09:00:00Z'),
    mergedAt: at('2026-03-04T09:00:00Z'),
    lines: 200,
    mergedBy: 'alice',
    deployedAt: at('2026-03-04T12:00:00Z'),
    checksFailed: true,
  }),
  // Commented, then closed without a merge.
  record({
    repo: 'api',
    number: 3,
    author: 'carol',
    createdAt: at('2026-03-05T08:00:00Z'),
    closed: true,
    interventions: [['alice', at('2026-03-05T09:00:00Z'), 'COMMENTED', 2]],
  }),
  // A hotfix merged into production: a corrective deployment.
  record({
    repo: 'api',
    number: 4,
    author: 'carol',
    hotfix: true,
    createdAt: at('2026-03-06T10:00:00Z'),
    mergedAt: at('2026-03-06T12:00:00Z'),
    lines: 5,
    mergedBy: 'carol',
    interventions: [['bob', at('2026-03-06T11:00:00Z'), 'CHANGES_REQUESTED', 1]],
    deployment: true,
    deployedAt: at('2026-03-06T12:00:00Z'),
  }),
  // A release opened by a bot: a deployment and a release, no author stat.
  record({
    repo: 'web',
    number: 5,
    author: 'robot',
    bot: true,
    kind: 'release',
    production: true,
    createdAt: at('2026-03-04T11:00:00Z'),
    mergedAt: at('2026-03-04T12:00:00Z'),
    deployment: true,
  }),
  // Opened before the range: only its review in the range counts.
  record({
    repo: 'web',
    number: 6,
    author: 'alice',
    createdAt: at('2026-02-20T09:00:00Z'),
    mergedAt: at('2026-02-21T09:00:00Z'),
    mergedBy: 'alice',
    interventions: [['bob', at('2026-03-02T08:00:00Z'), 'COMMENTED', 1]],
  }),
  // Dependabot: one merged, one closed, one still waiting since January.
  record({
    repo: 'web',
    number: 7,
    author: 'dependabot',
    bot: true,
    createdAt: at('2026-03-03T06:00:00Z'),
    mergedAt: at('2026-03-05T06:00:00Z'),
    dependency: 'npm_and_yarn',
  }),
  record({
    repo: 'api',
    number: 8,
    author: 'dependabot',
    bot: true,
    createdAt: at('2026-01-10T06:00:00Z'),
    dependency: 'github_actions',
  }),
  record({
    repo: 'api',
    number: 9,
    author: 'dependabot',
    bot: true,
    createdAt: at('2026-03-07T06:00:00Z'),
    closed: true,
    dependency: 'npm_and_yarn',
  }),
  // A revert merged into production: another corrective deployment.
  record({
    repo: 'api',
    number: 10,
    author: 'bob',
    createdAt: at('2026-03-07T10:00:00Z'),
    mergedAt: at('2026-03-07T11:00:00Z'),
    mergedBy: 'bob',
    deployment: true,
    revert: true,
    deployedAt: at('2026-03-07T11:00:00Z'),
  }),
]

describe('Paris days', () => {
  test('the day follows Paris time, daylight saving included', () => {
    assert.equal(parisDay('2026-03-28T23:30:00Z'), '2026-03-29')
    assert.equal(parisDay('2026-07-01T21:59:00Z'), '2026-07-01')
    assert.equal(parisDay('2026-07-01T22:00:00Z'), '2026-07-02')
  })

  test('a day starts at Paris midnight, in winter and in summer', () => {
    assert.equal(new Date(parisMidnight('2026-03-29')).toISOString(), '2026-03-28T23:00:00.000Z')
    assert.equal(new Date(parisMidnight('2026-07-01')).toISOString(), '2026-06-30T22:00:00.000Z')
    assert.equal(new Date(parisMidnight('2025-10-26')).toISOString(), '2025-10-25T22:00:00.000Z')
  })

  test('days are added on the calendar', () => {
    assert.equal(addDays('2026-02-28', 1), '2026-03-01')
    assert.equal(addDays('2026-03-29', -1), '2026-03-28')
  })
})

describe('computePeriod', () => {
  const period = computePeriod(RECORDS, WEEK)

  test('totals count the code pull requests of people opened in the range', () => {
    assert.deepEqual(period.totals, {
      opened: 5,
      merged: 4,
      medianTimeToMergeHours: 4,
      releases: 1,
      hotfixShare: 0.2,
      unreviewedShare: 0.5,
      reviewed: 4,
      commentsPerPr: 1,
      silentApprovalRate: 1,
      checksFailedShare: 0.25,
    })
  })

  test('authors are kept per repository, bots aside', () => {
    const authors = Object.fromEntries(period.authors.map((person) => [person.login, person.repos]))
    assert.deepEqual(Object.keys(authors).sort(), ['alice', 'bob', 'carol'])
    assert.deepEqual(authors.alice.web, {
      code: 2,
      release: 0,
      integration: 0,
      merged: 2,
      closedUnmerged: 0,
      unreviewed: 1,
      timesToFirstReviewHours: [1],
      timesToMergeHours: [6, 24],
      sizes: [50, 200],
    })
    assert.equal(authors.carol.api.closedUnmerged, 1)
  })

  test('reviewers count what they did in the range, older pull requests included', () => {
    const bob = period.reviewers.find((person) => person.login === 'bob').repos
    assert.equal(bob.web.prs, 2)
    assert.equal(bob.web.silentApproved, 1)
    assert.equal(bob.web.merges, 1)
    assert.equal(bob.api.changesRequested, 1)
    assert.equal(bob.api.merges, 1)
  })

  test('day buckets cover the range, none partial for whole days', () => {
    assert.equal(period.series.length, 7)
    assert.equal(period.series[0].key, '2026-03-02')
    assert.ok(period.series.every((bucket) => !bucket.partial))
    const byDay = Object.fromEntries(period.series.map((bucket) => [bucket.key, bucket]))
    assert.equal(byDay['2026-03-04'].releases, 1)
    assert.equal(byDay['2026-03-06'].corrective, 1)
    assert.equal(byDay['2026-03-07'].deployments, 1)
  })

  test('delivery: deployments, rework rate, lead time and time to restore', () => {
    const { repositories, ...totals } = period.delivery
    assert.deepEqual(totals, {
      deployments: 3,
      corrective: 2,
      medianLeadTimeHours: 14.5,
      reworkRate: 0.667,
      medianRestoreHours: 1.5,
    })
    assert.deepEqual(
      repositories.find((row) => row.repo === 'web'),
      { repo: 'web', deployments: 1, corrective: 0, medianLeadTimeHours: 39, reworkRate: 0, medianRestoreHours: null },
    )
  })

  test('Dependabot: opened over the range, waiting whatever the range', () => {
    const { repositories, ecosystems, ...totals } = period.dependencies
    assert.deepEqual(totals, {
      opened: 2,
      merged: 1,
      closed: 1,
      medianTimeToMergeHours: 48,
      waiting: 1,
      oldestWaitingAt: iso(at('2026-01-10T06:00:00Z')),
    })
    assert.deepEqual(ecosystems, [{ ecosystem: 'npm_and_yarn', opened: 2, merged: 1 }])
  })

  test('a range stops at its end, excluded', () => {
    const monday = computePeriod(RECORDS, { ...WEEK, end: parisMidnight('2026-03-03') })
    assert.equal(monday.totals.opened, 1)
    assert.equal(monday.series.length, 1)
  })

  test('buckets cut by the range are partial', () => {
    const weeks = computePeriod(RECORDS, {
      start: parisMidnight('2026-03-04'),
      end: parisMidnight('2026-03-21'),
      bucket: 'week',
    })
    assert.deepEqual(
      weeks.series.map(({ key, partial }) => [key, partial]),
      [
        ['2026-03-02', true],
        ['2026-03-09', false],
        ['2026-03-16', true],
      ],
    )
    const midday = computePeriod(RECORDS, { ...WEEK, start: WEEK.start + DAY_MS / 2 })
    assert.equal(midday.series[0].partial, true)
  })
})

describe('computeCi', () => {
  const WORKFLOWS = [
    {
      repo: 'web',
      workflow: 'Tests',
      days: {
        '2026-03-02': [2, 1, 0, [60, 120]],
        '2026-03-03': [1, 0, 1, [300]],
        '2026-03-20': [5, 5, 0, [10, 10, 10, 10, 10]],
      },
    },
    { repo: 'api', workflow: 'Lint', days: { '2026-03-04': [1, 0, 0, [30]] } },
  ]
  const ci = computeCi(WORKFLOWS, WEEK)

  test('totals add up the days of the range only', () => {
    assert.deepEqual(ci.totals, { runs: 4, failureRate: 0.25, rerunRate: 0.25, medianSeconds: 90, p90Seconds: 300 })
  })

  test('each workflow has its own figures', () => {
    assert.deepEqual(ci.workflows, [
      { repo: 'web', workflow: 'Tests', runs: 3, failureRate: 0.333, rerunRate: 0.333, medianSeconds: 120, p90Seconds: 300 },
      { repo: 'api', workflow: 'Lint', runs: 1, failureRate: 0, rerunRate: 0, medianSeconds: 30, p90Seconds: 30 },
    ])
  })

  test('the series has every day of the range, empty ones included', () => {
    assert.equal(ci.series.length, 7)
    assert.deepEqual(
      ci.series.slice(0, 4).map(({ key, runs, medianSeconds }) => [key, runs, medianSeconds]),
      [
        ['2026-03-02', 2, 90],
        ['2026-03-03', 1, 300],
        ['2026-03-04', 1, 30],
        ['2026-03-05', 0, null],
      ],
    )
  })
})
