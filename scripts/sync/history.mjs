// The monthly history of each person's figures, for the badges: it outlasts the window, back to the first sync.

import { readFile } from 'node:fs/promises'

import { isOutdated, monthlyActivity, withNewFigures } from '../../site/domain/months.js'
import { DAY_MS, parisDay, parisMidnight } from '../../site/domain/time.js'
import { STATS_PATH } from './config.mjs'
import { decrypt } from './publish.mjs'

// A month of the monthly history is only worked out once the month before it lies within the data too: its reviews
// and merges are mostly of pull requests opened shortly before it.
export const HISTORY_LEAD_DAYS = 31

// A month of the monthly history is final this long after its end (see mergeMonthlyHistory()).
const MONTH_FINAL_AFTER_MS = 7 * DAY_MS
// How the months of the history are counted, kept with it: bumped when a fix changes it, so that the next sync works out
// again, once, every whole month of the history still in the window. A history without any was counted the first way.
// 2: the project branches that merge another branch into theirs are no longer code. 3: nor those named after the
// branch they bring in rather than after a merge (develop-into-main, sync-develop…).
export const MONTHLY_REVISION = 3

/** @type {(month: string) => string} */
const nextMonth = (month) => {
  const [year, number] = month.split('-').map(Number)

  return number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, '0')}`
}

// The Paris months ('YYYY-MM') lying whole within [start, end), in milliseconds.
/**
 * @param {number} start
 * @param {number} end
 */
export function wholeMonthsWithin(start, end) {
  let month = parisDay(start).slice(0, 7)
  if (parisMidnight(`${month}-01`) < start) {
    month = nextMonth(month)
  }
  /** @type {string[]} */
  const months = []
  for (; parisMidnight(`${nextMonth(month)}-01`) <= end; month = nextMonth(month)) {
    months.push(month)
  }

  return months
}

// The monthly history of each person's figures, as { 'YYYY-MM': { login: figures } } (see monthlyActivity()), for the
// badges, back to the first sync. A whole month of the window is worked out from its records until it has been over for
// MONTH_FINAL_AFTER_MS, for the data synced late; from then on it is final and stays as kept. Worked out again later, it
// would lose the reviews of pull requests created before the window as the window moves on. A final month kept before
// some of the figures existed, such as the lines added and deleted, gets them once from its records, still within the
// window: the figures it kept stay, and the people only those new figures name join it. A history counted the way of an
// older MONTHLY_REVISION (revision) has every whole month of the window worked out again, once, final or not: the fix
// applies to them too. The months gone from the window stay as kept.
/**
 * @param {MonthlyHistory} history
 * @param {PullRequestRecord[]} records
 * @param {{ windowStart: number, now: number, revision?: number }} range
 * @returns {MonthlyHistory}
 */
export function mergeMonthlyHistory(history, records, { windowStart, now, revision = MONTHLY_REVISION }) {
  const revised = revision < MONTHLY_REVISION
  const activity = monthlyActivity(records)
  const merged = { ...history }
  for (const month of wholeMonthsWithin(windowStart, now)) {
    const worked = Object.fromEntries(
      [...activity]
        .filter(([, perMonth]) => perMonth.has(month))
        .map(([login, perMonth]) => /** @type {[string, MonthlyFigures]} */ ([login, perMonth.get(month)]))
        .sort(([a], [b]) => a.localeCompare(b)),
    )
    if (revised || !(month in history) || parisMidnight(`${nextMonth(month)}-01`) > now - MONTH_FINAL_AFTER_MS) {
      merged[month] = worked
    } else if (isOutdated(history[month])) {
      merged[month] = withNewFigures(history[month], worked)
    }
  }

  return Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)))
}

// The monthly history of the stats last published, with its revision, for a snapshot without one: a lost Actions cache
// or a new SNAPSHOT_VERSION must not lose it. The local stats file first, else the deployed page (PUBLISHED_STATS_URL,
// by default the GitHub Pages address of the repository in CI). Stats encrypted with another password, or without any
// history, give none.
/** @returns {Promise<{ history: MonthlyHistory, revision: number } | null>} */
export async function readPublishedHistory() {
  const [owner, repo] = (process.env.GITHUB_REPOSITORY ?? '').split('/')
  const url = process.env.PUBLISHED_STATS_URL ?? (repo ? `https://${owner.toLowerCase()}.github.io/${repo}/data/stats.enc.json` : null)
  const sources = [
    async () => /** @type {EncryptedStats} */ (JSON.parse(await readFile(STATS_PATH, 'utf8'))),
    async () => {
      const response = url ? await fetch(url, { cache: 'no-store' }) : null

      return response?.ok ? /** @type {Promise<EncryptedStats>} */ (response.json()) : null
    },
  ]
  for (const source of sources) {
    try {
      const payload = await source()
      const stats = payload && decrypt(payload)
      if (stats?.monthly) {
        return { history: stats.monthly, revision: stats.monthlyRevision ?? 1 }
      }
    } catch {
      // Missing, unreachable or written with another password: the next source, or no history.
    }
  }

  return null
}
