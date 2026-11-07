// Tests of the CI stats of the Actions runs (scripts/sync/runs.mjs). Every repository, person and figure here is made up.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import './environment.mjs'
import { computeCi } from '../../scripts/sync/runs.mjs'

describe('computeCi', () => {
  const run = (fields) => ({
    repo: 'web',
    workflow: 'Tests',
    conclusion: 'success',
    attempt: 1,
    createdAt: '2026-03-02T09:00:00Z',
    startedAt: '2026-03-02T09:00:00Z',
    updatedAt: '2026-03-02T09:02:00Z',
    ...fields,
  })

  test('runs with a verdict, per Paris day: count, failures, reruns, durations', () => {
    const ci = computeCi([
      run({ createdAt: '2026-03-02T22:30:00Z', startedAt: '2026-03-02T22:30:00Z', updatedAt: '2026-03-02T22:32:00Z' }),
      // Paris is an hour ahead: 23:30 UTC is already the 3rd.
      run({
        conclusion: 'failure',
        attempt: 2,
        createdAt: '2026-03-02T23:30:00Z',
        startedAt: '2026-03-02T23:30:00Z',
        updatedAt: '2026-03-02T23:35:00Z',
      }),
      run({
        conclusion: 'timed_out',
        createdAt: '2026-03-03T08:00:00Z',
        startedAt: '2026-03-03T08:00:00Z',
        updatedAt: '2026-03-03T08:10:00Z',
      }),
      run({ conclusion: 'cancelled' }),
      run({ conclusion: 'skipped' }),
      run({ conclusion: null }),
    ])
    assert.deepEqual(ci, [
      {
        repo: 'web',
        workflow: 'Tests',
        days: { '2026-03-02': [1, 0, 0, [120]], '2026-03-03': [2, 2, 1, [300, 600]] },
      },
    ])
  })
})
