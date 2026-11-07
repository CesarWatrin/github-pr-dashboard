// Tendances: the key figures month after month, each against its rolling median and the year before.

import { isMissing } from '../domain/math.js'
import { lastMonthSummary, monthsTouched, monthYearBefore, rollingMedian } from '../domain/months.js'
import { parisMidnight } from '../domain/time.js'
import { capitalize, dateFormat, formatNumber, monthName, plural } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import {
  monthReady,
  monthStats,
  REPORT_FIGURES,
  REPORT_FORMATS,
  REPORT_YEAR_MONTHS,
  reportChange,
  reportMonths,
} from '../model/months.js'
import { currentRoute } from '../model/routes.js'
import { ciStart, periodRange, periodTitle } from '../model/selection.js'
import { squadKey } from '../model/squads.js'
import { state } from '../model/state.js'
import { dataTable } from '../ui/charts/data-table.js'
import { lineChart } from '../ui/charts/line-chart.js'
import { $, el } from '../ui/dom.js'

const TREND_FIGURES = [
  REPORT_FIGURES.get('PR de code mergées'),
  REPORT_FIGURES.get('Délai médian de merge'),
  REPORT_FIGURES.get('Attente médiane de la 1re review'),
  REPORT_FIGURES.get('Commentaires par PR relue'),
  REPORT_FIGURES.get('Délai médian jusqu’en prod'),
  REPORT_FIGURES.get('Taux de reprise'),
  REPORT_FIGURES.get('Part de hotfix'),
  { ...REPORT_FIGURES.get('En échec'), label: t('CI en échec'), ci: true },
]
// A month's rolling median covers it and the months just before it, this many in all.
const TREND_ROLLING_MONTHS = 3
const TREND_SERIES = [
  { key: 'value', label: t('Mois'), color: 'var(--series-1)' },
  { key: 'rolling', label: t('Médiane sur {count} mois', { count: TREND_ROLLING_MONTHS }), color: 'var(--series-2)' },
]

// How the latest whole month of a trend compares, the change colored when the figure has a better way.
function trendComparison(figure, value, against, text) {
  const change = reportChange(figure, value, against)

  return el(
    'li',
    {},
    change ? el('span', { className: `report-change is-${change.tone}`, textContent: change.text }) : el('span', { className: 'muted', textContent: '–' }),
    el('span', { textContent: text }),
  )
}

// Why the CI of a period that starts earlier has no figure for its first months: GitHub forgets the runs after about
// 13 months, and the dashboard only keeps them itself since ciStart. A month counts from the first one the runs cover
// whole, as monthStats() does. Nothing when the period starts after it.
function ciTrendNote(months, shown) {
  const first = months.find((month) => parisMidnight(`${month}-01`) >= ciStart())
  if (!first || shown[0] >= first) {
    return []
  }

  return [
    el('p', {
      className: 'card-note',
      textContent: t(
        'Pas de chiffre avant {month} : GitHub efface les exécutions de CI après environ 13 mois, et le dashboard ne les garde lui-même que depuis le {date}. L’historique s’allonge d’un mois chaque mois.',
        { month: monthName(first), date: dateFormat.format(ciStart()) },
      ),
    }),
  ]
}

// One card per figure, over the months of the period (shown): the latest whole one against the same month a year
// earlier and the median of the whole months up to it, then the chart and its data. The rolling median and these
// comparisons read the months before the period when they need them: every month of the data (months) is worked out.
// Returns the card and how to draw its chart once it is on the page.
function trendCard(figure, months, shown) {
  const format = REPORT_FORMATS[figure.kind]
  const current = months.at(-1)
  const value = (month) => {
    const figureValue = figure.value(monthStats(month))

    return isMissing(figureValue) ? null : figureValue
  }
  const whole = months.slice(0, -1).map((month) => ({ month, value: value(month) }))
  const rolling = rollingMedian(
    whole.map((point) => point.value),
    TREND_ROLLING_MONTHS,
  )
  const rollingOf = new Map(whole.map((point, index) => [point.month, rolling[index]]))
  const points = shown.map((month) =>
    month === current ? { key: month, value: value(month), rolling: null, partial: true } : { key: month, value: value(month), rolling: rollingOf.get(month) },
  )
  const lastWhole = shown.findLast((month) => month !== current)
  const upToLast = lastWhole ? whole.slice(0, whole.findIndex((point) => point.month === lastWhole) + 1) : []
  const summary = lastMonthSummary(upToLast, REPORT_YEAR_MONTHS)
  const yearBefore = summary ? monthYearBefore(summary.month) : null
  // The CI does not go back as far: its median may rest on fewer months.
  const medianMonths = upToLast.slice(-REPORT_YEAR_MONTHS).filter((point) => Number.isFinite(point.value)).length

  const chart = el('div', { className: 'chart chart-trend' })
  const table = el('div', { className: 'table-wrap' })
  dataTable(
    table,
    [t('Mois'), TREND_SERIES[0].label, TREND_SERIES[1].label],
    points
      .toReversed()
      .map((point) => [
        point.partial ? t('{month} (en cours)', { month: capitalize(monthName(point.key)) }) : capitalize(monthName(point.key)),
        format(point.value),
        format(point.rolling),
      ]),
  )
  const card = el(
    'section',
    { className: 'card trend-card' },
    el('h2', { textContent: figure.label }),
    summary
      ? el(
          'p',
          { className: 'trend-head' },
          el('strong', { className: 'trend-value', textContent: format(summary.value) }),
          el('span', { textContent: t('en {month}', { month: monthName(summary.month) }) }),
        )
      : el('p', { className: 'card-sub', textContent: t('Pas de mois complet sur la période') }),
    summary
      ? el(
          'ul',
          { className: 'trend-changes' },
          trendComparison(
            figure,
            summary.value,
            summary.yearAgo,
            t('sur un an ({value} en {month})', {
              value: isMissing(summary.yearAgo) ? t('pas de chiffre') : format(summary.yearAgo),
              month: monthName(yearBefore),
            }),
          ),
          trendComparison(
            figure,
            summary.value,
            summary.yearMedian,
            t('face à la médiane sur {count} mois ({value})', { count: formatNumber(medianMonths), value: format(summary.yearMedian) }),
          ),
        )
      : '',
    chart,
    ...(figure.ci ? ciTrendNote(months, shown) : []),
    el('details', { className: 'chart-data' }, el('summary', { textContent: t('Voir les données du graphique') }), table),
  )
  const ariaLabel = t('{figure}, mois par mois, de {from} à {to}, et sa médiane sur {count} mois', {
    figure: figure.label,
    from: monthName(shown[0]),
    to: monthName(shown.at(-1)),
    count: TREND_ROLLING_MONTHS,
  })

  return { card, draw: () => lineChart(chart, { points, series: TREND_SERIES, kind: figure.kind, format, ariaLabel }) }
}

// The months of the trends page, every one of the synced data, take a while to work out the first time: a month at a
// time, so that the page stays responsive. Resolves to false when newer stats came in the meantime.
async function prepareTrendMonths(months) {
  const stats = state.stats
  for (const month of months) {
    if (state.stats !== stats) {
      return false
    }
    monthStats(month)
    await new Promise((resolve) => setTimeout(resolve))
  }

  return state.stats === stats
}

// Below this many months, a period says too little of a trend: the page says so.
const TREND_FEW_MONTHS = 6

// Only when the page shows: its cards are built once per stats and period, their charts drawn again as the page
// resizes. Every month of the data is worked out, whatever the period: the comparisons may need the months before it.
export function renderTrends() {
  if (!state.stats || currentRoute() !== 'trends') {
    return
  }
  const months = reportMonths()
  const status = $('[data-trends-status]')
  if (!months.every(monthReady)) {
    // New stats keep the cards of the previous ones in the meantime.
    status.hidden = Boolean(state.trendsCards)
    status.textContent = t('Calcul des tendances, mois par mois…')
    // Once per stats and squad: the months of another squad are other stats.
    const preparing = `${squadKey()}`
    if (state.trendsPreparing?.stats !== state.stats || state.trendsPreparing.squad !== preparing) {
      state.trendsPreparing = { stats: state.stats, squad: preparing }
      prepareTrendMonths(months).then((done) => done && renderTrends())
    }
    return
  }
  const range = periodRange()
  const key = `${range.start}:${range.end}:${squadKey()}`
  const shown = monthsTouched(months, range)
  status.hidden = shown.length > 0
  // Only the first month of the data, cut by its start: no whole month to show.
  status.textContent = t('Aucun mois complet des données sur la période : choisissez une période plus longue.')

  if (state.trendsCards?.stats !== state.stats || state.trendsCards.key !== key) {
    const current = months.at(-1)
    const whole = shown.filter((month) => month !== current)
    const ciFrom = months.find((month) => monthStats(month).ci)
    $('[data-trends-title]').textContent = capitalize(periodTitle())
    // « D’avril », « D’août », « D’octobre » : de elides before a vowel.
    const from = (month) =>
      /^[aeiou]/.test(monthName(month)) ? t('D’{month}', { month: monthName(month) }) : t('De {month}', { month: monthName(month) })
    const then = shown.includes(current) ? t(', puis {month} en cours', { month: monthName(current) }) : ''
    $('[data-trends-sub]').textContent = [
      whole.length > 1 ? t('{from} à {to}{then}.', { from: from(whole[0]), to: monthName(whole.at(-1)), then }) : '',
      whole.length === 1 ? `${capitalize(monthName(whole[0]))}${then}.` : '',
      whole.length === 0 && shown.length ? t('{month} en cours.', { month: capitalize(monthName(current)) }) : '',
      shown.length && shown.length < TREND_FEW_MONTHS
        ? t('{months} seulement : une tendance se lit mieux sur 12 mois ou plus.', { months: capitalize(plural(shown.length, 'mois', 'mois')) })
        : '',
      ciFrom && shown.length && shown[0] < ciFrom
        ? t('L’intégration continue commence en {month} : GitHub oublie ses exécutions après environ 13 mois.', { month: monthName(ciFrom) })
        : '',
    ]
      .filter(Boolean)
      .join(' ')
    $('[data-trends-legend]').replaceChildren(
      ...TREND_SERIES.map((item) => {
        const key = el('span', { className: 'line-key' })
        key.style.background = item.color

        return el('span', {}, key, document.createTextNode(item.label))
      }),
    )
    const cards = shown.length ? TREND_FIGURES.map((figure) => trendCard(figure, months, shown)) : []
    $('[data-trends]').replaceChildren(...cards.map(({ card }) => card))
    state.trendsCards = { stats: state.stats, key, cards }
  }
  for (const { draw } of state.trendsCards.cards) {
    draw()
  }
}
