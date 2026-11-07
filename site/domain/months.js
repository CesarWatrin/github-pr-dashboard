// Figures month by month: each person's monthly activity and its leaders (the badges), and the reading of a monthly
// series (trends): rolling median, last month against the year before.

import { getOrCreate, median } from './math.js'
import { MINUTE_MS, parisDay } from './time.js'

// The figures of each person's month, those of monthlyActivity().
export const MONTHLY_FIGURES = ['code', 'hotfixes', 'reviewed', 'comments', 'added', 'deleted', 'opened']

// What each person did per Paris month ('YYYY-MM'), whatever the range, for the badges of the team page: code pull
// requests opened and hotfixes among them, pull requests of others reviewed (once a month however many reviews),
// comments left, and the lines added and deleted by their code pull requests merged that month. The month of the merge
// rather than of the opening: the sync keeps a month for good a week after its end, and a pull request merged later
// would miss it. Like the stats of a range, only code pull requests written by people count, but for the pull
// requests opened (opened), which also count those that merge a branch into another: opening them is work too. Releases
// stay out of it all.
export function monthlyActivity(records) {
  const people = new Map()
  const monthOf = (at) => parisDay(at * MINUTE_MS).slice(0, 7)
  const entry = (login, month) =>
    getOrCreate(getOrCreate(people, login, () => new Map()), month, () =>
      Object.fromEntries(MONTHLY_FIGURES.map((key) => [key, 0])),
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
    if (pr.mergedAt !== null) {
      const merged = entry(pr.author, monthOf(pr.mergedAt))
      merged.added += pr.lines - (pr.deleted ?? 0)
      merged.deleted += pr.deleted ?? 0
    }
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

// The top of the team for one figure of a monthly history ({ 'YYYY-MM': { login: figures } }), month by month, oldest
// first: how much, and who did that much, ties sharing it. A month nobody did any of it has no leader.
export function monthlyLeaders(history, key) {
  return Object.keys(history)
    .sort()
    .flatMap((month) => {
      const values = Object.entries(history[month]).map(([login, figures]) => [login, figures[key] ?? 0])
      const best = Math.max(0, ...values.map(([, value]) => value))

      return best > 0
        ? [{ month, value: best, people: values.filter(([, value]) => value === best).map(([login]) => login).sort() }]
        : []
    })
}

// The same month a year earlier ('YYYY-MM').
export const monthYearBefore = (month) => `${Number(month.slice(0, 4)) - 1}${month.slice(4)}`

// The months ('YYYY-MM', among `months`, in order) that a range touches, its start included and its end left out, in
// Paris time: each one counts whole, however little of it the range covers.
export function monthsTouched(months, { start, end }) {
  const first = parisDay(start).slice(0, 7)
  const last = parisDay(end - 1).slice(0, 7)

  return months.filter((month) => month >= first && month <= last)
}

// The median of each value and of the ones just before it, `size` values in all: none until that many follow each
// other, a missing value (null) breaking the run. Smooths the ups and downs of a monthly series without hiding a turn.
export function rollingMedian(values, size) {
  return values.map((_, index) => {
    const run = values.slice(Math.max(0, index - size + 1), index + 1)

    return run.length === size && run.every(Number.isFinite) ? median(run) : null
  })
}

// What a series of whole months, oldest first ([{ month, value }], null for a month without the figure), tells of its
// last month: its value, that of the same month a year earlier (null when the series does not have it), and the median
// of its last `yearMonths` months, the last one included, over the months that have the figure.
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
    yearAgo: Number.isFinite(yearAgo?.value) ? yearAgo.value : null,
    yearMedian: median(recent),
  }
}
