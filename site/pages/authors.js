// Auteurs: who delivers what, and the sizes of their pull requests.

import { formatDecimal, formatDuration, formatNumber, formatPercent, formatShare, SIZE_LABELS } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { displayName } from '../model/people.js'
import { frontShare } from '../model/repositories.js'
import { currentPeriod } from '../model/selection.js'
import { barChart } from '../ui/charts/bar-chart.js'
import { $ } from '../ui/dom.js'
import { LINES_COLUMN } from '../ui/tables/cells.js'

export const AUTHOR_COLUMNS = [
  { key: 'login', label: t('Contributeur'), kind: 'person', value: (row) => displayName(row.login) },
  { key: 'code', label: t('PR de code'), kind: 'bar', hint: t('PR ouvertes sur la période, hors release et synchronisation de branches.') },
  {
    key: 'stack',
    label: t('Stack'),
    kind: 'stack',
    value: (row) => frontShare(row.stack),
    hint: t('Part de ces PR dans les dépôts front, back et mobile. Full-stack : au moins 30 % côté back et 30 % côté client.'),
  },
  {
    key: 'process',
    label: t('Release / intég.'),
    value: (row) => row.release + row.integration,
    format: (row) => `${row.release} / ${row.integration}`,
    hint: t('PR de release / de synchronisation de branches, comptées à part.'),
  },
  {
    key: 'mergeRate',
    label: t('Taux de merge'),
    format: (row) => formatPercent(row.mergeRate),
    hint: t('Mergées / (mergées + fermées sans merge).'),
  },
  {
    key: 'unreviewedRate',
    label: t('Mergées sans review'),
    format: (row) => formatShare(row.unreviewedRate),
    hint: t('Part des PR mergées sans review ni commentaire d’une autre personne que l’auteur.'),
  },
  {
    key: 'medianTimeToFirstReviewHours',
    label: t('Attente 1re review'),
    format: (row) => formatDuration(row.medianTimeToFirstReviewHours),
    hint: t('Médiane, de la création à la première review ou au premier commentaire d’une autre personne.'),
  },
  {
    key: 'medianTimeToMergeHours',
    label: t('Délai de merge'),
    format: (row) => formatDuration(row.medianTimeToMergeHours),
    hint: t('Médiane, de la création au merge.'),
  },
  { key: 'medianSize', label: t('Taille médiane'), hint: t('Lignes ajoutées et supprimées des PR mergées.') },
  LINES_COLUMN,
]

export function renderSizeCharts() {
  const rows = currentPeriod().sizes.map((size, index) => ({ ...size, label: SIZE_LABELS[index] }))
  const common = {
    rows,
    label: (row) => row.label,
    color: 'var(--series-1)',
    tooltip: (row) => ({
      title: t('{size} lignes', { size: row.label }),
      rows: [
        { label: t('PR mergées'), value: formatNumber(row.prs) },
        { label: t('délai médian de merge'), value: formatDuration(row.medianTimeToMergeHours) },
        { label: t('commentaires par PR'), value: formatDecimal(row.commentsPerPr) },
      ],
    }),
  }
  barChart($('[data-sizes-chart="time"]'), {
    ...common,
    value: (row) => row.medianTimeToMergeHours,
    format: formatDuration,
    ariaLabel: t('Délai médian de merge selon la taille des PR'),
  })
  barChart($('[data-sizes-chart="comments"]'), {
    ...common,
    value: (row) => row.commentsPerPr,
    format: formatDecimal,
    ariaLabel: t('Commentaires par PR selon la taille des PR'),
  })
}
