// Tests of the year in review (site/domain/wrapped.js): the year and its months, a person's year, the team's, the people
// of a year, the badges of a year. Every person, repository and figure here is made up.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { parisMidnight } from '../../site/domain/time.js'
import { activePeople, dataYears, personYear, teamYear, yearBadges, yearMonths, yearRange } from '../../site/domain/wrapped.js'
import { at, record } from './records.mjs'

const NOW = Date.parse('2026-11-08T10:00:00Z')
const RANGE = /** @type {{ start: number, end: number }} */ (yearRange(2026, NOW))

// Ada's year: three code pull requests (one in 2025, out of it), a hotfix, reviews given and received.
const RECORDS = [
  // Tuesday 3 March, merged, the biggest.
  record({
    repo: 'web',
    number: 1,
    author: 'ada',
    createdAt: at('2026-03-03T09:00:00Z'),
    mergedAt: at('2026-03-03T15:00:00Z'),
    lines: 900,
    deleted: 100,
    interventions: [
      ['ben', at('2026-03-03T10:00:00Z'), 'COMMENTED', 2],
      ['ben', at('2026-03-03T11:00:00Z'), 'APPROVED', 0],
      ['cy', at('2026-03-03T12:00:00Z'), 'COMMENTED', 1],
    ],
  }),
  // Tuesday 10 March, merged.
  record({
    repo: 'web',
    number: 2,
    author: 'ada',
    createdAt: at('2026-03-10T09:00:00Z'),
    mergedAt: at('2026-03-11T09:00:00Z'),
    lines: 40,
    deleted: 10,
    interventions: [['ben', at('2026-03-10T14:00:00Z'), 'APPROVED', 0]],
  }),
  // Friday 5 June, a hotfix still open.
  record({ repo: 'api', number: 1, author: 'ada', hotfix: true, createdAt: at('2026-06-05T09:00:00Z') }),
  // The year before: out of it.
  record({ repo: 'api', number: 2, author: 'ada', createdAt: at('2025-12-30T09:00:00Z'), mergedAt: at('2025-12-30T12:00:00Z'), lines: 5000 }),
  // Others' pull requests Ada reviewed in 2026, one with comments.
  record({ repo: 'api', number: 3, author: 'ben', createdAt: at('2026-04-01T09:00:00Z'), interventions: [['ada', at('2026-04-01T10:00:00Z'), 'COMMENTED', 3]] }),
  record({ repo: 'api', number: 4, author: 'ben', createdAt: at('2026-04-02T09:00:00Z'), interventions: [['ada', at('2026-04-02T10:00:00Z'), 'APPROVED', 0]] }),
  record({ repo: 'web', number: 3, author: 'cy', createdAt: at('2026-05-02T09:00:00Z'), interventions: [['ada', at('2026-05-04T10:00:00Z'), 'APPROVED', 0]] }),
  // Reviewed in 2025: out of the year.
  record({ repo: 'web', number: 4, author: 'cy', createdAt: at('2025-11-02T09:00:00Z'), interventions: [['ada', at('2025-11-03T10:00:00Z'), 'APPROVED', 0]] }),
  // A release and a deployment, and a bot's pull request: no code of people.
  record({ repo: 'web', number: 5, author: 'ben', kind: 'release', deployment: true, createdAt: at('2026-03-12T09:00:00Z'), mergedAt: at('2026-03-12T10:00:00Z') }),
  record({ repo: 'web', number: 6, author: 'ben', kind: 'release', deployment: true, createdAt: at('2026-03-12T14:00:00Z'), mergedAt: at('2026-03-12T15:00:00Z') }),
  record({ repo: 'web', number: 7, author: 'bot', bot: true, createdAt: at('2026-03-12T09:00:00Z') }),
]

describe('the year', () => {
  test('the Paris calendar year, up to now while it goes on; none still to come', () => {
    assert.deepEqual(yearRange(2026, NOW), { start: parisMidnight('2026-01-01'), end: NOW })
    assert.deepEqual(yearRange(2025, NOW), { start: parisMidnight('2025-01-01'), end: parisMidnight('2026-01-01') })
    assert.equal(yearRange(2027, NOW), null)
  })

  test('the years the data covers from their first day, the latest first, the current one whatever; the months of a year', () => {
    assert.deepEqual(dataYears(Date.parse('2024-02-10T00:00:00Z'), NOW), [2026, 2025])
    assert.deepEqual(dataYears(parisMidnight('2024-01-01'), NOW), [2026, 2025, 2024])
    assert.deepEqual(dataYears(Date.parse('2026-03-10T00:00:00Z'), NOW), [2026])
    assert.deepEqual(yearMonths(2026).slice(0, 2), ['2026-01', '2026-02'])
    assert.equal(yearMonths(2026).length, 12)
  })
})

describe('personYear', () => {
  const year = personYear(RECORDS, 'ada', 2026, RANGE)

  test('the code pull requests of the year only, merged, lines and hotfixes', () => {
    assert.deepEqual([year.code, year.merged, year.added, year.deleted, year.hotfixes], [3, 2, 830, 110, 1])
  })

  test('month by month, the months begun so far, and per day of the week, the busiest of each', () => {
    assert.equal(year.months.find((month) => month.month === '2026-03')?.code, 2)
    assert.deepEqual([year.months.length, year.months.at(-1)?.month], [11, '2026-11'])
    assert.equal(year.busiestMonth, '2026-03')
    // Monday 0: Tuesday twice, Friday once.
    assert.deepEqual(year.weekdays, [0, 2, 0, 0, 1, 0, 0])
    assert.equal(year.busiestWeekday, 1)
    assert.equal(year.days, 3)
  })

  test('per repository, the most first, and the biggest pull request merged', () => {
    assert.deepEqual(year.repos, [['web', 2], ['api', 1]])
    assert.deepEqual(year.biggest, { repo: 'web', number: 1, lines: 900, title: null })
  })

  test('the pull requests of others reviewed within the year, the comments, and whose the most', () => {
    assert.deepEqual([year.reviewed, year.comments], [3, 3])
    assert.deepEqual(year.reviewedMost, [{ login: 'ben', prs: 2 }, { login: 'cy', prs: 1 }])
  })

  test('who reviewed theirs the most, each pull request once', () => {
    assert.deepEqual(year.reviewedBy, [{ login: 'ben', prs: 2 }, { login: 'cy', prs: 1 }])
  })

  test('a year without anything says so with zeros and nulls', () => {
    const empty = personYear(RECORDS, 'dan', 2026, RANGE)
    assert.deepEqual([empty.code, empty.busiestMonth, empty.busiestWeekday, empty.biggest, empty.reviewed], [0, null, null, null, 0])
  })
})

describe('teamYear', () => {
  const year = teamYear(RECORDS, 2026, RANGE)

  test('every code pull request of people of the year, and who opened them', () => {
    assert.deepEqual([year.code, year.merged, year.people], [6, 2, 3])
  })

  test('the pull requests reviewed by someone else, the comments, the reviewers', () => {
    assert.deepEqual([year.reviewed, year.comments, year.reviewers], [5, 6, 3])
  })

  test('the deployments to production, and on how many days', () => {
    assert.deepEqual([year.deployments, year.deploymentDays], [2, 1])
  })
})

describe('activePeople', () => {
  test('whoever opened a code pull request or reviewed one of someone else within the year', () => {
    assert.deepEqual([...activePeople(RECORDS, RANGE)].sort(), ['ada', 'ben', 'cy'])
  })
})

describe('yearBadges', () => {
  test('the months of the year a person led each badge, the most first', () => {
    const leaders = new Map([
      ['reviewed', [{ month: '2025-12', people: ['ada'] }, { month: '2026-01', people: ['ada'] }, { month: '2026-02', people: ['ada', 'ben'] }]],
      ['comments', [{ month: '2026-03', people: ['ada'] }]],
      ['hotfixes', [{ month: '2026-03', people: ['ben'] }]],
    ])
    assert.deepEqual(yearBadges(leaders, 'ada', 2026), [
      { key: 'reviewed', months: ['2026-01', '2026-02'] },
      { key: 'comments', months: ['2026-03'] },
    ])
  })
})
