// The day of the last sync (Aujourd'hui, on the overview): the podium of each of its counters, shared by the sync, which
// counts the pull requests and reviews, and the page, which counts the AC delivered and the TMA from the records.

import { MINUTE_MS, parisDay } from './time.js'

// The places of a podium of the day.
export const PODIUM_SIZE = 3

// Who did the most of something in the day, as [login, count], the most first, then by login: the first PODIUM_SIZE,
// and anyone tied with the last of them, so that a tie never leaves someone out at random. Empty for a day without any.
/**
 * @param {Map<string, number>} counts
 * @returns {TodayPodium}
 */
export function podiumOf(counts) {
  const ranked = [...counts].sort(([a, countA], [b, countB]) => countB - countA || a.localeCompare(b))
  const last = ranked[PODIUM_SIZE - 1]?.[1] ?? 0

  return ranked.filter(([, count], index) => index < PODIUM_SIZE || count === last)
}

// What the people delivered in a Paris day, from the records: the AC delivered (merged for good: see acLife() of
// acs.js), each counting once for each of its authors on the podium; and the TMA, the hotfixes merged, for their
// authors.
/**
 * @param {PullRequestRecord[]} records
 * @param {{ status: string, deliveredAt: number | null, authors: string[] }[]} acs acsOf() of the records
 * @param {string} day 'YYYY-MM-DD', Paris
 */
export function deliveredOn(records, acs, day) {
  /** @param {number | null} at minutes since the epoch */
  const onDay = (at) => at !== null && parisDay(at * MINUTE_MS) === day
  /** @type {Map<string, number>} */
  const acAuthors = new Map()
  const delivered = acs.filter((ac) => ac.status === 'delivered' && onDay(ac.deliveredAt))
  for (const login of delivered.flatMap((ac) => ac.authors)) {
    acAuthors.set(login, (acAuthors.get(login) ?? 0) + 1)
  }
  /** @type {Map<string, number>} */
  const tmaAuthors = new Map()
  const hotfixes = records.filter((pr) => pr.hotfix && !pr.bot && onDay(pr.mergedAt))
  for (const pr of hotfixes) {
    tmaAuthors.set(pr.author, (tmaAuthors.get(pr.author) ?? 0) + 1)
  }

  return {
    acs: delivered.length,
    tma: hotfixes.length,
    podiums: { acs: podiumOf(acAuthors), tma: podiumOf(tmaAuthors) },
  }
}
