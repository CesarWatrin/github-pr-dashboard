// Relecteurs: who reviews, how deep, and one person's reviews over time.

import { formatDecimal, formatNumber, formatShare } from '../lib/format.js'
import { displayName, isCurrent } from '../model/people.js'
import { BUCKET_TITLES } from '../model/periods.js'
import { frontShare } from '../model/repositories.js'
import { currentPeriod } from '../model/selection.js'
import { state } from '../model/state.js'
import { columnChart } from '../ui/charts/column-chart.js'
import { $ } from '../ui/dom.js'
import { topReposCell } from '../ui/tables/cells.js'

export const REVIEWER_COLUMNS = [
  { key: 'login', label: 'Relecteur', kind: 'person', value: (row) => displayName(row.login) },
  {
    key: 'prs',
    label: 'PR relues',
    kind: 'bar',
    hint: 'PR de code d’autres personnes avec au moins une review ou un commentaire de sa part sur la période.',
  },
  {
    key: 'stack',
    label: 'Stack',
    kind: 'stack',
    value: (row) => frontShare(row.stack),
    hint: 'Part de ces PR dans les dépôts front, back et mobile.',
  },
  {
    key: 'commentsPerPr',
    label: 'Comment. / PR',
    format: (row) => formatDecimal(row.commentsPerPr),
    hint: 'Commentaires dans le code, commentaires généraux et reviews « commentaire », par PR relue.',
  },
  {
    key: 'silentApprovalRate',
    label: 'Approb. sans comment.',
    format: (row) => formatShare(row.silentApprovalRate),
    hint: 'Part des PR approuvées sans y laisser de commentaire.',
  },
  { key: 'changesRequested', label: 'Modif. demandées', hint: 'Reviews « changements demandés ».' },
  { key: 'medianSize', label: 'Taille médiane', hint: 'Lignes ajoutées et supprimées des PR relues.' },
  { key: 'merges', label: 'Merges effectués', hint: 'PR de code mergées par la personne, les siennes comprises.' },
  {
    key: 'topRepos',
    label: 'Principaux dépôts',
    kind: 'text',
    value: (row) => row.topRepos[0]?.[0] ?? '',
    cell: (row) => topReposCell(row.topRepos, 'PR relues'),
    hint: 'Dépôts où la personne a relu le plus de PR.',
  },
]

const MINI_CHARTS = [
  { key: 'prs', title: 'PR relues', value: (point) => point.prs },
  {
    key: 'ratio',
    title: 'Commentaires par PR relue',
    decimals: true,
    value: (point) => (point.prs ? point.comments / point.prs : null),
    extraRows: (point) => [
      { label: 'PR relues', value: formatNumber(point.prs) },
      { label: 'commentaires', value: formatNumber(point.comments) },
    ],
  },
]

function personPoints(login) {
  const { series, reviewerSeries } = currentPeriod()
  const values = reviewerSeries[login] ?? []

  return series.map((point, index) => {
    const [prs, comments] = values[index] ?? [0, 0]

    return { key: point.key, partial: point.partial, prs, comments }
  })
}

export function renderMiniCharts() {
  const { bucket } = currentPeriod()
  const points = personPoints(state.person)
  for (const mini of MINI_CHARTS) {
    columnChart($(`[data-mini="${mini.key}"]`), {
      points,
      bucket,
      decimals: mini.decimals,
      series: [{ label: mini.title.toLowerCase(), color: 'var(--series-1)', value: mini.value }],
      ariaLabel: `${mini.title} ${BUCKET_TITLES[bucket]}, ${displayName(state.person)}`,
      extraRows: mini.extraRows,
    })
  }
}

export function renderPersonPicker() {
  const reviewers = Object.entries(currentPeriod().reviewerSeries)
    .filter(([login]) => isCurrent(login))
    .map(([login, points]) => ({ login, prs: points.reduce((total, [prs]) => total + prs, 0) }))
    .sort((a, b) => b.prs - a.prs)
  if (!reviewers.some((row) => row.login === state.person)) {
    state.person = reviewers[0]?.login ?? null
  }
  const picker = $('[data-person]')
  picker.replaceChildren(...reviewers.map((row) => new Option(displayName(row.login), row.login)))
  picker.value = state.person ?? ''
}

// Listens to the person picker of the reviews over time.
export function setupReviewers() {
  $('[data-person]').addEventListener('change', (event) => {
    state.person = event.target.value
    renderMiniCharts()
  })
}
