// Relecteurs: who reviews, how deep, and one person's reviews over time.

import { formatDecimal, formatNumber, formatShare } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { displayName, isCurrent } from '../model/people.js'
import { BUCKET_TITLES } from '../model/periods.js'
import { frontShare } from '../model/repositories.js'
import { currentPeriod } from '../model/selection.js'
import { state } from '../model/state.js'
import { columnChart } from '../ui/charts/column-chart.js'
import { $ } from '../ui/dom.js'
import { topReposCell } from '../ui/tables/cells.js'

export const REVIEWER_COLUMNS = [
  { key: 'login', label: t('Relecteur'), kind: 'person', value: (row) => displayName(row.login) },
  {
    key: 'prs',
    label: t('PR relues'),
    kind: 'bar',
    hint: t('PR de code d’autres personnes avec au moins une review ou un commentaire de sa part sur la période.'),
  },
  {
    key: 'stack',
    label: t('Stack'),
    kind: 'stack',
    value: (row) => frontShare(row.stack),
    hint: t('Part de ces PR dans les dépôts front, back et mobile.'),
  },
  {
    key: 'commentsPerPr',
    label: t('Comment. / PR'),
    format: (row) => formatDecimal(row.commentsPerPr),
    hint: t('Commentaires dans le code, commentaires généraux et reviews « commentaire », par PR relue.'),
  },
  {
    key: 'silentApprovalRate',
    label: t('Approb. sans comment.'),
    format: (row) => formatShare(row.silentApprovalRate),
    hint: t('Part des PR approuvées sans y laisser de commentaire.'),
  },
  { key: 'changesRequested', label: t('Modif. demandées'), hint: t('Reviews « changements demandés ».') },
  { key: 'medianSize', label: t('Taille médiane'), hint: t('Lignes ajoutées et supprimées des PR relues.') },
  { key: 'merges', label: t('Merges effectués'), hint: t('PR de code mergées par la personne, les siennes comprises.') },
  {
    key: 'topRepos',
    label: t('Principaux dépôts'),
    kind: 'text',
    value: (row) => row.topRepos[0]?.[0] ?? '',
    cell: (row) => topReposCell(row.topRepos, t('PR relues')),
    hint: t('Dépôts où la personne a relu le plus de PR.'),
  },
]

const MINI_CHARTS = [
  { key: 'prs', title: t('PR relues'), series: t('pr relues'), value: (point) => point.prs },
  {
    key: 'ratio',
    title: t('Commentaires par PR relue'),
    series: t('commentaires par pr relue'),
    decimals: true,
    value: (point) => (point.prs ? point.comments / point.prs : null),
    extraRows: (point) => [
      { label: t('PR relues'), value: formatNumber(point.prs) },
      { label: t('commentaires'), value: formatNumber(point.comments) },
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

// The people of the picker: those still in the team who reviewed over the period, the busiest first.
const pickerReviewers = () =>
  Object.entries(currentPeriod().reviewerSeries)
    .filter(([login]) => isCurrent(login))
    .map(([login, points]) => ({ login, prs: points.reduce((total, [prs]) => total + prs, 0) }))
    .sort((a, b) => b.prs - a.prs)

// The person whose reviews the charts show: the one picked (state.person, which the address holds), while among the
// reviewers of the period, else the busiest of them. Never stored: a new period shows its own busiest, as loading its
// address does.
/** @type {(reviewers?: { login: string }[]) => string | null} */
const shownPerson = (reviewers = pickerReviewers()) =>
  reviewers.some((row) => row.login === state.person) ? state.person : (reviewers[0]?.login ?? null)

export function renderMiniCharts() {
  const person = shownPerson()
  if (!person) {
    return
  }
  const { bucket } = currentPeriod()
  const points = personPoints(person)
  for (const mini of MINI_CHARTS) {
    columnChart($(`[data-mini="${mini.key}"]`), {
      points,
      bucket,
      decimals: mini.decimals,
      series: [{ label: mini.series, color: 'var(--series-1)', value: mini.value }],
      ariaLabel: `${mini.title} ${BUCKET_TITLES[bucket]}, ${displayName(person)}`,
      extraRows: mini.extraRows,
    })
  }
}

export function renderPersonPicker() {
  const reviewers = pickerReviewers()
  const picker = $('[data-person]', HTMLSelectElement)
  picker.replaceChildren(...reviewers.map((row) => new Option(displayName(row.login), row.login)))
  picker.value = shownPerson(reviewers) ?? ''
}

// Listens to the person picker of the reviews over time.
export function setupReviewers() {
  $('[data-person]').addEventListener('change', (event) => {
    state.person = /** @type {HTMLSelectElement} */ (event.target).value
    renderMiniCharts()
  })
}
