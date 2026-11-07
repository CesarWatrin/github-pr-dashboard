// Tests of the Paris days and of the working time (site/domain/time.js). Every repository, person and figure here is made up.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { addDays, parisDay, parisMidnight, workHoursBetween } from '../../site/domain/time.js'
import { at } from './records.mjs'

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

describe('workHoursBetween', () => {
  // Paris is UTC+1 in winter: 09:00 in Paris is 08:00 UTC. Monday 2 March 2026 is a Monday.
  const hours = (from, to) => workHoursBetween(at(from), at(to))

  test('within a working day', () => {
    assert.equal(hours('2026-03-02T09:00:00Z', '2026-03-02T11:30:00Z'), 2.5)
  })

  test('the hours before 9 and after 18 do not count', () => {
    assert.equal(hours('2026-03-02T06:00:00Z', '2026-03-02T20:00:00Z'), 9)
    assert.equal(hours('2026-03-02T16:00:00Z', '2026-03-03T09:00:00Z'), 1 + 1)
  })

  test('nor do weekends: Friday evening to Monday morning is an hour', () => {
    assert.equal(hours('2026-03-06T16:30:00Z', '2026-03-09T08:30:00Z'), 0.5 + 0.5)
    assert.equal(hours('2026-03-07T10:00:00Z', '2026-03-08T10:00:00Z'), 0)
  })

  test('whole weeks count five working days of nine hours', () => {
    assert.equal(hours('2026-03-02T08:00:00Z', '2026-03-16T08:00:00Z'), 2 * 5 * 9)
    assert.equal(hours('2026-03-02T08:00:00Z', '2026-03-26T08:00:00Z'), 3 * 5 * 9 + 3 * 9)
  })

  test('the change to summer time on a Sunday moves the working day by an hour in UTC', () => {
    // Monday 30 March 2026, Paris is UTC+2: 09:00 in Paris is 07:00 UTC.
    assert.equal(hours('2026-03-30T07:00:00Z', '2026-03-30T08:00:00Z'), 1)
    assert.equal(hours('2026-03-27T16:00:00Z', '2026-03-30T08:00:00Z'), 1 + 1)
  })

  test('backwards or empty, nothing', () => {
    assert.equal(hours('2026-03-02T10:00:00Z', '2026-03-02T09:00:00Z'), 0)
  })
})
