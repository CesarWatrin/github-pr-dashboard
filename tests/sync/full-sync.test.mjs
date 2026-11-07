// Tests of the full sync and its password, on the side of the sync (scripts/sync/full-sync.mjs). Every repository, person and figure here is made up.

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, test } from 'node:test'

import './environment.mjs'
import { chooseFullSync, fullSyncSettings, publishedSyncTrigger } from '../../scripts/sync/full-sync.mjs'
import { checkFullSyncProof, deriveFullSyncKey, fullSyncProof, fullSyncVerifier } from '../../site/domain/full-sync.js'

describe('full sync password', async () => {
  // Few iterations, to keep the tests fast.
  const ITERATIONS = 1000
  const REPOSITORY = 'example-owner/example-dashboard'
  const NOW = 1_800_000_000
  const settings = await fullSyncSettings('made-up full sync password', 'example-org', ITERATIONS)
  const { key } = settings
  const ask = (fields) =>
    chooseFullSync({ commandLine: false, requested: true, key, proof: undefined, repository: REPOSITORY, now: NOW, ...fields })

  test('without a password, nothing is published nor asked for', async () => {
    assert.equal(await fullSyncSettings(undefined, 'example-org', ITERATIONS), null)
    assert.equal(await fullSyncSettings('', 'example-org', ITERATIONS), null)
    assert.deepEqual(await ask({ key: undefined }), { full: true, refused: false })
    assert.deepEqual(await ask({ key: undefined, requested: false }), { full: false, refused: false })
  })

  test('the stats carry the salt, the iterations and the verifier, never the key', async () => {
    const { published } = settings
    assert.deepEqual(Object.keys(published).sort(), ['iterations', 'salt', 'verifier'])
    assert.equal(published.iterations, ITERATIONS)
    const salt = createHash('sha256').update('github-pr-dashboard:full-sync:example-org').digest().subarray(0, 16)
    assert.equal(published.salt, salt.toString('base64'))
    // What the page derives from the password and the published salt matches the verifier.
    const derived = await deriveFullSyncKey('made-up full sync password', salt, published.iterations)
    assert.equal(await fullSyncVerifier(derived), published.verifier)
    assert.ok(!JSON.stringify(published).includes(Buffer.from(key).toString('base64')))
  })

  test('the trigger carries the verifier when there is one, and stays as it was without', () => {
    const trigger = { repository: REPOSITORY, workflow: 'deploy.yml', ref: 'main', token: 'made-up-token' }
    assert.deepEqual(publishedSyncTrigger(trigger, settings.published), { ...trigger, fullSync: settings.published })
    assert.deepEqual(publishedSyncTrigger(trigger, null), trigger)
    assert.deepEqual(publishedSyncTrigger(trigger, undefined), trigger)
    assert.equal(publishedSyncTrigger(null, settings.published), null)
    assert.equal(publishedSyncTrigger({ ...trigger, repository: undefined }, settings.published), null)
  })

  test('the proof of the page, checked by the run, lets the full sync through', async () => {
    const proof = await fullSyncProof(key, REPOSITORY, NOW - 30 * 60)
    assert.equal(await checkFullSyncProof(proof, key, REPOSITORY, NOW), true)
    assert.deepEqual(await ask({ proof }), { full: true, refused: false })
  })

  test('a full sync asked without a valid proof is refused: an incremental one instead', async () => {
    const other = await deriveFullSyncKey('another made-up password', new Uint8Array(16), ITERATIONS)
    for (const proof of [
      undefined,
      '',
      await fullSyncProof(other, REPOSITORY, NOW),
      await fullSyncProof(key, 'example-owner/another-dashboard', NOW),
      await fullSyncProof(key, REPOSITORY, NOW - 3 * 60 * 60),
      await fullSyncProof(key, REPOSITORY, NOW + 10 * 60),
    ]) {
      assert.deepEqual(await ask({ proof }), { full: false, refused: true })
    }
    // Without the repository of the dashboard, no proof can be checked.
    const proof = await fullSyncProof(key, REPOSITORY, NOW)
    assert.deepEqual(await ask({ proof, repository: undefined }), { full: false, refused: true })
  })

  test('the command line needs no proof, nor does a sync that does not ask for a full one', async () => {
    assert.deepEqual(await ask({ commandLine: true, requested: false }), { full: true, refused: false })
    assert.deepEqual(await ask({ commandLine: true }), { full: true, refused: false })
    assert.deepEqual(await ask({ requested: false }), { full: false, refused: false })
  })
})
