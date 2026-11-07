// Tests of the people of the stats (site/model/people.js): who left the team, since when each one is around. Every
// person here is made up.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { displayName, firstShown, isCurrent, isFormer, mePeople, seniority } from '../../site/model/people.js'
import { minutes, record, useStats } from './stats.mjs'

describe('displayName', () => {
  test('the name of the stats, else the login', () => {
    useStats()
    assert.equal(displayName('ada'), 'Ada Lune')
    assert.equal(displayName('zoe'), 'zoe')
  })
})

describe('isFormer', () => {
  test('a person without any activity for 30 days has left the team', () => {
    useStats({
      pullRequests: [
        record('ada', '2026-06-01T09:00:00Z'),
        record('ben', '2026-05-10T09:00:00Z'),
        // A review counts as activity: cleo reviewed lately.
        record('ben', '2026-04-01T09:00:00Z', { interventions: [['cleo', minutes('2026-06-10T09:00:00Z'), 'APPROVED', 0]] }),
      ],
    })
    assert.equal(isFormer('ada'), false)
    assert.equal(isFormer('ben'), true)
    assert.equal(isCurrent('cleo'), true)
    // Someone the stats do not know has not left.
    assert.equal(isFormer('zoe'), false)
  })

  test('the « Mes PR » page offers the people still in the team, by name', () => {
    useStats({
      people: { ada: 'Ada Lune', ben: 'Ben Kerr', cleo: 'Aaron Cleo' },
      pullRequests: [record('ada', '2026-06-01T09:00:00Z'), record('ben', '2026-01-01T09:00:00Z'), record('cleo', '2026-06-02T09:00:00Z')],
    })
    assert.deepEqual(mePeople(), ['cleo', 'ada'])
  })
})

describe('seniority', () => {
  test('from the first pull request in the organization, even before the data', () => {
    useStats({
      pullRequests: [record('ada', '2026-01-05T09:00:00Z')],
      firstPullRequests: { ada: minutes('2025-03-03T09:00:00Z') },
    })
    assert.deepEqual(
      { ...firstShown('ada'), at: new Date(firstShown('ada').at).toISOString() },
      { at: '2025-03-03T09:00:00.000Z', fromPullRequest: true, known: true },
    )
    assert.equal(seniority('ada').label, '1 an et 3 mois')
  })

  test('a first activity in the first days of the data may be older: more than its whole years', () => {
    useStats({ pullRequests: [record('ada', '2023-06-20T09:00:00Z')] })
    assert.equal(firstShown('ada').known, false)
    assert.equal(seniority('ada').label, 'plus de 3 ans')
  })

  test('months under a year, nothing for someone unknown', () => {
    useStats({ pullRequests: [record('ada', '2026-01-10T09:00:00Z')] })
    assert.equal(seniority('ada').label, '5 mois')
    assert.equal(seniority('zoe'), null)
  })
})
