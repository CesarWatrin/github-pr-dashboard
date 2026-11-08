// The projects of the records: the code pull requests the sync tied to a project (project), and the merges of its
// branch, project/<name>/main, into a long-lived branch (projectMerge), grouped by name whatever the repository. What
// each project is over the whole data, its life (start, merges, last activity, status), and its figures over a range,
// those of computePeriod() over its pull requests.

import { getOrCreate, median } from './math.js'
import { openPullRequests } from './open-pull-requests.js'
import { computePeriod } from './period.js'
import { DAY_MS, MINUTE_MS, workHoursBetween } from './time.js'

// A project without any activity for this long, its branch not merged since its last pull request, has stalled.
export const STALLED_AFTER_DAYS = 30
const WEEK_MINUTES = 7 * 24 * 60
const DAY_MINUTES = DAY_MS / MINUTE_MS

/** @typedef {'ongoing' | 'delivered' | 'stalled'} ProjectStatus */

// The records of each project, by name, those of people only: a project of the same name in several repositories is
// one project.
/**
 * @param {PullRequestRecord[]} records
 * @returns {Map<string, PullRequestRecord[]>}
 */
export function recordsByProject(records) {
  /** @type {Map<string, PullRequestRecord[]>} */
  const projects = new Map()
  for (const pr of records) {
    if (pr.project && !pr.bot) {
      getOrCreate(projects, pr.project, () => []).push(pr)
    }
  }

  return projects
}

/**
 * A project over the whole data, from all its records, times in minutes since the epoch. start: its first pull request
 * opened. merges: the pull requests that merged its branch into a long-lived branch, and when, oldest first; mergeOpen:
 * such a merge still waits. lastActivity: its latest pull request opened or merged, review or comment. deliveredAt: its last merge, when
 * no pull request of the project was opened after it (one opened after brings it back to work). end: delivered, else
 * its last activity. status at now (milliseconds): delivered, else stalled after STALLED_AFTER_DAYS without activity,
 * else ongoing. days: from its start to its end, on the calendar. integrationHours: the working hours from the last
 * code pull request merged before its last merge to that merge, null without either.
 * @param {PullRequestRecord[]} records
 * @param {number} now
 */
export function projectLife(records, now) {
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
  /** @type {ProjectStatus} */
  const status = deliveredAt !== null ? 'delivered' : now - lastActivity * MINUTE_MS > STALLED_AFTER_DAYS * DAY_MS ? 'stalled' : 'ongoing'
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
    deliveredAt,
    status,
    days: (end - start) / DAY_MINUTES,
    integrationHours: lastMerge !== null && lastFeatureMerge !== null ? workHoursBetween(lastFeatureMerge, lastMerge) : null,
  }
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

// The code pull requests opened in each week of a span (minutes), the first week starting with it: how busy a project
// was along its bar.
/**
 * @param {PullRequestRecord[]} records
 * @param {number} from
 * @param {number} to
 * @returns {number[]}
 */
export function weeklyOpened(records, from, to) {
  const counts = Array.from({ length: Math.max(1, Math.ceil((to - from) / WEEK_MINUTES)) }, () => 0)
  for (const pr of records) {
    if (pr.kind === 'code' && pr.createdAt >= from && pr.createdAt <= to) {
      counts[Math.min(counts.length - 1, Math.floor((pr.createdAt - from) / WEEK_MINUTES))]++
    }
  }

  return counts
}

/**
 * The projects whose span meets a range, the earliest started first: their life over all the records (all, every
 * person's: the start, the merges and the status are the project's whatever the squad), and their figures over the
 * range from the records counted (records, a squad's say), as computePeriod() counts them. code: the code pull requests
 * opened over the range; merged: those of them merged; open: those still open, drafts aside; authors, with their code
 * pull requests, those merged and their lines, and reviewers, with the pull requests they reviewed and their comments,
 * the busiest first; added and deleted lines; the median time to merge; perWeek: the code pull requests opened a week
 * while the project was under way within the range; repos: every repository of the project, by its code pull requests
 * over the range; weeks: the code pull requests opened each week of its span within the range.
 * @param {PullRequestRecord[]} records
 * @param {TimeRange} range
 * @param {{ all?: PullRequestRecord[], now?: number }} [options]
 */
export function projectRows(records, range, { all = records, now = range.end } = {}) {
  const counted = recordsByProject(records)
  const whole = all === records ? counted : recordsByProject(all)

  return [...counted]
    .flatMap(([name, own]) => {
      const project = whole.get(name) ?? own
      const life = projectLife(project, now)
      const span = spanInRange(life, range)
      if (!span) {
        return []
      }
      const period = computePeriod(own, range)
      /** @type {Map<string, number>} */
      const repos = new Map(project.map((pr) => [pr.repo, 0]))
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
          name,
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
          weeks: weeklyOpened(project, span.from, span.to),
        },
      ]
    })
    .sort((a, b) => a.start - b.start || a.name.localeCompare(b.name))
}

/** @typedef {ReturnType<typeof projectRows>[number]} ProjectRow */

// What the projects of a range add up to: how many are under way now, how many were delivered within the range, and,
// over these, the median days from their start to their delivery and the median integration delay (working hours).
/**
 * @param {Pick<ProjectRow, 'status' | 'deliveredAt' | 'days' | 'integrationHours'>[]} rows
 * @param {Pick<TimeRange, 'start' | 'end'>} range
 */
export function projectSummary(rows, range) {
  const delivered = rows.filter(
    (row) => row.status === 'delivered' && row.deliveredAt !== null && row.deliveredAt * MINUTE_MS >= range.start && row.deliveredAt * MINUTE_MS < range.end,
  )

  return {
    ongoing: rows.filter((row) => row.status === 'ongoing').length,
    delivered: delivered.length,
    medianDays: median(delivered.map((row) => row.days)),
    medianIntegrationHours: median(delivered.flatMap((row) => (row.integrationHours === null ? [] : [row.integrationHours]))),
  }
}
