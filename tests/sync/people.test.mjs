// Tests of the first pull request of each person (scripts/sync/people.mjs). Every repository, person and figure here is made up.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import './environment.mjs'
import { peopleToLookUp } from '../../scripts/sync/people.mjs'

describe('first pull requests', () => {
  const record = (fields) => ({ bot: false, mergedBy: null, interventions: [], ...fields })

  test('the people of the records are looked up once, bots aside, whatever their part', () => {
    const records = [
      record({ author: 'alice', interventions: [['bob', 1, 'APPROVED', 0]], mergedBy: 'carol' }),
      // A Dependabot update: its author is a bot, the reviewer is not.
      record({ author: 'dependabot', bot: true, interventions: [['dan', 2, 'COMMENTED', 1]] }),
      record({ author: 'alice' }),
    ]
    assert.deepEqual(peopleToLookUp(records, {}), ['alice', 'bob', 'carol', 'dan'])
    // Known already, even as someone who never opened a pull request: not looked up again.
    assert.deepEqual(peopleToLookUp(records, { alice: '2021-04-02T09:00:00Z', dan: null }), ['bob', 'carol'])
  })
})
