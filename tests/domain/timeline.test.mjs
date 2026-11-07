// Tests of the timeline of a pull request (site/domain/timeline.js). Every repository, person and figure here is made up.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { pullRequestTimeline } from '../../site/domain/timeline.js'
import { at, record } from './records.mjs'

describe('pullRequestTimeline', () => {
  // Monday 2 March 2026, Paris being an hour ahead of UTC: 09:00Z is 10:00 in Paris.
  const reviewed = record({
    repo: 'web',
    number: 40,
    author: 'alice',
    createdAt: at('2026-03-02T09:00:00Z'),
    mergedAt: at('2026-03-03T10:30:00Z'),
    mergedBy: 'dan',
    deployedAt: at('2026-03-04T08:30:00Z'),
    interventions: [
      ['bob', at('2026-03-02T11:00:00Z'), null, 1],
      ['carol', at('2026-03-02T14:00:00Z'), 'CHANGES_REQUESTED', 3],
      ['carol', at('2026-03-03T09:00:00Z'), 'APPROVED', 0],
      ['bob', at('2026-03-03T11:00:00Z'), 'COMMENTED', 1],
    ],
  })

  test('each step with the working hours since the one before, up to production', () => {
    const { steps, pending, durations } = pullRequestTimeline(reviewed, at('2026-03-09T09:00:00Z'))
    assert.deepEqual(
      steps.map(({ key, login, wait }) => [key, login, wait]),
      [
        ['opened', 'alice', null],
        ['commented', 'bob', 2],
        ['changes', 'carol', 3],
        // From 15:00 to 18:00 on Monday, then from 9:00 to 10:00 on Tuesday.
        ['approved', 'carol', 4],
        ['merged', 'dan', 1.5],
        ['deployed', null, 7],
      ],
    )
    assert.equal(steps[1].at, at('2026-03-02T11:00:00Z'))
    assert.equal(pending, null)
    assert.deepEqual(durations, { pickup: 2, toMerge: 10.5, toProduction: 17.5 })
  })

  test('waits to the minute, where the cycle page rounds to the tenth of an hour', () => {
    const quick = record({
      repo: 'web',
      number: 45,
      author: 'alice',
      createdAt: at('2026-03-02T09:00:00Z'),
      mergedAt: at('2026-03-02T09:23:00Z'),
      interventions: [['bob', at('2026-03-02T09:03:00Z'), 'APPROVED', 0]],
    })
    const { steps, durations } = pullRequestTimeline(quick, at('2026-03-02T10:00:00Z'))
    assert.deepEqual(
      steps.map(({ wait }) => wait && Math.round(wait * 60)),
      [null, 3, 20],
    )
    assert.equal(Math.round(durations.toMerge * 60), 23)
    assert.equal(durations.toProduction, null)
  })

  test('everyone who intervened, after the merge included, with their decisions and comments', () => {
    assert.deepEqual(pullRequestTimeline(reviewed, at('2026-03-09T09:00:00Z')).people, [
      { login: 'bob', approved: 0, changes: 0, comments: 2, first: at('2026-03-02T11:00:00Z'), last: at('2026-03-03T11:00:00Z') },
      { login: 'carol', approved: 1, changes: 1, comments: 3, first: at('2026-03-02T14:00:00Z'), last: at('2026-03-03T09:00:00Z') },
    ])
  })

  test('a first intervention that decides is one step, and a review without decision only counts first', () => {
    const pr = record({
      repo: 'api',
      number: 41,
      author: 'alice',
      createdAt: at('2026-03-02T09:00:00Z'),
      interventions: [
        ['bob', at('2026-03-02T10:00:00Z'), 'APPROVED', 0],
        ['carol', at('2026-03-02T11:00:00Z'), 'COMMENTED', 2],
      ],
    })
    assert.deepEqual(
      pullRequestTimeline(pr, at('2026-03-02T12:00:00Z')).steps.map(({ key }) => key),
      ['opened', 'approved'],
    )
    const commentedFirst = {
      ...pr,
      interventions: [
        ['carol', at('2026-03-02T10:00:00Z'), 'COMMENTED', 2],
        ['bob', at('2026-03-02T11:00:00Z'), 'APPROVED', 0],
        ['carol', at('2026-03-02T11:30:00Z'), 'COMMENTED', 1],
      ],
    }
    assert.deepEqual(
      pullRequestTimeline(commentedFirst, at('2026-03-02T12:00:00Z')).steps.map(({ key, login }) => [key, login]),
      [
        ['opened', 'alice'],
        ['reviewed', 'carol'],
        ['approved', 'bob'],
      ],
    )
  })

  test('an open pull request waits since its last step, a draft for its author', () => {
    const pr = record({
      repo: 'web',
      number: 42,
      author: 'alice',
      createdAt: at('2026-03-02T09:00:00Z'),
      interventions: [['bob', at('2026-03-02T10:00:00Z'), 'CHANGES_REQUESTED', 1]],
    })
    // From 11:00 on Monday to 10:00 on Tuesday: 7 then 1 working hours.
    assert.deepEqual(pullRequestTimeline(pr, at('2026-03-03T09:00:00Z')).pending, {
      key: 'open',
      since: at('2026-03-02T10:00:00Z'),
      wait: 8,
    })
    assert.equal(pullRequestTimeline({ ...pr, draft: true }, at('2026-03-03T09:00:00Z')).pending.key, 'draft')
  })

  test('a merged code pull request not in production yet waits for it, a release does not', () => {
    const pr = record({
      repo: 'web',
      number: 43,
      author: 'alice',
      createdAt: at('2026-03-02T09:00:00Z'),
      mergedAt: at('2026-03-02T10:00:00Z'),
      deployedAt: null,
    })
    assert.deepEqual(pullRequestTimeline(pr, at('2026-03-02T12:00:00Z')).pending, {
      key: 'production',
      since: at('2026-03-02T10:00:00Z'),
      wait: 2,
    })
    const release = { ...pr, kind: 'release' }
    delete release.deployedAt
    assert.equal(pullRequestTimeline(release, at('2026-03-02T12:00:00Z')).pending, null)
  })

  test('one closed without a merge ends closed, without a time nor anything pending', () => {
    const pr = record({ repo: 'web', number: 44, author: 'alice', createdAt: at('2026-03-02T09:00:00Z'), closed: true })
    const { steps, pending } = pullRequestTimeline(pr, at('2026-03-09T09:00:00Z'))
    assert.deepEqual(steps.at(-1), { key: 'closed', at: null, login: null, wait: null })
    assert.equal(pending, null)
  })
})
