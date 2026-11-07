// TMA: the hotfixes, and who makes them.

import { capitalize, formatDuration, formatNumber, formatRelative, formatShare } from '../lib/format.js'
import { t } from '../lib/i18n.js'
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
  { key: 'opened', label: t('Hotfix ouverts') },
  { key: 'merged', label: t('Hotfix mergés') },
  { key: 'medianTimeToMergeHours', label: t('Délai médian de merge'), format: formatDuration, better: 'down' },
  { key: 'medianTimeToFirstReviewHours', label: t('Attente médiane 1re review'), format: formatDuration, better: 'down' },
  { key: 'contributors', label: t('Contributeurs TMA') },
]

export const TMA_COLUMNS = [
  { key: 'login', label: t('Contributeur'), kind: 'person', value: (row) => displayName(row.login) },
  {
    key: 'hotfixes',
    label: t('Hotfix'),
    kind: 'bar',
    hint: t('PR de code ouvertes sur la période depuis une branche qui commence par hotfix.'),
  },
  {
    key: 'share',
    label: t('Part de ses PR'),
    format: (row) => formatShare(row.share),
    hint: t('Ses hotfix rapportés à toutes ses PR de code.'),
  },
  {
    key: 'medianTimeToMergeHours',
    label: t('Délai de merge'),
    format: (row) => formatDuration(row.medianTimeToMergeHours),
    hint: t('Médiane de ses hotfix, de la création au merge.'),
  },
  {
    key: 'topRepos',
    label: t('Dépôts'),
    kind: 'text',
    value: (row) => row.topRepos[0]?.[0] ?? '',
    cell: (row) => topReposCell(row.topRepos, t('hotfix')),
    hint: t('Dépôts où la personne a fait le plus de hotfix.'),
  },
  {
    key: 'lastAt',
    label: t('Dernier hotfix'),
    format: (row) => formatRelative(row.lastAt),
    hint: t('Création de son dernier hotfix sur la période.'),
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
  $('[data-tma-chart-title]').textContent = t('Hotfix ouverts {bucket}', { bucket: BUCKET_TITLES[bucket] })
  barChart($('[data-tma-repos]'), {
    rows: tma.repositories.slice(0, TOP_HOTFIX_REPOSITORIES),
    label: (row) => row.repo,
    value: (row) => row.hotfixes,
    format: formatNumber,
    color: 'var(--series-1)',
    ariaLabel: t('Hotfix par dépôt'),
    tooltip: (row) => ({ title: row.repo, rows: [{ label: t('hotfix'), value: formatNumber(row.hotfixes) }] }),
  })
  columnChart($('[data-tma-chart]'), {
    points: series,
    bucket,
    series: [{ label: t('hotfix ouverts'), color: 'var(--series-1)', value: (point) => point.hotfixes }],
    ariaLabel: t('Hotfix ouverts {bucket}, {period}', { bucket: BUCKET_TITLES[bucket], period: periodTitle() }),
  })
}
