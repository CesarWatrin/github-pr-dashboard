// Cycle de vie: where the time of a pull request goes, stage by stage, per repository.

import { WORK_DAY_HOURS } from '../domain/time.js'
import { capitalize, formatDuration, formatNumber, SIZE_LABELS } from '../lib/format.js'
import { inSelection } from '../model/contributors.js'
import { CYCLE_STAGES, cycleSummary } from '../model/cycle.js'
import { BUCKET_TITLES } from '../model/periods.js'
import { CATEGORIES, repoInfo } from '../model/repositories.js'
import { comparedPeriod, currentPeriod, periodTitle } from '../model/selection.js'
import { state } from '../model/state.js'
import { bucketTitle } from '../ui/charts/axis.js'
import { columnChart } from '../ui/charts/column-chart.js'
import { dataTable } from '../ui/charts/data-table.js'
import { shareChart } from '../ui/charts/share-chart.js'
import { $ } from '../ui/dom.js'
import { repoCell } from '../ui/tables/cells.js'
import { renderTiles } from '../ui/tiles.js'

const CYCLE_STAGE_TILES = CYCLE_STAGES.map(({ key, label }) => ({ key, label, format: formatDuration, better: 'down' }))
const CYCLE_END_TO_END_TILES = [
  { key: 'toMerge', label: 'De l’ouverture au merge', format: formatDuration, better: 'down' },
  { key: 'toProduction', label: 'De l’ouverture à la prod', format: formatDuration, better: 'down' },
  { key: 'prs', label: 'PR de code ouvertes' },
]

export const CYCLE_COLUMNS = [
  { key: 'repo', label: 'Dépôt', kind: 'text', value: (row) => row.repo, cell: (row) => repoCell(row) },
  { key: 'prs', label: 'PR de code', kind: 'bar', hint: 'PR ouvertes sur la période, hors release et synchronisation de branches.' },
  ...CYCLE_STAGES.map(({ key, label, hint }) => ({ key, label, format: (row) => formatDuration(row[key]), hint })),
  {
    key: 'toProduction',
    label: 'Jusqu’en prod',
    format: (row) => formatDuration(row.toProduction),
    hint: 'Médiane, de l’ouverture à l’arrivée en prod, pour les PR ouvertes sur la période.',
  },
]

// The code pull requests of the period, on the repositories selected on the cycle page.
const selectedCycles = () => currentPeriod().cycles.filter((cycle) => inSelection(state.repos.cycle, cycle.repo))

function groupCycles(cycles, keyOf) {
  const groups = new Map()
  for (const cycle of cycles) {
    const key = keyOf(cycle)
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key).push(cycle)
  }

  return groups
}

export function cycleRows() {
  return [...groupCycles(selectedCycles(), (cycle) => cycle.repo)].map(([repo, cycles]) => ({
    repo,
    category: repoInfo(repo).category,
    ...cycleSummary(cycles),
  }))
}

export function renderCycleTiles(mode) {
  const summary = cycleSummary(selectedCycles())
  // The range compared to, over the same repositories.
  const comparedCycles = comparedPeriod()?.cycles.filter((cycle) => inSelection(state.repos.cycle, cycle.repo))
  const compared = comparedCycles ? cycleSummary(comparedCycles) : null
  $('[data-cycle-title]').textContent = capitalize(periodTitle())
  renderTiles($('[data-cycle-stage-tiles]'), CYCLE_STAGE_TILES, summary, mode, compared)
  renderTiles($('[data-cycle-end-tiles]'), CYCLE_END_TO_END_TILES, summary, mode, compared)
}

export function renderCycleCharts() {
  const cycles = selectedCycles()
  const byType = groupCycles(cycles, (cycle) => repoInfo(cycle.repo).category)
  shareChart($('[data-cycle-types]'), {
    rows: [
      { label: 'Tous les dépôts', ...cycleSummary(cycles) },
      ...CATEGORIES.filter((category) => byType.has(category.key)).map((category) => ({
        label: category.label,
        ...cycleSummary(byType.get(category.key)),
      })),
    ],
    ariaLabel: 'Part de chaque étape dans le temps des PR, par type de dépôt',
  })
  const bySize = groupCycles(cycles, (cycle) => cycle.size)
  shareChart($('[data-cycle-sizes]'), {
    rows: SIZE_LABELS.flatMap((label, index) => (bySize.has(index) ? [{ label: `${label} lignes`, ...cycleSummary(bySize.get(index)) }] : [])),
    ariaLabel: 'Part de chaque étape dans le temps des PR, selon leur taille',
  })

  const { series, bucket } = currentPeriod()
  const byBucket = groupCycles(cycles, (cycle) => cycle.bucket)
  const points = series.map(({ key, partial }) => ({ key, partial, ...cycleSummary(byBucket.get(key) ?? []) }))
  $('[data-cycle-charts-title]').textContent = `Médiane de chaque étape ${BUCKET_TITLES[bucket]}`
  for (const stage of CYCLE_STAGES) {
    // Long stages read in working days, short ones in working hours.
    const hoursPerUnit = Math.max(0, ...points.map((point) => point[stage.key] ?? 0)) > 2 * WORK_DAY_HOURS ? WORK_DAY_HOURS : 1
    $(`[data-cycle-chart-title="${stage.key}"]`).textContent =
      `${stage.label}, en ${hoursPerUnit === WORK_DAY_HOURS ? 'jours ouvrés' : 'heures ouvrées'}`
    columnChart($(`[data-cycle-chart="${stage.key}"]`), {
      points,
      bucket,
      decimals: true,
      format: (value) => formatDuration(value === null ? null : value * hoursPerUnit),
      series: [
        {
          label: 'médiane',
          color: stage.color,
          value: (point) => (point[stage.key] === null ? null : point[stage.key] / hoursPerUnit),
        },
      ],
      ariaLabel: `${stage.label}, médiane ${BUCKET_TITLES[bucket]}, ${periodTitle()}`,
      extraRows: (point) => [{ label: 'PR de code ouvertes', value: formatNumber(point.prs) }],
    })
  }
  dataTable(
    $('[data-cycle-chart-table]'),
    ['Période', 'PR de code', ...CYCLE_STAGES.map((stage) => stage.label), 'Jusqu’en prod'],
    points
      .toReversed()
      .map((point) => [
        bucketTitle(point.key, bucket) + (point.partial ? ' (incomplète)' : ''),
        formatNumber(point.prs),
        ...CYCLE_STAGES.map((stage) => formatDuration(point[stage.key])),
        formatDuration(point.toProduction),
      ]),
  )
}
