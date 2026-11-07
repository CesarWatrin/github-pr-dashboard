// DevOps: deployments, continuous integration and dependency updates.

import {
  capitalize,
  dateFormat,
  formatDecimal,
  formatDuration,
  formatNumber,
  formatRelative,
  formatSeconds,
  formatShare,
} from '../lib/format.js'
import { BUCKET_TITLES } from '../model/periods.js'
import {
  ciStart,
  comparedCi,
  comparedPeriod,
  comparedRange,
  currentCi,
  currentPeriod,
  periodRange,
  periodTitle,
  perWeek,
} from '../model/selection.js'
import { activeSquad } from '../model/squads.js'
import { axisLabel, bucketTitle } from '../ui/charts/axis.js'
import { barChart } from '../ui/charts/bar-chart.js'
import { columnChart } from '../ui/charts/column-chart.js'
import { heatmapChart } from '../ui/charts/heatmap-chart.js'
import { $ } from '../ui/dom.js'
import { repoCell } from '../ui/tables/cells.js'
import { renderTiles } from '../ui/tiles.js'

const TOP_ECOSYSTEMS = 8
// The repositories that deploy the most get a row of their own in the calendar of deployments; the others share one.
const CALENDAR_REPOS = 15

const DORA_TILES = [
  { key: 'deployments', label: 'Déploiements' },
  { key: 'deploymentsPerWeek', label: 'Par semaine', format: formatDecimal },
  { key: 'medianLeadTimeHours', label: 'Délai médian jusqu’en prod', format: formatDuration, better: 'down' },
  { key: 'reworkRate', label: 'Taux de reprise', format: formatShare, better: 'down' },
  { key: 'medianRestoreHours', label: 'Rétablissement médian', format: formatDuration, better: 'down' },
]

const CI_TILES = [
  { key: 'runs', label: 'Exécutions' },
  { key: 'medianSeconds', label: 'Durée médiane', format: formatSeconds, better: 'down' },
  { key: 'p90Seconds', label: '9 sur 10 en moins de', format: formatSeconds, better: 'down' },
  { key: 'failureRate', label: 'En échec', format: formatShare, better: 'down' },
  { key: 'rerunRate', label: 'Relancées', format: formatShare, better: 'down' },
  { key: 'checksFailedShare', label: 'PR mergées avec un check rouge', format: formatShare, better: 'down' },
]

const DEPENDENCY_TILES = [
  { key: 'opened', label: 'PR ouvertes' },
  { key: 'merged', label: 'Mergées' },
  { key: 'closed', label: 'Fermées sans merge' },
  { key: 'medianTimeToMergeHours', label: 'Délai médian de merge', format: formatDuration, better: 'down' },
  // A count of today, not of the period: nothing to compare.
  { key: 'waiting', label: 'En attente aujourd’hui', compare: false },
]

export const DEPLOYMENT_COLUMNS = [
  { key: 'repo', label: 'Dépôt', kind: 'text', value: (row) => row.repo, cell: (row) => repoCell(row) },
  {
    key: 'deployments',
    label: 'Déploiements',
    kind: 'bar',
    hint: 'PR mergées dans master ou main sur la période : releases, hotfix et merges directs.',
  },
  { key: 'corrective', label: 'Correctifs', hint: 'Déploiements imprévus pour réparer la prod : hotfix ou revert.' },
  {
    key: 'medianLeadTimeHours',
    label: 'Délai jusqu’en prod',
    format: (row) => formatDuration(row.medianLeadTimeHours),
    hint: 'Médiane, de l’ouverture d’une PR de code à son arrivée en prod, pour celles arrivées sur la période.',
  },
  {
    key: 'reworkRate',
    label: 'Taux de reprise',
    format: (row) => formatShare(row.reworkRate),
    hint: 'Part des déploiements qui sont des correctifs.',
  },
  {
    key: 'medianRestoreHours',
    label: 'Rétablissement',
    format: (row) => formatDuration(row.medianRestoreHours),
    hint: 'Médiane, de l’ouverture d’un correctif à son merge en prod.',
  },
]

export const WORKFLOW_COLUMNS = [
  { key: 'repo', label: 'Dépôt', kind: 'text', value: (row) => row.repo, cell: (row) => repoCell(row) },
  { key: 'workflow', label: 'Workflow', kind: 'text', format: (row) => row.workflow },
  {
    key: 'runs',
    label: 'Exécutions',
    kind: 'bar',
    hint: 'Exécutions sur des PR ou des push qui ont abouti à un verdict : annulées et ignorées exclues.',
  },
  {
    key: 'medianSeconds',
    label: 'Durée médiane',
    format: (row) => formatSeconds(row.medianSeconds),
    hint: 'Du démarrage de l’exécution à la fin de sa dernière tâche, attente des runners comprise.',
  },
  {
    key: 'p90Seconds',
    label: '9 sur 10 sous',
    format: (row) => formatSeconds(row.p90Seconds),
    hint: 'Durée sous laquelle se terminent 90 % des exécutions : les plus lentes, sans les cas extrêmes.',
  },
  {
    key: 'failureRate',
    label: 'En échec',
    format: (row) => formatShare(row.failureRate),
    hint: 'Exécutions en échec, dépassements de délai compris.',
  },
  {
    key: 'rerunRate',
    label: 'Relancées',
    format: (row) => formatShare(row.rerunRate),
    hint: 'Exécutions relancées au moins une fois, souvent le signe d’un test instable.',
  },
]

export const DEPENDENCY_COLUMNS = [
  { key: 'repo', label: 'Dépôt', kind: 'text', value: (row) => row.repo, cell: (row) => repoCell(row) },
  { key: 'opened', label: 'Ouvertes', kind: 'bar', hint: 'PR Dependabot ouvertes sur la période.' },
  { key: 'merged', label: 'Mergées', hint: 'Parmi elles, celles mergées.' },
  {
    key: 'closed',
    label: 'Fermées',
    hint: 'Parmi elles, celles fermées sans merge : remplacées par une version plus récente ou ignorées.',
  },
  {
    key: 'medianTimeToMergeHours',
    label: 'Délai de merge',
    format: (row) => formatDuration(row.medianTimeToMergeHours),
    hint: 'Médiane, de l’ouverture au merge.',
  },
  { key: 'waiting', label: 'En attente', hint: 'PR Dependabot encore ouvertes aujourd’hui, quelle que soit la période.' },
  {
    key: 'oldestWaitingAt',
    label: 'Plus ancienne',
    format: (row) => (row.oldestWaitingAt ? formatRelative(row.oldestWaitingAt) : '–'),
    hint: 'Ouverture de la plus ancienne encore en attente.',
  },
]

// Dependabot ecosystems, as named in its branches.
const ECOSYSTEM_NAMES = {
  github_actions: 'GitHub Actions',
  npm_and_yarn: 'npm',
  composer: 'Composer',
  pub: 'pub (Dart)',
  go_modules: 'Go',
  cargo: 'Cargo',
  docker: 'Docker',
  pip: 'pip',
  bundler: 'Bundler',
  terraform: 'Terraform',
}

export const DEPLOYMENT_SERIES = [
  {
    label: 'releases et merges',
    color: 'var(--series-1)',
    value: (point) => point.deployments - point.corrective,
  },
  { label: 'correctifs', color: 'var(--series-2)', value: (point) => point.corrective },
]

// What the CI of the period leaves out, when it starts after the period: « depuis le 3 mars 2025 », say.
function ciCut() {
  const start = ciStart()

  return periodRange().start < start ? `depuis le ${dateFormat.format(start)}` : null
}

export function renderDevopsTiles(mode) {
  const { delivery, dependencies, totals } = currentPeriod()
  const compared = comparedPeriod()
  $('[data-devops-title]').textContent = capitalize(periodTitle())
  renderTiles(
    $('[data-dora-tiles]'),
    DORA_TILES,
    { ...delivery, deploymentsPerWeek: perWeek(delivery.deployments, periodRange()) },
    mode,
    compared && { ...compared.delivery, deploymentsPerWeek: perWeek(compared.delivery.deployments, comparedRange()) },
  )
  renderTiles(
    $('[data-ci-tiles]'),
    CI_TILES,
    { ...currentCi().totals, checksFailedShare: totals.checksFailedShare },
    mode,
    compared && { ...comparedCi()?.totals, checksFailedShare: compared.totals.checksFailedShare },
  )
  const cut = ciCut()
  const squad = activeSquad()
  const notes = [
    ...(cut ? [`Exécutions de CI ${cut} seulement : GitHub efface les plus anciennes, la synchro garde les autres.`] : []),
    // No run belongs to a squad: the CI stays that of the whole organization, and says so.
    ...(squad ? [`Intégration continue de toute l’organisation : une exécution ne se rattache à aucune squad, pas même ${squad.name}.`] : []),
  ]
  $('[data-ci-cut]').hidden = notes.length === 0
  $('[data-ci-cut]').textContent = notes.join(' ')
  renderTiles($('[data-dependency-tiles]'), DEPENDENCY_TILES, dependencies, mode, compared?.dependencies)
}

// When each repository deploys: its deployments per bucket of the period, the busiest repositories first, the others
// together on a last row, which stays out of the color scale.
function renderDeploymentCalendar() {
  const { series, bucket, deploymentCalendar } = currentPeriod()
  const total = (buckets) => buckets.reduce((sum, [count]) => sum + count, 0)
  const sorted = deploymentCalendar.toSorted((a, b) => total(b.buckets) - total(a.buckets) || a.repo.localeCompare(b.repo))
  const shown = sorted.slice(0, CALENDAR_REPOS)
  const others = sorted.slice(CALENDAR_REPOS)
  const rows = shown.map(({ repo, buckets }) => ({ key: repo, label: repo, buckets }))
  if (others.length) {
    rows.push({
      key: 'others',
      label: `${formatNumber(others.length)} autres dépôts`,
      grouped: true,
      buckets: series.map((_, index) => others.reduce(([count, corrective], other) => [count + other.buckets[index][0], corrective + other.buckets[index][1]], [0, 0])),
    })
  }
  const columns = series.map((point, index) => ({ key: point.key, label: axisLabel(point.key, bucket), index, partial: point.partial }))
  $('[data-deploy-calendar-title]').textContent = `Calendrier des mises en production ${BUCKET_TITLES[bucket]}`
  $('[data-deploy-calendar-sub]').textContent = others.length
    ? `Déploiements de chaque dépôt : les ${formatNumber(CALENDAR_REPOS)} qui déploient le plus, puis les autres ensemble`
    : 'Déploiements de chaque dépôt, ceux qui déploient le plus en haut'
  heatmapChart($('[data-deploy-calendar]'), {
    rows,
    columns,
    value: (row, column) => row.buckets[column.index][0],
    ariaLabel: `Déploiements de chaque dépôt ${BUCKET_TITLES[bucket]}, ${periodTitle()}`,
    tooltip: (row, column, count) => ({
      title: `${row.label} · ${bucketTitle(column.key, bucket)}`,
      rows: [
        { label: count > 1 ? 'déploiements' : 'déploiement', value: formatNumber(count) },
        { label: 'dont correctifs', value: formatNumber(row.buckets[column.index][1]) },
      ],
      note: column.partial ? 'Période incomplète' : null,
    }),
  })
}

export function renderDevopsCharts() {
  const { series, bucket, dependencies } = currentPeriod()
  $('[data-deployments-chart-title]').textContent = `Déploiements ${BUCKET_TITLES[bucket]}`
  columnChart($('[data-deployments-chart]'), {
    points: series,
    bucket,
    series: DEPLOYMENT_SERIES,
    ariaLabel: `Déploiements ${BUCKET_TITLES[bucket]}, ${periodTitle()}`,
  })

  renderDeploymentCalendar()

  const ci = currentCi()
  const cut = ciCut()
  $('[data-ci-sub]').textContent = `Exécutions GitHub Actions déclenchées par une PR ou un push${cut ? `, ${cut} seulement` : ''}`
  $('[data-ci-charts-title]').textContent = `Exécutions ${BUCKET_TITLES[bucket]}`
  columnChart($('[data-ci-duration-chart]'), {
    points: ci.series,
    bucket,
    series: [{ label: 'min, durée médiane', color: 'var(--series-1)', value: (point) => (point.medianSeconds ?? 0) / 60 }],
    decimals: true,
    ariaLabel: `Durée médiane des exécutions de CI ${BUCKET_TITLES[bucket]}, ${periodTitle()}`,
    extraRows: (point) => [{ label: 'exécutions', value: formatNumber(point.runs) }],
  })
  columnChart($('[data-ci-failure-chart]'), {
    points: ci.series,
    bucket,
    series: [{ label: '% en échec', color: 'var(--series-2)', value: (point) => (point.failureRate ?? 0) * 100 }],
    decimals: true,
    ariaLabel: `Part des exécutions de CI en échec ${BUCKET_TITLES[bucket]}, ${periodTitle()}`,
    extraRows: (point) => [{ label: 'exécutions', value: formatNumber(point.runs) }],
  })

  const ecosystemName = (row) => ECOSYSTEM_NAMES[row.ecosystem] ?? row.ecosystem
  barChart($('[data-dependency-ecosystems]'), {
    rows: dependencies.ecosystems.slice(0, TOP_ECOSYSTEMS),
    label: ecosystemName,
    value: (row) => row.opened,
    format: formatNumber,
    color: 'var(--series-1)',
    ariaLabel: 'PR Dependabot par écosystème',
    tooltip: (row) => ({
      title: ecosystemName(row),
      rows: [
        { label: 'ouvertes', value: formatNumber(row.opened) },
        { label: 'mergées', value: formatNumber(row.merged) },
      ],
    }),
  })
}
