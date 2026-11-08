// Projets: what the projects of the period add up to, their timeline, a card per project, and the table that compares
// them. Every part follows the period, the squad and the search; without any project in the data, the page says how one
// is found.

import { parisDay } from '../../domain/time.js'
import { capitalize, formatDecimal, formatDuration, formatNumber, formatShare } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { anyProject, currentProjects } from '../../model/projects.js'
import { matchesQuery, periodRange, periodTitle } from '../../model/selection.js'
import { state } from '../../model/state.js'
import { ganttChart } from '../../ui/charts/gantt-chart.js'
import { renderLegend } from '../../ui/charts/legend.js'
import { $, el } from '../../ui/dom.js'
import { LINES_COLUMN } from '../../ui/tables/cells.js'
import { renderTiles } from '../../ui/tiles.js'
import { openProjectDialog, projectCard } from './cards.js'
import { formatDay, formatShortDay, formatSpan, lastMergeOf, PROJECT_FIGURES, PROJECT_STATUSES, STATUS_ORDER, statusTag } from './figures.js'

const PROJECT_TILES = [
  { key: 'ongoing', label: t('Projets en cours') },
  { key: 'delivered', label: t('Livrés sur la période') },
  { key: 'medianDays', label: t('Durée médiane jusqu’à la livraison'), format: formatSpan },
  { key: 'medianIntegrationHours', label: t('Intégration médiane'), format: formatDuration },
]

// The projects the search finds, by their name or their repositories.
const foundRows = () => currentProjects().rows.filter((row) => matchesQuery(row.name, ...row.repos.map(([repo]) => repo)))

// The name of a project in the table opens its dialog, as its card does; its repositories follow, under it.
function nameCell(row) {
  const pick = el('button', { type: 'button', className: 'squad-pick project-pick', textContent: row.name, title: row.name })
  pick.setAttribute('aria-haspopup', 'dialog')
  pick.addEventListener('click', () => openProjectDialog(row, currentProjects().rows, pick))
  const repos = row.repos.map(([repo]) => repo).join(', ')

  return el('td', { className: 'text project-name-cell' }, pick, el('span', { className: 'project-name-repos', textContent: repos, title: repos }))
}

// A figure of a project as a column of the table (shell/tables.js): sorted on its value, shown in its format, shorter
// than on the cards so that the fourteen columns fit. Their hints make the legend under the table.
const column = (key, format = PROJECT_FIGURES[key].format ?? formatNumber) => {
  const figure = PROJECT_FIGURES[key]
  const read = figure.value ?? ((row) => row[key])

  return { ...figure, value: read, format: (row) => format(read(row)) }
}
// A day, in short and small.
const dateColumn = (key) => ({ ...column(key, formatShortDay), cell: (row) => el('td', { className: 'project-date', textContent: formatShortDay(column(key).value(row)) }) })
export const PROJECT_COLUMNS = [
  {
    key: 'name',
    label: t('Projet'),
    kind: 'text',
    value: (row) => row.name,
    cell: nameCell,
    hint: t('Le nom de sa branche project/…/main, et ses dépôts dessous : un projet du même nom dans plusieurs dépôts n’en fait qu’un.'),
  },
  {
    key: 'status',
    label: t('Statut'),
    kind: 'text',
    // Sorted as they call for attention, whatever the language of their words: under way, stalled, then delivered.
    value: (row) => STATUS_ORDER.indexOf(row.status),
    format: (row) => PROJECT_STATUSES[row.status].label,
    cell: (row) => el('td', { className: 'text' }, statusTag(row.status)),
    hint: PROJECT_FIGURES.status.hint,
  },
  dateColumn('start'),
  dateColumn('lastMerge'),
  dateColumn('lastActivity'),
  column('days', (days) => formatSpan(days, { short: true })),
  { ...PROJECT_FIGURES.code, kind: 'bar' },
  { ...PROJECT_FIGURES.merged },
  {
    key: 'people',
    label: t('Personnes'),
    format: (row) => formatNumber(row.people),
    // How many, and under it the share of the team they are.
    cell: (row) =>
      el(
        'td',
        { className: 'project-people' },
        el('span', { textContent: formatNumber(row.people) }),
        el('span', { className: 'project-share', textContent: formatShare(row.teamShare) }),
      ),
    hint: t('Personnes qui ont ouvert ces PR, parties comprises, et la part de l’équipe (ou de la squad choisie) encore là qu’elles sont.'),
  },
  column('reviewers'),
  { ...LINES_COLUMN, hint: PROJECT_FIGURES.lines.hint },
  column('medianTimeToMergeHours'),
  column('integrationHours'),
  column('perWeek', (value) => formatDecimal(Math.round(value * 10) / 10)),
]

// What the timeline shows of a project: its name and status, its span within the period, fading in where the period cuts
// it and out where it goes on, flat where it stopped; its merges; its dates and figures on hover.
function timelineRow(row, rows) {
  const status = PROJECT_STATUSES[row.status]
  const lastMerge = lastMergeOf(row)
  const cut = row.span.cutStart
    ? row.span.cutEnd
      ? t('Commencé avant la période, il continue après : sa barre est coupée aux deux bords.')
      : t('Commencé avant la période : sa barre est coupée à gauche.')
    : row.span.cutEnd
      ? t('Il continue après la période : sa barre est coupée à droite.')
      : null
  const dates = t('du {start} au {end}', { start: formatDay(row.start), end: formatDay(row.end) })

  return {
    key: row.name,
    head: [el('span', { className: 'gantt-name', textContent: row.name, title: row.name }), statusTag(row.status)],
    from: row.span.from,
    to: row.span.to,
    fadeStart: row.span.cutStart,
    fadeEnd: row.span.cutEnd || row.status === 'ongoing',
    flatEnd: row.status === 'stalled' && !row.span.cutEnd,
    color: status.color,
    markers: row.merges,
    ariaLabel: [`${row.name}, ${status.label}, ${dates}.`, ...(cut ? [cut] : [])].join(' '),
    tooltip: {
      title: row.name,
      rows: [
        { color: status.color, value: status.label, label: t('à la dernière synchro') },
        { value: formatDay(row.start), label: t('début') },
        ...(lastMerge === null ? [] : [{ value: formatDay(lastMerge), label: t('mergé dans une branche principale') }]),
        ...(row.merges.length > 1 ? [{ value: formatNumber(row.merges.length), label: t('merges de sa branche') }] : []),
        { value: formatDay(row.lastActivity), label: t('dernière activité') },
        { value: formatSpan(row.days), label: t('de durée') },
        { value: formatNumber(row.code), label: t('PR de code sur la période') },
        { value: formatNumber(row.people), label: t('personnes') },
      ],
      note: cut,
    },
    open: (opener) => openProjectDialog(row, rows, opener),
  }
}

// The timeline of the projects, as wide as its card: drawn when the page shows, and again as it resizes. A dashed line
// marks the last sync, « Aujourd’hui » when it was today.
export function renderProjectTimeline() {
  const container = $('[data-project-timeline]')
  if (!state.stats || container.clientWidth === 0 || !anyProject()) {
    return
  }
  const rows = foundRows()
  if (rows.length === 0) {
    container.replaceChildren(el('p', { className: 'chart-empty', textContent: t('Aucun projet à montrer') }))

    return
  }
  const lastSync = Date.parse(state.stats.generatedAt)
  ganttChart(container, {
    range: periodRange(),
    rows: rows.map((row) => timelineRow(row, currentProjects().rows)),
    ariaLabel: t('Calendrier des projets, {period}', { period: periodTitle() }),
    now: { at: lastSync, label: parisDay(lastSync) === parisDay(Date.now()) ? t('Aujourd’hui') : formatDay(lastSync / 60_000) },
  })
}

// The words of the timeline's colors, and its dots.
function renderTimelineLegend() {
  const legend = $('[data-project-timeline-legend]')
  renderLegend(legend, Object.values(PROJECT_STATUSES))
  legend.append(el('span', {}, el('span', { className: 'swatch gantt-legend-merge' }), document.createTextNode(t('Merge dans une branche principale'))))
}

export function renderProjects(mode = 'enter') {
  const any = anyProject()
  $('[data-projects-empty]').hidden = any
  $('[data-projects-content]').hidden = !any
  if (!any) {
    return
  }
  const { summary } = currentProjects()
  $('[data-projects-sub]').textContent = t('{period} : les projets dont la vie croise la période, du premier commencé au dernier', {
    period: capitalize(periodTitle()),
  })
  renderTiles($('[data-project-tiles]'), PROJECT_TILES, summary, mode)
  renderTimelineLegend()
  const rows = foundRows()
  const cards = $('[data-project-cards]')
  if (rows.length === 0) {
    cards.replaceChildren(
      el('p', { className: 'feed-empty', textContent: state.query ? t('Aucun projet ne correspond à cette recherche') : t('Aucun projet sur la période') }),
    )
  } else {
    cards.replaceChildren(...rows.map((row, index) => projectCard(row, index, currentProjects().rows)))
  }
  renderProjectTimeline()
}

