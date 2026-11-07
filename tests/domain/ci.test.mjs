// Tests of the CI stats of a range (site/domain/ci.js). Every repository, person and figure here is made up.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { computeCi } from '../../site/domain/ci.js'
import { WEEK } from './records.mjs'

describe('computeCi', () => {
  /** @type {WorkflowRuns[]} */
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
