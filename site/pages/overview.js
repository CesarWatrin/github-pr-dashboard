// Vue d’ensemble: today, the totals of the period, the activity, the technologies, the repositories and the feed.

import { median } from '../domain/math.js'
import {
  capitalize,
  dayLongFormat,
  formatDecimal,
  formatDuration,
  formatLines,
  formatNumber,
  formatShare,
} from '../lib/format.js'
import { displayName } from '../model/people.js'
import { BUCKET_TITLES } from '../model/periods.js'
import { repoInfo, technologyWeights } from '../model/repositories.js'
import { comparedPeriod, currentPeriod, matchesQuery, periodTitle } from '../model/selection.js'
import { activeSquad, inSquad } from '../model/squads.js'
import { state } from '../model/state.js'
import { bucketTitle } from '../ui/charts/axis.js'
import { barChart } from '../ui/charts/bar-chart.js'
import { columnChart } from '../ui/charts/column-chart.js'
import { dataTable } from '../ui/charts/data-table.js'
import { $, $$, el } from '../ui/dom.js'
import { personLink, pullRequestLink } from '../ui/links.js'
import { listItem, renderList } from '../ui/list.js'
import { formatTechnologyShare, LINES_COLUMN, repoCell, technologiesCell } from '../ui/tables/cells.js'
import { renderTiles } from '../ui/tiles.js'

const EVENT_VERBS = {
  opened: 'a ouvert',
  merged: 'a mergé',
  approved: 'a approuvé',
  changes_requested: 'a demandé des changements sur',
  commented: 'a commenté',
}

const TODAY_TILES = [
  { key: 'opened', label: 'PR ouvertes' },
  { key: 'merged', label: 'PR mergées' },
  { key: 'reviews', label: 'Reviews soumises' },
]

// A tile with a route leads to the page that details it.
const DELIVERY_TILES = [
  { key: 'opened', label: 'PR ouvertes', route: 'authors' },
  { key: 'merged', label: 'PR de code mergées', route: 'authors' },
  { key: 'medianTimeToMergeHours', label: 'Délai médian de merge', format: formatDuration, route: 'authors', better: 'down' },
  { key: 'releases', label: 'Mises en production' },
  { key: 'hotfixShare', label: 'Part de hotfix', format: formatShare, route: 'tma', better: 'down' },
]

const LINES_TILES = [
  { key: 'added', label: 'Lignes ajoutées', format: formatLines },
  { key: 'deleted', label: 'Lignes supprimées', format: formatLines },
  { key: 'medianSize', label: 'Taille médiane des PR', route: 'authors' },
]

const REVIEW_TILES = [
  { key: 'reviewed', label: 'PR relues', route: 'reviewers' },
  { key: 'commentsPerPr', label: 'Commentaires par PR relue', format: formatDecimal, route: 'reviewers' },
  { key: 'silentApprovalRate', label: 'Approb. sans commentaire', format: formatShare, route: 'reviewers' },
  { key: 'unreviewedShare', label: 'Mergées sans review', format: formatShare, route: 'authors', better: 'down' },
]

export const REPO_COLUMNS = [
  { key: 'repo', label: 'Dépôt', kind: 'text', value: (row) => row.repo, cell: (row) => repoCell(row) },
  {
    key: 'technologies',
    label: 'Technos',
    kind: 'text',
    value: (row) => row.technologies[0]?.[0] ?? '',
    cell: (row) => technologiesCell(row.technologies),
    hint: 'Technologies principales du code du dépôt, détail au survol.',
  },
  { key: 'code', label: 'PR de code', kind: 'bar', hint: 'PR ouvertes sur la période, hors release et synchronisation de branches.' },
  { key: 'contributors', label: 'Contributeurs', hint: 'Auteurs de ces PR.' },
  LINES_COLUMN,
  {
    key: 'medianTimeToMergeHours',
    label: 'Délai de merge',
    format: (row) => formatDuration(row.medianTimeToMergeHours),
    hint: 'Médiane, de la création au merge.',
  },
  {
    key: 'unreviewedRate',
    label: 'Mergées sans review',
    format: (row) => formatShare(row.unreviewedRate),
    hint: 'Part des PR mergées sans review ni commentaire d’une autre personne que l’auteur.',
  },
  { key: 'reviewed', label: 'PR relues', hint: 'PR du dépôt avec une review ou un commentaire sur la période.' },
]

export const ACTIVITY_SERIES = [
  { label: 'PR ouvertes', color: 'var(--series-1)', value: (point) => point.opened },
  { label: 'commentaires de review', color: 'var(--series-2)', value: (point) => point.comments },
]

// The counts of today come from the sync, for the whole organization: a squad picked hides them, rather than show figures
// that are not its own.
export function renderToday(mode) {
  $('[data-today-card]').hidden = activeSquad() !== null
  const { today, timezone } = state.stats
  const currentDay = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
  $('[data-today-title]').textContent =
    today.date === currentDay ? 'Aujourd’hui' : `Le ${dayLongFormat.format(new Date(`${today.date}T12:00:00Z`))}`
  renderTiles($('[data-today]'), TODAY_TILES, today, mode)
}

export function renderTotals(mode) {
  const { totals } = currentPeriod()
  const compared = comparedPeriod()?.totals
  $('[data-totals-title]').textContent = capitalize(periodTitle())
  renderTiles($('[data-totals-delivery]'), DELIVERY_TILES, totals, mode, compared)
  renderTiles($('[data-totals-lines]'), LINES_TILES, totals, mode, compared)
  renderTiles($('[data-totals-review]'), REVIEW_TILES, totals, mode, compared)
}

export function renderActivityChart() {
  const { series, bucket } = currentPeriod()
  $('[data-chart-title]').textContent = `Activité ${BUCKET_TITLES[bucket]}`
  columnChart($('[data-chart]'), {
    points: series,
    bucket,
    series: ACTIVITY_SERIES,
    ariaLabel: `PR ouvertes et commentaires de review ${BUCKET_TITLES[bucket]}, ${periodTitle()}`,
    extraRows: (point) => [
      { label: 'PR de code mergées', value: formatNumber(point.merged) },
      { label: 'approbations', value: formatNumber(point.approvals) },
      { label: 'mises en production', value: formatNumber(point.releases) },
    ],
  })
}

// What the technologies chart can weigh, each repository's amount shared among its technologies: the code pull
// requests opened over the period, or the lines those merged added.
const TECHNOLOGY_MEASURES = {
  prs: { amount: (stats) => stats.code, share: 'Part des PR de code', of: 'des PR de code', weight: 'PR de code, au prorata' },
  added: {
    amount: (stats) => stats.added,
    share: 'Part des lignes ajoutées',
    of: 'des lignes ajoutées',
    weight: 'Lignes ajoutées, au prorata',
  },
}

export function renderTechnologiesChart() {
  const measure = TECHNOLOGY_MEASURES[state.technologyMeasure]
  for (const button of $$('[data-technology-measure]')) {
    button.setAttribute('aria-checked', String(button.dataset.technologyMeasure === state.technologyMeasure))
  }
  const amountPerRepo = new Map()
  for (const person of currentPeriod().authors) {
    for (const [repo, stats] of Object.entries(person.repos)) {
      amountPerRepo.set(repo, (amountPerRepo.get(repo) ?? 0) + measure.amount(stats))
    }
  }
  const weights = technologyWeights([...amountPerRepo])
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0)
  const rows = weights.map(([name, weight]) => ({ name, weight, share: weight / total }))
  $('[data-technologies-sub]').textContent =
    `${measure.share}, ${formatNumber(rows.length)} technologie${rows.length > 1 ? 's' : ''}`
  barChart($('[data-technologies-chart]'), {
    rows,
    label: (row) => row.name,
    technology: (row) => row.name,
    value: (row) => row.share,
    format: formatTechnologyShare,
    color: 'var(--series-1)',
    ariaLabel: `${measure.share} par technologie`,
    tooltip: (row) => ({
      title: row.name,
      rows: [
        { label: measure.of, value: formatTechnologyShare(row.share) },
        { label: measure.weight, value: formatNumber(Math.round(row.weight)) },
      ],
    }),
  })
}

export function renderChartTable() {
  const { series, bucket } = currentPeriod()
  dataTable(
    $('[data-chart-table]'),
    ['Période', 'PR ouvertes', 'Commentaires', 'PR de code mergées', 'Approbations', 'Mises en production'],
    series
      .toReversed()
      .map((point) => [
        bucketTitle(point.key, bucket) + (point.partial ? ' (incomplète)' : ''),
        formatNumber(point.opened),
        formatNumber(point.comments),
        formatNumber(point.merged),
        formatNumber(point.approvals),
        formatNumber(point.releases),
      ]),
  )
}

// Code pull requests, people, delays and reviews per repository over the period, from the per-person stats.
export function repoRows() {
  const { authors, repositories } = currentPeriod()
  const rows = new Map()
  const row = (repo) => {
    if (!rows.has(repo)) {
      rows.set(repo, { repo, code: 0, contributors: 0, merged: 0, unreviewed: 0, added: 0, deleted: 0, timesToMerge: [], reviewed: 0 })
    }

    return rows.get(repo)
  }
  for (const person of authors) {
    for (const [repo, stats] of Object.entries(person.repos)) {
      if (stats.code > 0) {
        const totals = row(repo)
        totals.code += stats.code
        totals.contributors++
        totals.merged += stats.merged
        totals.unreviewed += stats.unreviewed
        totals.added += stats.added
        totals.deleted += stats.deleted
        totals.timesToMerge.push(...stats.timesToMergeHours)
      }
    }
  }
  for (const { repo, prs } of repositories) {
    row(repo).reviewed = prs
  }

  return [...rows.values()].map((totals) => ({
    repo: totals.repo,
    category: repoInfo(totals.repo).category,
    technologies: repoInfo(totals.repo).technologies,
    code: totals.code,
    contributors: totals.contributors,
    added: totals.added,
    deleted: totals.deleted,
    medianTimeToMergeHours: median(totals.timesToMerge),
    unreviewedRate: totals.merged ? totals.unreviewed / totals.merged : null,
    reviewed: totals.reviewed,
  }))
}

const eventId = (event) => `${event.type}:${event.repo}#${event.number}:${event.actor}:${event.at}`

export function renderFeed(highlight) {
  const { events } = state.stats
  const previous = state.seenEvents
  // With a squad, the events of the pull requests of its members, whoever acted on them.
  const items = events
    .filter(
      (event) =>
        inSquad(event.author) &&
        matchesQuery(event.actor, event.author, displayName(event.actor), displayName(event.author), event.repo),
    )
    .map((event) => {
      const text = el(
        'p',
        { className: 'feed-text' },
        personLink(event.actor, { withAvatar: false }),
        document.createTextNode(` ${EVENT_VERBS[event.type]} `),
        pullRequestLink(event.repo, event.number),
      )
      if (event.type !== 'opened' && event.author !== event.actor) {
        text.append(document.createTextNode(' de '), personLink(event.author, { withAvatar: false }))
      }
      const item = listItem(event.actor, text, event.at)
      if (highlight && previous && !previous.has(eventId(event))) {
        item.classList.add('is-new')
      }

      return item
    })

  state.seenEvents = new Set(events.map(eventId))
  renderList($('[data-feed]'), items, 'Aucune activité')
}

// Listens to the measure of the technologies chart: pull requests or lines.
export function setupOverview() {
  for (const button of $$('[data-technology-measure]')) {
    button.addEventListener('click', () => {
      state.technologyMeasure = button.dataset.technologyMeasure
      if (state.stats) {
        renderTechnologiesChart()
      }
    })
  }
}
