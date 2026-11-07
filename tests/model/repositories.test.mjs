// Tests of the type of a person's work and of their technologies (site/model/repositories.js). Every repository here is
// made up.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { stackOf, stackType, topTechnologies } from '../../site/model/repositories.js'
import { useStats } from './stats.mjs'

describe('stackType', () => {
  test('full-stack with at least 30 % of back end and as much of client, web or mobile', () => {
    assert.deepEqual(stackType({ front: 6, back: 4, mobile: 0 }), { key: 'full-stack', label: 'full-stack' })
    assert.deepEqual(stackType({ front: 0, back: 3, mobile: 3 }), { key: 'full-stack', label: 'full-stack' })
  })

  test('else the type of most of their pull requests', () => {
    assert.deepEqual(stackType({ front: 8, back: 2, mobile: 0 }), { key: 'front', label: 'front' })
    assert.deepEqual(stackType({ front: 0, back: 1, mobile: 5 }), { key: 'mobile', label: 'mobile' })
    assert.equal(stackType({ front: 0, back: 0, mobile: 0 }), null)
  })
})

describe('stackOf', () => {
  test('counts the pull requests per type and weighs the technologies of each repository, others left out', () => {
    useStats({
      repos: {
        shop: { category: 'front', technologies: [['Vue', 0.75], ['TypeScript', 0.25]] },
        api: { category: 'back', technologies: [['Laravel', 1]] },
        infra: { category: 'other', technologies: [['HCL', 1]] },
      },
    })
    const stack = stackOf([['shop', 4], ['api', 2], ['infra', 9]])
    assert.deepEqual(stack.counts, { front: 4, back: 2, mobile: 0 })
    assert.deepEqual(stack.technologies, [['Vue', 3], ['Laravel', 2], ['TypeScript', 1]])
  })
})

describe('topTechnologies', () => {
  test('the three main ones over 5 % of the stack, with their share', () => {
    assert.deepEqual(topTechnologies([['Vue', 6], ['Laravel', 3], ['Go', 0.8], ['Shell', 0.2]]), [
      ['Vue', 0.6],
      ['Laravel', 0.3],
      ['Go', 0.08],
    ])
    assert.deepEqual(topTechnologies([['Vue', 99], ['Shell', 1]]), [['Vue', 0.99]])
  })
})
