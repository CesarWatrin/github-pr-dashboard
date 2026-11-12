// The configuration of the sync, read from the environment when loaded (.env locally, the secrets of the github-pages
// environment in CI): what it tracks, where it writes, and the rules of the organization. Without an organization or a
// password, nothing runs.

import { dirname, join } from 'node:path'

// Checked below: nothing runs without it.
export const ORG = /** @type {string} */ (process.env.ORG)

export const SNAPSHOT_PATH = process.env.SNAPSHOT_PATH ?? '.cache/snapshot.json'
export const STATS_PATH = process.env.STATS_PATH ?? 'site/data/stats.enc.json'
export const VERSION_PATH = join(dirname(STATS_PATH), 'version.json')
export const RETRO_PATH = join(dirname(STATS_PATH), 'retro.enc.json')

// Repository types, from the languages GitHub detects in them. TypeScript and JavaScript go with Vue: front-end code
// next to it, back-end services without it. Docs, infrastructure and tooling fall under "other".
/** @type {string[]} */
const CATEGORIES = ['front', 'back', 'mobile', 'other']

// Corrections for the repositories their languages misjudge, as "repo:category,repo:category". They come from the
// environment rather than the code because the repository names of the organization are private.
/** @type {Map<string, Category>} */
export const CATEGORY_OVERRIDES = new Map(
  (process.env.REPO_CATEGORIES ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [repo, category] = entry.split(':').map((part) => part.trim())
      if (!CATEGORIES.includes(category)) {
        // The entry holds a repository name: the public CI logs do not show it.
        throw new Error(`REPO_CATEGORIES: ${process.env.CI ? 'an entry' : `"${entry}"`} should be repo:${CATEGORIES.join('|')}`)
      }

      return /** @type {[string, Category]} */ ([repo, category])
    }),
)

// Optional fine-grained token, restricted to starting the workflow of this repository, that lets the page start a
// sync. It only travels inside the encrypted stats: only the people with the password can use it.
const WORKFLOW_FILE = 'deploy.yml'
// The repository of the dashboard, whose workflow the page starts and for which a full sync is signed.
export const DASHBOARD_REPOSITORY = process.env.GITHUB_REPOSITORY ?? process.env.DISPATCH_REPOSITORY
export const SYNC_TRIGGER = process.env.DISPATCH_TOKEN
  ? {
      repository: DASHBOARD_REPOSITORY,
      workflow: WORKFLOW_FILE,
      ref: process.env.GITHUB_REF_NAME || 'main',
      token: process.env.DISPATCH_TOKEN,
    }
  : null

// How many approvals a pull request needs before it can be merged, a rule of the organization: from REQUIRED_APPROVALS,
// 1 without it. It only travels inside the encrypted stats, for the page to tell the pull requests ready to merge.
/** @param {string} [value] */
export function requiredApprovals(value = '') {
  if (value.trim() === '') {
    return 1
  }
  const count = Number(value)
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('REQUIRED_APPROVALS should be a whole number, 1 or more')
  }

  return count
}

export const REQUIRED_APPROVALS = requiredApprovals(process.env.REQUIRED_APPROVALS)

// The squads of the organization, as "name:login,login;name:login,…": from SQUADS, none without it. Their names and
// members are private, so they come from the environment, and only travel inside the encrypted stats, for the squads
// page and the squad filter. A person may belong to several squads; the order is kept, the page lists them so. A star
// before a login marks the lead of the squad, one at most: "name:*login,login".
/**
 * @param {string} [value]
 * @returns {Squad[]}
 */
export function parseSquads(value = '') {
  /** @type {Squad[]} */
  const squads = []
  // A value copied with the quotes of its line in .env, as a secret: they surround the value, not the first squad's name.
  const unquoted = value.trim().replace(/^(["'])([\s\S]*)\1$/, '$2')
  for (const entry of unquoted.split(';').map((part) => part.trim()).filter(Boolean)) {
    const separator = entry.indexOf(':')
    const name = entry.slice(0, separator).trim()
    const logins = entry.slice(separator + 1).split(',').map((login) => login.trim()).filter(Boolean)
    const leads = logins.filter((login) => login.startsWith('*')).map((login) => login.slice(1).trim())
    const members = [...new Set(logins.map((login) => login.replace(/^\*\s*/, '')).filter(Boolean))]
    if (separator === -1 || !name || !members.length || leads.length > 1 || leads.includes('') || squads.some((squad) => squad.name === name)) {
      // The entry holds names of the organization: the public CI logs do not show it.
      throw new Error(`SQUADS: ${process.env.CI ? 'an entry' : `"${entry}"`} should be name:*lead,login,login, each name once, one lead at most`)
    }
    squads.push({ name, members, ...(leads.length && { lead: leads[0] }) })
  }

  return squads
}

export const SQUADS = parseSquads(process.env.SQUADS)

// The key of the year in review (« Rétrospective »), published apart from the stats: 32 random bytes in base64url (43
// characters), which its link carries after the # (never sent to any server). Without it, no year in review. It is not
// a password: nothing derives it, a key too short is refused.
/**
 * @param {string} [value]
 * @returns {Buffer | null}
 */
export function retroKey(value = '') {
  const text = value.trim()
  if (text === '') {
    return null
  }
  const key = Buffer.from(text, 'base64url')
  if (!/^[\w-]{43}$/.test(text) || key.length !== 32) {
    throw new Error('RETRO_KEY should be 32 random bytes in base64url: node -e "console.log(crypto.randomBytes(32).toString(\'base64url\'))"')
  }

  return key
}

export const RETRO_KEY = retroKey(process.env.RETRO_KEY)

// GitHub Apps are detected from their actor type: these are user accounts acting as bots. The organization's own
// come from BOT_USERS (logins separated by commas), so that its account names stay out of this public code.
export const BOT_USERS = new Set([
  'ghost',
  ...(process.env.BOT_USERS ?? '')
    .split(',')
    .map((login) => login.trim())
    .filter(Boolean),
])

if (!ORG) {
  throw new Error('No organization: set ORG (in .env locally, as a secret of the github-pages environment in CI).')
}
// The stats are only ever written encrypted: without a password, nothing is published.
if (!process.env.DASHBOARD_PASSWORD) {
  throw new Error('No password: set DASHBOARD_PASSWORD (in .env locally, as a secret of the github-pages environment in CI).')
}
