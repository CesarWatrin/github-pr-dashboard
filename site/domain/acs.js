// The AC (améliorations continues) of the records: the improvements developed on a branch feature/<name> or
// feat/<name> cut from develop (ac of the records, that branch, see the sync), grouped by name whatever the repository, a name taken
// up again long after making another AC. What each one is over the whole data (its life: start, delivery into develop,
// production, delays, size, people), and what they add up to over a range, bucket by bucket too: how many started, were
// delivered and reached production, and their delays and sizes. Far too many to show one by one: the page only shows
// what they add up to.

import { bucketOfDay, bucketsOf } from './buckets.js'
import { getOrCreate, median } from './math.js'
import { sizeOf } from './period/sizes.js'
import { DAY_MS, MINUTE_MS, parisDay, workHoursBetween } from './time.js'

// A pull request of an AC's name opened this long after the latest one of it starts another AC of that name.
export const AC_GAP_DAYS = 30
// The name of an AC, from its branch: what follows feature/ or feat/.
/** @type {(branch: string) => string} */
export const acName = (branch) => branch.replace(/^(?:feature|feat)\//, '')
const DAY_MINUTES = DAY_MS / MINUTE_MS

/** @typedef {'open' | 'delivered' | 'abandoned'} AcStatus */

/**
 * An AC over the whole data, times in minutes since the epoch. key: its name, followed from the second AC of that name
 * on by its rank (csv-export#2). start: its first pull request opened. status: open while one of its pull requests is,
 * else delivered when one was merged, else abandoned. deliveredAt: its last merge, once delivered; deployedAt: when its
 * last pull request merged reached production, once all have. timeToMergeHours and leadTimeHours: the working hours from
 * its start to these. lines: those its merged pull requests changed. authors and repos: who opened its pull requests,
 * and where.
 * @param {string} key
 * @param {string} name
 * @param {PullRequestRecord[]} records
 */
export function acLife(key, name, records) {
  const start = Math.min(...records.map((pr) => pr.createdAt))
  const merged = records.filter((pr) => pr.mergedAt !== null)
  /** @type {AcStatus} */
  const status = records.some((pr) => pr.mergedAt === null && !pr.closed) ? 'open' : merged.length ? 'delivered' : 'abandoned'
  const deliveredAt = status === 'delivered' ? Math.max(...merged.map((pr) => /** @type {number} */ (pr.mergedAt))) : null
  const deployed = merged.map((pr) => pr.deployedAt ?? null)
  const deployedAt = deliveredAt !== null && deployed.every((at) => at !== null) ? Math.max(.../** @type {number[]} */ (deployed)) : null

  return {
    key,
    name,
    start,
    status,
    deliveredAt,
    deployedAt,
    timeToMergeHours: deliveredAt === null ? null : workHoursBetween(start, deliveredAt),
    leadTimeHours: deployedAt === null ? null : workHoursBetween(start, deployedAt),
    lines: merged.reduce((total, pr) => total + pr.lines, 0),
    authors: [...new Set(records.map((pr) => pr.author))].sort(),
    repos: [...new Set(records.map((pr) => pr.repo))].sort(),
    records,
  }
}

/** @typedef {ReturnType<typeof acLife>} Ac */

// The AC of the records, those of people only, in the order their names first come. An AC of the same name in several
// repositories is one AC; its pull requests come in the order they were opened, and one opened more than AC_GAP_DAYS after
// the latest one of the AC starts another AC of that name.
/**
 * @param {PullRequestRecord[]} records
 * @returns {Ac[]}
 */
export function acsOf(records) {
  /** @type {Map<string, PullRequestRecord[]>} */
  const byName = new Map()
  for (const pr of records) {
    if (pr.ac && !pr.bot && pr.kind === 'code') {
      getOrCreate(byName, acName(pr.ac), () => []).push(pr)
    }
  }

  return [...byName].flatMap(([name, own]) => {
    /** @type {PullRequestRecord[][]} */
    const runs = []
    for (const pr of own.toSorted((a, b) => a.createdAt - b.createdAt)) {
      const run = runs.at(-1)
      if (run && pr.createdAt - /** @type {PullRequestRecord} */ (run.at(-1)).createdAt <= AC_GAP_DAYS * DAY_MINUTES) {
        run.push(pr)
      } else {
        runs.push([pr])
      }
    }

    return runs.map((run, index) => acLife(index === 0 ? name : `${name}#${index + 1}`, name, run))
  })
}

// Whether a time (minutes, or null) falls within a range (milliseconds).
/** @type {(range: Pick<TimeRange, 'start' | 'end'>) => (at: number | null) => boolean} */
const within = (range) => (at) => at !== null && at * MINUTE_MS >= range.start && at * MINUTE_MS < range.end

// What the AC add up to over a range: how many started within it, were delivered (merged into develop) and reached
// production within it, how many are open at the last sync, how many of those started within it were abandoned; over
// those delivered, the median working hours from their start to their merge and their median lines; over those that
// reached production, the median working hours to it; the people who opened the pull requests of those started or
// delivered; and the pull requests of AC opened within the range (code), for their share of the code pull requests.
/**
 * @param {Ac[]} acs
 * @param {Pick<TimeRange, 'start' | 'end'>} range
 */
export function acSummary(acs, range) {
  const inRange = within(range)
  const started = acs.filter((ac) => inRange(ac.start))
  const delivered = acs.filter((ac) => inRange(ac.deliveredAt))
  const deployed = acs.filter((ac) => inRange(ac.deployedAt))

  return {
    started: started.length,
    delivered: delivered.length,
    deployed: deployed.length,
    open: acs.filter((ac) => ac.status === 'open').length,
    abandoned: started.filter((ac) => ac.status === 'abandoned').length,
    medianTimeToMergeHours: median(delivered.map((ac) => /** @type {number} */ (ac.timeToMergeHours))),
    medianLeadTimeHours: median(deployed.map((ac) => /** @type {number} */ (ac.leadTimeHours))),
    medianLines: median(delivered.map((ac) => ac.lines)),
    people: new Set([...started, ...delivered].flatMap((ac) => ac.authors)).size,
    code: acs.reduce((total, ac) => total + ac.records.filter((pr) => inRange(pr.createdAt)).length, 0),
  }
}

/** @typedef {ReturnType<typeof acSummary>} AcSummary */

// For each bucket of a range (day, week or month, in Paris days), oldest first: the AC started in it, and those
// delivered in it. partial: the range does not cover the whole bucket.
/**
 * @param {Ac[]} acs
 * @param {TimeRange} range
 */
export function acSeries(acs, { start, end, bucket }) {
  /** @param {number} at */
  const bucketOf = (at) => bucketOfDay(parisDay(at * MINUTE_MS), bucket)
  /** @type {Map<string, { started: number, delivered: number }>} */
  const counts = new Map(bucketsOf(start, end, bucket).map(({ key }) => [key, { started: 0, delivered: 0 }]))
  const inRange = within({ start, end })
  for (const ac of acs) {
    if (inRange(ac.start)) {
      const point = counts.get(bucketOf(ac.start))
      point && point.started++
    }
    if (inRange(ac.deliveredAt)) {
      const point = counts.get(bucketOf(/** @type {number} */ (ac.deliveredAt)))
      point && point.delivered++
    }
  }

  return bucketsOf(start, end, bucket).map(({ key, partial }) => ({ key, partial, .../** @type {{ started: number, delivered: number }} */ (counts.get(key)) }))
}

// The AC delivered within a range, counted by what keysOf gives each one (its repositories, its authors…), the most
// first: an AC counts once for each of its keys.
/**
 * @param {Ac[]} acs
 * @param {Pick<TimeRange, 'start' | 'end'>} range
 * @param {(ac: Ac) => string[]} keysOf
 * @returns {[key: string, count: number][]}
 */
export function deliveredBy(acs, range, keysOf) {
  const inRange = within(range)
  /** @type {Map<string, number>} */
  const counts = new Map()
  for (const ac of acs.filter((other) => inRange(other.deliveredAt))) {
    for (const key of new Set(keysOf(ac))) {
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }

  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

// The AC delivered within a range by the size of what they changed, in the size buckets of the dashboard (SIZE_BUCKETS),
// smallest first.
/**
 * @param {Ac[]} acs
 * @param {Pick<TimeRange, 'start' | 'end'>} range
 * @returns {number[]}
 */
export function acSizes(acs, range) {
  const inRange = within(range)
  const counts = [0, 0, 0, 0, 0]
  for (const ac of acs.filter((other) => inRange(other.deliveredAt))) {
    counts[sizeOf(ac.lines)]++
  }

  return counts
}
