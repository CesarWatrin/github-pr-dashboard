// The password of the managers (MANAGER_PASSWORD), apart from the dashboard's: it opens the annual review. Shared by
// the sync, which publishes what the page checks it against, and by the page. Derived as the full sync key is
// (site/domain/full-sync.js), with a salt of its own: the stats only carry a hash of the key.
//
// It hides a page, not data: the review is worked out in the browser from the records that anyone with the dashboard
// password can read.

import { deriveFullSyncKey, FULL_SYNC_ITERATIONS, fullSyncVerifier } from './full-sync.js'

const { subtle } = globalThis.crypto

export const MANAGER_ITERATIONS = FULL_SYNC_ITERATIONS

// The salt only depends on the organization, so that the verifier stays the same from one sync to the next, and differs
// from those of the dashboard key and the full sync key.
/** @param {string} org */
export async function managerSalt(org) {
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(`github-pr-dashboard:manager:${org}`))

  return new Uint8Array(digest).slice(0, 16)
}

// What the stats carry: the salt, the iterations and the verifier. Null without a password: no review.
/**
 * @param {string | undefined} password
 * @param {string} org
 * @param {number} [iterations]
 * @returns {Promise<FullSyncCheck | null>}
 */
export async function managerCheck(password, org, iterations = MANAGER_ITERATIONS) {
  if (!password) {
    return null
  }
  const salt = await managerSalt(org)
  const verifier = await fullSyncVerifier(await deriveFullSyncKey(password, salt, iterations))

  return { salt: btoa(String.fromCharCode(...salt)), iterations, verifier }
}

// Whether a password is the managers' one.
/**
 * @param {string} password
 * @param {FullSyncCheck} check
 */
export async function isManagerPassword(password, check) {
  const salt = Uint8Array.from(atob(check.salt), (char) => char.charCodeAt(0))

  return (await fullSyncVerifier(await deriveFullSyncKey(password, salt, check.iterations))) === check.verifier
}
