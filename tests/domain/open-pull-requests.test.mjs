// Tests of where the open pull requests stand (site/domain/open-pull-requests.js). Every repository, person and figure here is made up.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { openPullRequests, personalQueue } from '../../site/domain/open-pull-requests.js'
import { at, iso, record } from './records.mjs'

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

  test('releases and integrations come with the code when asked for, each with its kind', () => {
    const records = [open(1), open(2, { kind: 'release' }), open(3, { kind: 'integration' }), open(4, { kind: 'integration', draft: true })]
    assert.deepEqual(
      openPullRequests(records).map(({ number, kind }) => [number, kind]),
      [[1, 'code']],
    )
    assert.deepEqual(
      openPullRequests(records, { kinds: ['code', 'integration', 'release'] }).map(({ number, kind }) => [number, kind]),
      [
        [1, 'code'],
        [2, 'release'],
        [3, 'integration'],
      ],
    )
  })

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
