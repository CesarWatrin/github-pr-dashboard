// Tests of the backfill of the window (scripts/sync/backfill.mjs). Every repository, person and figure here is made up.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import './environment.mjs'
import { backfillSlice, snapshotCoverage, splitDays } from '../../scripts/sync/backfill.mjs'

describe('backfill', () => {
  const recentStart = '2026-03-10T08:30:00.000Z'

  test('without a snapshot, the sync starts from the last year, pull requests and runs alike', () => {
    assert.deepEqual(snapshotCoverage(null, recentStart), { pullRequests: recentStart, runs: recentStart })
  })

  test('a snapshot kept before it told what it covers covers the year before its sync', () => {
    const snapshot = { syncedAt: '2026-03-01T12:00:00.000Z', pullRequests: [], runs: [] }
    assert.deepEqual(snapshotCoverage(snapshot, recentStart), {
      pullRequests: '2025-03-01T12:00:00.000Z',
      runs: '2025-03-01T12:00:00.000Z',
    })
  })

  test('a snapshot covers what it tells, its runs from the last year when it has none', () => {
    const snapshot = {
      syncedAt: '2026-03-01T12:00:00.000Z',
      pullRequests: [],
      pullRequestsSince: '2024-06-01T00:00:00.000Z',
      runs: [],
      runsSince: '2025-02-01T00:00:00.000Z',
    }
    assert.deepEqual(snapshotCoverage(snapshot, recentStart), {
      pullRequests: '2024-06-01T00:00:00.000Z',
      runs: '2025-02-01T00:00:00.000Z',
    })
    assert.equal(snapshotCoverage({ ...snapshot, runs: undefined }, recentStart).runs, recentStart)
  })

  test('a slice reads the 30 days before what the snapshot covers, by whole days', () => {
    assert.deepEqual(backfillSlice('2025-03-01T12:00:00.000Z', '2023-03-02T12:00:00.000Z'), {
      from: '2025-01-30',
      to: '2025-03-01',
      since: '2025-01-30T00:00:00.000Z',
    })
  })

  test('the last slice stops at the start of the window, then the snapshot covers it', () => {
    const windowStart = '2025-01-15T12:00:00.000Z'
    const last = backfillSlice('2025-02-01T00:00:00.000Z', windowStart)
    assert.deepEqual(last, { from: '2025-01-15', to: '2025-02-01', since: '2025-01-15T00:00:00.000Z' })
    assert.equal(backfillSlice(last.since, windowStart), null)
  })

  test('a slice is read in ranges of whole days that follow each other, about the same length', () => {
    // The 31 days of a slice, its last day included.
    assert.deepEqual(splitDays('2025-01-30', '2025-03-01', 4), [
      ['2025-01-30', '2025-02-06'],
      ['2025-02-07', '2025-02-14'],
      ['2025-02-15', '2025-02-22'],
      ['2025-02-23', '2025-03-01'],
    ])
    // Fewer days than ranges: a day each.
    assert.deepEqual(splitDays('2025-01-15', '2025-01-16', 4), [
      ['2025-01-15', '2025-01-15'],
      ['2025-01-16', '2025-01-16'],
    ])
    assert.deepEqual(splitDays('2025-01-15', '2025-01-15', 4), [['2025-01-15', '2025-01-15']])
  })

  test('slice after slice, the two years before the last one come back in 25 syncs', () => {
    const windowStart = '2023-03-02T12:00:00.000Z'
    let since = '2025-03-01T12:00:00.000Z'
    let syncs = 0
    for (let slice = backfillSlice(since, windowStart); slice; slice = backfillSlice(since, windowStart)) {
      // Each slice starts where the previous one ended.
      assert.equal(slice.to, since.slice(0, 10))
      since = slice.since
      syncs++
    }
    assert.equal(syncs, 25)
    assert.ok(since <= windowStart)
  })
})
