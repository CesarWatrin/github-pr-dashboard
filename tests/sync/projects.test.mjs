// Tests of the project of each pull request (scripts/sync/projects.mjs): named branches, stacked pull requests, the
// merge of a project branch, branches that only look like a project's, and the stages of a project. Every repository,
// branch and project here is made up.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import './environment.mjs'
import { isProjectMerge, projectIndex, projectNames, projectOf, projectOfBranch, projectStageOf } from '../../scripts/sync/projects.mjs'
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
  test('the project branch, or a variant of it, into a long-lived branch', () => {
    assert.equal(isProjectMerge({ head: 'project/paper-kite/main', base: 'develop' }), true)
    assert.equal(isProjectMerge({ head: 'project/paper-kite/main', base: 'main' }), true)
    assert.equal(isProjectMerge({ head: 'project/paper-kite/main-1.1', base: 'develop' }), true)
    assert.equal(isProjectMerge({ head: 'project/paper-kite/main-pilot', base: 'develop' }), true)
    assert.equal(isProjectMerge({ head: 'project/paper-kite/main-v2', base: 'develop' }), true)
  })

  test('not into a feature branch, another project, nor another branch of the project', () => {
    assert.equal(isProjectMerge({ head: 'project/paper-kite/main', base: 'feature/cart' }), false)
    assert.equal(isProjectMerge({ head: 'project/paper-kite/main', base: 'project/quiet-otter/main' }), false)
    assert.equal(isProjectMerge({ head: 'project/paper-kite/maintenance', base: 'develop' }), false)
    assert.equal(isProjectMerge({ head: 'project/paper-kite/cart', base: 'develop' }), false)
  })
})

describe('projectNames', () => {
  test('a name read as a stage of a project branch of its own name', () => {
    const names = projectNames(['paper-kite', 'paper-kite-2', 'paper-kite-2-1', 'paper-kite-2.2', 'paper-kite-step-3'])
    assert.deepEqual(Object.fromEntries(names), {
      'paper-kite': { project: 'paper-kite', stage: null },
      'paper-kite-2': { project: 'paper-kite', stage: '2' },
      'paper-kite-2-1': { project: 'paper-kite', stage: '2.1' },
      'paper-kite-2.2': { project: 'paper-kite', stage: '2.2' },
      'paper-kite-step-3': { project: 'paper-kite', stage: '3' },
    })
  })

  test('the stages of a name no branch carries, once there are two of them', () => {
    assert.deepEqual(Object.fromEntries(projectNames(['quiet-otter-step-1', 'quiet-otter-step-2', 'lone-heron-2'])), {
      'quiet-otter-step-1': { project: 'quiet-otter', stage: '1' },
      'quiet-otter-step-2': { project: 'quiet-otter', stage: '2' },
      'lone-heron-2': { project: 'lone-heron-2', stage: null },
    })
  })

  test('a year, a version or a number with letters is no stage', () => {
    const names = projectNames(['paper-kite', 'paper-kite-2026', 'paper-kite-v2', 'paper-kite-2b', 'paper-kite-123'])
    assert.deepEqual(
      [...names.values()].map(({ project }) => project),
      ['paper-kite', 'paper-kite-2026', 'paper-kite-v2', 'paper-kite-2b', 'paper-kite-123'],
    )
  })
})

describe('projectStageOf', () => {
  // The project and stage of each of these pull requests, resolved against all of them.
  /** @param {Record<string, ReturnType<typeof pullRequest>>} pullRequests */
  function stagesOf(pullRequests) {
    const index = projectIndex(Object.values(pullRequests))

    return Object.fromEntries(Object.entries(pullRequests).map(([name, pr]) => [name, projectStageOf(pr, index)]))
  }

  test('a stage on a branch of its own name, its merge, and the main branch of the project', () => {
    const stages = stagesOf({
      main: pullRequest({ number: 1, head: 'feature/cart', base: 'project/paper-kite/main' }),
      feature: pullRequest({ number: 2, head: 'feature/cart-total', base: 'project/paper-kite-2-1/main' }),
      merge: pullRequest({ number: 3, head: 'project/paper-kite-2-1/main', base: 'develop' }),
    })
    assert.deepEqual(stages, {
      main: { project: 'paper-kite', stage: null },
      feature: { project: 'paper-kite', stage: '2.1' },
      merge: { project: 'paper-kite', stage: '2.1' },
    })
  })

  test('a variant of the main branch that comes back into a long-lived branch is a stage, named after it', () => {
    const stages = stagesOf({
      numbered: pullRequest({ number: 1, head: 'feature/cart', base: 'project/paper-kite/main-1.1' }),
      numberedMerge: pullRequest({ number: 2, head: 'project/paper-kite/main-1.1', base: 'develop' }),
      word: pullRequest({ number: 3, head: 'feature/menu', base: 'project/paper-kite/main-pilot' }),
      wordMerge: pullRequest({ number: 4, head: 'project/paper-kite/main-pilot', base: 'develop' }),
      // Brings another branch in: the main branch of the project, not a stage.
      mergeMerge: pullRequest({ number: 5, head: 'project/paper-kite/main-merge-develop', base: 'develop' }),
    })
    assert.deepEqual(Object.values(stages).map(({ stage }) => stage), ['1.1', '1.1', 'pilot', 'pilot', null])
  })

  test('a branch that never comes back on its own is of the stage its pull request lands in', () => {
    const stages = stagesOf({
      stage: pullRequest({ number: 1, head: 'project/paper-kite/main-3.1', base: 'develop' }),
      bridge: pullRequest({ number: 2, head: 'project/paper-kite/main-3.1-merge-2.4', base: 'project/paper-kite/main-3.1' }),
      onBridge: pullRequest({ number: 3, head: 'feature/cart', base: 'project/paper-kite/main-3.1-merge-2.4' }),
      stacked: pullRequest({ number: 4, head: 'feature/cart-total', base: 'feature/cart' }),
      // A variant that went nowhere: of the project only.
      nowhere: pullRequest({ number: 5, head: 'feature/menu', base: 'project/paper-kite/main-tmp' }),
    })
    assert.deepEqual(
      Object.values(stages).map(({ stage }) => stage),
      ['3.1', '3.1', '3.1', '3.1', null],
    )
  })

  test('a branch named after a stage, merged straight into a long-lived branch, is of that stage', () => {
    const stages = stagesOf({
      main: pullRequest({ number: 1, head: 'project/paper-kite/main', base: 'develop' }),
      fix: pullRequest({ number: 2, head: 'project/paper-kite-3/fix-label', base: 'develop' }),
    })
    assert.deepEqual(stages.fix, { project: 'paper-kite', stage: '3' })
  })

  test('a pull request of no project has no stage either', () => {
    const stages = stagesOf({ plain: pullRequest({ number: 1, head: 'feature/menu', base: 'develop' }) })
    assert.equal(stages.plain, null)
  })
})
