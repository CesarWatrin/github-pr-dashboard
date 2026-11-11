// Tests of where the code effort goes (site/domain/effort.js): the kind of each code pull request, what they add up to
// over a range, bucket by bucket and per author. Every repository, person, project, AC and figure here is made up.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { EFFORT_KINDS, effortByAuthor, effortKind, effortOf, effortSeries, effortSummary } from '../../site/domain/effort.js'
import { parisMidnight } from '../../site/domain/time.js'
import { at, record } from './records.mjs'

/** @type {TimeRange} */
const MARCH = { start: parisMidnight('2026-03-01'), end: parisMidnight('2026-04-01'), bucket: 'week' }

const RECORDS = [
  // Two pull requests of a project, one merged.
  record({ repo: 'web', number: 1, author: 'alice', project: 'blue-kite', createdAt: at('2026-03-02T09:00:00Z'), mergedAt: at('2026-03-03T09:00:00Z'), lines: 120, deleted: 20 }),
  record({ repo: 'api', number: 2, author: 'bob', project: 'blue-kite', createdAt: at('2026-03-10T09:00:00Z') }),
  // A hotfix, merged; and a hotfix on a project branch, which counts for the project.
  record({ repo: 'api', number: 3, author: 'bob', hotfix: true, createdAt: at('2026-03-03T09:00:00Z'), mergedAt: at('2026-03-03T11:00:00Z'), lines: 6, deleted: 2 }),
  record({ repo: 'web', number: 4, author: 'alice', hotfix: true, project: 'blue-kite', createdAt: at('2026-03-11T09:00:00Z') }),
  // An AC, merged; and a hotfix stacked on an AC branch, which counts for the TMA.
  record({ repo: 'web', number: 5, author: 'carol', ac: 'feature/csv-export', createdAt: at('2026-03-04T09:00:00Z'), mergedAt: at('2026-03-05T09:00:00Z'), lines: 40, deleted: 10 }),
  record({ repo: 'web', number: 6, author: 'carol', hotfix: true, ac: 'feature/csv-export', createdAt: at('2026-03-17T09:00:00Z') }),
  // The rest: a code pull request of none of them, merged, and one closed.
  record({ repo: 'web', number: 7, author: 'alice', createdAt: at('2026-03-18T09:00:00Z'), mergedAt: at('2026-03-18T15:00:00Z'), lines: 30, deleted: 30 }),
  record({ repo: 'api', number: 8, author: 'dan', createdAt: at('2026-03-19T09:00:00Z'), closed: true }),
  // Not counted: a bot's, a release, the merge of a project branch, and one opened before the range.
  record({ repo: 'web', number: 9, author: 'renovate', bot: true, createdAt: at('2026-03-05T09:00:00Z') }),
  record({ repo: 'web', number: 10, author: 'alice', kind: 'release', createdAt: at('2026-03-06T09:00:00Z') }),
  record({ repo: 'web', number: 11, author: 'alice', kind: 'integration', project: 'blue-kite', projectMerge: true, createdAt: at('2026-03-20T09:00:00Z') }),
  record({ repo: 'web', number: 12, author: 'alice', hotfix: true, createdAt: at('2026-02-26T09:00:00Z') }),
]

describe('the kind of work of a code pull request', () => {
  test('a project first, then a hotfix, then an AC, else the rest', () => {
    assert.deepEqual(
      RECORDS.slice(0, 8).map((pr) => effortKind(pr)),
      ['projects', 'projects', 'tma', 'projects', 'acs', 'tma', 'rest', 'rest'],
    )
  })

  test('the projects can be those the page shows, rather than every name a record carries', () => {
    const shown = new Set([RECORDS[0]])
    assert.deepEqual(
      RECORDS.slice(0, 4).map((pr) => effortKind(pr, (other) => shown.has(other))),
      ['projects', 'rest', 'tma', 'tma'],
    )
  })
})

describe('where the effort of a range goes', () => {
  test('each code pull request of a person opened in the range counts once, with the lines added by those merged', () => {
    const effort = effortOf(RECORDS, MARCH)
    assert.deepEqual(effort.counts, { projects: 3, tma: 2, acs: 1, rest: 2 })
    assert.deepEqual(effort.added, { projects: 100, tma: 4, acs: 30, rest: 0 })
    assert.equal(effort.code, 8)
    assert.deepEqual(effort.shares, { projects: 3 / 8, tma: 2 / 8, acs: 1 / 8, rest: 2 / 8 })
  })

  test('building is the projects and the AC, maintaining the TMA, the rest aside', () => {
    const effort = effortOf(RECORDS, MARCH)
    assert.deepEqual([effort.build, effort.run, effort.buildShare, effort.runShare], [4, 2, 4 / 6, 2 / 6])
  })

  test('nothing to share without any pull request, nor to read without building or maintaining', () => {
    const april = { start: parisMidnight('2026-04-01'), end: parisMidnight('2026-05-01') }
    const none = effortOf(RECORDS, april)
    assert.deepEqual([none.code, none.shares, none.buildShare, none.runShare], [0, null, null, null])
    const rest = effortSummary({ counts: { projects: 0, tma: 0, acs: 0, rest: 3 }, added: { projects: 0, tma: 0, acs: 0, rest: 0 } })
    assert.deepEqual([rest.shares.rest, rest.buildShare, rest.runShare], [1, null, null])
  })

  test('the kinds, in the order a pull request is given one', () => {
    assert.deepEqual(EFFORT_KINDS, ['projects', 'tma', 'acs', 'rest'])
  })
})

describe('bucket by bucket, and per author', () => {
  test('week by week, every bucket of the range, empty ones at zero', () => {
    const points = effortSeries(RECORDS, MARCH)
    assert.deepEqual(points.map((point) => point.key), ['2026-02-23', '2026-03-02', '2026-03-09', '2026-03-16', '2026-03-23', '2026-03-30'])
    const week = (key) => points.find((point) => point.key === key)
    assert.deepEqual(week('2026-03-02').counts, { projects: 1, tma: 1, acs: 1, rest: 0 })
    assert.deepEqual(week('2026-03-09').counts, { projects: 2, tma: 0, acs: 0, rest: 0 })
    assert.deepEqual(week('2026-03-16').counts, { projects: 0, tma: 1, acs: 0, rest: 2 })
    assert.deepEqual([week('2026-03-23').code, week('2026-03-23').shares], [0, null])
    // The range starts on a Sunday and ends on a Tuesday: its first and last weeks are partial.
    assert.deepEqual([points[0].partial, points[1].partial, points.at(-1).partial], [true, false, true])
  })

  test('each author, their own', () => {
    const authors = effortByAuthor(RECORDS, MARCH)
    assert.deepEqual([...authors.keys()].sort(), ['alice', 'bob', 'carol', 'dan'])
    assert.deepEqual(authors.get('alice').counts, { projects: 2, tma: 0, acs: 0, rest: 1 })
    assert.deepEqual(authors.get('carol').counts, { projects: 0, tma: 1, acs: 1, rest: 0 })
    assert.equal(authors.get('dan').runShare, null)
  })
})
