// Tests of the day of the last sync: the podium of each counter, the AC delivered and the TMA of a day
// (site/domain/today.js). Every repository, person and figure here is made up.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { acsOf } from '../../site/domain/acs.js'
import { deliveredOn, podiumOf } from '../../site/domain/today.js'
import { at, record } from './records.mjs'

describe('podiumOf', () => {
  test('the first three, the most first, and anyone tied with the third', () => {
    const counts = new Map([
      ['erin', 1],
      ['alice', 5],
      ['dave', 2],
      ['bob', 3],
      ['carol', 2],
      ['fred', 2],
    ])
    assert.deepEqual(podiumOf(counts), [
      ['alice', 5],
      ['bob', 3],
      ['carol', 2],
      ['dave', 2],
      ['fred', 2],
    ])
    assert.deepEqual(podiumOf(new Map([['alice', 1]])), [['alice', 1]])
    assert.deepEqual(podiumOf(new Map()), [])
  })
})

describe('deliveredOn', () => {
  // 10 March 2026, Paris.
  const day = '2026-03-10'
  const pr = (number, fields) => record({ repo: 'web', number, author: 'alice', createdAt: at('2026-03-05T09:00:00Z'), ...fields })
  const records = [
    // An AC of two pull requests, by two people, its last merged on the day: delivered then.
    pr(1, { ac: 'feature/export', mergedAt: at('2026-03-09T10:00:00Z') }),
    pr(2, { ac: 'feature/export', author: 'bob', mergedAt: at('2026-03-10T10:00:00Z') }),
    // Merged on the day, but another of it still open: not delivered yet.
    pr(3, { ac: 'feature/search', mergedAt: at('2026-03-10T11:00:00Z') }),
    pr(4, { ac: 'feature/search' }),
    // Delivered the day before.
    pr(5, { ac: 'feature/filters', author: 'bob', mergedAt: at('2026-03-09T16:00:00Z') }),
    // Hotfixes: two merged on the day, one the day before, one still open.
    pr(6, { hotfix: true, author: 'carol', mergedAt: at('2026-03-10T08:00:00Z') }),
    pr(7, { hotfix: true, author: 'carol', mergedAt: at('2026-03-10T15:00:00Z') }),
    pr(8, { hotfix: true, author: 'bob', mergedAt: at('2026-03-09T15:00:00Z') }),
    pr(9, { hotfix: true, author: 'dave' }),
    // 00:30 in Paris on the 11th, still the 10th in UTC: another day.
    pr(10, { hotfix: true, author: 'dave', mergedAt: at('2026-03-10T23:30:00Z') }),
  ]

  test('the AC delivered on the day, once for each of their authors, and the hotfixes merged, by Paris day', () => {
    assert.deepEqual(deliveredOn(records, acsOf(records), day), {
      acs: 1,
      tma: 2,
      podiums: {
        acs: [
          ['alice', 1],
          ['bob', 1],
        ],
        tma: [['carol', 2]],
      },
    })
  })
})
