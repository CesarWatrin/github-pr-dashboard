// The chart of a person's monthly report: their code pull requests month by month, beside those of a project, of the TMA
// and of an AC, each counting once as « Où va l’effort » counts them (personEffortMonths()); under it, the projects of
// the month picked on it (personMonthProjects()), the month shown until another is clicked; its data as a table. Its
// card hides for the team.

import { formatNumber, monthName, plural } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { displayName } from '../../model/people.js'
import { personEffortMonths, personMonthProjects } from '../../model/person-report.js'
import { bucketTitle } from '../../ui/charts/axis.js'
import { columnChart } from '../../ui/charts/column-chart.js'
import { dataTable } from '../../ui/charts/data-table.js'
import { $, el } from '../../ui/dom.js'
import { EFFORT_SERIES } from '../../ui/effort.js'
import { renderList } from '../../ui/list.js'
import { projectLink } from '../../ui/projects.js'

/** @typedef {import('../../domain/effort.js').EffortPoint} EffortPoint */

// A kind of work as « Où va l’effort » shows it, its label and color.
/** @param {import('../../domain/effort.js').EffortKind} key */
const kindOf = (key) => {
  const { label, color } = EFFORT_SERIES.find((kind) => kind.key === key)

  return { label, color, value: (/** @type {EffortPoint} */ point) => point.counts[key] }
}

// All their code pull requests, in the grey of the whole, then the projects, the TMA and the AC among them, in their
// colors of « Où va l’effort ».
/** @type {{ label: string, color: string, value: (point: EffortPoint) => number }[]} */
export const REPORT_CHART_SERIES = [
  { label: t('PR de code'), color: 'var(--text-muted)', value: (point) => point.code },
  kindOf('projects'),
  kindOf('tma'),
  kindOf('acs'),
]

/** @type {(point: EffortPoint) => string} */
const monthTitle = (point) =>
  point.partial ? t('{bucket} (incomplète)', { bucket: bucketTitle(point.key, 'month') }) : bucketTitle(point.key, 'month')

// The month picked on the chart, for the person and the month shown it was picked for: another of them shows its month.
/** @type {{ person: string, month: string, key: string } | null} */
let picked = null

// The projects of a person over a month of the chart, each with its code pull requests.
/**
 * @param {string} person
 * @param {string} key
 */
function renderMonthProjects(person, key) {
  $('[data-report-chart-projects-title]').textContent = t('Ses projets en {month}', { month: monthName(key) })
  renderList(
    $('[data-report-chart-projects]'),
    personMonthProjects(key, person).map(({ row, code }) =>
      el('li', {}, projectLink(row), el('span', { className: 'pair-count', textContent: plural(code, 'PR de code', 'PR de code') })),
    ),
    t('Aucun projet ce mois-ci'),
  )
}

// The card of the person picked, for the month shown: drawn as wide as it, so again as the page resizes. Without anyone,
// the card hides and empties.
/**
 * @param {string | null} person
 * @param {string} month
 */
export function renderReportChart(person, month) {
  $('[data-report-chart-card]').hidden = !person
  const chart = $('[data-report-chart]')
  const table = $('[data-report-chart-table]')
  if (!person) {
    chart.replaceChildren()
    table.replaceChildren()
    $('[data-report-chart-projects]').replaceChildren()

    return
  }
  const points = personEffortMonths(month, person)
  if (picked?.person !== person || picked.month !== month || !points.some((point) => point.key === picked?.key)) {
    picked = { person, month, key: month }
  }
  renderMonthProjects(person, picked.key)
  dataTable(
    table,
    [t('Mois'), ...REPORT_CHART_SERIES.map((series) => series.label), t('Le reste')],
    points
      .toReversed()
      .map((point) => [monthTitle(point), ...REPORT_CHART_SERIES.map((series) => formatNumber(series.value(point))), formatNumber(point.counts.rest)]),
  )
  columnChart(chart, {
    points,
    bucket: 'month',
    series: REPORT_CHART_SERIES,
    extraRows: (point) => [{ label: t('Le reste'), value: formatNumber(point.counts.rest) }],
    picked: picked.key,
    onPick: (point) => {
      picked = { person, month, key: point.key }
      renderMonthProjects(person, point.key)
    },
    ariaLabel: t('PR de code de {name}, et parmi elles celles de projet, de TMA et d’AC, mois par mois, de {from} à {to}', {
      name: displayName(person),
      from: monthName(points[0].key),
      to: monthName(month),
    }),
  })
}
