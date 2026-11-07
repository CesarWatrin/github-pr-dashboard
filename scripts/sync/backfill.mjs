// What the snapshot covers, and the older pull requests read back one slice per sync until it covers the window.

import { addDays, DAY_MS } from '../../site/domain/time.js'
import { CONCURRENCY, mapWithConcurrency, rest } from './github.mjs'
import { fetchCreatedBetween } from './pull-requests.mjs'

// The rolling window of the pull requests and runs published: three years, for the periods of the page up to 36 months.
export const WINDOW_DAYS = 3 * 365
// What a full sync reads again, and a sync without snapshot reads at once: the last year. A full sync keeps the older
// pull requests as read: closed for the most part, and an incremental sync still reads one again when it changes.
export const RECENT_DAYS = 365
// The pull requests older than what the snapshot covers are read back one slice of this many days per sync, about a
// minute, until it covers the window: the whole window at once would outlast the workflow and the token's hourly quota.
const BACKFILL_DAYS = 30
// The backfill waits while the token has fewer GraphQL points left for the hour: they are shared with the CI and the team.
const BACKFILL_MIN_POINTS = 2500

// What a snapshot covers: every pull request, and every run, created since these times has been read. A snapshot kept
// before it told covers the year before its sync, the window then; without a snapshot, the sync starts from the year
// before now (recentStartIso), and so do the runs without any.
export function snapshotCoverage(snapshot, recentStartIso) {
  if (!snapshot) {
    return { pullRequests: recentStartIso, runs: recentStartIso }
  }
  const yearBefore = new Date(Date.parse(snapshot.syncedAt) - RECENT_DAYS * DAY_MS).toISOString()

  return {
    pullRequests: snapshot.pullRequestsSince ?? yearBefore,
    runs: snapshot.runs ? (snapshot.runsSince ?? yearBefore) : recentStartIso,
  }
}

// The next slice of the backfill: the days (UTC, included) of the BACKFILL_DAYS before what the snapshot covers
// (sinceIso), back to the start of the window at most, and what the snapshot covers once they are read. Null once it
// covers the window. Whole days, so that each slice starts where the previous one ended.
export function backfillSlice(sinceIso, windowStartIso) {
  if (sinceIso <= windowStartIso) {
    return null
  }
  const start = Math.max(Date.parse(sinceIso) - BACKFILL_DAYS * DAY_MS, Date.parse(windowStartIso))
  const from = new Date(start).toISOString().slice(0, 10)

  return { from, to: sinceIso.slice(0, 10), since: `${from}T00:00:00.000Z` }
}

// Whole days from one day to another (UTC, included) cut into at most `parts` ranges of about the same length, in order.
export function splitDays(from, to, parts) {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1
  const count = Math.min(parts, days)
  const ranges = []
  let start = from
  for (let index = 0; index < count; index++) {
    const end = addDays(start, Math.floor(days / count) + (index < days % count ? 1 : 0) - 1)
    ranges.push([start, end])
    start = addDays(end, 1)
  }

  return ranges
}

// One slice of the backfill, when the token can spare it: the pull requests read, what the snapshot then covers, and
// whether the slice was read, waits for the quota, or the snapshot already covers the window. A page of the search
// takes seconds: the slice is read in CONCURRENCY ranges at once, as the full sync reads repositories.
export async function backfill(sinceIso, windowStartIso) {
  const slice = backfillSlice(sinceIso, windowStartIso)
  if (!slice) {
    return { pullRequests: [], since: sinceIso, status: 'done' }
  }
  // Asking for the quota does not count against it.
  const limits = await rest('/rate_limit')
  if ((limits?.resources?.graphql?.remaining ?? 0) < BACKFILL_MIN_POINTS) {
    return { pullRequests: [], since: sinceIso, status: 'waiting' }
  }

  const ranges = splitDays(slice.from, slice.to, CONCURRENCY)
  const perRange = await mapWithConcurrency(ranges, CONCURRENCY, ([from, to]) => fetchCreatedBetween(from, to))

  return { pullRequests: perRange.flat(), since: slice.since, status: 'read' }
}

// What the logs tell of the backfill, the same in CI: nothing of the organization.
export const BACKFILL_LOGS = { read: ', older pull requests read back', waiting: ', backfill waiting for the quota', done: '' }
