// The key of the stats: derived from the password with Web Crypto, kept 30 days in this browser (never the password).

export const KEY_STORAGE_KEY = 'github-pr-dashboard:key'
// That this browser unlocked the dashboard once: kept for good, even once locked, unlike the key. A browser without it
// that opened the year in review goes back to it rather than to the lock screen (app.js).
export const UNLOCKED_STORAGE_KEY = 'github-pr-dashboard:unlocked'

const UNLOCK_DURATION_MS = 30 * 24 * 60 * 60_000

// Access: the published stats are encrypted with a key derived from the team password. Once the password is
// entered, the key is kept on the device for a day.

export const fromBase64 = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0))
const toBase64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))

export async function deriveKey(password, payload) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveKey',
  ])

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(payload.salt), iterations: payload.iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    true,
    ['decrypt'],
  )
}

// Null when the key does not open the file: a wrong password, or one changed since it was entered.
export async function decryptStats(payload, key) {
  let plain
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(payload.iv) }, key, fromBase64(payload.data))
  } catch {
    return null
  }

  return new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'))).json()
}

export async function storeKey(key) {
  const expiresAt = Date.now() + UNLOCK_DURATION_MS
  try {
    const raw = toBase64(await crypto.subtle.exportKey('raw', key))
    localStorage.setItem(KEY_STORAGE_KEY, JSON.stringify({ key: raw, expiresAt }))
    localStorage.setItem(UNLOCKED_STORAGE_KEY, '1')
  } catch {
    // Storage can be unavailable (private browsing): the page then stays unlocked until it is closed.
  }

  return expiresAt
}

export async function readStoredKey() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY_STORAGE_KEY))
    if (stored && stored.expiresAt > Date.now()) {
      const key = await crypto.subtle.importKey('raw', fromBase64(stored.key), 'AES-GCM', true, ['decrypt'])

      return { key, expiresAt: stored.expiresAt }
    }
  } catch {
    // A missing or unreadable entry only means that the password is asked again.
  }

  return null
}

// Whether this browser ever unlocked the dashboard: the mark, or a key kept, even expired (a browser unlocked before the
// mark existed has none).
export function hasUnlockedBefore() {
  try {
    return localStorage.getItem(UNLOCKED_STORAGE_KEY) !== null || localStorage.getItem(KEY_STORAGE_KEY) !== null
  } catch {
    return false
  }
}
