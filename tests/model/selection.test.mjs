// Tests of what the filters select (site/model/selection.js): the range of a period, the days that can be picked.
import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'

import { DAY_MS, parisMidnight } from '../../site/domain/time.js'
import { clampRange, comparedRange, matchesQuery, periodAvailable, periodRange } from '../../site/model/selection.js'
import { state } from '../../site/model/state.js'
import { GENERATED_AT, useStats, WINDOW_START } from './stats.mjs'

const lastSync = Date.parse(GENERATED_AT)

beforeEach(() => useStats())

describe('periodRange', () => {
  test('a preset ends with the last sync, its buckets set by its length', () => {
    state.period = '30d'
    assert.deepEqual(periodRange(), { start: lastSync - 30 * DAY_MS, end: lastSync, bucket: 'day' })
    state.period = '90d'
    assert.equal(periodRange().bucket, 'week')
    state.period = '365d'
    assert.deepEqual(periodRange(), { start: lastSync - 365 * DAY_MS, end: lastSync, bucket: 'month' })
  })

  test('picked days run from the start of the first to the end of the last, in Paris time', () => {
    state.period = 'custom'
    state.range = { from: '2026-05-01', to: '2026-05-10' }
    assert.deepEqual(periodRange(), { start: parisMidnight('2026-05-01'), end: parisMidnight('2026-05-11'), bucket: 'day' })
  })

  test('picked days are shown by day up to a month, by week up to four months, then by month', () => {
    state.period = 'custom'
    state.range = { from: '2026-04-01', to: '2026-05-31' }
    assert.equal(periodRange().bucket, 'week')
    state.range = { from: '2025-06-01', to: '2026-05-31' }
    assert.equal(periodRange().bucket, 'month')
  })

  test('picked days end with the last sync at the latest', () => {
    state.period = 'custom'
    state.range = { from: '2026-06-01', to: '2026-06-15' }
    assert.equal(periodRange().end, lastSync)
  })
})

describe('clampRange', () => {
  test('keeps picked days within the synced data, none when nothing is left', () => {
    assert.deepEqual(clampRange({ from: '2026-01-01', to: '2026-02-01' }), { from: '2026-01-01', to: '2026-02-01' })
    assert.deepEqual(clampRange({ from: '2020-01-01', to: '2026-12-31' }), { from: '2023-06-16', to: '2026-06-15' })
    assert.equal(clampRange({ from: '2027-01-01', to: '2027-02-01' }), null)
    assert.equal(clampRange(null), null)
  })
})

describe('periodAvailable', () => {
  test('a preset waits until the data covers it, as the sync reads the older months back', () => {
    useStats({ windowStart: new Date(lastSync - 400 * DAY_MS).toISOString() })
    assert.equal(periodAvailable('365d'), true)
    assert.equal(periodAvailable('730d'), false)
    useStats({ windowStart: WINDOW_START })
    assert.equal(periodAvailable('1095d'), true)
  })
})

describe('comparedRange', () => {
  test('nothing to compare to without a comparison', () => {
    assert.equal(comparedRange(), null)
  })

  test('the period before, of the same length', () => {
    state.period = '30d'
    assert.deepEqual(comparedRange('previous'), { start: lastSync - 60 * DAY_MS, end: lastSync - 30 * DAY_MS, bucket: 'day' })
  })
})

describe('matchesQuery', () => {
  test('everything without a search, else any text containing it', () => {
    assert.equal(matchesQuery('ada', 'Ada Lune'), true)
    state.query = 'lune'
    assert.equal(matchesQuery('ada', 'Ada Lune'), true)
    assert.equal(matchesQuery('ben', 'Ben Kerr'), false)
  })
})
