// Where the year in review (retro.html) reads its data, and its key. Published apart from the stats
// (data/retro.enc.json), encrypted with a key of its own that its link carries after the #, which no browser sends to any
// server. Once it opened the year in review, the key stays 30 days in this browser, so that the address can do without.

import { decryptStats, fromBase64 } from './stats-key.js'

export const RETRO_URL = 'data/retro.enc.json'
export const RETRO_KEY_STORAGE_KEY = 'github-pr-dashboard:retro-key'
const KEEP_MS = 30 * 24 * 60 * 60_000

// The key of a link: 32 bytes in base64url (43 characters); null for anything else.
/**
 * @param {string | null} text
 * @returns {Promise<CryptoKey | null>}
 */
export async function importRetroKey(text) {
  if (!text || !/^[\w-]{43}$/.test(text)) {
    return null
  }
  try {
    const bytes = fromBase64(`${text.replace(/-/g, '+').replace(/_/g, '/')}=`)

    return bytes.length === 32 ? await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['decrypt']) : null
  } catch {
    return null
  }
}

// Kept, or kept again for 30 days more, once it opened the year in review.
/** @param {string} text */
export function storeRetroKey(text) {
  try {
    localStorage.setItem(RETRO_KEY_STORAGE_KEY, JSON.stringify({ key: text, expiresAt: Date.now() + KEEP_MS }))
  } catch {
    // Storage can be unavailable (private browsing): the link is needed again next time.
  }
}

/** @returns {string | null} */
export function readRetroKey() {
  try {
    const stored = JSON.parse(localStorage.getItem(RETRO_KEY_STORAGE_KEY) ?? 'null')

    return stored && stored.expiresAt > Date.now() && typeof stored.key === 'string' ? stored.key : null
  } catch {
    return null
  }
}

export function forgetRetroKey() {
  try {
    localStorage.removeItem(RETRO_KEY_STORAGE_KEY)
  } catch {
    // Nothing was kept.
  }
}

/**
 * The year in review, opened with a key; else why not: none published yet (missing), a key that does not open it, changed
 * since say (wrong), or nothing reachable (unavailable).
 * @param {CryptoKey} key
 * @returns {Promise<{ retro: Retro } | { error: 'missing' | 'wrong' | 'unavailable' }>}
 */
export async function loadRetro(key) {
  try {
    const response = await fetch(`${RETRO_URL}?t=${Date.now()}`, { cache: 'no-store' })
    if (response.status === 404) {
      return { error: 'missing' }
    }
    if (!response.ok) {
      return { error: 'unavailable' }
    }
    const retro = await decryptStats(await response.json(), key)

    return retro ? { retro } : { error: 'wrong' }
  } catch {
    return { error: 'unavailable' }
  }
}
