// Where the code effort goes: each code pull request of a person opened in a range counts once, in one of four kinds of
// work, in this order: a project (projects), else a hotfix (tma), else an AC (acs), else the rest. Building is the
// projects and the AC, maintaining the TMA; the rest stays out of that reading. What they add up to over a range,
// bucket by bucket, and per author.

import { bucketOfDay, bucketsOf } from './buckets.js'
import { getOrCreate } from './math.js'
import { MINUTE_MS, parisDay } from './time.js'

/** @typedef {'projects' | 'tma' | 'acs' | 'rest'} EffortKind */
/** @typedef {Record<EffortKind, number>} EffortCounts */

// The kinds of work, in the order a pull request is given one: a project first, then a hotfix, then an AC.
/** @type {EffortKind[]} */
export const EFFORT_KINDS = ['projects', 'tma', 'acs', 'rest']

// Whether a pull request belongs to a project: by default, whether its record names one. The page passes the projects
// it shows (projectsOf(): a branch made by mistake makes none).
/** @typedef {(pr: PullRequestRecord) => boolean} OnProject */
/** @type {OnProject} */
const namesProject = (pr) => pr.project !== undefined

/**
 * The kind of work of a code pull request.
 * @param {PullRequestRecord} pr
 * @param {OnProject} [onProject]
 * @returns {EffortKind}
 */
export function effortKind(pr, onProject = namesProject) {
  return onProject(pr) ? 'projects' : pr.hotfix ? 'tma' : pr.ac ? 'acs' : 'rest'
}

/** @returns {EffortCounts} */
const noCounts = () => ({ projects: 0, tma: 0, acs: 0, rest: 0 })

/**
 * What the code pull requests of each kind add up to: how many (counts), and the lines added by those merged (added),
 * whenever they were. code: all of them. shares: the share of each kind, null without any. build: the projects and the
 * AC; run: the TMA; buildShare and runShare: their shares of build + run, the rest aside, null without either.
 * @param {{ counts: EffortCounts, added: EffortCounts }} totals
 */
export function effortSummary({ counts, added }) {
  const code = EFFORT_KINDS.reduce((total, kind) => total + counts[kind], 0)
  const build = counts.projects + counts.acs
  const run = counts.tma
  const worked = build + run
  /** @type {EffortCounts | null} */
  const shares = code
    ? { projects: counts.projects / code, tma: counts.tma / code, acs: counts.acs / code, rest: counts.rest / code }
    : null

  return {
    counts,
    added,
    code,
    shares,
    build,
    run,
    buildShare: worked ? build / worked : null,
    runShare: worked ? run / worked : null,
  }
}

/** @typedef {ReturnType<typeof effortSummary>} EffortSummary */

// The code pull requests of people opened in a range, by the key each one is given (its author, its bucket…).
/**
 * @param {PullRequestRecord[]} records
 * @param {Pick<TimeRange, 'start' | 'end'>} range
 * @param {(pr: PullRequestRecord) => string} keyOf
 * @param {OnProject} onProject
 * @returns {Map<string, EffortSummary>}
 */
function effortBy(records, { start, end }, keyOf, onProject) {
  /** @type {Map<string, { counts: EffortCounts, added: EffortCounts }>} */
  const totals = new Map()
  for (const pr of records) {
    const opened = pr.createdAt * MINUTE_MS
    if (pr.bot || pr.kind !== 'code' || opened < start || opened >= end) {
      continue
    }
    const kind = effortKind(pr, onProject)
    const total = getOrCreate(totals, keyOf(pr), () => ({ counts: noCounts(), added: noCounts() }))
    total.counts[kind]++
    if (pr.mergedAt !== null) {
      total.added[kind] += pr.lines - (pr.deleted ?? 0)
    }
  }

  return new Map([...totals].map(([key, total]) => [key, effortSummary(total)]))
}

/** @type {() => EffortSummary} */
const noEffort = () => effortSummary({ counts: noCounts(), added: noCounts() })

/**
 * Where the effort of the code pull requests opened in a range goes.
 * @param {PullRequestRecord[]} records
 * @param {Pick<TimeRange, 'start' | 'end'>} range
 * @param {{ onProject?: OnProject }} [options]
 * @returns {EffortSummary}
 */
export function effortOf(records, range, { onProject = namesProject } = {}) {
  return effortBy(records, range, () => '', onProject).get('') ?? noEffort()
}

/**
 * The same for each bucket of the range (day, week or month, in Paris days), oldest first, a bucket without any pull
 * request at zero. partial: the range does not cover the whole bucket.
 * @param {PullRequestRecord[]} records
 * @param {TimeRange} range
 * @param {{ onProject?: OnProject }} [options]
 */
export function effortSeries(records, range, { onProject = namesProject } = {}) {
  const byBucket = effortBy(records, range, (pr) => bucketOfDay(parisDay(pr.createdAt * MINUTE_MS), range.bucket), onProject)

  return bucketsOf(range.start, range.end, range.bucket).map(({ key, partial }) => ({ key, partial, ...(byBucket.get(key) ?? noEffort()) }))
}

/** @typedef {ReturnType<typeof effortSeries>[number]} EffortPoint */

/**
 * The same for each author of code pull requests opened in the range.
 * @param {PullRequestRecord[]} records
 * @param {Pick<TimeRange, 'start' | 'end'>} range
 * @param {{ onProject?: OnProject }} [options]
 * @returns {Map<string, EffortSummary>}
 */
export function effortByAuthor(records, range, { onProject = namesProject } = {}) {
  return effortBy(records, range, (pr) => pr.author, onProject)
}
