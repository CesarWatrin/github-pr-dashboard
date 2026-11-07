// Whole months of the synced data and their stats, for the monthly report and the trends: the figures each one
// shows, and how two months compare.

import { computeCi } from '../domain/ci.js'
import { isMissing, median } from '../domain/math.js'
import { computePeriod } from '../domain/period.js'
import { parisDay, parisMidnight } from '../domain/time.js'
import { formatDecimal, formatDuration, formatNumber, formatShare } from '../lib/format.js'
import { badgeMonths } from './badges.js'
import { ciStart } from './selection.js'
import { scopedRecords, squadKey } from './squads.js'
import { state } from './state.js'

// The figures of the monthly report, read from { period, ci } of a month, in groups. kind tells how two months compare:
// counts and durations by how much they changed, shares by how many points. better tells which way is good, when one
// is: the change then takes its color.
/**
 * A figure of the report: how to read it from the stats of a month ({ period, ci }), how two months compare (kind),
 * and the way that is better, if any.
 * @typedef {{ label: string, value: (month: { period: any, ci: any }) => number | null, kind: string, better?: string, hint?: string }} ReportFigure
 */

/** @type {{ label: string, figures: ReportFigure[] }[]} */
export const REPORT_GROUPS = [
  {
    label: 'Livraison',
    figures: [
      { label: 'PR ouvertes', value: ({ period }) => period.totals.opened, kind: 'count' },
      { label: 'PR de code mergées', value: ({ period }) => period.totals.merged, kind: 'count' },
      { label: 'Lignes ajoutées', value: ({ period }) => period.totals.added, kind: 'count' },
      { label: 'Lignes supprimées', value: ({ period }) => period.totals.deleted, kind: 'count' },
      { label: 'Délai médian de merge', value: ({ period }) => period.totals.medianTimeToMergeHours, kind: 'duration', better: 'down' },
      { label: 'Déploiements', value: ({ period }) => period.delivery.deployments, kind: 'count' },
      { label: 'Délai médian jusqu’en prod', value: ({ period }) => period.delivery.medianLeadTimeHours, kind: 'duration', better: 'down' },
      { label: 'Part de hotfix', value: ({ period }) => period.totals.hotfixShare, kind: 'share', better: 'down' },
      { label: 'Taux de reprise', value: ({ period }) => period.delivery.reworkRate, kind: 'share', better: 'down' },
    ],
  },
  {
    label: 'Revue',
    figures: [
      { label: 'PR relues', value: ({ period }) => period.totals.reviewed, kind: 'count' },
      {
        label: 'Attente médiane de la 1re review',
        value: ({ period }) => median(period.authors.flatMap((person) => Object.values(person.repos).flatMap((stats) => stats.timesToFirstReviewHours))),
        kind: 'duration',
        better: 'down',
      },
      { label: 'Commentaires par PR relue', value: ({ period }) => period.totals.commentsPerPr, kind: 'decimal' },
      { label: 'Mergées sans review', value: ({ period }) => period.totals.unreviewedShare, kind: 'share', better: 'down' },
    ],
  },
  {
    label: 'Intégration continue',
    figures: [
      { label: 'Exécutions', value: ({ ci }) => ci?.totals.runs, kind: 'count' },
      { label: 'En échec', value: ({ ci }) => ci?.totals.failureRate, kind: 'share', better: 'down' },
      { label: 'PR mergées avec un check rouge', value: ({ period }) => period.totals.checksFailedShare, kind: 'share', better: 'down' },
    ],
  },
  {
    label: 'Équipe',
    figures: [
      { label: 'Auteurs de PR de code', value: ({ period }) => period.authors.filter((person) => Object.values(person.repos).some((stats) => stats.code > 0)).length, kind: 'count' },
      { label: 'Relecteurs', value: ({ period }) => period.reviewers.filter((person) => Object.values(person.repos).some((stats) => stats.prs > 0)).length, kind: 'count' },
    ],
  },
]
export const REPORT_FORMATS = { count: formatNumber, duration: formatDuration, share: formatShare, decimal: formatDecimal }
// A month of the report is set against the median of this many last whole months.
export const REPORT_YEAR_MONTHS = 12

const nextMonthOf = (month) => {
  const [year, number] = month.split('-').map(Number)

  return number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, '0')}`
}

// The months a report can cover: the whole months of the synced data, then the current one, unfinished.
export function reportMonths() {
  return [...badgeMonths(), parisDay(Date.parse(state.stats.generatedAt)).slice(0, 7)]
}

// The stats of a month, worked out once per stats and squad: those of a period and of the CI over its Paris days, up to
// the last sync for the current month. The CI stays that of the whole organization: no run belongs to a squad.
export function monthStats(month) {
  if (state.reportCache?.stats !== state.stats) {
    state.reportCache = { stats: state.stats, months: new Map() }
  }
  const { months } = state.reportCache
  const key = `${squadKey()}:${month}`
  if (!months.has(key)) {
    const range = {
      start: parisMidnight(`${month}-01`),
      end: Math.min(parisMidnight(`${nextMonthOf(month)}-01`), Date.parse(state.stats.generatedAt)),
      bucket: 'week',
    }
    // A month the runs do not cover whole has no CI: GitHub had forgotten its runs.
    const ci = range.start >= ciStart() ? computeCi(state.stats.ci ?? [], range) : null
    months.set(key, { period: computePeriod(scopedRecords(), range), ci })
  }

  return months.get(key)
}

// How a figure changed from one month to the next: by how much for counts and durations, by how many points for
// shares; and whether that is for the better, when the figure has a better way.
export function reportChange(figure, value, previous) {
  if (isMissing(value) || isMissing(previous)) {
    return null
  }
  const sign = (amount) => (amount > 0 ? '+' : amount < 0 ? '−' : '')
  let text
  if (figure.kind === 'share') {
    const points = Math.round((value - previous) * 100)
    text = `${sign(points)}${Math.abs(points)} pt${Math.abs(points) > 1 ? 's' : ''}`
  } else if (previous === 0) {
    return null
  } else {
    const percent = Math.round(((value - previous) / previous) * 100)
    text = `${sign(percent)}${formatNumber(Math.abs(percent))} %`
  }
  const direction = Math.sign(value - previous)
  const tone = !figure.better || direction === 0 ? 'neutral' : (direction < 0) === (figure.better === 'down') ? 'better' : 'worse'

  return { text, tone }
}

// The figures of the trends page, those of the monthly report, two by two: delivery, review, production, quality.
export const REPORT_FIGURES = new Map(REPORT_GROUPS.flatMap((group) => group.figures).map((figure) => [figure.label, figure]))

export const monthReady = (month) => state.reportCache?.stats === state.stats && state.reportCache.months.has(`${squadKey()}:${month}`)
