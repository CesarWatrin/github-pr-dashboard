// Tests of the stats computed for a date range. Every repository, person and figure here is made up.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  DAY_MS,
  activityBounds,
  addDays,
  busFactor,
  computeCi,
  comparisonRange,
  computePeriod,
  monthlyActivity,
  monthlyLeaders,
  openPullRequests,
  overlapsPeriod,
  parisDay,
  parisMidnight,
  personalQueue,
  reviewNetwork,
  sameDays,
  workHoursBetween,
} from '../site/period.js'

const at = (iso) => Date.parse(iso) / 60_000
const iso = (time) => new Date(time * 60_000).toISOString()

// A week of Paris days, Monday 2 to Sunday 8 March 2026.
const WEEK = { start: parisMidnight('2026-03-02'), end: parisMidnight('2026-03-09'), bucket: 'day' }

function record(fields) {
  return {
    bot: false,
    kind: 'code',
    hotfix: false,
    production: false,
    mergedAt: null,
    closed: false,
    lines: 10,
    mergedBy: null,
    interventions: [],
    ...fields,
  }
}

const RECORDS = [
  // Reviewed then merged by someone else, shipped with the release of the 4th.
  record({
    repo: 'web',
    number: 1,
    author: 'alice',
    createdAt: at('2026-03-02T09:00:00Z'),
    mergedAt: at('2026-03-02T15:00:00Z'),
    lines: 50,
    deleted: 20,
    mergedBy: 'bob',
    interventions: [['bob', at('2026-03-02T10:00:00Z'), 'APPROVED', 0]],
    deployedAt: at('2026-03-04T12:00:00Z'),
  }),
  // Merged by its author without any review, with a failed check: it only deletes.
  record({
    repo: 'web',
    number: 2,
    author: 'alice',
    createdAt: at('2026-03-03T09:00:00Z'),
    mergedAt: at('2026-03-04T09:00:00Z'),
    lines: 200,
    deleted: 200,
    mergedBy: 'alice',
    deployedAt: at('2026-03-04T12:00:00Z'),
    checksFailed: true,
  }),
  // Commented, then closed without a merge.
  record({
    repo: 'api',
    number: 3,
    author: 'carol',
    createdAt: at('2026-03-05T08:00:00Z'),
    closed: true,
    interventions: [['alice', at('2026-03-05T09:00:00Z'), 'COMMENTED', 2]],
  }),
  // A hotfix merged into production: a corrective deployment.
  record({
    repo: 'api',
    number: 4,
    author: 'carol',
    hotfix: true,
    createdAt: at('2026-03-06T10:00:00Z'),
    mergedAt: at('2026-03-06T12:00:00Z'),
    lines: 5,
    deleted: 1,
    mergedBy: 'carol',
    interventions: [['bob', at('2026-03-06T11:00:00Z'), 'CHANGES_REQUESTED', 1]],
    deployment: true,
    deployedAt: at('2026-03-06T12:00:00Z'),
  }),
  // A release opened by a bot: a deployment and a release, no author stat.
  record({
    repo: 'web',
    number: 5,
    author: 'robot',
    bot: true,
    kind: 'release',
    production: true,
    createdAt: at('2026-03-04T11:00:00Z'),
    mergedAt: at('2026-03-04T12:00:00Z'),
    deployment: true,
  }),
  // Opened before the range: only its review in the range counts.
  record({
    repo: 'web',
    number: 6,
    author: 'alice',
    createdAt: at('2026-02-20T09:00:00Z'),
    mergedAt: at('2026-02-21T09:00:00Z'),
    deleted: 3,
    mergedBy: 'alice',
    interventions: [['bob', at('2026-03-02T08:00:00Z'), 'COMMENTED', 1]],
  }),
  // Dependabot: one merged, one closed, one still waiting since January.
  record({
    repo: 'web',
    number: 7,
    author: 'dependabot',
    bot: true,
    createdAt: at('2026-03-03T06:00:00Z'),
    mergedAt: at('2026-03-05T06:00:00Z'),
    dependency: 'npm_and_yarn',
  }),
  record({
    repo: 'api',
    number: 8,
    author: 'dependabot',
    bot: true,
    createdAt: at('2026-01-10T06:00:00Z'),
    dependency: 'github_actions',
  }),
  record({
    repo: 'api',
    number: 9,
    author: 'dependabot',
    bot: true,
    createdAt: at('2026-03-07T06:00:00Z'),
    closed: true,
    dependency: 'npm_and_yarn',
  }),
  // A revert merged into production: another corrective deployment.
  record({
    repo: 'api',
    number: 10,
    author: 'bob',
    createdAt: at('2026-03-07T10:00:00Z'),
    mergedAt: at('2026-03-07T11:00:00Z'),
    deleted: 10,
    mergedBy: 'bob',
    deployment: true,
    revert: true,
    deployedAt: at('2026-03-07T11:00:00Z'),
  }),
]

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

describe('computePeriod', () => {
  const period = computePeriod(RECORDS, WEEK)

  test('totals count the code pull requests of people opened in the range', () => {
    assert.deepEqual(period.totals, {
      opened: 5,
      merged: 4,
      medianTimeToMergeHours: 4,
      // Sizes 5, 10, 50 and 200.
      medianSize: 30,
      added: 34,
      deleted: 231,
      releases: 1,
      hotfixShare: 0.2,
      unreviewedShare: 0.5,
      reviewed: 4,
      commentsPerPr: 1,
      silentApprovalRate: 1,
      checksFailedShare: 0.25,
    })
  })

  test('authors are kept per repository, bots aside', () => {
    const authors = Object.fromEntries(period.authors.map((person) => [person.login, person.repos]))
    assert.deepEqual(Object.keys(authors).sort(), ['alice', 'bob', 'carol'])
    assert.deepEqual(authors.alice.web, {
      code: 2,
      release: 0,
      integration: 0,
      merged: 2,
      closedUnmerged: 0,
      unreviewed: 1,
      reviewed: 1,
      timesToFirstReviewHours: [1],
      // Tuesday 10:00 to Wednesday 10:00 in Paris: the eight working hours of Tuesday and one of Wednesday.
      timesToMergeHours: [6, 9],
      sizes: [50, 200],
      added: 30,
      deleted: 220,
    })
    assert.equal(authors.carol.api.closedUnmerged, 1)
  })

  test('lines added and deleted: those of the code pull requests opened in the range and merged', () => {
    const authors = Object.fromEntries(period.authors.map((person) => [person.login, person.repos]))
    // The hotfix adds 4 of its 5 lines; the pull request closed without a merge adds nothing.
    assert.deepEqual([authors.carol.api.added, authors.carol.api.deleted], [4, 1])
    // A revert only deletes. Alice's pull request merged before the range does not count.
    assert.deepEqual([authors.bob.api.added, authors.bob.api.deleted], [0, 10])
    assert.deepEqual([period.totals.added, period.totals.deleted], [30 + 4, 220 + 1 + 10])
  })

  test('reviewers count what they did in the range, older pull requests included', () => {
    const bob = period.reviewers.find((person) => person.login === 'bob').repos
    assert.equal(bob.web.prs, 2)
    assert.equal(bob.web.silentApproved, 1)
    assert.equal(bob.web.merges, 1)
    assert.equal(bob.api.changesRequested, 1)
    assert.equal(bob.api.merges, 1)
  })

  test('day buckets cover the range, none partial for whole days', () => {
    assert.equal(period.series.length, 7)
    assert.equal(period.series[0].key, '2026-03-02')
    assert.ok(period.series.every((bucket) => !bucket.partial))
    const byDay = Object.fromEntries(period.series.map((bucket) => [bucket.key, bucket]))
    assert.equal(byDay['2026-03-04'].releases, 1)
    assert.equal(byDay['2026-03-06'].corrective, 1)
    assert.equal(byDay['2026-03-07'].deployments, 1)
  })

  test('delivery: deployments, rework rate, lead time and time to restore', () => {
    const { repositories, ...totals } = period.delivery
    assert.deepEqual(totals, {
      deployments: 3,
      corrective: 2,
      medianLeadTimeHours: 7,
      reworkRate: 0.667,
      // The revert, opened and merged on a Saturday, took no working time.
      medianRestoreHours: 1,
    })
    assert.deepEqual(
      repositories.find((row) => row.repo === 'web'),
      { repo: 'web', deployments: 1, corrective: 0, medianLeadTimeHours: 16.5, reworkRate: 0, medianRestoreHours: null },
    )
  })

  test('the calendar of deployments: per repository and bucket, corrective ones apart', () => {
    const days = Object.fromEntries(
      period.deploymentCalendar.map(({ repo, buckets }) => [
        repo,
        Object.fromEntries(buckets.map((cell, index) => [period.series[index].key, cell]).filter(([, [count]]) => count > 0)),
      ]),
    )
    assert.deepEqual(days, {
      web: { '2026-03-04': [1, 0] },
      api: { '2026-03-06': [1, 1], '2026-03-07': [1, 1] },
    })
  })

  test('Dependabot: opened over the range, waiting whatever the range', () => {
    const { repositories, ecosystems, ...totals } = period.dependencies
    assert.deepEqual(totals, {
      opened: 2,
      merged: 1,
      closed: 1,
      medianTimeToMergeHours: 18,
      waiting: 1,
      oldestWaitingAt: iso(at('2026-01-10T06:00:00Z')),
    })
    assert.deepEqual(ecosystems, [{ ecosystem: 'npm_and_yarn', opened: 2, merged: 1 }])
  })

  test('cycles: each code pull request of people opened in the range, in the stages it went through', () => {
    const cycle = (repo, bucket, size, pickup, review, merge, deploy, toMerge, toProduction) => ({
      repo,
      bucket,
      size,
      pickup,
      review,
      merge,
      deploy,
      toMerge,
      toProduction,
    })
    assert.deepEqual(period.cycles, [
      // Approved at its first review: no time in review.
      cycle('web', '2026-03-02', 1, 1, 0, 5, 15, 6, 21),
      // Merged without any review: only the way to production.
      cycle('web', '2026-03-03', 2, null, null, null, 3, 9, 12),
      // Closed without a merge: only its pickup.
      cycle('api', '2026-03-05', 1, 1, null, null, null, null, null),
      // Changes requested, then merged without an approval: the review lasts until the merge.
      cycle('api', '2026-03-06', 0, 1, 1, null, 0, 2, 2),
      // Opened and merged on a Saturday: no working time.
      cycle('api', '2026-03-07', 1, null, null, null, 0, 0, 0),
    ])
  })

  test('cycles: the last approval before the merge counts, what comes after the merge does not', () => {
    const { cycles } = computePeriod(
      [
        record({
          repo: 'web',
          number: 20,
          author: 'alice',
          createdAt: at('2026-03-02T09:00:00Z'),
          mergedAt: at('2026-03-03T09:00:00Z'),
          interventions: [
            ['bob', at('2026-03-02T11:00:00Z'), 'COMMENTED', 1],
            ['bob', at('2026-03-02T15:00:00Z'), 'APPROVED', 0],
            ['carol', at('2026-03-02T17:00:00Z'), 'APPROVED', 0],
            ['dave', at('2026-03-04T09:00:00Z'), 'COMMENTED', 1],
          ],
          deployedAt: null,
        }),
        // Only commented once merged: never reviewed.
        record({
          repo: 'web',
          number: 21,
          author: 'alice',
          createdAt: at('2026-03-02T09:00:00Z'),
          mergedAt: at('2026-03-02T10:00:00Z'),
          interventions: [['bob', at('2026-03-02T12:00:00Z'), 'COMMENTED', 1]],
        }),
        // Approved, still open: its review is not over.
        record({
          repo: 'web',
          number: 22,
          author: 'alice',
          createdAt: at('2026-03-02T09:00:00Z'),
          interventions: [['bob', at('2026-03-02T10:00:00Z'), 'APPROVED', 0]],
        }),
      ],
      WEEK,
    )
    const stages = cycles.map(({ pickup, review, merge, deploy, toMerge, toProduction }) => [
      pickup,
      review,
      merge,
      deploy,
      toMerge,
      toProduction,
    ])
    assert.deepEqual(stages, [
      // Approved at 18:00 on Monday, merged at 10:00 on Tuesday: one working hour.
      [2, 6, 1, null, 9, null],
      [null, null, null, null, 1, null],
      [1, null, null, null, null, null],
    ])
  })

  test('a range stops at its end, excluded', () => {
    const monday = computePeriod(RECORDS, { ...WEEK, end: parisMidnight('2026-03-03') })
    assert.equal(monday.totals.opened, 1)
    assert.equal(monday.series.length, 1)
  })

  test('buckets cut by the range are partial', () => {
    const weeks = computePeriod(RECORDS, {
      start: parisMidnight('2026-03-04'),
      end: parisMidnight('2026-03-21'),
      bucket: 'week',
    })
    assert.deepEqual(
      weeks.series.map(({ key, partial }) => [key, partial]),
      [
        ['2026-03-02', true],
        ['2026-03-09', false],
        ['2026-03-16', true],
      ],
    )
    const midday = computePeriod(RECORDS, { ...WEEK, start: WEEK.start + DAY_MS / 2 })
    assert.equal(midday.series[0].partial, true)
  })
})

describe('reviewNetwork', () => {
  // Three authors and three reviewers, all made up, over the week of WEEK.
  const review = (login, time, state = 'COMMENTED', comments = 1) => [login, at(time), state, comments]
  const PAIRS = [
    // Reviewed twice by the same person: one pull request for the pair.
    record({
      repo: 'web',
      number: 1,
      author: 'ana',
      createdAt: at('2026-03-02T09:00:00Z'),
      interventions: [review('ben', '2026-03-02T10:00:00Z'), review('ben', '2026-03-02T11:00:00Z', 'APPROVED', 0)],
    }),
    record({
      repo: 'web',
      number: 2,
      author: 'ana',
      createdAt: at('2026-03-03T09:00:00Z'),
      interventions: [review('ben', '2026-03-03T10:00:00Z'), review('cyd', '2026-03-03T11:00:00Z')],
    }),
    record({
      repo: 'api',
      number: 3,
      author: 'ana',
      createdAt: at('2026-03-04T09:00:00Z'),
      interventions: [review('cyd', '2026-03-04T10:00:00Z')],
    }),
    // Its author commenting it does not make it reviewed.
    record({
      repo: 'api',
      number: 4,
      author: 'ana',
      createdAt: at('2026-03-05T09:00:00Z'),
      interventions: [review('ana', '2026-03-05T10:00:00Z')],
    }),
    record({
      repo: 'api',
      number: 5,
      author: 'ben',
      createdAt: at('2026-03-05T09:00:00Z'),
      interventions: [review('dee', '2026-03-05T10:00:00Z'), review('cyd', '2026-03-05T12:00:00Z')],
    }),
    // Opened before the range: its review in the range does not make a pair.
    record({
      repo: 'web',
      number: 6,
      author: 'cyd',
      createdAt: at('2026-02-25T09:00:00Z'),
      interventions: [review('dee', '2026-03-02T10:00:00Z')],
    }),
    record({ repo: 'web', number: 7, author: 'cyd', createdAt: at('2026-03-06T09:00:00Z') }),
    // A release pull request is not a code one.
    record({
      repo: 'web',
      number: 8,
      author: 'ben',
      kind: 'release',
      createdAt: at('2026-03-06T09:00:00Z'),
      interventions: [review('ana', '2026-03-06T10:00:00Z')],
    }),
  ]
  const period = computePeriod(PAIRS, WEEK)

  test('each distinct reviewer of a pull request counts once for the pair, per repository', () => {
    const pairs = Object.fromEntries(period.reviewPairs.map(({ author, reviewer, repos }) => [`${author}>${reviewer}`, repos]))
    assert.deepEqual(pairs, {
      'ana>ben': { web: 2 },
      'ana>cyd': { web: 1, api: 1 },
      'ben>dee': { api: 1 },
      'ben>cyd': { api: 1 },
    })
  })

  test('pairs and authors over every repository', () => {
    const network = reviewNetwork(period)
    assert.deepEqual(
      network.pairs.map(({ author, reviewer, prs }) => [author, reviewer, prs]),
      [
        ['ana', 'ben', 2],
        ['ana', 'cyd', 2],
        ['ben', 'cyd', 1],
        ['ben', 'dee', 1],
      ],
    )
    assert.deepEqual(network.authors, [
      { login: 'ana', code: 4, reviewed: 3, reviewers: 2, topReviewer: 'ben', topReviewerShare: 0.667 },
      { login: 'ben', code: 1, reviewed: 1, reviewers: 2, topReviewer: 'cyd', topReviewerShare: 1 },
      { login: 'cyd', code: 1, reviewed: 0, reviewers: 0, topReviewer: null, topReviewerShare: null },
    ])
  })

  test('the repository filter applies to pairs and authors', () => {
    const network = reviewNetwork(period, new Set(['api']))
    assert.deepEqual(
      network.pairs.map(({ author, reviewer, prs }) => [author, reviewer, prs]),
      [
        ['ana', 'cyd', 1],
        ['ben', 'cyd', 1],
        ['ben', 'dee', 1],
      ],
    )
    assert.deepEqual(network.authors[0], {
      login: 'ana',
      code: 2,
      reviewed: 1,
      reviewers: 1,
      topReviewer: 'cyd',
      topReviewerShare: 1,
    })
    assert.deepEqual(
      network.authors.map(({ login }) => login),
      ['ana', 'ben'],
    )
    assert.deepEqual(reviewNetwork(period, new Set()), { pairs: [], authors: [] })
  })
})

describe('activityBounds', () => {
  const records = [
    record({
      repo: 'web',
      number: 20,
      author: 'ana',
      createdAt: at('2026-03-10T09:00:00Z'),
      interventions: [['ben', at('2026-03-10T10:00:00Z'), 'APPROVED', 0]],
    }),
    // Ana's earlier pull request, listed later: the order of the records does not matter.
    record({ repo: 'api', number: 21, author: 'ana', createdAt: at('2026-02-01T09:00:00Z') }),
    // Ben's own pull request comes after his first review; dan merges it, and merging counts.
    record({
      repo: 'web',
      number: 22,
      author: 'ben',
      createdAt: at('2026-03-20T09:00:00Z'),
      mergedAt: at('2026-03-21T09:00:00Z'),
      mergedBy: 'dan',
    }),
    // A bot's pull request does not count for the bot, but its reviewer counts.
    record({
      repo: 'web',
      number: 23,
      author: 'renovate',
      bot: true,
      createdAt: at('2026-01-05T09:00:00Z'),
      interventions: [['cyd', at('2026-01-06T09:00:00Z'), 'COMMENTED', 1]],
    }),
  ]

  test('each person shows from their earliest to their latest pull request, review or merge', () => {
    const bounds = activityBounds(records)
    assert.deepEqual(
      [...bounds].map(([login, { first, last }]) => [login, iso(first), iso(last)]).sort(),
      [
        ['ana', '2026-02-01T09:00:00.000Z', '2026-03-10T09:00:00.000Z'],
        ['ben', '2026-03-10T10:00:00.000Z', '2026-03-20T09:00:00.000Z'],
        ['cyd', '2026-01-06T09:00:00.000Z', '2026-01-06T09:00:00.000Z'],
        ['dan', '2026-03-21T09:00:00.000Z', '2026-03-21T09:00:00.000Z'],
      ],
    )
  })

  test('no records, nobody', () => {
    assert.equal(activityBounds([]).size, 0)
  })
})

describe('busFactor', () => {
  test('the fewest people who wrote at least half of the pull requests', () => {
    assert.equal(busFactor([6, 2, 2], 10), 1)
    assert.equal(busFactor([3, 4, 3], 10), 2)
    assert.equal(busFactor([2, 2, 2, 2, 2], 10), 3)
  })

  test('people who left count in the total only', () => {
    assert.equal(busFactor([3, 1], 10), 0)
    assert.equal(busFactor([], 4), 0)
  })

  test('no pull request, no bus factor', () => {
    assert.equal(busFactor([], 0), null)
  })
})

describe('monthlyActivity', () => {
  const records = [
    // A hotfix of Ana's in March, reviewed twice by Ben in March, with comments, then once in April, and merged in
    // April: its lines count in April.
    record({
      repo: 'web',
      number: 30,
      author: 'ana',
      hotfix: true,
      createdAt: at('2026-03-30T09:00:00Z'),
      mergedAt: at('2026-04-01T12:00:00Z'),
      lines: 40,
      deleted: 15,
      interventions: [
        ['ben', at('2026-03-30T10:00:00Z'), 'COMMENTED', 2],
        ['ben', at('2026-03-31T10:00:00Z'), 'APPROVED', 1],
        ['ben', at('2026-04-01T10:00:00Z'), 'COMMENTED', 1],
      ],
    }),
    // Opened at 23:30 UTC on the 31st of March: already April in Paris.
    record({ repo: 'web', number: 31, author: 'ana', createdAt: at('2026-03-31T23:30:00Z') }),
    // Releases and bot pull requests do not count, nor do the reviews they get.
    record({
      repo: 'web',
      number: 32,
      author: 'ana',
      kind: 'release',
      createdAt: at('2026-03-10T09:00:00Z'),
      mergedAt: at('2026-03-10T12:00:00Z'),
      lines: 500,
      interventions: [['ben', at('2026-03-10T10:00:00Z'), 'APPROVED', 0]],
    }),
    record({ repo: 'web', number: 33, author: 'renovate', bot: true, createdAt: at('2026-03-11T09:00:00Z') }),
    // A merge of a branch into another counts among the pull requests Ana opened in March, and nowhere else.
    record({
      repo: 'web',
      number: 34,
      author: 'ana',
      kind: 'integration',
      createdAt: at('2026-03-12T09:00:00Z'),
      mergedAt: at('2026-03-12T10:00:00Z'),
      lines: 3000,
      interventions: [['ben', at('2026-03-12T09:30:00Z'), 'APPROVED', 1]],
    }),
  ]
  const activity = monthlyActivity(records)

  test('code pull requests and hotfixes count in the Paris month opened, their lines in that of the merge', () => {
    assert.deepEqual(Object.fromEntries(activity.get('ana')), {
      '2026-03': { code: 1, hotfixes: 1, reviewed: 0, comments: 0, added: 0, deleted: 0, opened: 2 },
      '2026-04': { code: 1, hotfixes: 0, reviewed: 0, comments: 0, added: 25, deleted: 15, opened: 1 },
    })
  })

  test('a pull request counts once a month for its reviewer, comments all count', () => {
    assert.deepEqual(Object.fromEntries(activity.get('ben')), {
      '2026-03': { code: 0, hotfixes: 0, reviewed: 1, comments: 3, added: 0, deleted: 0, opened: 0 },
      '2026-04': { code: 0, hotfixes: 0, reviewed: 1, comments: 1, added: 0, deleted: 0, opened: 0 },
    })
  })

  test('bots do not show', () => {
    assert.equal(activity.has('renovate'), false)
  })
})

describe('monthlyLeaders', () => {
  const history = {
    '2026-02': { alice: { code: 4, reviewed: 1 }, bob: { code: 4, reviewed: 3 } },
    '2026-01': { alice: { code: 2, reviewed: 0 }, carol: { code: 5, reviewed: 2 } },
    '2026-03': { bob: { code: 0, reviewed: 0 } },
  }

  test('the top of each month, oldest first, ties sharing it', () => {
    assert.deepEqual(monthlyLeaders(history, 'code'), [
      { month: '2026-01', value: 5, people: ['carol'] },
      { month: '2026-02', value: 4, people: ['alice', 'bob'] },
    ])
  })

  test('a month nobody did any of it has no leader', () => {
    assert.deepEqual(
      monthlyLeaders(history, 'reviewed').map(({ month }) => month),
      ['2026-01', '2026-02'],
    )
    assert.deepEqual(monthlyLeaders(history, 'hotfixes'), [])
  })
})

describe('openPullRequests', () => {
  const open = (number, fields) => record({ repo: 'web', number, author: 'alice', createdAt: at('2026-03-02T09:00:00Z'), ...fields })
  const stances = openPullRequests([
    open(1),
    open(2, { interventions: [['bob', at('2026-03-02T10:00:00Z'), 'COMMENTED', 2]] }),
    // Approved by one, then changes requested by another: changes are requested.
    open(3, {
      interventions: [
        ['bob', at('2026-03-02T10:00:00Z'), 'APPROVED', 0],
        ['carol', at('2026-03-02T11:00:00Z'), 'CHANGES_REQUESTED', 1],
      ],
    }),
    // Changes requested, then approved by the same person, who commented afterwards: approved.
    open(4, {
      interventions: [
        ['bob', at('2026-03-02T10:00:00Z'), 'CHANGES_REQUESTED', 1],
        ['bob', at('2026-03-03T10:00:00Z'), 'APPROVED', 0],
        ['carol', at('2026-03-03T12:00:00Z'), 'APPROVED', 0],
        ['bob', at('2026-03-04T10:00:00Z'), 'COMMENTED', 1],
      ],
    }),
    open(5, { draft: true }),
    open(6, { mergedAt: at('2026-03-03T09:00:00Z') }),
    open(7, { closed: true }),
    open(8, { bot: true }),
    open(9, { kind: 'release' }),
  ]).map(({ number, stance, since, by, lastAt }) => [number, stance, iso(since), by, iso(lastAt)])

  test('code owners who have not reviewed it block a pull request, unless changes are requested', () => {
    const blocked = openPullRequests([
      open(1, { codeOwners: ['carol', '@backend'], interventions: [['bob', at('2026-03-02T10:00:00Z'), 'APPROVED', 0]] }),
      open(2, { codeOwners: ['carol'], interventions: [['bob', at('2026-03-02T10:00:00Z'), 'CHANGES_REQUESTED', 1]] }),
    ])
    assert.deepEqual(
      blocked.map(({ number, stance, since, by }) => [number, stance, iso(since), by]),
      [
        [1, 'owners', '2026-03-02T09:00:00.000Z', ['carol', '@backend']],
        [2, 'changes', '2026-03-02T10:00:00.000Z', ['bob']],
      ],
    )
  })

  test('approved by fewer people than merging needs, it is still being approved', () => {
    const twoNeeded = openPullRequests(
      [
        open(1, { interventions: [['bob', at('2026-03-02T10:00:00Z'), 'APPROVED', 0]] }),
        open(2, {
          interventions: [
            ['bob', at('2026-03-02T10:00:00Z'), 'APPROVED', 0],
            ['carol', at('2026-03-02T11:00:00Z'), 'APPROVED', 0],
          ],
        }),
      ],
      { requiredApprovals: 2 },
    )
    assert.deepEqual(
      twoNeeded.map(({ number, stance, by }) => [number, stance, by]),
      [
        [1, 'approving', ['bob']],
        [2, 'approved', ['bob', 'carol']],
      ],
    )
  })

  test('where each open pull request stands, after the latest decision of each reviewer', () => {
    assert.deepEqual(stances, [
      [1, 'waiting', '2026-03-02T09:00:00.000Z', [], '2026-03-02T09:00:00.000Z'],
      [2, 'discussed', '2026-03-02T10:00:00.000Z', [], '2026-03-02T10:00:00.000Z'],
      [3, 'changes', '2026-03-02T11:00:00.000Z', ['carol'], '2026-03-02T11:00:00.000Z'],
      [4, 'approved', '2026-03-03T12:00:00.000Z', ['bob', 'carol'], '2026-03-04T10:00:00.000Z'],
    ])
  })

  test('the people still asked to review it, none when the sync published none', () => {
    const asked = openPullRequests([open(1, { requestedReviewers: ['bob', 'carol'] }), open(2)])
    assert.deepEqual(
      asked.map(({ number, requestedReviewers }) => [number, requestedReviewers]),
      [
        [1, ['bob', 'carol']],
        [2, []],
      ],
    )
  })
})

describe('personalQueue', () => {
  const open = (number, fields) => record({ repo: 'web', number, author: 'alice', createdAt: at('2026-03-02T09:00:00Z'), ...fields })
  // Forgotten: nothing reviewed or commented since the 5th.
  const forgottenBefore = at('2026-03-05T00:00:00Z')
  const queue = personalQueue(
    openPullRequests([
      // Bob's, asking for Alice's review: the older one first, forgotten or not.
      open(1, { author: 'bob', createdAt: at('2026-03-06T09:00:00Z'), requestedReviewers: ['alice', 'carol'] }),
      open(2, { author: 'bob', createdAt: at('2026-03-03T09:00:00Z'), requestedReviewers: ['alice'] }),
      // Bob's, asking someone else: not for Alice.
      open(3, { author: 'bob', requestedReviewers: ['carol'] }),
      // Alice's own, with something since the 5th: by where each stands.
      open(4, { createdAt: at('2026-03-06T09:00:00Z'), requestedReviewers: ['bob'] }),
      open(5, { createdAt: at('2026-03-06T09:00:00Z'), interventions: [['bob', at('2026-03-07T10:00:00Z'), 'CHANGES_REQUESTED', 1]] }),
      open(6, { createdAt: at('2026-03-06T09:00:00Z'), interventions: [['carol', at('2026-03-06T15:00:00Z'), 'APPROVED', 0]] }),
      open(7, { createdAt: at('2026-03-06T09:00:00Z'), codeOwners: ['@backend'] }),
      open(8, { createdAt: at('2026-03-05T09:00:00Z'), interventions: [['bob', at('2026-03-06T10:00:00Z'), 'COMMENTED', 1]] }),
      // Alice's own, nothing since the 5th: forgotten, whatever they stand, the longest forgotten first.
      open(9, { interventions: [['bob', at('2026-03-03T10:00:00Z'), 'CHANGES_REQUESTED', 1]] }),
      open(10, { interventions: [['carol', at('2026-03-02T10:00:00Z'), 'APPROVED', 0]] }),
      // A draft waits for no one: neither in her lists nor in Carol's.
      open(11, { draft: true, author: 'bob', requestedReviewers: ['alice'] }),
    ]),
    'alice',
    { forgottenBefore },
  )
  const numbers = (prs) => prs.map((pr) => pr.number)

  test('the reviews still asked of the person on other people’s pull requests, the oldest first', () => {
    assert.deepEqual(numbers(queue.toReview), [2, 1])
  })

  test('their own, each in one list after where it stands, the longest there first', () => {
    assert.deepEqual(numbers(queue.ready), [6])
    assert.deepEqual(numbers(queue.changes), [5])
    assert.deepEqual(numbers(queue.owners), [7])
    assert.deepEqual(numbers(queue.open), [4, 8])
  })

  test('forgotten wins over where it stands, the longest forgotten first', () => {
    assert.deepEqual(numbers(queue.forgotten), [10, 9])
  })

  test('nothing is forgotten without a date, and someone without anything open has empty lists', () => {
    const recent = personalQueue(openPullRequests([open(1, { interventions: [['bob', at('2026-03-02T10:00:00Z'), 'CHANGES_REQUESTED', 1]] })]), 'alice')
    assert.deepEqual([numbers(recent.changes), numbers(recent.forgotten)], [[1], []])
    assert.deepEqual(personalQueue([], 'alice'), { toReview: [], ready: [], changes: [], owners: [], open: [], forgotten: [] })
  })
})

describe('computeCi', () => {
  const WORKFLOWS = [
    {
      repo: 'web',
      workflow: 'Tests',
      days: {
        '2026-03-02': [2, 1, 0, [60, 120]],
        '2026-03-03': [1, 0, 1, [300]],
        '2026-03-20': [5, 5, 0, [10, 10, 10, 10, 10]],
      },
    },
    { repo: 'api', workflow: 'Lint', days: { '2026-03-04': [1, 0, 0, [30]] } },
  ]
  const ci = computeCi(WORKFLOWS, WEEK)

  test('totals add up the days of the range only', () => {
    assert.deepEqual(ci.totals, { runs: 4, failureRate: 0.25, rerunRate: 0.25, medianSeconds: 90, p90Seconds: 300 })
  })

  test('each workflow has its own figures', () => {
    assert.deepEqual(ci.workflows, [
      { repo: 'web', workflow: 'Tests', runs: 3, failureRate: 0.333, rerunRate: 0.333, medianSeconds: 120, p90Seconds: 300 },
      { repo: 'api', workflow: 'Lint', runs: 1, failureRate: 0, rerunRate: 0, medianSeconds: 30, p90Seconds: 30 },
    ])
  })

  test('the series has every day of the range, empty ones included', () => {
    assert.equal(ci.series.length, 7)
    assert.deepEqual(
      ci.series.slice(0, 4).map(({ key, runs, medianSeconds }) => [key, runs, medianSeconds]),
      [
        ['2026-03-02', 2, 90],
        ['2026-03-03', 1, 300],
        ['2026-03-04', 1, 30],
        ['2026-03-05', 0, null],
      ],
    )
  })
})

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
