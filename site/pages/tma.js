// TMA: the hotfixes, and who makes them.

import { capitalize, formatDuration, formatNumber, formatRelative, formatShare } from '../lib/format.js'
import { displayName } from '../model/people.js'
import { BUCKET_TITLES } from '../model/periods.js'
import { comparedPeriod, currentPeriod, periodTitle } from '../model/selection.js'
import { barChart } from '../ui/charts/bar-chart.js'
import { columnChart } from '../ui/charts/column-chart.js'
import { $ } from '../ui/dom.js'
import { topReposCell } from '../ui/tables/cells.js'
import { renderTiles } from '../ui/tiles.js'

const TOP_HOTFIX_REPOSITORIES = 8

const TMA_TILES = [
  { key: 'opened', label: 'Hotfix ouverts' },
  { key: 'merged', label: 'Hotfix mergés' },
  { key: 'medianTimeToMergeHours', label: 'Délai médian de merge', format: formatDuration, better: 'down' },
  { key: 'medianTimeToFirstReviewHours', label: 'Attente médiane 1re review', format: formatDuration, better: 'down' },
  { key: 'contributors', label: 'Contributeurs TMA' },
]

export const TMA_COLUMNS = [
  { key: 'login', label: 'Contributeur', kind: 'person', value: (row) => displayName(row.login) },
  {
    key: 'hotfixes',
    label: 'Hotfix',
    kind: 'bar',
    hint: 'PR de code ouvertes sur la période depuis une branche qui commence par hotfix.',
  },
  {
    key: 'share',
    label: 'Part de ses PR',
    format: (row) => formatShare(row.share),
    hint: 'Ses hotfix rapportés à toutes ses PR de code.',
  },
  {
    key: 'medianTimeToMergeHours',
    label: 'Délai de merge',
    format: (row) => formatDuration(row.medianTimeToMergeHours),
    hint: 'Médiane de ses hotfix, de la création au merge.',
  },
  {
    key: 'topRepos',
    label: 'Dépôts',
    kind: 'text',
    value: (row) => row.topRepos[0]?.[0] ?? '',
    cell: (row) => topReposCell(row.topRepos, 'hotfix'),
    hint: 'Dépôts où la personne a fait le plus de hotfix.',
  },
  {
    key: 'lastAt',
    label: 'Dernier hotfix',
    format: (row) => formatRelative(row.lastAt),
    hint: 'Création de son dernier hotfix sur la période.',
  },
]

export function renderTmaTiles(mode) {
  const { tma } = currentPeriod()
  const compared = comparedPeriod()?.tma
  $('[data-tma-title]').textContent = capitalize(periodTitle())
  renderTiles($('[data-tma-tiles]'), TMA_TILES, { ...tma, contributors: tma.people.length }, mode, compared && { ...compared, contributors: compared.people.length })
}

export function renderTmaCharts() {
  const { tma, series, bucket } = currentPeriod()
  $('[data-tma-chart-title]').textContent = `Hotfix ouverts ${BUCKET_TITLES[bucket]}`
  barChart($('[data-tma-repos]'), {
    rows: tma.repositories.slice(0, TOP_HOTFIX_REPOSITORIES),
    label: (row) => row.repo,
    value: (row) => row.hotfixes,
    format: formatNumber,
    color: 'var(--series-1)',
    ariaLabel: 'Hotfix par dépôt',
    tooltip: (row) => ({ title: row.repo, rows: [{ label: 'hotfix', value: formatNumber(row.hotfixes) }] }),
  })
  columnChart($('[data-tma-chart]'), {
    points: series,
    bucket,
    series: [{ label: 'hotfix ouverts', color: 'var(--series-1)', value: (point) => point.hotfixes }],
    ariaLabel: `Hotfix ouverts ${BUCKET_TITLES[bucket]}, ${periodTitle()}`,
  })
}
