// The full sync asks for a password of its own (FULL_SYNC_PASSWORD), apart from the dashboard's: shared by the page,
// which checks it and signs the request, and by the sync, which publishes what the page checks it against and checks
// the signature in the workflow run. Web Crypto only, as available in browsers and in Node.
//
// Anyone with the dashboard password can read the dispatch token from the stats and start a run without the page: the
// run itself checks the proof, the page only spares a run started with a wrong password.

const { subtle } = globalThis.crypto
const encoder = new TextEncoder()

// PBKDF2-SHA256 iterations deriving the full sync key from its password, as many as for the dashboard key.
export const FULL_SYNC_ITERATIONS = 600_000
// How long a proof is good for, in seconds. The run checks it when it starts, and runs go one at a time, up to 45
// minutes each: a full sync asked while another run is going waits for it. A proof that leaks (it travels as a workflow
// input) can only start another full sync within that time.
export const FULL_SYNC_PROOF_MAX_AGE = 2 * 60 * 60
// A proof dated this far in the future is still taken: the clock of the browser may run a little ahead of the runner's.
const CLOCK_SKEW = 60

const toHex = (bytes) => Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
const toBase64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))

function concat(...parts) {
  const bytes = new Uint8Array(parts.reduce((length, part) => length + part.length, 0))
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.length
  }

  return bytes
}

// Same length, same text, in a time that does not tell where they differ.
function sameText(a, b) {
  if (a.length !== b.length) {
    return false
  }
  let difference = 0
  for (let index = 0; index < a.length; index++) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }

  return difference === 0
}

// The salt only depends on the organization, so that the verifier stays the same from one sync to the next, and differs
// from the salt of the dashboard key.
export async function fullSyncSalt(org) {
  const digest = await subtle.digest('SHA-256', encoder.encode(`github-pr-dashboard:full-sync:${org}`))

  return new Uint8Array(digest).slice(0, 16)
}

// The key, 32 raw bytes: it signs the proofs, so it is never published, stored nor logged.
export async function deriveFullSyncKey(password, salt, iterations = FULL_SYNC_ITERATIONS) {
  const material = await subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])

  return new Uint8Array(await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, 256))
}

// What the page checks a password against, published in the encrypted stats: a hash of the key, not the key itself.
export async function fullSyncVerifier(key) {
  return toBase64(await subtle.digest('SHA-256', concat(encoder.encode('verify:'), key)))
}

async function signature(key, repository, at) {
  const hmacKey = await subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])

  return toHex(await subtle.sign('HMAC', hmacKey, encoder.encode(`full-sync:${repository}:${at}`)))
}

// The proof that whoever asks for a full sync of this repository knows the password: `at.signature`, at in seconds since
// the epoch.
export async function fullSyncProof(key, repository, at) {
  return `${at}.${await signature(key, repository, at)}`
}

// True only for a proof signed with this key, for this repository, neither from the future nor older than maxAge.
export async function checkFullSyncProof(proof, key, repository, now, maxAge = FULL_SYNC_PROOF_MAX_AGE) {
  const match = /^(0|[1-9]\d{0,11})\.([0-9a-f]{64})$/.exec(typeof proof === 'string' ? proof : '')
  if (!match) {
    return false
  }
  const at = Number(match[1])
  if (at > now + CLOCK_SKEW || at < now - maxAge) {
    return false
  }

  return sameText(await signature(key, repository, at), match[2])
}
