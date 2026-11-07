// Tests of the reading of pull requests (scripts/sync/pull-requests.mjs). Every repository, person and figure here is made up.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import './environment.mjs'
import { requestedPeople } from '../../scripts/sync/pull-requests.mjs'

describe('requestedPeople', () => {
  test('the people asked to review, code owners or not; teams, apps and unreadable reviewers aside', () => {
    const requests = [
      { asCodeOwner: false, requestedReviewer: { __typename: 'User', login: 'bob' } },
      { asCodeOwner: true, requestedReviewer: { __typename: 'User', login: 'carol' } },
      { asCodeOwner: true, requestedReviewer: { __typename: 'Team', slug: 'backend' } },
      { asCodeOwner: false, requestedReviewer: { __typename: 'Bot' } },
      { asCodeOwner: true, requestedReviewer: null },
    ]
    assert.deepEqual(requestedPeople(requests), ['bob', 'carol'])
  })

  test('none asked, or an answer without the requests', () => {
    assert.deepEqual(requestedPeople([]), [])
    assert.deepEqual(requestedPeople(undefined), [])
  })
})
