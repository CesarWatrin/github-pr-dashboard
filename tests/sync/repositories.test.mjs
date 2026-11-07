// Tests of the bots, and of the type and technologies of repositories (scripts/sync/people.mjs, repositories.mjs). Every repository, person and figure here is made up.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import './environment.mjs'
import { isBot } from '../../scripts/sync/people.mjs'
import { repositoryCategory, technologyShares } from '../../scripts/sync/repositories.mjs'

describe('bots and repositories', () => {
  test('bots: ghost and the accounts of BOT_USERS', () => {
    assert.equal(isBot('ghost'), true)
    assert.equal(isBot('robot'), true)
    assert.equal(isBot('alice'), false)
  })

  test('the type of a repository follows its main languages', () => {
    assert.equal(repositoryCategory('web', [['Vue', 100], ['TypeScript', 300]]), 'front')
    assert.equal(repositoryCategory('api', [['TypeScript', 300]]), 'back')
    assert.equal(repositoryCategory('app', [['Dart', 10], ['Swift', 5]]), 'mobile')
    assert.equal(repositoryCategory('infra', [['HCL', 10]]), 'other')
    assert.equal(repositoryCategory('empty', []), 'other')
  })

  test('REPO_CATEGORIES overrides the languages', () => {
    assert.equal(repositoryCategory('docs-site', [['Vue', 100]]), 'other')
  })

  test('technologies are grouped under their framework, marginal ones dropped', () => {
    assert.deepEqual(technologyShares([['PHP', 900], ['Blade', 80], ['Shell', 20]], ['Laravel']), [
      ['Laravel', 0.98],
      ['Shell', 0.02],
    ])
    assert.deepEqual(technologyShares([['Vue', 50], ['TypeScript', 940], ['CSS', 10]], ['Nuxt', 'Vue']), [['Nuxt', 1]])
  })
})
