// Tests of the counterparts of a pull request: those of its branch in other repositories (scripts/sync/counterparts.mjs).
// Every repository, person and figure here is made up.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import './environment.mjs'
import { counterpartIndex, counterpartsOf } from '../../scripts/sync/counterparts.mjs'
import { deliveryIndex, toPeriodRecord } from '../../scripts/sync/records.mjs'
import { pullRequest } from './pull-request.mjs'

describe('counterpartsOf', () => {
  const PULL_REQUESTS = {
    front: pullRequest({ repo: 'web', number: 1, head: 'feature/search', createdAt: '2026-03-10T09:00:00Z' }),
    back: pullRequest({ repo: 'api', number: 4, head: 'feature/search', createdAt: '2026-03-09T09:00:00Z' }),
    // Merged a week before the front end was opened: still its counterpart.
    mobile: pullRequest({ repo: 'app', number: 2, head: 'feature/search', mergedAt: '2026-03-03T09:00:00Z' }),
    // The same name, merged long before: another piece of work.
    older: pullRequest({ repo: 'admin', number: 7, head: 'feature/search', createdAt: '2025-06-01T09:00:00Z', mergedAt: '2025-06-02T09:00:00Z' }),
    closed: pullRequest({ repo: 'docs', number: 3, head: 'feature/search', state: 'CLOSED', closedAt: '2026-03-10T10:00:00Z' }),
    bot: pullRequest({ repo: 'tools', number: 5, head: 'feature/search', author: 'robot' }),
    // Another back end: a counterpart of the front end, not of the first back end, on its side. Tooling is none.
    sameRepository: pullRequest({ repo: 'web', number: 9, head: 'feature/search' }),
    sameSide: pullRequest({ repo: 'worker', number: 8, head: 'feature/search' }),
    tooling: pullRequest({ repo: 'infra', number: 6, head: 'feature/search' }),
    releaseFront: pullRequest({ repo: 'web', number: 2, head: 'release/2.0', base: 'main' }),
    releaseBack: pullRequest({ repo: 'api', number: 5, head: 'release/2.0', base: 'main' }),
    developFront: pullRequest({ repo: 'web', number: 3, head: 'develop', base: 'main' }),
    developBack: pullRequest({ repo: 'api', number: 6, head: 'develop', base: 'main' }),
  }
  const CATEGORIES = { web: 'front', admin: 'front', api: 'back', worker: 'back', app: 'mobile', docs: 'other', infra: 'other', tools: 'other' }
  const index = counterpartIndex(Object.values(PULL_REQUESTS), (repo) => CATEGORIES[repo])
  const of = (name) => counterpartsOf(PULL_REQUESTS[name], index)

  test('the pull requests of its branch on another side, open or merged lately, by repository', () => {
    assert.deepEqual(of('front'), [
      ['api', 4],
      ['app', 2],
      ['worker', 8],
    ])
    // Neither the other back end nor tooling.
    assert.deepEqual(of('back'), [
      ['app', 2],
      ['web', 1],
      ['web', 9],
    ])
  })

  test('none for a pull request merged or closed, of tooling, nor on a branch shared by chance', () => {
    assert.deepEqual([of('mobile'), of('closed'), of('tooling'), of('releaseFront'), of('developFront')], [[], [], [], [], []])
  })

  test('the record carries them, never the branch', () => {
    const record = toPeriodRecord(PULL_REQUESTS.front, deliveryIndex([]), null, null, index)
    assert.deepEqual(record?.counterparts, [
      ['api', 4],
      ['app', 2],
      ['worker', 8],
    ])
    assert.equal(JSON.stringify(record).includes('feature/search'), false)
    assert.equal('counterparts' in (toPeriodRecord(PULL_REQUESTS.mobile, deliveryIndex([]), null, null, index) ?? {}), false)
    assert.equal('counterparts' in (toPeriodRecord(PULL_REQUESTS.front, deliveryIndex([])) ?? {}), false)
  })
})
