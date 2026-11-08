// Tests of the project of each pull request (scripts/sync/projects.mjs): named branches, stacked pull requests, the
// merge of a project branch, and branches that only look like a project's. Every repository, branch and project here
// is made up.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import './environment.mjs'
import { isProjectMerge, projectIndex, projectOf, projectOfBranch } from '../../scripts/sync/projects.mjs'
import { pullRequest } from './pull-request.mjs'

// The project of each of these pull requests, resolved against all of them.
/** @param {Record<string, ReturnType<typeof pullRequest>>} pullRequests */
function projectsOf(pullRequests) {
  const index = projectIndex(Object.values(pullRequests))

  return Object.fromEntries(Object.entries(pullRequests).map(([name, pr]) => [name, projectOf(pr, index)]))
}

describe('projectOfBranch', () => {
  test('a branch named under a project, its long-lived branch included', () => {
    assert.equal(projectOfBranch('project/paper-kite/main'), 'paper-kite')
    assert.equal(projectOfBranch('project/paper-kite/search-screen'), 'paper-kite')
    assert.equal(projectOfBranch('project/paper-kite/steps/first'), 'paper-kite')
  })

  test('a branch that only looks like one belongs to none', () => {
    assert.equal(projectOfBranch('project/paper-kite'), null)
    assert.equal(projectOfBranch('projects/paper-kite/main'), null)
    assert.equal(projectOfBranch('feature/project/paper-kite/main'), null)
    assert.equal(projectOfBranch('develop'), null)
  })
})

describe('projectOf', () => {
  test('a pull request into the project branch, or into a branch named under the project', () => {
    const projects = projectsOf({
      feature: pullRequest({ number: 1, head: 'feature/cart', base: 'project/paper-kite/main' }),
      step: pullRequest({ number: 2, head: 'feature/cart-icons', base: 'project/paper-kite/cart' }),
    })
    assert.deepEqual(projects, { feature: 'paper-kite', step: 'paper-kite' })
  })

  test('the merge of the project branch into a long-lived branch, and a branch named under the project', () => {
    const projects = projectsOf({
      merge: pullRequest({ number: 1, head: 'project/paper-kite/main', base: 'develop' }),
      named: pullRequest({ number: 2, head: 'project/paper-kite/hotfix-label', base: 'main' }),
    })
    assert.deepEqual(projects, { merge: 'paper-kite', named: 'paper-kite' })
  })

  test('a pull request stacked on a feature branch of the project belongs to it, however deep', () => {
    const projects = projectsOf({
      feature: pullRequest({ number: 1, head: 'feature/cart', base: 'project/paper-kite/main', createdAt: '2026-03-02T09:00:00Z' }),
      stacked: pullRequest({ number: 2, head: 'feature/cart-total', base: 'feature/cart', createdAt: '2026-03-03T09:00:00Z' }),
      deeper: pullRequest({ number: 3, head: 'feature/cart-total-tax', base: 'feature/cart-total', createdAt: '2026-03-04T09:00:00Z' }),
      // Opened before the pull request that brings its base into the project: the order does not matter.
      early: pullRequest({ number: 4, head: 'feature/cart-empty', base: 'feature/cart', createdAt: '2026-03-01T09:00:00Z' }),
    })
    assert.deepEqual(projects, { feature: 'paper-kite', stacked: 'paper-kite', deeper: 'paper-kite', early: 'paper-kite' })
  })

  test('stacking only counts within a repository', () => {
    const projects = projectsOf({
      feature: pullRequest({ repo: 'web', number: 1, head: 'feature/cart', base: 'project/paper-kite/main' }),
      elsewhere: pullRequest({ repo: 'api', number: 1, head: 'feature/cart-api', base: 'feature/cart' }),
    })
    assert.deepEqual(projects, { feature: 'paper-kite', elsewhere: null })
  })

  test('a project of the same name in two repositories has the same name in both', () => {
    const projects = projectsOf({
      web: pullRequest({ repo: 'web', number: 1, head: 'feature/cart', base: 'project/paper-kite/main' }),
      api: pullRequest({ repo: 'api', number: 1, head: 'feature/cart', base: 'project/paper-kite/main' }),
      apiMerge: pullRequest({ repo: 'api', number: 2, head: 'project/paper-kite/main', base: 'develop' }),
    })
    assert.deepEqual(projects, { web: 'paper-kite', api: 'paper-kite', apiMerge: 'paper-kite' })
  })

  test('a long-lived branch never belongs to a project, even brought into one', () => {
    const projects = projectsOf({
      backMerge: pullRequest({ number: 1, head: 'develop', base: 'project/paper-kite/main' }),
      intoDevelop: pullRequest({ number: 2, head: 'feature/login', base: 'develop' }),
      intoMain: pullRequest({ number: 3, head: 'feature/menu', base: 'main' }),
    })
    assert.deepEqual(projects, { backMerge: 'paper-kite', intoDevelop: null, intoMain: null })
  })

  test('branches that only look like a project’s give none', () => {
    const projects = projectsOf({
      plural: pullRequest({ number: 1, head: 'feature/cart', base: 'projects/paper-kite/main' }),
      bare: pullRequest({ number: 2, head: 'project/paper-kite', base: 'develop' }),
      plain: pullRequest({ number: 3, head: 'feature/menu', base: 'develop' }),
    })
    assert.deepEqual(projects, { plural: null, bare: null, plain: null })
  })

  test('the branch a pull request targets comes before its own name', () => {
    const projects = projectsOf({
      across: pullRequest({ number: 1, head: 'project/paper-kite/cart', base: 'project/quiet-otter/main' }),
    })
    assert.deepEqual(projects, { across: 'quiet-otter' })
  })

  test('a branch reused in two projects belongs to the newest that took it', () => {
    const projects = projectsOf({
      older: pullRequest({ number: 1, head: 'feature/cart', base: 'project/paper-kite/main', createdAt: '2026-01-02T09:00:00Z' }),
      newer: pullRequest({ number: 2, head: 'feature/cart', base: 'project/quiet-otter/main', createdAt: '2026-02-02T09:00:00Z' }),
      // Opened from it later still, into a long-lived branch: no project, so the one before decides.
      latest: pullRequest({ number: 3, head: 'feature/cart', base: 'develop', createdAt: '2026-03-02T09:00:00Z' }),
      stacked: pullRequest({ number: 4, head: 'feature/cart-total', base: 'feature/cart', createdAt: '2026-03-03T09:00:00Z' }),
    })
    assert.equal(projects.stacked, 'quiet-otter')
    assert.equal(projects.latest, null)
  })

  test('a cycle of branches gives none, and ends', () => {
    const projects = projectsOf({
      one: pullRequest({ number: 1, head: 'feature/a', base: 'feature/b' }),
      two: pullRequest({ number: 2, head: 'feature/b', base: 'feature/a' }),
    })
    assert.deepEqual(projects, { one: null, two: null })
  })
})

describe('isProjectMerge', () => {
  test('the project branch into a long-lived branch', () => {
    assert.equal(isProjectMerge({ head: 'project/paper-kite/main', base: 'develop' }), true)
    assert.equal(isProjectMerge({ head: 'project/paper-kite/main', base: 'main' }), true)
  })

  test('not into a feature branch, another project, nor another branch of the project', () => {
    assert.equal(isProjectMerge({ head: 'project/paper-kite/main', base: 'feature/cart' }), false)
    assert.equal(isProjectMerge({ head: 'project/paper-kite/main', base: 'project/quiet-otter/main' }), false)
    assert.equal(isProjectMerge({ head: 'project/paper-kite/main-v2', base: 'develop' }), false)
    assert.equal(isProjectMerge({ head: 'project/paper-kite/cart', base: 'develop' }), false)
  })
})
