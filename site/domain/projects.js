// The projects of the records: the code pull requests the sync tied to a project (project), and the merges of its
// branch, project/<name>/main or that of one of its stages, into a long-lived branch (projectMerge), grouped by name
// whatever the repository, a name taken up again long after its project was over making another project. What each
// project is over the whole data, its life (start, merges, last activity, status, its stages when it goes in stages:
// stage of the records), and its figures over a range, those of computePeriod() over its pull
// requests. The projects bucket by bucket in projects/series.js.

import { getOrCreate, median } from './math.js'
import { openPullRequests } from './open-pull-requests.js'
import { computePeriod } from './period.js'
import { DAY_MS, MINUTE_MS, workHoursBetween } from './time.js'

// A project without any activity for this long, its branch not merged since its last pull request, has stalled.
export const STALLED_AFTER_DAYS = 30
// A project with nothing of it still open and nothing done on it for this long is over: a pull request opened under its
// name afterwards starts another project, the name taken up again (a branch project/<name>/main made anew, say).
export const REUSED_AFTER_DAYS = 90
// The code pull requests a project carries over its life, whoever opened them, to count as one: a project branch made by
// mistake and dropped, a single pull request, or code pushed without any pull request tell nothing of a project.
export const MIN_PROJECT_CODE = 2
const WEEK_MINUTES = 7 * 24 * 60
const DAY_MINUTES = DAY_MS / MINUTE_MS

/** @typedef {'ongoing' | 'delivered' | 'stalled' | 'abandoned'} ProjectStatus */

/**
 * A project and its records. key: its name, followed from the second project of that name on by its rank
 * (paper-kite, paper-kite#2); run: that rank, from 1; runs: how many projects took that name.
 * @typedef {{ key: string, name: string, run: number, runs: number, records: PullRequestRecord[] }} ProjectRecords
 */

// What was done on a pull request: opened, merged, closed, reviewed or commented.
/** @type {(pr: PullRequestRecord) => number[]} */
const eventsOf = (pr) => [pr.createdAt, pr.mergedAt ?? pr.closedAt ?? pr.createdAt, ...pr.interventions.map(([, at]) => at)]

// When a pull request stopped being open: merged, or closed (as of its last event for a record without its closing
// time, published before the sync gave it); never while it is open.
/** @type {(pr: PullRequestRecord) => number} */
const doneAt = (pr) => pr.mergedAt ?? (pr.closed ? (pr.closedAt ?? Math.max(...eventsOf(pr))) : Infinity)

// Whether a project is over at a time (minutes): none of its pull requests still open, and nothing done on it over the
// REUSED_AFTER_DAYS before.
/**
 * @param {PullRequestRecord[]} records
 * @param {number} at
 */
function isOver(records, at) {
  let last = -Infinity
  for (const pr of records) {
    if (doneAt(pr) > at) {
      return false
    }
    for (const event of eventsOf(pr)) {
      if (event <= at) {
        last = Math.max(last, event)
      }
    }
  }

  return at - last > REUSED_AFTER_DAYS * DAY_MINUTES
}

// The projects of the records, those of people only, in the order their names first come. A project of the same name in
// several repositories is one project, but a name can be taken up again: its pull requests come in the order they were
// opened, and one opened once the project is over (isOver()) starts another project of that name. Only the projects
// with MIN_PROJECT_CODE code pull requests or more count, ranked among those of their name.
/**
 * @param {PullRequestRecord[]} records
 * @returns {ProjectRecords[]}
 */
export function projectsOf(records) {
  /** @type {Map<string, PullRequestRecord[]>} */
  const byName = new Map()
  for (const pr of records) {
    if (pr.project && !pr.bot) {
      getOrCreate(byName, pr.project, () => []).push(pr)
    }
  }

  return [...byName].flatMap(([name, own]) => {
    /** @type {PullRequestRecord[][]} */
    const runs = []
    for (const pr of own.toSorted((a, b) => a.createdAt - b.createdAt)) {
      const run = runs.at(-1)
      if (run && !isOver(run, pr.createdAt)) {
        run.push(pr)
      } else {
        runs.push([pr])
      }
    }

    const kept = runs.filter((run) => run.filter((pr) => pr.kind === 'code').length >= MIN_PROJECT_CODE)

    return kept.map((run, index) => ({ key: index === 0 ? name : `${name}#${index + 1}`, name, run: index + 1, runs: kept.length, records: run }))
  })
}

/** @typedef {'merged' | 'open' | 'closed'} MergeState */

// For each repository of a project, the pull request that brings its branch into a long-lived branch which tells the
// most: one still open (the latest), else one merged (the latest), else one closed without a merge (the latest); and
// where it stands.
/**
 * @param {PullRequestRecord[]} records
 * @returns {Record<string, { number: number, state: MergeState }>}
 */
export function mergeRequestsOf(records) {
  /** @type {MergeState[]} */
  const precedence = ['open', 'merged', 'closed']
  /** @type {Record<string, { number: number, state: MergeState, createdAt: number }>} */
  const byRepo = {}
  for (const pr of records.filter((other) => other.projectMerge)) {
    /** @type {MergeState} */
    const state = pr.mergedAt !== null ? 'merged' : pr.closed ? 'closed' : 'open'
    const kept = byRepo[pr.repo]
    const better = !kept || precedence.indexOf(state) < precedence.indexOf(kept.state) || (state === kept.state && pr.createdAt > kept.createdAt)
    if (better) {
      byRepo[pr.repo] = { number: pr.number, state, createdAt: pr.createdAt }
    }
  }

  return Object.fromEntries(Object.entries(byRepo).map(([repo, { number, state }]) => [repo, { number, state }]))
}

/**
 * A project, or a stage of it, over the whole data, from all its records, times in minutes since the epoch. start: its first pull request
 * opened. merges: the pull requests that merged its branch into a long-lived branch, and when, oldest first; mergeOpen:
 * such a merge still waits; mergeRequests: per repository, the pull request of such a merge that tells the most
 * (mergeRequestsOf()). lastActivity: its latest pull request opened or merged, review or comment. deliveredAt: its last merge, when
 * no pull request of the project was opened after it (one opened after brings it back to work). end: delivered, else
 * its last activity. status at now (milliseconds): delivered, else abandoned when every merge of its branch was closed
 * without a merge and nothing of it is still open, else stalled after STALLED_AFTER_DAYS without activity, else ongoing. days: from its start to its end, on the calendar. integrationHours: the working hours from the last
 * code pull request merged before its last merge to that merge, null without either.
 * @param {PullRequestRecord[]} records
 * @param {number} now
 */
function lifeOf(records, now) {
  let start = Infinity
  let lastActivity = -Infinity
  for (const pr of records) {
    start = Math.min(start, pr.createdAt)
    lastActivity = pr.interventions.reduce((latest, [, at]) => Math.max(latest, at), Math.max(lastActivity, pr.createdAt, pr.mergedAt ?? -Infinity))
  }
  const merges = records
    .filter((pr) => pr.projectMerge && pr.mergedAt !== null)
    .map((pr) => ({ repo: pr.repo, number: pr.number, at: /** @type {number} */ (pr.mergedAt) }))
    .sort((a, b) => a.at - b.at)
  const lastMerge = merges.at(-1)?.at ?? null
  const deliveredAt = lastMerge !== null && records.every((pr) => pr.createdAt <= lastMerge) ? lastMerge : null
  const end = deliveredAt ?? lastActivity
  const mergeRequests = mergeRequestsOf(records)
  // Every merge of its branch closed without a merge, nothing of it still open: given up.
  const abandoned =
    Object.values(mergeRequests).length > 0 &&
    Object.values(mergeRequests).every((request) => request.state === 'closed') &&
    records.every((pr) => pr.mergedAt !== null || pr.closed)
  /** @type {ProjectStatus} */
  const status =
    deliveredAt !== null ? 'delivered' : abandoned ? 'abandoned' : now - lastActivity * MINUTE_MS > STALLED_AFTER_DAYS * DAY_MS ? 'stalled' : 'ongoing'
  const lastFeatureMerge = records.reduce(
    (latest, pr) => (pr.kind === 'code' && pr.mergedAt !== null && lastMerge !== null && pr.mergedAt <= lastMerge ? Math.max(latest ?? -Infinity, pr.mergedAt) : latest),
    /** @type {number | null} */ (null),
  )

  return {
    start,
    end,
    lastActivity,
    merges,
    mergeOpen: records.some((pr) => pr.projectMerge && pr.mergedAt === null && !pr.closed),
    mergeRequests,
    deliveredAt,
    status,
    days: (end - start) / DAY_MINUTES,
    integrationHours: lastMerge !== null && lastFeatureMerge !== null ? workHoursBetween(lastFeatureMerge, lastMerge) : null,
  }
}

// The numbered stages come after the main branch and the stages named by a word.
/** @type {(stage: { stage: string | null }) => number} */
const stageRank = ({ stage }) => (stage !== null && /^\d/.test(stage) ? 1 : 0)

// Two numbered stages, number by number: 1.2 before 1.10.
/** @type {(a: string | null, b: string | null) => number} */
function compareNumbers(a, b) {
  const [left, right] = [String(a).split('.').map(Number), String(b).split('.').map(Number)]
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? -1) - (right[index] ?? -1)
    if (difference !== 0) {
      return difference
    }
  }

  return 0
}

// The stages of a project that goes in stages (stage of the records, such as 1, 2.1 or pilot), each with its life (lifeOf())
// and its code pull requests; none for a project without any. The pull requests of no stage make one more when their
// branch came back into a long-lived branch on its own (merges of it), the main branch of the project; else they were
// only work done along the stages. In their order: the main branch and the stages named by a word first, the earliest
// started first, then the numbered ones by their number (1.2 before 1.10, 2 after 1.3).
/**
 * @param {PullRequestRecord[]} records
 * @param {number} now
 */
function stagesOf(records, now) {
  if (!records.some((pr) => pr.stage)) {
    return []
  }
  /** @type {Map<string | null, PullRequestRecord[]>} */
  const byStage = new Map()
  for (const pr of records) {
    getOrCreate(byStage, pr.stage ?? null, () => []).push(pr)
  }

  return [...byStage]
    .filter(([stage, own]) => stage !== null || own.some((pr) => pr.projectMerge))
    .map(([stage, own]) => ({ stage, code: own.filter((pr) => pr.kind === 'code').length, ...lifeOf(own, now) }))
    .sort((a, b) => stageRank(a) - stageRank(b) || (stageRank(a) === 0 ? a.start - b.start : compareNumbers(a.stage, b.stage)))
}

// A project over the whole data (lifeOf()), and its stages (stagesOf()). A project that goes in stages is delivered once
// every stage is, or was abandoned, one at least delivered, and no pull request of the project was opened after the last
// delivery; abandoned when every stage was; else ongoing, or stalled after STALLED_AFTER_DAYS without activity.
/**
 * @param {PullRequestRecord[]} records
 * @param {number} now
 */
export function projectLife(records, now) {
  const life = lifeOf(records, now)
  const stages = stagesOf(records, now)
  if (stages.length === 0) {
    return { ...life, stages }
  }
  const done = stages.every((stage) => stage.status === 'delivered' || stage.status === 'abandoned')
  const lastDelivery = Math.max(...stages.map((stage) => stage.deliveredAt ?? -Infinity))
  const deliveredAt = done && lastDelivery > -Infinity && records.every((pr) => pr.createdAt <= lastDelivery) ? lastDelivery : null
  /** @type {ProjectStatus} */
  const status =
    deliveredAt !== null
      ? 'delivered'
      : stages.every((stage) => stage.status === 'abandoned')
        ? 'abandoned'
        : now - life.lastActivity * MINUTE_MS > STALLED_AFTER_DAYS * DAY_MS
          ? 'stalled'
          : 'ongoing'
  const end = deliveredAt ?? life.lastActivity

  return { ...life, deliveredAt, status, end, days: (end - life.start) / DAY_MINUTES, stages }
}

/** @typedef {ReturnType<typeof projectLife>} ProjectLife */

// The part of a project's span, from its start to its end, within a range (milliseconds), in minutes since the epoch,
// and whether the range cuts it at its start or at its end; null when the span misses the range.
/**
 * @param {Pick<ProjectLife, 'start' | 'end'>} life
 * @param {Pick<TimeRange, 'start' | 'end'>} range
 * @returns {{ from: number, to: number, cutStart: boolean, cutEnd: boolean } | null}
 */
export function spanInRange({ start, end }, range) {
  const rangeStart = range.start / MINUTE_MS
  const rangeEnd = range.end / MINUTE_MS
  if (start >= rangeEnd || end < rangeStart) {
    return null
  }

  return { from: Math.max(start, rangeStart), to: Math.min(end, rangeEnd), cutStart: start < rangeStart, cutEnd: end > rangeEnd }
}

/**
 * The projects whose span meets a range, the earliest started first: their life over all the records (all, every
 * person's: the start, the merges and the status are the project's whatever the squad), and their figures over the
 * range from the records counted (records, a squad's say), as computePeriod() counts them. code: the code pull requests
 * opened over the range; merged: those of them merged; open: those still open, drafts aside; authors, with their code
 * pull requests, those merged and their lines, and reviewers, with the pull requests they reviewed and their comments,
 * the busiest first; added and deleted lines; the median time to merge; perWeek: the code pull requests opened a week
 * while the project was under way within the range; repos: every repository of the project, by its code pull requests
 * over the range. The projects are those of projectsOf() over all the records, so that a squad sees the same projects
 * as everyone, each with its key, its rank among the projects of its name (run, runs), and the start and end of the
 * others of that name (namesakes).
 * @param {PullRequestRecord[]} records
 * @param {TimeRange} range
 * @param {{ all?: PullRequestRecord[], now?: number }} [options]
 */
export function projectRows(records, range, { all = records, now = range.end } = {}) {
  const projects = projectsOf(all)
  const lives = new Map(projects.map((project) => [project, projectLife(project.records, now)]))
  /** @type {(pr: PullRequestRecord) => string} */
  const recordKey = (pr) => `${pr.repo}#${pr.number}`
  const counted = new Set(records.map(recordKey))

  return projects
    .flatMap((project) => {
      const { key, name, run, runs } = project
      const own = all === records ? project.records : project.records.filter((pr) => counted.has(recordKey(pr)))
      const life = /** @type {ProjectLife} */ (lives.get(project))
      const span = spanInRange(life, range)
      if (own.length === 0 || !span) {
        return []
      }
      const namesakes = projects
        .filter((other) => other.name === name && other !== project)
        .map((other) => {
          const { start, end, status } = /** @type {ProjectLife} */ (lives.get(other))

          return { start, end, status }
        })
      const period = computePeriod(own, range)
      /** @type {Map<string, number>} */
      const repos = new Map(project.records.map((pr) => [pr.repo, 0]))
      const authors = period.authors
        .map(({ login, repos: perRepository }) => {
          const tallies = Object.entries(perRepository)
          for (const [repo, stats] of tallies) {
            repos.set(repo, (repos.get(repo) ?? 0) + stats.code)
          }
          /** @type {(field: 'code' | 'merged' | 'added' | 'deleted') => number} */
          const total = (field) => tallies.reduce((sum, [, stats]) => sum + stats[field], 0)

          return { login, code: total('code'), merged: total('merged'), added: total('added'), deleted: total('deleted') }
        })
        .filter((author) => author.code > 0)
        .sort((a, b) => b.code - a.code || a.login.localeCompare(b.login))
      const reviewers = period.reviewers
        .map(({ login, repos: perRepository }) => {
          const tallies = Object.values(perRepository)

          return {
            login,
            prs: tallies.reduce((sum, stats) => sum + stats.prs, 0),
            comments: tallies.reduce((sum, stats) => sum + stats.comments, 0),
          }
        })
        .filter((reviewer) => reviewer.prs > 0)
        .sort((a, b) => b.prs - a.prs || a.login.localeCompare(b.login))
      const code = authors.reduce((total, author) => total + author.code, 0)

      return [
        {
          key,
          name,
          run,
          runs,
          namesakes,
          ...life,
          span,
          code,
          merged: period.totals.merged,
          open: openPullRequests(own).length,
          authors,
          reviewers,
          added: period.totals.added,
          deleted: period.totals.deleted,
          medianTimeToMergeHours: period.totals.medianTimeToMergeHours,
          perWeek: code / Math.max(1, (span.to - span.from) / WEEK_MINUTES),
          repos: [...repos].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
        },
      ]
    })
    .sort((a, b) => a.start - b.start || a.name.localeCompare(b.name) || a.run - b.run)
}

/** @typedef {ReturnType<typeof projectRows>[number]} ProjectRow */

// What the projects of a range (projectRows()) add up to: how many lived within it (active) and started within it, how
// many are under way now, how many were delivered within the range, the code pull requests they carry over the range,
// and, over those delivered, the median days from their start to their delivery and the median integration delay
// (working hours).
/**
 * @param {Pick<ProjectRow, 'start' | 'status' | 'deliveredAt' | 'days' | 'integrationHours' | 'code'>[]} rows
 * @param {Pick<TimeRange, 'start' | 'end'>} range
 */
export function projectSummary(rows, range) {
  /** @param {number | null} at */
  const within = (at) => at !== null && at * MINUTE_MS >= range.start && at * MINUTE_MS < range.end
  const delivered = rows.filter((row) => row.status === 'delivered' && within(row.deliveredAt))

  return {
    active: rows.length,
    started: rows.filter((row) => within(row.start)).length,
    ongoing: rows.filter((row) => row.status === 'ongoing').length,
    delivered: delivered.length,
    code: rows.reduce((total, row) => total + row.code, 0),
    medianDays: median(delivered.map((row) => row.days)),
    medianIntegrationHours: median(delivered.flatMap((row) => (row.integrationHours === null ? [] : [row.integrationHours]))),
  }
}
