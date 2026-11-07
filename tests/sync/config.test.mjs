// Tests of the configuration read from the environment (scripts/sync/config.mjs). Every repository, person and figure here is made up.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import './environment.mjs'
import { parseSquads, requiredApprovals } from '../../scripts/sync/config.mjs'

describe('requiredApprovals', () => {
  test('1 by default, else the number given', () => {
    assert.equal(requiredApprovals(), 1)
    assert.equal(requiredApprovals(' '), 1)
    assert.equal(requiredApprovals('2'), 2)
  })

  test('anything but a whole number of 1 or more is refused', () => {
    for (const value of ['0', '-1', '1.5', 'two']) {
      assert.throws(() => requiredApprovals(value), /REQUIRED_APPROVALS/)
    }
  })
})

describe('parseSquads', () => {
  test('none by default', () => {
    assert.deepEqual(parseSquads(), [])
    assert.deepEqual(parseSquads(' ; '), [])
  })

  test('the quotes around a value copied from .env are left out', () => {
    const expected = [{ name: 'Blue team', members: ['ada', 'grace'] }]
    assert.deepEqual(parseSquads('"Blue team:ada,grace"'), expected)
    assert.deepEqual(parseSquads(" 'Blue team:ada,grace' "), expected)
  })

  test('each team with its members, in order, a person allowed in several teams', () => {
    assert.deepEqual(parseSquads('Blue team: ada, grace ;Red team:linus,grace,linus'), [
      { name: 'Blue team', members: ['ada', 'grace'] },
      { name: 'Red team', members: ['linus', 'grace'] },
    ])
  })

  test('a star before a login marks the lead, who stays a member', () => {
    assert.deepEqual(parseSquads('Blue team:ada,*grace;Red team:linus'), [
      { name: 'Blue team', members: ['ada', 'grace'], lead: 'grace' },
      { name: 'Red team', members: ['linus'] },
    ])
  })

  test('a team without a name or members, named twice, or with two leads, is refused', () => {
    for (const value of ['ada,grace', ':ada', 'Blue team:', 'Blue team:ada;Blue team:grace', 'Blue team:*ada,*grace', 'Blue team:*']) {
      assert.throws(() => parseSquads(value), /SQUADS/)
    }
  })
})
