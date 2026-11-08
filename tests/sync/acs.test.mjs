// Tests of the AC of each pull request (scripts/sync/acs.mjs): branches feature/… and feat/… cut from develop, stacked
// pull requests, and branches that go elsewhere. Every repository, branch and AC here is made up.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import './environment.mjs'
import { acOf, acOfBranch } from '../../scripts/sync/acs.mjs'
import { projectIndex } from '../../scripts/sync/projects.mjs'
import { pullRequest } from './pull-request.mjs'

// The AC of each of these pull requests, resolved against all of them.
/** @param {Record<string, ReturnType<typeof pullRequest>>} pullRequests */
function acsOf(pullRequests) {
  const index = projectIndex(Object.values(pullRequests))

  return Object.fromEntries(Object.entries(pullRequests).map(([name, pr]) => [name, acOf(pr, index)]))
}

describe('acOfBranch', () => {
  test('a branch feature/… or feat/…, its name what follows', () => {
    assert.equal(acOfBranch('feature/csv-export'), 'csv-export')
    assert.equal(acOfBranch('feat/csv-export'), 'csv-export')
    assert.equal(acOfBranch('feature/exports/csv'), 'exports/csv')
  })

  test('any other branch is none', () => {
    assert.equal(acOfBranch('fix/csv-export'), null)
    assert.equal(acOfBranch('features/csv-export'), null)
    assert.equal(acOfBranch('feature'), null)
    assert.equal(acOfBranch('develop'), null)
  })
})

describe('acOf', () => {
  test('a branch feature/… or feat/… that goes into develop is that of its AC', () => {
    assert.deepEqual(
      acsOf({
        feature: pullRequest({ number: 1, head: 'feature/csv-export', base: 'develop' }),
        feat: pullRequest({ number: 2, head: 'feat/dark-mode', base: 'develop' }),
      }),
      { feature: 'feature/csv-export', feat: 'feat/dark-mode' },
    )
  })

  test('a branch that goes elsewhere was not cut from develop', () => {
    assert.deepEqual(
      acsOf({
        project: pullRequest({ number: 1, head: 'feature/cart', base: 'project/paper-kite/main' }),
        master: pullRequest({ number: 2, head: 'feature/urgent', base: 'master' }),
        other: pullRequest({ number: 3, head: 'chore/upgrade', base: 'develop' }),
      }),
      { project: null, master: null, other: null },
    )
  })

  test('a pull request stacked on the branch of an AC belongs to it, at any depth, in its own repository', () => {
    assert.deepEqual(
      acsOf({
        ac: pullRequest({ number: 1, head: 'feature/csv-export', base: 'develop' }),
        stacked: pullRequest({ number: 2, head: 'feat/csv-headers', base: 'feature/csv-export' }),
        deeper: pullRequest({ number: 3, head: 'fix/csv-quotes', base: 'feat/csv-headers' }),
        elsewhere: pullRequest({ repo: 'api', number: 4, head: 'feat/csv-headers', base: 'feature/csv-export' }),
      }),
      { ac: 'feature/csv-export', stacked: 'feature/csv-export', deeper: 'feature/csv-export', elsewhere: null },
    )
  })

  test('stacked on a branch that never goes into develop, or in a loop, none', () => {
    assert.deepEqual(
      acsOf({
        orphan: pullRequest({ number: 1, head: 'feat/steps', base: 'feature/wizard' }),
        loop: pullRequest({ number: 2, head: 'feature/a', base: 'feature/b' }),
        back: pullRequest({ number: 3, head: 'feature/b', base: 'feature/a' }),
      }),
      { orphan: null, loop: null, back: null },
    )
  })
})
