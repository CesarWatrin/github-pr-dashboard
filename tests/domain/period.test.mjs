// Tests of the stats of a date range (site/domain/period.js). Every repository, person and figure here is made up.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { computePeriod } from '../../site/domain/period.js'
import { DAY_MS, parisMidnight } from '../../site/domain/time.js'
import { at, iso, record, RECORDS, WEEK } from './records.mjs'

describe('computePeriod', () => {
  const period = computePeriod(RECORDS, WEEK)

  test('totals count the code pull requests of people opened in the range', () => {
    assert.deepEqual(period.totals, {
      opened: 5,
      merged: 4,
      medianTimeToMergeHours: 4,
      // Sizes 5, 10, 50 and 200.
      medianSize: 30,
      added: 34,
      deleted: 231,
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
      reviewed: 1,
      timesToFirstReviewHours: [1],
      // Tuesday 10:00 to Wednesday 10:00 in Paris: the eight working hours of Tuesday and one of Wednesday.
      timesToMergeHours: [6, 9],
      sizes: [50, 200],
      added: 30,
      deleted: 220,
    })
    assert.equal(authors.carol.api.closedUnmerged, 1)
  })

  test('lines added and deleted: those of the code pull requests opened in the range and merged', () => {
    const authors = Object.fromEntries(period.authors.map((person) => [person.login, person.repos]))
    // The hotfix adds 4 of its 5 lines; the pull request closed without a merge adds nothing.
    assert.deepEqual([authors.carol.api.added, authors.carol.api.deleted], [4, 1])
    // A revert only deletes. Alice's pull request merged before the range does not count.
    assert.deepEqual([authors.bob.api.added, authors.bob.api.deleted], [0, 10])
    assert.deepEqual([period.totals.added, period.totals.deleted], [30 + 4, 220 + 1 + 10])
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
      medianLeadTimeHours: 7,
      reworkRate: 0.667,
      // The revert, opened and merged on a Saturday, took no working time.
      medianRestoreHours: 1,
    })
    assert.deepEqual(
      repositories.find((row) => row.repo === 'web'),
      { repo: 'web', deployments: 1, corrective: 0, medianLeadTimeHours: 16.5, reworkRate: 0, medianRestoreHours: null },
    )
  })

  test('the calendar of deployments: per repository and bucket, corrective ones apart', () => {
    const days = Object.fromEntries(
      period.deploymentCalendar.map(({ repo, buckets }) => [
        repo,
        Object.fromEntries(
          buckets.map((cell, index) => /** @type {[string, number[]]} */ ([period.series[index].key, cell])).filter(([, [count]]) => count > 0),
        ),
      ]),
    )
    assert.deepEqual(days, {
      web: { '2026-03-04': [1, 0] },
      api: { '2026-03-06': [1, 1], '2026-03-07': [1, 1] },
    })
  })

  test('Dependabot: opened over the range, waiting whatever the range', () => {
    const { repositories, ecosystems, ...totals } = period.dependencies
    assert.deepEqual(totals, {
      opened: 2,
      merged: 1,
      closed: 1,
      medianTimeToMergeHours: 18,
      waiting: 1,
      oldestWaitingAt: iso(at('2026-01-10T06:00:00Z')),
    })
    assert.deepEqual(ecosystems, [{ ecosystem: 'npm_and_yarn', opened: 2, merged: 1 }])
  })

  test('cycles: each code pull request of people opened in the range, in the stages it went through', () => {
    const cycle = (repo, bucket, size, pickup, review, merge, deploy, toMerge, toProduction) => ({
      repo,
      bucket,
      size,
      pickup,
      review,
      merge,
      deploy,
      toMerge,
      toProduction,
    })
    assert.deepEqual(period.cycles, [
      // Approved at its first review: no time in review.
      cycle('web', '2026-03-02', 1, 1, 0, 5, 15, 6, 21),
      // Merged without any review: only the way to production.
      cycle('web', '2026-03-03', 2, null, null, null, 3, 9, 12),
      // Closed without a merge: only its pickup.
      cycle('api', '2026-03-05', 1, 1, null, null, null, null, null),
      // Changes requested, then merged without an approval: the review lasts until the merge.
      cycle('api', '2026-03-06', 0, 1, 1, null, 0, 2, 2),
      // Opened and merged on a Saturday: no working time.
      cycle('api', '2026-03-07', 1, null, null, null, 0, 0, 0),
    ])
  })

  test('cycles: the last approval before the merge counts, what comes after the merge does not', () => {
    const { cycles } = computePeriod(
      [
        record({
          repo: 'web',
          number: 20,
          author: 'alice',
          createdAt: at('2026-03-02T09:00:00Z'),
          mergedAt: at('2026-03-03T09:00:00Z'),
          interventions: [
            ['bob', at('2026-03-02T11:00:00Z'), 'COMMENTED', 1],
            ['bob', at('2026-03-02T15:00:00Z'), 'APPROVED', 0],
            ['carol', at('2026-03-02T17:00:00Z'), 'APPROVED', 0],
            ['dave', at('2026-03-04T09:00:00Z'), 'COMMENTED', 1],
          ],
          deployedAt: null,
        }),
        // Only commented once merged: never reviewed.
        record({
          repo: 'web',
          number: 21,
          author: 'alice',
          createdAt: at('2026-03-02T09:00:00Z'),
          mergedAt: at('2026-03-02T10:00:00Z'),
          interventions: [['bob', at('2026-03-02T12:00:00Z'), 'COMMENTED', 1]],
        }),
        // Approved, still open: its review is not over.
        record({
          repo: 'web',
          number: 22,
          author: 'alice',
          createdAt: at('2026-03-02T09:00:00Z'),
          interventions: [['bob', at('2026-03-02T10:00:00Z'), 'APPROVED', 0]],
        }),
      ],
      WEEK,
    )
    const stages = cycles.map(({ pickup, review, merge, deploy, toMerge, toProduction }) => [
      pickup,
      review,
      merge,
      deploy,
      toMerge,
      toProduction,
    ])
    assert.deepEqual(stages, [
      // Approved at 18:00 on Monday, merged at 10:00 on Tuesday: one working hour.
      [2, 6, 1, null, 9, null],
      [null, null, null, null, 1, null],
      [1, null, null, null, null, null],
    ])
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
