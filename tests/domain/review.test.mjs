// Tests of the annual review (site/domain/review.js and site/domain/review/): its statistics, its calendar, the units of
// work, the profiles, marks and recommendations, and the review of a made-up team. Every person, repository and figure
// here is made up.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { teamReview } from '../../site/domain/review.js'
import { frenchHolidays, parisClock, reviewMonths, workingDaysOf } from '../../site/domain/review/calendar.js'
import { personFigures } from '../../site/domain/review/figures.js'
import { notesOf } from '../../site/domain/review/notes.js'
import { overallOf } from '../../site/domain/review/scores.js'
import { bootstrapInterval, chiSquareSurvival, intraclassCorrelation, kruskalWallis, rankShares } from '../../site/domain/review/statistics.js'
import { reviewTallies, workUnits } from '../../site/domain/review/tallies.js'
import { at, record } from './records.mjs'

const near = (actual, expected, tolerance = 1e-3) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} is not ${expected}`)

describe('the statistics of the review', () => {
  test('the chi-square tail matches the tables', () => {
    near(chiSquareSurvival(3.841, 1), 0.05)
    near(chiSquareSurvival(11.07, 5), 0.05)
    near(chiSquareSurvival(0, 3), 1)
  })

  test('Kruskal-Wallis tells groups apart, and not groups alike', () => {
    const apart = kruskalWallis([[1, 2, 3], [4, 5, 6]])
    near(apart.h, 3.857)
    assert.equal(apart.degrees, 1)
    near(apart.p, 0.0495)
    assert.ok(kruskalWallis([[1, 4, 5], [2, 3, 6]]).p > 0.5)
  })

  test('the intraclass correlation is 1 when the group tells everything, 0 when it tells nothing', () => {
    near(intraclassCorrelation([[5, 5, 5], [9, 9, 9]]), 1)
    near(intraclassCorrelation([[1, 9], [1, 9]]), 0)
  })

  test('the bootstrap interval holds the mean, the same for the same seed, narrow for steady months', () => {
    const steady = bootstrapInterval([10, 10, 11, 10, 9, 10], { seed: 3 })
    const odd = bootstrapInterval([1, 20, 2, 30, 1, 25], { seed: 3 })
    assert.deepEqual(steady, bootstrapInterval([10, 10, 11, 10, 9, 10], { seed: 3 }))
    assert.ok(steady[0] <= 10 && steady[1] >= 10)
    assert.ok(odd[1] - odd[0] > 5 * (steady[1] - steady[0]))
  })

  test('ranks go from 0 to 1, ties sharing, a missing value in the middle', () => {
    assert.deepEqual(rankShares([3, 1, 2]), [1, 0, 0.5])
    assert.deepEqual(rankShares([1, 1, 2]), [0.25, 0.25, 1])
    assert.deepEqual(rankShares([1, null, 3]), [0, 0.5, 1])
  })
})

describe('the calendar of the review', () => {
  test('the French public holidays follow Easter', () => {
    const holidays = frenchHolidays(2026)
    for (const day of ['2026-01-01', '2026-04-06', '2026-05-01', '2026-05-08', '2026-05-14', '2026-05-25', '2026-07-14', '2026-08-15', '2026-11-01', '2026-11-11', '2026-12-25']) {
      assert.ok(holidays.has(day), day)
    }
    assert.equal(holidays.size, 11)
  })

  test('a month has its weekdays as working days, public holidays aside', () => {
    // May 2026: 21 weekdays, four of them public holidays.
    assert.equal(workingDaysOf('2026-05'), 17)
    assert.equal(workingDaysOf('2026-02'), 20)
  })

  test('the review covers the twelve whole months before the current one, those the data covers', () => {
    const now = Date.parse('2026-11-18T10:00:00Z')
    assert.deepEqual(reviewMonths(now), ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'])
    assert.deepEqual(reviewMonths(now, Date.parse('2026-08-10T00:00:00Z')), ['2026-09', '2026-10'])
  })

  test('an instant falls on its Paris day and hour', () => {
    // Monday 2 March 2026, 9:30 UTC: 10:30 in Paris (winter time); Sunday 5 July, 22:00 UTC: Monday 0:00 in Paris.
    assert.deepEqual(parisClock(Date.parse('2026-03-02T09:30:00Z')), { weekday: 0, hour: 10, time: 10.5 })
    assert.equal(parisClock(Date.parse('2026-07-05T22:00:00Z')).weekday, 0)
  })
})

describe('the units of work', () => {
  test('100 lines are one unit, growing with the logarithm of the lines', () => {
    near(workUnits(100), 1)
    near(workUnits(1000), 1.497)
    near(workUnits(9), 0.499)
    assert.equal(workUnits(0), 0)
  })
})

// A made-up month of a team: alice builds and reviews, bob does maintenance, carol merges without review.
const MONTHS = ['2026-03']
/** @param {number} day @param {number} hour */
const on = (day, hour) => at(`2026-03-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00Z`)
const RECORDS = [
  record({ repo: 'web', number: 1, author: 'alice', createdAt: on(2, 9), mergedAt: on(2, 13), lines: 100, mergedBy: 'alice', interventions: [['bob', on(2, 10), 'APPROVED', 2]] }),
  record({ repo: 'web', number: 2, author: 'alice', createdAt: on(3, 9), mergedAt: on(3, 10), lines: 1000, mergedBy: 'alice', interventions: [['carol', on(3, 9), 'APPROVED', 0]] }),
  record({ repo: 'api', number: 3, author: 'bob', hotfix: true, createdAt: on(4, 9), mergedAt: on(4, 11), lines: 5, mergedBy: 'bob', interventions: [['alice', on(4, 10), 'CHANGES_REQUESTED', 3], ['alice', on(4, 10), 'APPROVED', 0]] }),
  record({ repo: 'api', number: 4, author: 'bob', hotfix: true, createdAt: on(5, 9), closed: true }),
  record({ repo: 'api', number: 5, author: 'carol', createdAt: on(7, 20), mergedAt: on(7, 21), lines: 10, mergedBy: 'carol' }),
  // Out of the months: opened in February, reviewed in March.
  record({ repo: 'web', number: 6, author: 'alice', createdAt: at('2026-02-26T09:00:00Z'), interventions: [['bob', on(2, 9), 'COMMENTED', 1]] }),
  // A bot's, and a release: never counted.
  record({ repo: 'web', number: 7, author: 'renovate', bot: true, createdAt: on(9, 9), mergedAt: on(9, 10), mergedBy: 'renovate' }),
  record({ repo: 'web', number: 8, author: 'alice', kind: 'release', createdAt: on(9, 9) }),
]
/** @type {Record<string, RepositoryInfo>} */
const REPOS = { web: { category: 'front', technologies: [] }, api: { category: 'back', technologies: [] } }

describe('what each person did over the months', () => {
  const { people, reviewPairs, hotfixes } = reviewTallies(RECORDS, MONTHS, REPOS)
  const alice = people.get('alice')
  const bob = people.get('bob')
  const carol = people.get('carol')

  test('the code pull requests opened in the months, merged or not, by size', () => {
    assert.equal(alice.code, 2)
    assert.equal(alice.merged, 2)
    near(alice.months['2026-03'].units, 1 + 1.497)
    assert.deepEqual(alice.categories, { front: 2 })
    assert.equal(bob.hotfixes, 2)
    assert.equal(bob.closed, 1)
    assert.equal(hotfixes, 2)
    assert.equal(carol.unreviewed, 1)
    assert.equal(people.has('renovate'), false)
  })

  test('the reviews: each pull request once per reviewer, its comments, silent approvals and changes asked', () => {
    // Bob reviewed alice's pull request of March, and the one of February in March: two reviews in the month.
    assert.equal(bob.months['2026-03'].reviews, 2)
    assert.equal(bob.reviewed, 1)
    assert.equal(alice.reviewed, 1)
    assert.equal(alice.changesRequested, 1)
    assert.equal(alice.reviewComments, 3)
    assert.equal(carol.silentApprovals, 1)
    assert.equal(reviewPairs, 3)
  })

  test('when they acted, hour by hour of the week, and on which weekdays', () => {
    // Carol opened her pull request on Saturday 7 March at 21:00 in Paris, and merged it at 22:00.
    assert.equal(carol.grid[5][21] + carol.grid[5][22], 2)
    assert.equal(carol.days.has('2026-03-07'), false)
    assert.ok(alice.days.has('2026-03-02'))
  })

  test('a person counts the months after their arrival, the arrival month if they came by the 5th', () => {
    const months = ['2026-01', '2026-02', '2026-03']
    const tally = reviewTallies(RECORDS, months, REPOS).people.get('alice')
    assert.equal(personFigures(tally, { months, first: '2026-01-04', last: '2026-03-20' }).months, 3)
    assert.equal(personFigures(tally, { months, first: '2026-01-12', last: '2026-03-20' }).months, 2)
  })

  test('the profile follows the share of hotfixes', () => {
    assert.equal(personFigures(bob, { months: MONTHS, first: '2026-01-01', last: '2026-03-31' }).profile, 'TMA')
    assert.equal(personFigures(alice, { months: MONTHS, first: '2026-01-01', last: '2026-03-31' }).profile, 'Build')
  })
})

describe('the overall mark and the recommendation', () => {
  /** @typedef {import('../../site/domain/review/scores.js').ScoredPerson} ScoredPerson */
  /** @typedef {import('../../site/domain/review/scores.js').SquadResult} SquadResult */
  // Only what the overall mark reads.
  /**
   * @param {ScoredPerson['marks']} marks
   * @param {Partial<ScoredPerson>} [fields]
   */
  const person = (marks, fields = {}) => /** @type {ScoredPerson} */ (/** @type {unknown} */ ({ marks, unreviewedShare: 0, ...fields }))
  /** @param {number} mark */
  const squad = (mark) => /** @type {SquadResult} */ (/** @type {unknown} */ ({ mark }))

  test('productivity weighs most, then collaboration and importance, then efficiency', () => {
    assert.deepEqual(overallOf(person({ productivity: 100, efficiency: 100, collaboration: 100, importance: 100 }), null), { overall: 100, verdict: 'priority', process: false })
    assert.equal(overallOf(person({ productivity: 60, efficiency: 60, collaboration: 60, importance: 60 }), null).verdict, 'reward')
    assert.equal(overallOf(person({ productivity: 50, efficiency: 50, collaboration: 50, importance: 50 }), null).verdict, 'steady')
    assert.equal(overallOf(person({ productivity: 10, efficiency: 50, collaboration: 30, importance: 30 }), null).verdict, 'support')
  })

  test('too many merges without review hold any reward back', () => {
    const result = overallOf(person({ productivity: 100, efficiency: 100, collaboration: 100, importance: 100 }, { unreviewedShare: 0.3 }), null)
    assert.deepEqual(result, { overall: 100, verdict: 'steady', process: true })
  })

  test('a head of squad is judged on their squad for a quarter, and less on their own code', () => {
    const marks = { productivity: 0, efficiency: 50, collaboration: 50, importance: 50 }
    assert.equal(overallOf(person(marks), null).overall, 33)
    assert.equal(overallOf(person(marks), squad(100)).overall, 55)
  })
})

describe('the notes of a person', () => {
  const team = { mergeHours: 4, hotfixMergeHours: 2, firstReviewHours: 1, reviewHours: 2, reviewsMean: 30, commentsPerReview: 1, size: 100, closedShare: 0.05, variation: 0.5, work: 0.95 }
  const base = {
    profile: 'Build',
    standing: 'within',
    deliveredVsProfile: 1,
    hotfixesMean: 0,
    reviewsMean: 30,
    reviewsInterval: [25, 35],
    dependents: [],
    reviewed: 100,
    commentsPerReview: 1,
    silentShare: 0.5,
    owned: [],
    unreviewedShare: 0,
    closedShare: 0.05,
    mergeHours: 4,
    hotfixMergeHours: null,
    size: 100,
    variation: 0.5,
    failedShare: 0,
    projects: 1,
    acs: 1,
    mergesOfOthers: 0,
    reviewHours: 2,
    presence: 0.9,
    activeDays: 200,
    availableDays: 220,
    rhythm: { work: 0.95, edges: 0.05, night: 0, weekend: 0 },
    marks: { productivity: 50 },
  }
  const keys = (fields, squad = null) => {
    const { strengths, weaknesses } = notesOf({ ...base, ...fields }, team, { requiredApprovals: 2, profile: { delivered: 10, hotfixes: 5 }, squad })
    return { strengths: strengths.map((note) => note.key), weaknesses: weaknesses.map((note) => note.key) }
  }

  test('a person like the team has nothing to say', () => {
    assert.deepEqual(keys({}), { strengths: [], weaknesses: [] })
  })

  test('what stands out clearly says so, with its figures', () => {
    assert.deepEqual(keys({ standing: 'above', reviewsInterval: [60, 80], reviewsMean: 70 }).strengths, ['delivers', 'pillar'])
    assert.deepEqual(keys({ unreviewedShare: 0.4, closedShare: 0.2, presence: 0.4 }).weaknesses, ['presence', 'unreviewed', 'closed'])
    assert.deepEqual(keys({ rhythm: { work: 0.8, edges: 0.05, night: 0.05, weekend: 0.1 } }).weaknesses, ['offHours'])
  })

  test('a person of the TMA is said to deliver too few hotfixes, not too little code', () => {
    assert.deepEqual(keys({ profile: 'TMA', standing: 'below' }).weaknesses, ['fewHotfixes'])
    assert.deepEqual(keys({ standing: 'below' }).weaknesses, ['delivery'])
  })

  test('a head of squad hears of their squad', () => {
    assert.deepEqual(keys({}, { mark: 80, unitsPerMember: 10, reviewsPerMember: 30 }).strengths, ['squadLeads'])
    assert.deepEqual(keys({}, { mark: 20, unitsPerMember: 10, reviewsPerMember: 30 }).weaknesses, ['squadLags'])
  })
})

describe('the review of a team', () => {
  // Six people over a year, each with a steady monthly pace of their own: two who deliver a lot, two little, two of the
  // TMA, and one who arrived two months ago.
  // Early in November, so that everyone active in October is still in the team.
  const generatedAt = '2026-11-02T10:00:00Z'
  const months = reviewMonths(Date.parse(generatedAt))
  const paces = { ann: 8, ben: 7, cid: 2, dan: 2, eve: 6, fay: 5 }
  const records = []
  let number = 0
  for (const month of months) {
    for (const [author, pace] of Object.entries(paces)) {
      for (let index = 0; index < pace; index++) {
        const createdAt = at(`${month}-${String(3 + index).padStart(2, '0')}T09:00:00Z`)
        const reviewer = author === 'ann' ? 'ben' : 'ann'
        records.push(
          record({ repo: author < 'e' ? 'web' : 'api', number: ++number, author, hotfix: author >= 'e', createdAt, mergedAt: createdAt + 120, lines: 80, mergedBy: author, interventions: [[reviewer, createdAt + 60, 'APPROVED', 1]] }),
        )
      }
    }
  }
  for (const month of months.slice(-2)) {
    for (let index = 0; index < 8; index++) {
      const createdAt = at(`${month}-${String(3 + index).padStart(2, '0')}T09:00:00Z`)
      records.push(record({ repo: 'web', number: ++number, author: 'gus', createdAt, mergedAt: createdAt + 60, lines: 50, mergedBy: 'gus', interventions: [['ann', createdAt + 30, 'APPROVED', 0]] }))
    }
  }
  const review = teamReview({
    pullRequests: records,
    repos: REPOS,
    generatedAt,
    windowStart: '2023-11-18T10:00:00Z',
    requiredApprovals: 1,
    squads: [{ name: 'Blue', members: ['ann', 'cid', 'eve'], lead: 'cid' }, { name: 'Red', members: ['ben', 'dan', 'fay'] }],
  })
  const of = (login) => review.people.find((person) => person.login === login)

  test('evaluates those with enough months, the others apart', () => {
    assert.deepEqual(review.people.map((person) => person.login).sort(), ['ann', 'ben', 'cid', 'dan', 'eve', 'fay'])
    assert.deepEqual(review.others.map((person) => person.login), ['gus'])
    assert.equal(review.months.length, 12)
  })

  test('compares productivity within a profile: the TMA among themselves', () => {
    assert.equal(of('eve').profile, 'TMA')
    assert.equal(of('ann').profile, 'Build')
    assert.equal(of('ann').marks.productivity, 100)
    assert.equal(of('eve').marks.productivity, 100)
    assert.equal(of('fay').marks.productivity, 0)
    assert.equal(of('ann').standing, 'above')
    assert.equal(of('cid').standing, 'below')
  })

  test('a head of squad gets their squad, and the review sees that people differ', () => {
    assert.equal(of('cid').squad?.name, 'Blue')
    assert.equal(of('ann').squad, null)
    assert.ok(review.differences && review.differences.units.p < 0.001)
    assert.ok(review.differences.unitsShare > 0.9)
    // Everything at 10:00 or 11:00 in Paris, but the days of the month that fall on a weekend.
    assert.ok(review.workShare > 0.6 && review.workShare < 0.8)
  })

  test('the people who depend on a reviewer, and the repositories that rest on one person', () => {
    assert.deepEqual(of('ann').dependents.map((dependent) => dependent.login).sort(), ['ben', 'cid', 'dan', 'eve', 'fay', 'gus'])
    assert.deepEqual(of('ann').owned, [])
  })
})
