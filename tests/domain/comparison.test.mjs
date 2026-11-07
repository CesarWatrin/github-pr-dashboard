// Tests of the range a period is compared to (site/domain/comparison.js). Every repository, person and figure here is made up.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { comparisonRange, overlapsPeriod, sameDays } from '../../site/domain/comparison.js'
import { DAY_MS, parisMidnight } from '../../site/domain/time.js'

describe('comparisonRange', () => {
  // A week of whole Paris days across the change to summer time of Sunday 29 March 2026.
  const AFTER_CHANGE = { start: parisMidnight('2026-03-30'), end: parisMidnight('2026-04-06'), bucket: 'day' }
  // A preset period: 30 days up to a sync in the morning.
  const PRESET = { start: Date.parse('2026-10-07T09:30:00Z'), end: Date.parse('2026-11-06T09:30:00Z'), bucket: 'day' }

  test('the previous period of whole days is the same number of days right before, whatever the change of time', () => {
    assert.deepEqual(comparisonRange(AFTER_CHANGE, 'previous', 0), {
      start: parisMidnight('2026-03-23'),
      end: parisMidnight('2026-03-30'),
      bucket: 'day',
    })
  })

  test('the previous period of a preset has the same length, right before it', () => {
    assert.deepEqual(comparisonRange(PRESET, 'previous', 0), {
      start: PRESET.start - 30 * DAY_MS,
      end: PRESET.start,
      bucket: 'day',
    })
  })

  test('the same period last year keeps the days and the time of day', () => {
    assert.deepEqual(comparisonRange(PRESET, 'year', 0), {
      start: Date.parse('2025-10-07T09:30:00Z'),
      end: Date.parse('2025-11-06T09:30:00Z'),
      bucket: 'day',
    })
  })

  test('29 February is compared with the 28th of the year before', () => {
    const leapDay = { start: parisMidnight('2028-02-29'), end: parisMidnight('2028-03-01'), bucket: 'day' }
    assert.deepEqual(comparisonRange(leapDay, 'year', 0), {
      start: parisMidnight('2027-02-28'),
      end: parisMidnight('2027-03-01'),
      bucket: 'day',
    })
  })

  test('a range the data does not cover is no comparison', () => {
    assert.equal(comparisonRange(PRESET, 'previous', PRESET.start - 10 * DAY_MS), null)
    assert.equal(comparisonRange(PRESET, 'year', PRESET.start), null)
  })

  test('a range that starts at most a day before the data starts with the data', () => {
    const dataStart = PRESET.start - 30 * DAY_MS + 12 * 3_600_000
    assert.deepEqual(comparisonRange(PRESET, 'previous', dataStart), { start: dataStart, end: PRESET.start, bucket: 'day' })
  })

  test('no mode, no comparison', () => {
    assert.equal(comparisonRange(PRESET, 'none', 0), null)
  })
})

describe('sameDays', () => {
  // 12 months up to a sync in the morning, with no 29 February within the two years before.
  const YEAR = { start: Date.parse('2025-11-06T09:30:00Z'), end: Date.parse('2026-11-06T09:30:00Z'), bucket: 'month' }
  const MONTH = { start: Date.parse('2026-10-07T09:30:00Z'), end: Date.parse('2026-11-06T09:30:00Z'), bucket: 'day' }

  test('for 12 months, the period before is the same period last year', () => {
    assert.equal(sameDays(comparisonRange(YEAR, 'previous', 0), comparisonRange(YEAR, 'year', 0)), true)
  })

  test('within a day, as when a 29 February lies between them', () => {
    const range = { start: 0, end: 10 * DAY_MS }
    assert.equal(sameDays(range, { start: DAY_MS, end: 11 * DAY_MS }), true)
    assert.equal(sameDays(range, { start: 2 * DAY_MS, end: 12 * DAY_MS }), false)
  })

  test('for 30 days, the period before and last year differ', () => {
    assert.equal(sameDays(comparisonRange(MONTH, 'previous', 0), comparisonRange(MONTH, 'year', 0)), false)
  })

  test('a range the data does not cover matches nothing', () => {
    assert.equal(sameDays(null, comparisonRange(YEAR, 'year', 0)), false)
    assert.equal(sameDays(null, null), false)
  })
})

describe('overlapsPeriod', () => {
  // Presets up to a sync in the morning, with no 29 February within the years before.
  const upTo = Date.parse('2026-11-06T09:30:00Z')
  const preset = (days) => ({ start: upTo - days * DAY_MS, end: upTo, bucket: 'month' })

  test('the same period last year of 24 months takes back part of them', () => {
    assert.equal(overlapsPeriod(preset(730), comparisonRange(preset(730), 'year', 0)), true)
  })

  test('for 12 months or less, last year ends where the period starts', () => {
    assert.equal(overlapsPeriod(preset(365), comparisonRange(preset(365), 'year', 0)), false)
    assert.equal(overlapsPeriod(preset(90), comparisonRange(preset(90), 'year', 0)), false)
  })

  test('the period before never takes back any of it', () => {
    assert.equal(overlapsPeriod(preset(730), comparisonRange(preset(730), 'previous', 0)), false)
  })

  test('a range the data does not cover overlaps nothing', () => {
    assert.equal(overlapsPeriod(preset(730), null), false)
  })
})
