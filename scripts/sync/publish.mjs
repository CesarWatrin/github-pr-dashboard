// What the sync publishes and keeps: the snapshot, and the stats, gzipped then encrypted with the key of the
// dashboard password, with today's counters and the feed of the week.

import { createCipheriv, createDecipheriv, createHash, pbkdf2Sync, randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'

import { DAY_MS, parisDay } from '../../site/domain/time.js'
import { ORG, SNAPSHOT_PATH } from './config.mjs'
import { isBot } from './people.mjs'

// 4: the checks of each pull request and the Actions runs. The monthly history (monthly) came later as an optional
// field: an older snapshot just has none yet, and never needs to be read again for it. So did what the snapshot covers
// (pullRequestsSince, runsSince): without them, it covers the year before its sync, as it then did.
export const SNAPSHOT_VERSION = 4

const EVENTS_LIMIT = 50
const EVENTS_MAX_AGE_DAYS = 7

// PBKDF2-SHA256 iterations deriving the encryption key from the password, also read from the file by the page.
const KEY_ITERATIONS = 600_000

/** @returns {Promise<Snapshot | null>} */
export async function readSnapshot() {
  try {
    const snapshot = /** @type {Snapshot} */ (JSON.parse(await readFile(SNAPSHOT_PATH, 'utf8')))

    return snapshot.org === ORG && snapshot.version === SNAPSHOT_VERSION ? snapshot : null
  } catch {
    return null
  }
}

// The salt only depends on the organization so that the key stays the same from one sync to the next: the page
// derives it once from the password and keeps it.
const encryptionSalt = createHash('sha256').update(`github-pr-dashboard:${ORG}`).digest().subarray(0, 16)
// config.mjs refuses to run without a password.
const encryptionKey = pbkdf2Sync(
  /** @type {string} */ (process.env.DASHBOARD_PASSWORD),
  encryptionSalt,
  KEY_ITERATIONS,
  32,
  'sha256',
)

// Gzipped then encrypted with AES-256-GCM, the authentication tag appended as the Web Crypto API expects it.
/**
 * @param {Stats} data
 * @returns {EncryptedStats}
 */
export function encrypt(data) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv)
  const encrypted = Buffer.concat([cipher.update(gzipSync(JSON.stringify(data))), cipher.final(), cipher.getAuthTag()])

  return {
    iterations: KEY_ITERATIONS,
    salt: encryptionSalt.toString('base64'),
    iv: iv.toString('base64'),
    data: encrypted.toString('base64'),
  }
}

// The year in review, gzipped then encrypted the same way, with its own key (RETRO_KEY): the dashboard password never
// opens it, and its key never opens the stats.
/**
 * @param {Retro} retro
 * @param {Buffer} key
 * @returns {EncryptedRetro}
 */
export function encryptRetro(retro, key) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(gzipSync(JSON.stringify(retro))), cipher.final(), cipher.getAuthTag()])

  return { iv: iv.toString('base64'), data: encrypted.toString('base64') }
}

/**
 * @param {Pick<EncryptedStats, 'iv' | 'data'>} payload
 * @returns {Stats}
 */
export function decrypt({ iv, data }) {
  const blob = Buffer.from(data, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(blob.subarray(-16))

  return JSON.parse(gunzipSync(Buffer.concat([decipher.update(blob.subarray(0, -16)), decipher.final()])).toString())
}

/**
 * @param {string} path
 * @param {unknown} data
 */
export async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(data))
}

/**
 * @param {SnapshotPullRequest[]} pullRequests
 * @param {Date} now
 * @returns {Stats['today']}
 */
export function computeToday(pullRequests, now) {
  const today = parisDay(now.toISOString())
  const totals = { date: today, opened: 0, merged: 0, reviews: 0 }
  for (const pr of pullRequests) {
    if (isBot(pr.author)) {
      continue
    }
    if (parisDay(pr.createdAt) === today) {
      totals.opened++
    }
    if (pr.mergedAt && parisDay(pr.mergedAt) === today) {
      totals.merged++
    }
    for (const review of pr.reviews) {
      const counted = review.submittedAt && review.author !== pr.author && !isBot(review.author)
      if (counted && parisDay(/** @type {string} */ (review.submittedAt)) === today) {
        totals.reviews++
      }
    }
  }

  return totals
}

/**
 * @param {SnapshotPullRequest[]} pullRequests
 * @param {Date} now
 * @returns {FeedEvent[]}
 */
export function computeEvents(pullRequests, now) {
  const sinceIso = new Date(now.getTime() - EVENTS_MAX_AGE_DAYS * DAY_MS).toISOString()
  /** @type {FeedEvent[]} */
  const events = []
  /** @type {(type: FeedEventType, at: string | null, actor: string, pr: SnapshotPullRequest) => void} */
  const push = (type, at, actor, pr) => {
    if (at && at >= sinceIso && !isBot(actor)) {
      events.push({ type, at, actor, author: pr.author, repo: pr.repo, number: pr.number })
    }
  }

  for (const pr of pullRequests) {
    if (isBot(pr.author)) {
      continue
    }
    push('opened', pr.createdAt, pr.author, pr)
    push('merged', pr.mergedAt, pr.mergedBy ?? pr.author, pr)
    for (const review of pr.reviews) {
      if (review.author === pr.author) {
        continue
      }
      if (review.state === 'APPROVED') {
        push('approved', review.submittedAt, review.author, pr)
      } else if (review.state === 'CHANGES_REQUESTED') {
        push('changes_requested', review.submittedAt, review.author, pr)
      } else if (review.state === 'COMMENTED') {
        push('commented', review.submittedAt, review.author, pr)
      }
    }
    for (const comment of pr.comments) {
      if (comment.author !== pr.author) {
        push('commented', comment.createdAt, comment.author, pr)
      }
    }
  }

  return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, EVENTS_LIMIT)
}
