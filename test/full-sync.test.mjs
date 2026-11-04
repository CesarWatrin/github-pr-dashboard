// Tests of the password of the full sync, shared by the page and the sync. Every password and repository here is made
// up, and the keys are derived with few iterations to keep the tests fast.
import assert from 'node:assert/strict'
import { createHash, pbkdf2Sync } from 'node:crypto'
import { describe, test } from 'node:test'

import {
  FULL_SYNC_ITERATIONS,
  FULL_SYNC_PROOF_MAX_AGE,
  checkFullSyncProof,
  deriveFullSyncKey,
  fullSyncProof,
  fullSyncSalt,
  fullSyncVerifier,
} from '../site/full-sync.js'

const ITERATIONS = 1000
const REPOSITORY = 'example-owner/example-dashboard'
const NOW = 1_800_000_000

const salt = await fullSyncSalt('example-org')
const key = await deriveFullSyncKey('made-up full sync password', salt, ITERATIONS)

describe('fullSyncSalt', () => {
  test('the first 16 bytes of a hash of the organization, apart from the salt of the dashboard key', async () => {
    const expected = createHash('sha256').update('github-pr-dashboard:full-sync:example-org').digest().subarray(0, 16)
    const dashboard = createHash('sha256').update('github-pr-dashboard:example-org').digest().subarray(0, 16)
    assert.deepEqual(Buffer.from(salt), expected)
    assert.notDeepEqual(Buffer.from(salt), dashboard)
    assert.deepEqual(await fullSyncSalt('example-org'), salt)
    assert.notDeepEqual(await fullSyncSalt('other-org'), salt)
  })
})

describe('deriveFullSyncKey and fullSyncVerifier', () => {
  test('the same password gives the same key and verifier, another password neither', async () => {
    const again = await deriveFullSyncKey('made-up full sync password', salt, ITERATIONS)
    const other = await deriveFullSyncKey('another made-up password', salt, ITERATIONS)
    assert.equal(key.length, 32)
    assert.deepEqual(again, key)
    assert.notDeepEqual(other, key)
    assert.equal(await fullSyncVerifier(again), await fullSyncVerifier(key))
    assert.notEqual(await fullSyncVerifier(other), await fullSyncVerifier(key))
  })

  test('the key is PBKDF2-SHA256 of the password, 600 000 iterations by default', async () => {
    assert.equal(FULL_SYNC_ITERATIONS, 600_000)
    assert.deepEqual(Buffer.from(key), pbkdf2Sync('made-up full sync password', salt, ITERATIONS, 32, 'sha256'))
  })

  test('the verifier, published, is a hash of the key and not the key itself', async () => {
    const verifier = await fullSyncVerifier(key)
    const expected = createHash('sha256').update(Buffer.concat([Buffer.from('verify:'), key])).digest('base64')
    assert.equal(verifier, expected)
    assert.notEqual(verifier, Buffer.from(key).toString('base64'))
  })
})

describe('fullSyncProof and checkFullSyncProof', () => {
  test('a proof signed with the key, for the repository, just now, is good', async () => {
    const proof = await fullSyncProof(key, REPOSITORY, NOW)
    assert.match(proof, /^1800000000\.[0-9a-f]{64}$/)
    assert.equal(await checkFullSyncProof(proof, key, REPOSITORY, NOW), true)
  })

  test('a proof is good while a run waits for the ones before it, up to its maximum age', async () => {
    const proof = await fullSyncProof(key, REPOSITORY, NOW)
    assert.equal(FULL_SYNC_PROOF_MAX_AGE, 2 * 60 * 60)
    assert.equal(await checkFullSyncProof(proof, key, REPOSITORY, NOW + 45 * 60), true)
    assert.equal(await checkFullSyncProof(proof, key, REPOSITORY, NOW + FULL_SYNC_PROOF_MAX_AGE), true)
    assert.equal(await checkFullSyncProof(proof, key, REPOSITORY, NOW + 10, 5), false)
  })

  test('a proof too old is refused', async () => {
    const proof = await fullSyncProof(key, REPOSITORY, NOW - FULL_SYNC_PROOF_MAX_AGE - 1)
    assert.equal(await checkFullSyncProof(proof, key, REPOSITORY, NOW), false)
  })

  test('a proof from the future is refused, but for five minutes of clock skew', async () => {
    assert.equal(await checkFullSyncProof(await fullSyncProof(key, REPOSITORY, NOW + 300), key, REPOSITORY, NOW), true)
    assert.equal(await checkFullSyncProof(await fullSyncProof(key, REPOSITORY, NOW + 301), key, REPOSITORY, NOW), false)
    assert.equal(await checkFullSyncProof(await fullSyncProof(key, REPOSITORY, NOW + 3600), key, REPOSITORY, NOW), false)
  })

  test('a proof signed with another password is refused', async () => {
    const other = await deriveFullSyncKey('another made-up password', salt, ITERATIONS)
    const proof = await fullSyncProof(other, REPOSITORY, NOW)
    assert.equal(await checkFullSyncProof(proof, key, REPOSITORY, NOW), false)
  })

  test('a proof signed for another repository is refused', async () => {
    const proof = await fullSyncProof(key, 'example-owner/another-dashboard', NOW)
    assert.equal(await checkFullSyncProof(proof, key, REPOSITORY, NOW), false)
  })

  test('a signature changed, moved to another time, or cut short is refused', async () => {
    const proof = await fullSyncProof(key, REPOSITORY, NOW)
    const [at, signature] = proof.split('.')
    const flipped = `${at}.${signature.slice(0, -1)}${signature.at(-1) === '0' ? '1' : '0'}`
    assert.equal(await checkFullSyncProof(flipped, key, REPOSITORY, NOW), false)
    assert.equal(await checkFullSyncProof(`${NOW - 1}.${signature}`, key, REPOSITORY, NOW), false)
    assert.equal(await checkFullSyncProof(`${at}.${signature.slice(0, 32)}`, key, REPOSITORY, NOW), false)
  })

  test('anything but a proof is refused', async () => {
    const proof = await fullSyncProof(key, REPOSITORY, NOW)
    for (const value of [undefined, null, '', 'true', proof.toUpperCase(), ` ${proof}`, `0${proof}`, proof.replace('.', ':')]) {
      assert.equal(await checkFullSyncProof(value, key, REPOSITORY, NOW), false)
    }
  })
})
