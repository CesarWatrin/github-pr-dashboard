// Où va l'effort: the code pull requests of the period, for the squad picked, between the TMA, the projects, the AC and
// the rest, each counting once; maintaining against building, against the period compared; bucket by bucket; per squad
// and per person still in the team.

import { capitalize, formatLines, formatNumber, formatShare, plural } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { comparedEffort, currentEffort, effortChart, peopleEfforts, squadEfforts } from '../model/effort.js'
import { displayName } from '../model/people.js'
import { BUCKET_TITLES } from '../model/periods.js'
import { periodRange, periodTitle } from '../model/selection.js'
import { squadsOf } from '../model/squads.js'
import { bucketTitle } from '../ui/charts/axis.js'
import { dataTable } from '../ui/charts/data-table.js'
import { shareChart } from '../ui/charts/share-chart.js'
import { stackedChart } from '../ui/charts/stacked-chart.js'
import { $ } from '../ui/dom.js'
import { EFFORT_SERIES } from '../ui/effort.js'
import { renderTiles } from '../ui/tiles.js'

/** @typedef {import('../domain/effort.js').EffortSummary} EffortSummary */

// The share of each kind of work in the code pull requests of the period. Less maintaining reads better; the others
// stay neutral.
const EFFORT_TILES = [
  ...EFFORT_SERIES.map((kind) => ({ key: kind.key, label: kind.label, format: formatShare, ...(kind.key === 'tma' && { better: 'down' }) })),
  { key: 'code', label: t('PR de code') },
]

// Maintaining against building, the rest aside.
const BUILD_RUN_TILES = [
  { key: 'runShare', label: t('Maintenir'), format: formatShare, better: 'down' },
  { key: 'buildShare', label: t('Construire'), format: formatShare },
  { key: 'run', label: t('PR pour maintenir') },
  { key: 'build', label: t('PR pour construire') },
]

// What the tiles read of where the effort goes: the share of each kind, flat.
/** @param {EffortSummary} effort */
const tileValues = (effort) => ({
  ...Object.fromEntries(EFFORT_SERIES.map((kind) => [kind.key, effort.shares?.[kind.key] ?? null])),
  code: effort.code,
  build: effort.build,
  run: effort.run,
  buildShare: effort.buildShare,
  runShare: effort.runShare,
})

// What a kind holds, in a tooltip: its code pull requests, and the lines added by those merged.
/**
 * @param {EffortSummary} effort
 * @param {import('../domain/effort.js').EffortKind} kind
 */
const kindDetail = (effort, kind) =>
  effort.added[kind] > 0
    ? `${plural(effort.counts[kind], 'PR', 'PR')} · ${t('{count} lignes ajoutées', { count: formatLines(effort.added[kind]) })}`
    : plural(effort.counts[kind], 'PR', 'PR')

// The last rows of a tooltip: all the code pull requests, and the share of maintaining.
/** @param {EffortSummary} effort */
const readingRows = (effort) => [
  { label: t('PR de code'), value: formatNumber(effort.code) },
  { label: t('maintenir, le reste à part'), value: formatShare(effort.runShare) },
]

// The rows of a tooltip: the share of each kind and what it holds, then the reading.
/** @param {EffortSummary} effort */
const effortRows = (effort) => [
  ...EFFORT_SERIES.map((kind) => ({
    color: kind.color,
    value: formatShare(effort.shares?.[kind.key] ?? null),
    label: `${kind.label}, ${kindDetail(effort, kind.key)}`,
  })),
  ...readingRows(effort),
]

// A share and its count, in the data table under the chart.
/**
 * @param {EffortSummary} effort
 * @param {import('../domain/effort.js').EffortKind} kind
 */
const shareCell = (effort, kind) => (effort.shares ? `${formatShare(effort.shares[kind])} (${formatNumber(effort.counts[kind])})` : '–')

// The tiles, the data of the chart as a table and what the cards say; drawn again by render().
export function renderEffort(mode = 'enter') {
  $('[data-effort-title]').textContent = capitalize(periodTitle())
  const compared = comparedEffort()
  const values = tileValues(currentEffort())
  renderTiles($('[data-effort-tiles]'), EFFORT_TILES, values, mode, compared && tileValues(compared))
  renderTiles($('[data-effort-build-tiles]'), BUILD_RUN_TILES, values, mode, compared && tileValues(compared))
  $('[data-effort-squads-card]').hidden = squadsOf().length === 0
  const { bucket } = periodRange()
  dataTable(
    $('[data-effort-chart-table]'),
    [t('Période'), ...EFFORT_SERIES.map((kind) => kind.label), t('PR de code')],
    effortChart()
      .toReversed()
      .map((point) => [
        point.partial ? t('{bucket} (incomplète)', { bucket: bucketTitle(point.key, bucket) }) : bucketTitle(point.key, bucket),
        ...EFFORT_SERIES.map((kind) => shareCell(point, kind.key)),
        formatNumber(point.code),
      ]),
  )
  const { rows, total } = peopleEfforts()
  $('[data-effort-people-sub]').textContent =
    total > rows.length
      ? t('Les {count} personnes de l’équipe qui ont ouvert le plus de PR de code sur la période, sur {total}', { count: rows.length, total })
      : t('Les personnes de l’équipe qui ont ouvert des PR de code sur la période, la plus active d’abord')
}

// A bar per group of code pull requests (a squad, a person), cut into the share of each kind of work.
/**
 * @param {HTMLElement} container
 * @param {(EffortSummary & { label: string })[]} rows
 * @param {string} ariaLabel
 */
function effortShares(container, rows, ariaLabel) {
  shareChart(container, {
    rows,
    stages: EFFORT_SERIES,
    tooltipRows: (row) => effortRows(row),
    ariaLabel,
  })
}

// The charts, as wide as their cards: drawn when the page shows, and again as it resizes.
export function renderEffortCharts() {
  const container = $('[data-effort-chart]')
  if (container.clientWidth === 0) {
    return
  }
  const { bucket } = periodRange()
  $('[data-effort-chart-title]').textContent = t('L’effort {bucket}', { bucket: BUCKET_TITLES[bucket] })
  stackedChart(container, {
    points: effortChart(),
    bucket,
    series: EFFORT_SERIES.map((kind) => ({
      label: kind.label,
      color: kind.color,
      value: (point) => point.counts[kind.key],
      detail: (point) => kindDetail(point, kind.key),
    })),
    extraRows: (point) => readingRows(point),
    ariaLabel: t('Part de la TMA, des projets, des AC et du reste dans les PR de code {bucket}, {period}', { bucket: BUCKET_TITLES[bucket], period: periodTitle() }),
  })
  if (squadsOf().length) {
    const { squads, organization } = squadEfforts()
    effortShares(
      $('[data-effort-squads]'),
      [...squads.map((squad) => ({ ...squad, label: squad.name })), { ...organization, label: t('Toute l’organisation') }],
      t('Part de chaque type de travail dans les PR de code de chaque squad, {period}', { period: periodTitle() }),
    )
  }
  effortShares(
    $('[data-effort-people]'),
    peopleEfforts().rows.map((person) => ({ ...person, label: displayName(person.login) })),
    t('Part de chaque type de travail dans les PR de code de chaque personne, {period}', { period: periodTitle() }),
  )
}
