// Tests of who reviews whom, who is around, and the bus factor (site/domain/team.js). Every repository, person and figure here is made up.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { computePeriod } from '../../site/domain/period.js'
import { activityBounds, busFactor, reviewNetwork } from '../../site/domain/team.js'
import { at, iso, record, WEEK } from './records.mjs'

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
