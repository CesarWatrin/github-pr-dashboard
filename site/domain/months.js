// Figures month by month: each person's monthly activity and its leaders (the badges), and the reading of a monthly
// series (trends): rolling median, last month against the year before.

import { getOrCreate, median } from './math.js'
import { projectsOf } from './projects.js'
import { MINUTE_MS, parisDay } from './time.js'

// The figures of each person's month, those of monthlyActivity().
/** @type {(keyof MonthlyFigures)[]} */
export const MONTHLY_FIGURES = ['code', 'hotfixes', 'reviewed', 'comments', 'added', 'deleted', 'opened', 'projects']

// What each person did per Paris month ('YYYY-MM'), whatever the range, for the badges of the team page: code pull
// requests opened, hotfixes among them and those of a project (projectsOf(): one with a few code pull requests, a branch
// made by mistake aside), pull requests of others reviewed (once a month however many reviews),
// comments left, and the lines added and deleted by their code pull requests merged that month. The month of the merge
// rather than of the opening: the sync keeps a month for good a week after its end, and a pull request merged later
// would miss it. Like the stats of a range, only code pull requests written by people count, but for the pull
// requests opened (opened), which also count those that merge a branch into another: opening them is work too. Releases
// stay out of it all.
/**
 * @param {PullRequestRecord[]} records
 * @returns {Map<string, Map<string, MonthlyFigures>>}
 */
export function monthlyActivity(records) {
  /** @type {Map<string, Map<string, MonthlyFigures>>} */
  const people = new Map()
  const onProjects = new Set(projectsOf(records).flatMap((project) => project.records))
  /** @param {number} at */
  const monthOf = (at) => parisDay(at * MINUTE_MS).slice(0, 7)
  /**
   * @param {string} login
   * @param {string} month
   */
  const entry = (login, month) =>
    getOrCreate(getOrCreate(people, login, () => new Map()), month, () =>
      // Every figure of MONTHLY_FIGURES, at zero.
      /** @type {MonthlyFigures} */ (/** @type {unknown} */ (Object.fromEntries(MONTHLY_FIGURES.map((key) => [key, 0])))),
    )
  for (const pr of records) {
    if (pr.bot || !['code', 'integration'].includes(pr.kind)) {
      continue
    }
    const opened = entry(pr.author, monthOf(pr.createdAt))
    opened.opened++
    if (pr.kind !== 'code') {
      continue
    }
    opened.code++
    if (pr.hotfix) {
      opened.hotfixes++
    }
    if (onProjects.has(pr)) {
      opened.projects++
    }
    if (pr.mergedAt !== null) {
      const merged = entry(pr.author, monthOf(pr.mergedAt))
      merged.added += pr.lines - (pr.deleted ?? 0)
      merged.deleted += pr.deleted ?? 0
    }
    /** @type {Set<string>} */
    const reviewed = new Set()
    for (const [login, at, , comments] of pr.interventions) {
      const month = monthOf(at)
      const stats = entry(login, month)
      if (!reviewed.has(`${login}\n${month}`)) {
        reviewed.add(`${login}\n${month}`)
        stats.reviewed++
      }
      stats.comments += comments
    }
  }

  return people
}

// A month of a monthly history kept before some of the figures of monthlyActivity() existed: none of its people has
// them all.
/** @type {(kept: MonthlyHistory[string]) => boolean} */
export const isOutdated = (kept) =>
  Object.keys(kept).length > 0 && Object.values(kept).every((figures) => MONTHLY_FIGURES.some((key) => !(key in figures)))

// Such a month with the figures it lacks, worked out again from the records (worked): the figures it kept stay, and the
// people only those new figures name join it.
/**
 * @param {MonthlyHistory[string]} kept
 * @param {MonthlyHistory[string]} worked
 * @returns {MonthlyHistory[string]}
 */
export const withNewFigures = (kept, worked) =>
  Object.fromEntries(
    [...new Set([...Object.keys(kept), ...Object.keys(worked)])].sort((a, b) => a.localeCompare(b)).map((login) => [login, { ...worked[login], ...kept[login] }]),
  )

// The top of the team for one figure of a monthly history ({ 'YYYY-MM': { login: figures } }), month by month, oldest
// first: how much, and who did that much, ties sharing it. A month nobody did any of it has no leader.
/**
 * @param {MonthlyHistory} history
 * @param {keyof MonthlyFigures} key
 */
export function monthlyLeaders(history, key) {
  return Object.keys(history)
    .sort()
    .flatMap((month) => {
      /** @type {[string, number][]} */
      const values = Object.entries(history[month]).map(([login, figures]) => [login, figures[key] ?? 0])
      const best = Math.max(0, ...values.map(([, value]) => value))

      return best > 0
        ? [{ month, value: best, people: values.filter(([, value]) => value === best).map(([login]) => login).sort() }]
        : []
    })
}

// The same month a year earlier ('YYYY-MM').
/** @param {string} month */
export const monthYearBefore = (month) => `${Number(month.slice(0, 4)) - 1}${month.slice(4)}`

// The months ('YYYY-MM', among `months`, in order) that a range touches, its start included and its end left out, in
// Paris time: each one counts whole, however little of it the range covers.
/**
 * @param {string[]} months
 * @param {{ start: number, end: number }} range
 */
export function monthsTouched(months, { start, end }) {
  const first = parisDay(start).slice(0, 7)
  const last = parisDay(end - 1).slice(0, 7)

  return months.filter((month) => month >= first && month <= last)
}

// The median of each value and of the ones just before it, `size` values in all: none until that many follow each
// other, a missing value (null) breaking the run. Smooths the ups and downs of a monthly series without hiding a turn.
/**
 * @param {(number | null)[]} values
 * @param {number} size
 */
export function rollingMedian(values, size) {
  return values.map((_, index) => {
    const run = values.slice(Math.max(0, index - size + 1), index + 1)

    return run.length === size && run.every(Number.isFinite) ? median(/** @type {number[]} */ (run)) : null
  })
}

// What a series of whole months, oldest first ([{ month, value }], null for a month without the figure), tells of its
// last month: its value, that of the same month a year earlier (null when the series does not have it), and the median
// of its last `yearMonths` months, the last one included, over the months that have the figure.
/**
 * @param {{ month: string, value: number | null }[]} points
 * @param {number} [yearMonths]
 */
export function lastMonthSummary(points, yearMonths = 12) {
  const last = points.at(-1)
  if (!last) {
    return null
  }
  const yearAgo = points.find((point) => point.month === monthYearBefore(last.month))
  const recent = points
    .slice(-yearMonths)
    .map((point) => point.value)
    .filter(Number.isFinite)

  return {
    month: last.month,
    value: Number.isFinite(last.value) ? last.value : null,
    yearAgo: Number.isFinite(yearAgo?.value) ? /** @type {{ value: number }} */ (yearAgo).value : null,
    yearMedian: median(/** @type {number[]} */ (recent)),
  }
}
