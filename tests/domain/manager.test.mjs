// Tests of the managers' password (site/domain/manager.js), which opens the annual review. Every organization and
// password here is made up.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, test } from 'node:test'

import { fullSyncSalt } from '../../site/domain/full-sync.js'
import { isManagerPassword, managerCheck, managerSalt } from '../../site/domain/manager.js'

// Few iterations, to keep the tests fast.
const ITERATIONS = 1000

describe('the managers’ password', () => {
  test('without a password, nothing is published', async () => {
    assert.equal(await managerCheck(undefined, 'example-org', ITERATIONS), null)
    assert.equal(await managerCheck('', 'example-org', ITERATIONS), null)
  })

  test('the stats carry the salt, the iterations and the verifier, never the password', async () => {
    const check = await managerCheck('made-up manager password', 'example-org', ITERATIONS)
    assert.deepEqual(Object.keys(check).sort(), ['iterations', 'salt', 'verifier'])
    const salt = createHash('sha256').update('github-pr-dashboard:manager:example-org').digest().subarray(0, 16)
    assert.equal(check.salt, salt.toString('base64'))
    assert.ok(!JSON.stringify(check).includes('made-up manager password'))
  })

  test('its salt differs from the full sync one', async () => {
    assert.notDeepEqual(await managerSalt('example-org'), await fullSyncSalt('example-org'))
  })

  test('only the right password opens the review', async () => {
    const check = await managerCheck('made-up manager password', 'example-org', ITERATIONS)
    assert.equal(await isManagerPassword('made-up manager password', check), true)
    assert.equal(await isManagerPassword('another made-up password', check), false)
    // The same password for another organization makes another verifier.
    assert.notEqual((await managerCheck('made-up manager password', 'other-org', ITERATIONS)).verifier, check.verifier)
  })
})
