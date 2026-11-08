// Améliorations continues: what the AC of the period add up to, against the period compared, bucket by bucket, and those
// delivered by repository, person, squad and size. Far too many to show one by one: no card, no timeline, figures only.
// Every part follows the period and the squad; without any AC in the data, the page says how one is found.

import { capitalize, formatDuration, formatNumber, formatShare, plural, SIZE_LABELS } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { acBreakdown, acChart, acTotals, anyAc, comparedAcTotals } from '../model/acs.js'
import { displayName } from '../model/people.js'
import { BUCKET_TITLES } from '../model/periods.js'
import { periodRange, periodTitle } from '../model/selection.js'
import { squadsOf } from '../model/squads.js'
import { bucketTitle } from '../ui/charts/axis.js'
import { barChart } from '../ui/charts/bar-chart.js'
import { columnChart } from '../ui/charts/column-chart.js'
import { dataTable } from '../ui/charts/data-table.js'
import { $ } from '../ui/dom.js'
import { renderTiles } from '../ui/tiles.js'

const AC_TILES = [
  { key: 'started', label: t('AC démarrées') },
  { key: 'delivered', label: t('AC livrées') },
  // Among those delivered, those in production at the last sync.
  { key: 'deployed', label: t('Livrées et en prod') },
  { key: 'codeShare', label: t('PR de code en AC'), format: formatShare },
  // Open at the last sync, whatever the period: not compared.
  { key: 'open', label: t('AC en cours'), compare: false },
]

const AC_DELAY_TILES = [
  { key: 'medianTimeToMergeHours', label: t('Délai médian jusqu’au merge'), format: formatDuration, better: 'down' },
  { key: 'medianLeadTimeHours', label: t('Délai médian jusqu’en prod'), format: formatDuration, better: 'down' },
  { key: 'medianLines', label: t('Taille médiane'), format: (value) => (value === null ? '–' : t('{value} lignes', { value: formatNumber(Math.round(value)) })) },
  { key: 'people', label: t('Personnes') },
  { key: 'abandoned', label: t('Abandonnées'), better: 'down' },
]

export const AC_SERIES = [
  { label: t('démarrées'), color: 'var(--series-1)', value: (point) => point.started },
  { label: t('livrées'), color: 'var(--series-3)', value: (point) => point.delivered },
]

// The tiles, and the data of the chart as a table; drawn again by render().
export function renderAcs(mode = 'enter') {
  const any = anyAc()
  $('[data-acs-empty]').hidden = any
  $('[data-acs-content]').hidden = !any
  if (!any) {
    return
  }
  $('[data-acs-title]').textContent = capitalize(periodTitle())
  const compared = comparedAcTotals()
  renderTiles($('[data-acs-tiles]'), AC_TILES, acTotals(), mode, compared)
  renderTiles($('[data-acs-delays]'), AC_DELAY_TILES, acTotals(), mode, compared)
  $('[data-acs-squads-card]').hidden = squadsOf().length === 0
  const { bucket } = periodRange()
  dataTable(
    $('[data-acs-chart-table]'),
    [t('Période'), t('Démarrées'), t('Livrées')],
    acChart()
      .toReversed()
      .map((point) => [
        point.partial ? t('{bucket} (incomplète)', { bucket: bucketTitle(point.key, bucket) }) : bucketTitle(point.key, bucket),
        formatNumber(point.started),
        formatNumber(point.delivered),
      ]),
  )
}

// Bars of AC delivered, each with its count.
/**
 * @param {string} selector
 * @param {[string, number][]} rows
 * @param {(key: string) => string} label
 * @param {string} ariaLabel
 */
function deliveredBars(selector, rows, label, ariaLabel) {
  barChart($(selector), {
    rows,
    label: ([key]) => label(key),
    value: ([, count]) => count,
    format: formatNumber,
    color: 'var(--series-3)',
    ariaLabel,
    tooltip: ([key, count]) => ({ title: label(key), rows: [{ label: t('AC livrées sur la période'), value: formatNumber(count) }] }),
  })
}

// The charts, as wide as their cards: drawn when the page shows, and again as it resizes.
export function renderAcCharts() {
  const container = $('[data-acs-chart]')
  if (container.clientWidth === 0 || !anyAc()) {
    return
  }
  const { bucket } = periodRange()
  $('[data-acs-chart-title]').textContent = t('AC {bucket}', { bucket: BUCKET_TITLES[bucket] })
  columnChart(container, {
    points: acChart(),
    bucket,
    series: AC_SERIES,
    ariaLabel: t('AC démarrées et livrées {bucket}, {period}', { bucket: BUCKET_TITLES[bucket], period: periodTitle() }),
  })
  const { repos, people, squads, sizes } = acBreakdown()
  deliveredBars('[data-acs-repos]', repos, (repo) => repo, t('AC livrées par dépôt'))
  deliveredBars('[data-acs-people]', people, displayName, t('AC livrées par personne'))
  if (squadsOf().length) {
    deliveredBars('[data-acs-squads]', squads, (squad) => squad, t('AC livrées par squad'))
  }
  deliveredBars(
    '[data-acs-sizes]',
    sizes.map((count, index) => /** @type {[string, number]} */ ([String(index), count])),
    (index) => t('{size} lignes', { size: SIZE_LABELS[Number(index)] }),
    t('AC livrées par taille'),
  )
  $('[data-acs-sizes-sub]').textContent = t('{count} livrées sur la période, selon les lignes modifiées par leurs PR mergées', {
    count: plural(sizes.reduce((total, count) => total + count, 0), 'AC', 'AC'),
  })
}
