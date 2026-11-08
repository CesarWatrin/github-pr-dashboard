// The projects on the overview: what they add up to over the period, how many lived, started and were delivered bucket
// by bucket, and the list of those of the period. Every repository, for the squad picked; nothing of it shows without
// any project in the data.

import { formatNumber, formatShare, plural } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { BUCKET_TITLES } from '../../model/periods.js'
import { anyProject, comparedProjectTotals, projectChart, projectsOfPeriod, projectTotals } from '../../model/projects.js'
import { periodRange, periodTitle } from '../../model/selection.js'
import { bucketTitle } from '../../ui/charts/axis.js'
import { columnChart } from '../../ui/charts/column-chart.js'
import { dataTable } from '../../ui/charts/data-table.js'
import { $, el } from '../../ui/dom.js'
import { renderList } from '../../ui/list.js'
import { PROJECT_STATUSES, projectLink, STATUS_ORDER } from '../../ui/projects.js'
import { renderTiles } from '../../ui/tiles.js'

// Each tile leads to the projects page.
const PROJECT_TILES = [
  { key: 'active', label: t('Projets actifs'), route: 'projects' },
  { key: 'started', label: t('Projets démarrés'), route: 'projects' },
  { key: 'delivered', label: t('Projets livrés'), route: 'projects' },
  { key: 'codeShare', label: t('PR de code sur des projets'), format: formatShare, route: 'projects' },
]

export const PROJECT_SERIES = [
  { label: t('projets actifs'), color: 'var(--series-1)', value: (point) => point.active },
  { label: t('démarrés'), color: 'var(--series-2)', value: (point) => point.started },
  { label: t('livrés'), color: 'var(--series-3)', value: (point) => point.delivered },
]

// The tiles of the projects, under those of the reviews, against the period compared.
export function renderProjectTotals(mode) {
  const any = anyProject()
  $('[data-totals-projects-title]').hidden = !any
  $('[data-totals-projects]').hidden = !any
  if (any) {
    renderTiles($('[data-totals-projects]'), PROJECT_TILES, projectTotals(), mode, comparedProjectTotals())
  }
}

// The chart of the projects, as wide as its card: drawn when the page shows, and again as it resizes.
export function renderProjectChart() {
  if (!anyProject()) {
    return
  }
  const { bucket } = periodRange()
  $('[data-projects-chart-title]').textContent = t('Projets {bucket}', { bucket: BUCKET_TITLES[bucket] })
  columnChart($('[data-projects-chart]'), {
    points: projectChart(),
    bucket,
    series: PROJECT_SERIES,
    ariaLabel: t('Projets actifs, démarrés et livrés {bucket}, {period}', { bucket: BUCKET_TITLES[bucket], period: periodTitle() }),
  })
}

// The projects of the period, those under way first, then those stalled, then those delivered, each with its code pull
// requests over the period; and the data of the chart, as a table.
export function renderProjectList() {
  const any = anyProject()
  $('[data-overview-projects]').hidden = !any
  if (!any) {
    return
  }
  const rows = projectsOfPeriod().toSorted((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || b.code - a.code)
  renderList(
    $('[data-overview-projects-list]'),
    rows.map((row) =>
      el(
        'li',
        { className: 'project-feed-item' },
        projectLink(row),
        el('span', {
          className: 'pair-count',
          textContent: `${PROJECT_STATUSES[row.status].label} · ${plural(row.code, 'PR de code', 'PR de code')} · ${plural(row.people, 'personne')}`,
        }),
      ),
    ),
    t('Aucun projet sur la période'),
  )
  const { bucket } = periodRange()
  dataTable(
    $('[data-projects-chart-table]'),
    [t('Période'), t('Projets actifs'), t('Démarrés'), t('Livrés')],
    projectChart()
      .toReversed()
      .map((point) => [
        point.partial ? t('{bucket} (incomplète)', { bucket: bucketTitle(point.key, bucket) }) : bucketTitle(point.key, bucket),
        formatNumber(point.active),
        formatNumber(point.started),
        formatNumber(point.delivered),
      ]),
  )
}
