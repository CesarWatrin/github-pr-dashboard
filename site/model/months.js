// Whole months of the synced data and their stats, for the monthly report and the trends: the figures each one
// shows, and how two months compare.

import { acSummary } from '../domain/acs.js'
import { computeCi } from '../domain/ci.js'
import { isMissing, median } from '../domain/math.js'
import { computePeriod } from '../domain/period.js'
import { projectRows, projectSummary } from '../domain/projects.js'
import { parisDay, parisMidnight } from '../domain/time.js'
import { formatDecimal, formatDuration, formatNumber, formatShare, formatSpan } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { acsFor } from './acs.js'
import { badgeMonths } from './badges.js'
import { withCodeShare } from './projects.js'
import { ciStart } from './selection.js'
import { scopedRecords, squadKey } from './squads.js'
import { loadedStats, state } from './state.js'

// The figures of the monthly report, read from { period, ci, projects } of a month, in groups. kind tells how two months
// compare: counts and durations (working time, or on the calendar: span) by how much they changed, shares by how many
// points. better tells which way is good, when one
// is: the change then takes its color.
/**
 * @typedef {'count' | 'duration' | 'span' | 'share' | 'decimal'} FigureKind
 * @typedef {{ label: string, value: (month: MonthStats) => number | null | undefined, kind: FigureKind, better?: 'up' | 'down' }} ReportFigure
 */

/** @type {{ label: string, figures: ReportFigure[] }[]} */
const GROUPS = [
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
    label: 'Projets',
    figures: [
      { label: 'Projets actifs', value: ({ projects }) => projects.active, kind: 'count' },
      { label: 'Projets démarrés', value: ({ projects }) => projects.started, kind: 'count' },
      { label: 'Projets livrés', value: ({ projects }) => projects.delivered, kind: 'count' },
      { label: 'Durée médiane des projets livrés', value: ({ projects }) => projects.medianDays, kind: 'span' },
      { label: 'PR de code sur des projets', value: ({ projects }) => projects.codeShare, kind: 'share' },
    ],
  },
  {
    label: 'Améliorations continues',
    figures: [
      { label: 'AC démarrées', value: ({ acs }) => acs.started, kind: 'count' },
      { label: 'AC livrées', value: ({ acs }) => acs.delivered, kind: 'count' },
      { label: 'Délai médian des AC jusqu’au merge', value: ({ acs }) => acs.medianTimeToMergeHours, kind: 'duration', better: 'down' },
      { label: 'PR de code en AC', value: ({ acs }) => acs.codeShare, kind: 'share' },
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
// The figures of the monthly report, by their French label, which the trends page picks its own by; each shows its
// label in the language of the page.
/** @type {Map<string, ReportFigure>} */
export const REPORT_FIGURES = new Map(GROUPS.flatMap((group) => group.figures).map((figure) => [figure.label, { ...figure, label: t(figure.label) }]))
// The groups of the report, their figures those of REPORT_FIGURES.
export const REPORT_GROUPS = GROUPS.map((group) => ({
  label: t(group.label),
  figures: group.figures.map((figure) => /** @type {ReportFigure} */ (REPORT_FIGURES.get(figure.label))),
}))
/** @type {Record<FigureKind, (value: number | null | undefined) => string>} */
export const REPORT_FORMATS = { count: formatNumber, duration: formatDuration, span: formatSpan, share: formatShare, decimal: formatDecimal }
// A month of the report is set against the median of this many last whole months.
export const REPORT_YEAR_MONTHS = 12

/** @type {(month: string) => string} */
const nextMonthOf = (month) => {
  const [year, number] = month.split('-').map(Number)

  return number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, '0')}`
}

// The months a report can cover: the whole months of the synced data, then the current one, unfinished.
/** @returns {string[]} */
export function reportMonths() {
  return [...badgeMonths(), parisDay(Date.parse(loadedStats().generatedAt)).slice(0, 7)]
}

// The Paris days of a month, up to the last sync for the current one.
/**
 * @param {string} month 'YYYY-MM'
 * @returns {Pick<TimeRange, 'start' | 'end'>}
 */
export function monthRange(month) {
  return {
    start: parisMidnight(`${month}-01`),
    end: Math.min(parisMidnight(`${nextMonthOf(month)}-01`), Date.parse(loadedStats().generatedAt)),
  }
}

// The pull requests a person opened, worked out once per stats and person: what the report of one person counts.
/** @type {WeakMap<Stats, Map<string, PullRequestRecord[]>>} */
const personRecordsByStats = new WeakMap()

/**
 * @param {string} login
 * @returns {PullRequestRecord[]}
 */
export function personRecords(login) {
  const stats = loadedStats()
  const byLogin = personRecordsByStats.get(stats) ?? new Map()
  personRecordsByStats.set(stats, byLogin)
  if (!byLogin.has(login)) {
    byLogin.set(
      login,
      stats.pullRequests.filter((pr) => pr.author === login),
    )
  }

  return /** @type {PullRequestRecord[]} */ (byLogin.get(login))
}

// The stats of a month, worked out once per stats and squad, or person: those of a period, of the CI and of the projects
// over its Paris days, up to the last sync for the current month. The CI stays that of the whole organization: no run
// belongs to a squad, and a person has none. The projects are those whose life meets the month (projectRows()), with
// what they add up to; for a person, only those worked on in the month: a code pull request opened in it, or one
// delivered in it. And what its AC add up to (acSummary()).
/**
 * @param {string} month 'YYYY-MM'
 * @param {string | null} [login] a person, for their own report: the pull requests they opened
 * @returns {MonthStats}
 */
export function monthStats(month, login = null) {
  const stats = loadedStats()
  if (state.reportCache?.stats !== stats) {
    state.reportCache = { stats, months: new Map() }
  }
  const { months } = state.reportCache
  const key = `${login ? `@${login}` : squadKey()}:${month}`
  if (!months.has(key)) {
    /** @type {TimeRange} */
    const range = { ...monthRange(month), bucket: 'week' }
    const records = login ? personRecords(login) : scopedRecords()
    // A month the runs do not cover whole has no CI: GitHub had forgotten its runs.
    const ci = !login && range.start >= ciStart() ? computeCi(stats.ci ?? [], range) : null
    const period = computePeriod(records, range)
    /** @param {number | null} at minutes */
    const within = (at) => at !== null && at * 60_000 >= range.start && at * 60_000 < range.end
    const rows = projectRows(records, range, { all: stats.pullRequests, now: Date.parse(stats.generatedAt) }).filter(
      (row) => !login || row.code > 0 || (row.status === 'delivered' && within(row.deliveredAt)),
    )
    months.set(key, {
      period,
      ci,
      projects: { ...withCodeShare(projectSummary(rows, range), period), rows },
      acs: withCodeShare(acSummary(acsFor(records), range), period),
    })
  }

  return /** @type {MonthStats} */ (months.get(key))
}

// How a figure changed from one month to the next: by how much for counts and durations, by how many points for
// shares; and whether that is for the better, when the figure has a better way.
/**
 * @param {{ kind: string, better?: string }} figure
 * @param {number | null | undefined} value
 * @param {number | null | undefined} previous
 * @returns {{ text: string, tone: 'neutral' | 'better' | 'worse' } | null}
 */
export function reportChange(figure, value, previous) {
  if (isMissing(value) || isMissing(previous)) {
    return null
  }
  /** @param {number} amount */
  const sign = (amount) => (amount > 0 ? '+' : amount < 0 ? '−' : '')
  let text
  if (figure.kind === 'share') {
    const points = Math.round((value - previous) * 100)
    text = t(Math.abs(points) > 1 ? '{sign}{value} pts' : '{sign}{value} pt', { sign: sign(points), value: Math.abs(points) })
  } else if (previous === 0) {
    return null
  } else {
    const percent = Math.round(((value - previous) / previous) * 100)
    text = t('{sign}{value} %', { sign: sign(percent), value: formatNumber(Math.abs(percent)) })
  }
  const direction = Math.sign(value - previous)
  const tone = !figure.better || direction === 0 ? 'neutral' : (direction < 0) === (figure.better === 'down') ? 'better' : 'worse'

  return { text, tone }
}

/** @type {(month: string) => boolean} */
export const monthReady = (month) => state.reportCache?.stats === state.stats && state.reportCache.months.has(`${squadKey()}:${month}`)
