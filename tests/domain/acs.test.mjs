// Tests of the AC (site/domain/acs.js): their grouping by name, their life, and what they add up to over a range. Every
// repository, person, AC and figure here is made up.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { AC_GAP_DAYS, acSeries, acSizes, acsOf, acSummary, deliveredBy } from '../../site/domain/acs.js'
import { parisMidnight } from '../../site/domain/time.js'
import { at, record } from './records.mjs'

/** @type {TimeRange} */
const MARCH = { start: parisMidnight('2026-03-01'), end: parisMidnight('2026-04-01'), bucket: 'week' }

const RECORDS = [
  // csv-export: in web and api, opened on Monday the 2nd at 10:00, merged on Tuesday at 12:00 and Wednesday at 10:00,
  // in production on Thursday at 11:00.
  record({
    repo: 'web',
    number: 1,
    author: 'alice',
    ac: 'feature/csv-export',
    createdAt: at('2026-03-02T09:00:00Z'),
    mergedAt: at('2026-03-03T11:00:00Z'),
    lines: 120,
    deployedAt: at('2026-03-05T10:00:00Z'),
  }),
  record({
    repo: 'api',
    number: 2,
    author: 'bob',
    ac: 'feature/csv-export',
    createdAt: at('2026-03-03T09:00:00Z'),
    mergedAt: at('2026-03-04T09:00:00Z'),
    lines: 30,
    deployedAt: at('2026-03-05T10:00:00Z'),
  }),
  // dark-mode: merged, not in production yet.
  record({ repo: 'web', number: 3, author: 'alice', ac: 'feat/dark-mode', createdAt: at('2026-03-09T09:00:00Z'), mergedAt: at('2026-03-09T13:00:00Z'), lines: 8 }),
  // quick-search: still open; old-menu: closed without a merge.
  record({ repo: 'web', number: 4, author: 'carol', ac: 'feature/quick-search', createdAt: at('2026-03-20T09:00:00Z') }),
  record({ repo: 'web', number: 5, author: 'carol', ac: 'feature/old-menu', createdAt: at('2026-03-10T09:00:00Z'), closed: true }),
  // Not an AC: a pull request of no AC, a bot's, and a release.
  record({ repo: 'web', number: 6, author: 'alice', createdAt: at('2026-03-11T09:00:00Z') }),
  record({ repo: 'web', number: 7, author: 'renovate', bot: true, ac: 'feature/deps', createdAt: at('2026-03-11T09:00:00Z') }),
  record({ repo: 'web', number: 8, author: 'alice', kind: 'release', ac: 'feature/release', createdAt: at('2026-03-11T09:00:00Z') }),
]

describe('acsOf', () => {
  const acs = acsOf(RECORDS)
  const byKey = new Map(acs.map((ac) => [ac.key, ac]))

  test('an AC per name, after its branch, whatever the repository, people only, code only', () => {
    assert.deepEqual(acs.map((ac) => ac.key), ['csv-export', 'dark-mode', 'quick-search', 'old-menu'])
    assert.deepEqual(byKey.get('csv-export').repos, ['api', 'web'])
    assert.deepEqual(byKey.get('csv-export').authors, ['alice', 'bob'])
  })

  test('delivered once every pull request is merged or closed, in production once all those merged are', () => {
    const csv = byKey.get('csv-export')
    assert.deepEqual([csv.status, csv.deliveredAt, csv.deployedAt, csv.lines], ['delivered', at('2026-03-04T09:00:00Z'), at('2026-03-05T10:00:00Z'), 150])
    // From 10:00 on Monday: 8 + 9 + 1 working hours to 10:00 on Wednesday, 8 + 9 + 9 + 2 to 11:00 on Thursday.
    assert.deepEqual([csv.timeToMergeHours, csv.leadTimeHours], [18, 28])
    assert.deepEqual([byKey.get('dark-mode').status, byKey.get('dark-mode').deployedAt], ['delivered', null])
    assert.equal(byKey.get('quick-search').status, 'open')
    assert.deepEqual([byKey.get('old-menu').status, byKey.get('old-menu').deliveredAt], ['abandoned', null])
  })

  test(`a name taken up again more than ${AC_GAP_DAYS} days after makes another AC`, () => {
    const again = record({ repo: 'web', number: 9, author: 'dan', ac: 'feat/dark-mode', createdAt: at('2026-05-04T09:00:00Z') })
    assert.deepEqual(acsOf([...RECORDS, again]).filter((ac) => ac.name === 'dark-mode').map((ac) => ac.key), ['dark-mode', 'dark-mode#2'])
  })
})

describe('what the AC add up to', () => {
  const acs = acsOf(RECORDS)

  test('started, delivered and in production within the range, open now, abandoned, with their delays and sizes', () => {
    assert.deepEqual(acSummary(acs, MARCH), {
      started: 4,
      delivered: 2,
      deployed: 1,
      open: 1,
      abandoned: 1,
      // csv-export in 18 working hours, dark-mode in 4.
      medianTimeToMergeHours: 11,
      medianLeadTimeHours: 28,
      medianLines: 79,
      people: 3,
      code: 5,
    })
  })

  test('outside the range, nothing but what is open now', () => {
    const april = { start: parisMidnight('2026-04-01'), end: parisMidnight('2026-05-01') }
    const summary = acSummary(acs, april)
    assert.deepEqual([summary.started, summary.delivered, summary.open, summary.medianTimeToMergeHours], [0, 0, 1, null])
  })

  test('week by week, the AC started and delivered', () => {
    const points = acSeries(acs, MARCH)
    const week = (key) => points.find((point) => point.key === key)
    assert.deepEqual([week('2026-03-02').started, week('2026-03-02').delivered], [1, 1])
    assert.deepEqual([week('2026-03-09').started, week('2026-03-09').delivered], [2, 1])
    assert.equal(week('2026-03-16').started, 1)
    assert.equal(points[0].partial, true)
  })

  test('those delivered by repository and by person, and by size', () => {
    assert.deepEqual(deliveredBy(acs, MARCH, (ac) => ac.repos), [['web', 2], ['api', 1]])
    assert.deepEqual(deliveredBy(acs, MARCH, (ac) => ac.authors), [['alice', 2], ['bob', 1]])
    // dark-mode under 10 lines, csv-export between 100 and 500.
    assert.deepEqual(acSizes(acs, MARCH), [1, 0, 1, 0, 0])
  })
})
