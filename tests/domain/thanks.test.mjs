// Tests of the thanks of the year in review of a team (site/domain/wrapped/thanks.js): one anecdote for each person, the
// figure they stand out on the most, varied across the team. Every person and figure here is made up.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { thanksOf } from '../../site/domain/wrapped/thanks.js'

// A made-up year of a person: nothing but what is given.
/** @type {(login: string, figures?: Partial<RetroPerson>) => RetroPerson} */
const person = (login, figures = {}) => ({
  login,
  code: 0,
  merged: 0,
  added: 0,
  deleted: 0,
  hotfixes: 0,
  months: [],
  busiestMonth: null,
  repos: [],
  reviewed: 0,
  comments: 0,
  projects: 0,
  delivered: 0,
  projectList: [],
  acs: 0,
  facts: { smallest: null, fastest: null, slowest: null, discussed: null, earliest: null, latest: null, fridays: 0 },
  days: 0,
  streak: 0,
  busiestWeekday: null,
  biggest: null,
  reviewedBy: null,
  reviewedMost: null,
  ...figures,
})

/** @type {(thanks: ReturnType<typeof thanksOf>) => string[]} */
const kinds = (thanks) => thanks.map((one) => `${one.login}:${one.kind}:${one.value}`)

describe('thanksOf', () => {
  test('each person, in their order, gets the figure they stand out on the most among the people thanked', () => {
    const people = [
      person('ada', { merged: 40, reviewed: 10, days: 30 }),
      person('ben', { merged: 10, reviewed: 90, days: 30 }),
      person('cy', { merged: 10, reviewed: 10, hotfixes: 3, days: 30 }),
    ]
    assert.deepEqual(kinds(thanksOf(people)), ['ada:merged:40', 'ben:reviewed:90', 'cy:hotfixes:3'])
  })

  test('the anecdote of a review partner names them', () => {
    const people = [person('ada', { reviewed: 5, reviewedMost: { login: 'ben', prs: 30 } }), person('ben', { reviewed: 5 })]
    assert.deepEqual(thanksOf(people)[0], { login: 'ada', kind: 'duo', value: 30, other: 'ben' })
  })

  test('a kind told already weighs less: the next person gets another anecdote when one stands out nearly as much', () => {
    // Merges are what Ben stands out on the most too, but Ada was told them first.
    const people = [
      person('ada', { merged: 40, reviewed: 10 }),
      person('ben', { merged: 38, reviewed: 12 }),
      person('cy', { merged: 10, reviewed: 10 }),
      person('dan', { merged: 10, reviewed: 10 }),
    ]
    assert.deepEqual(kinds(thanksOf(people)), ['ada:merged:40', 'ben:reviewed:12', 'cy:reviewed:10', 'dan:reviewed:10'])
  })

  test('a run of two days is no anecdote; with nothing to tell, a plain thank you', () => {
    const people = [person('ada', { streak: 2 }), person('ben', { streak: 5, days: 5 }), person('cy', { streak: 1, days: 10 })]
    assert.deepEqual(kinds(thanksOf(people)), ['ada:year:0', 'ben:streak:5', 'cy:days:10'])
  })

  test('nobody to thank, no anecdote', () => {
    assert.deepEqual(thanksOf([]), [])
  })
})
