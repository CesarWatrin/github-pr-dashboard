// Tests of the address of the year in review (site/model/retro-address.js): the key of its link, whose story shows, and
// the address that tells it without the key. Every person and squad here is made up.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { readRetroAddress, retroAddress } from '../../site/model/retro-address.js'

describe('the address of the year in review', () => {
  test('the key of the link, and whose story: a person, a squad, the team, or the picker', () => {
    assert.deepEqual(readRetroAddress('#k=made-up-key&for=ada-l'), { key: 'made-up-key', who: { login: 'ada-l' } })
    assert.deepEqual(readRetroAddress('#squad=Blue%20team'), { key: null, who: { squad: 'Blue team' } })
    assert.deepEqual(readRetroAddress('#team'), { key: null, who: 'team' })
    assert.deepEqual(readRetroAddress(''), { key: null, who: null })
  })

  test('a story told without the key, and back to it', () => {
    for (const who of [{ login: 'ada-l' }, { squad: 'Blue team' }, 'team', null]) {
      const address = retroAddress(/** @type {import('../../site/model/retro-address.js').RetroWho} */ (who))
      assert.equal(address.includes('k='), false)
      assert.deepEqual(readRetroAddress(address).who, who)
    }
  })
})
