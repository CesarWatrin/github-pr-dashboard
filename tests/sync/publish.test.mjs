// Tests of today's counters and the podium of each (computeToday() of scripts/sync/publish.mjs). Every
// repository, person and figure here is made up.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import './environment.mjs'
import { computeToday } from '../../scripts/sync/publish.mjs'
import { pullRequest } from './pull-request.mjs'

describe('computeToday', () => {
  // 11:00 in Paris on 10 March 2026.
  const now = new Date('2026-03-10T10:00:00Z')
  const review = (author, submittedAt) => ({ author, state: 'APPROVED', submittedAt, comments: 0 })
  const pullRequests = [
    pullRequest({ number: 1, author: 'alice', createdAt: '2026-03-10T08:00:00Z', reviews: [review('bob', '2026-03-10T09:00:00Z')] }),
    pullRequest({ number: 2, author: 'alice', createdAt: '2026-03-10T09:00:00Z', reviews: [review('bob', '2026-03-10T09:30:00Z'), review('alice', '2026-03-10T09:40:00Z')] }),
    pullRequest({ number: 3, author: 'carol', createdAt: '2026-03-10T07:00:00Z', mergedAt: '2026-03-10T09:00:00Z', reviews: [review('dave', '2026-03-10T08:00:00Z')] }),
    // Opened the day before, merged today; reviewed the day before.
    pullRequest({ number: 4, author: 'dave', createdAt: '2026-03-09T10:00:00Z', mergedAt: '2026-03-10T08:30:00Z', reviews: [review('carol', '2026-03-09T12:00:00Z')] }),
    // A bot's pull request and a bot's review count for nobody.
    pullRequest({ number: 5, author: 'robot', createdAt: '2026-03-10T08:00:00Z' }),
    pullRequest({ number: 6, author: 'erin', createdAt: '2026-03-08T08:00:00Z', reviews: [review('robot', '2026-03-10T08:00:00Z')] }),
  ]

  test('the counters of the day, and the podium of each, the most first', () => {
    assert.deepEqual(computeToday(pullRequests, now), {
      date: '2026-03-10',
      opened: 3,
      merged: 2,
      reviews: 3,
      podiums: {
        opened: [
          ['alice', 2],
          ['carol', 1],
        ],
        merged: [
          ['carol', 1],
          ['dave', 1],
        ],
        reviews: [
          ['bob', 2],
          ['dave', 1],
        ],
      },
    })
  })

  test('nobody is on the podium of a day without anything', () => {
    assert.deepEqual(computeToday([], now).podiums, { opened: [], merged: [], reviews: [] })
  })
})
