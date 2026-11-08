// What every page shows of a project: its statuses and their colors, its name, its day, its status as a tag, its branch
// on GitHub, its name as a link that opens its dialog (pages/projects/cards.js listens to OPEN_PROJECT), wherever it
// shows, and the projects of a person or a squad, on their card (with the AC they delivered) and in their dialog.

import { isMissing } from '../domain/math.js'
import { STALLED_AFTER_DAYS } from '../domain/projects.js'
import { MINUTE_MS, parisDay } from '../domain/time.js'
import { dayDate } from '../lib/dates.js'
import { monthLongFormat, plural, rangeShortFormat } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { state } from '../model/state.js'
import { el, svg } from './dom.js'
import { ICONS_URL } from './icons.js'
import { askToOpen, githubUrl, OPEN_PROJECT } from './links.js'

// Where a project stands at the last sync: a color for the timeline and its legend, a little lighter than the series, a
// stalled one lighter still; always with its word.
export const PROJECT_STATUSES = {
  ongoing: {
    key: 'ongoing',
    label: t('En cours'),
    color: 'color-mix(in srgb, var(--series-1) 85%, var(--surface))',
    hint: t('Sa branche n’est pas mergée depuis sa dernière PR, et il a bougé dans les {days} derniers jours.', { days: STALLED_AFTER_DAYS }),
  },
  delivered: {
    key: 'delivered',
    label: t('Livré'),
    color: 'color-mix(in srgb, var(--series-3) 85%, var(--surface))',
    hint: t('Sa branche project/…/main est mergée dans une branche principale, et aucune PR du projet n’a été ouverte depuis.'),
  },
  stalled: {
    key: 'stalled',
    label: t('À l’arrêt'),
    color: 'color-mix(in srgb, var(--series-2) 55%, var(--surface))',
    hint: t('Pas livré, et plus rien depuis {days} jours : ni PR, ni review, ni commentaire, ni merge.', { days: STALLED_AFTER_DAYS }),
  },
}

// The order of the statuses in the table: those that call for attention first.
export const STATUS_ORDER = ['ongoing', 'stalled', 'delivered']

// A project's day, from minutes since the epoch: « 3 mars 2026 ».
/** @type {(minutes: number | null | undefined) => string} */
export const formatDay = (minutes) => (isMissing(minutes) ? '–' : rangeShortFormat.format(dayDate(parisDay(minutes * MINUTE_MS))))

// The name of a project. A name that several projects took (the name taken up again long after its project was over)
// comes with the month the project started: « paper-kite (mars 2024) ».
/** @type {(row: { name: string, runs: number, start: number }) => string} */
export const projectLabel = (row) =>
  row.runs > 1 ? t('{name} ({month})', { name: row.name, month: monthLongFormat.format(dayDate(parisDay(row.start * MINUTE_MS))) }) : row.name

// The status of a project as a tag: a dot of its color, and its word.
export function statusTag(status) {
  const { label, color, hint } = PROJECT_STATUSES[status]
  const dot = el('span', { className: 'project-status-dot' })
  dot.style.background = color

  return el('span', { className: `project-status is-${status}`, title: hint }, dot, document.createTextNode(label))
}

// Where the branch of a project, project/<name>/main, lives on GitHub in one of its repositories.
/** @type {(repo: string, name: string) => string} */
export const projectBranchPath = (repo, name) => `${state.stats.org}/${encodeURIComponent(repo)}/tree/project/${encodeURIComponent(name)}/main`

// The branch of a project in one of its repositories, as the GitHub mark: a link to it on GitHub, named on hover.
/**
 * @param {string} repo
 * @param {string} name
 */
export function projectBranchLink(repo, name) {
  const label = t('La branche project/{name}/main de {repo} sur GitHub', { name, repo })
  const mark = svg('svg', { viewBox: '0 0 24 24', width: 14, height: 14, 'aria-hidden': 'true' })
  mark.append(svg('use', { href: `${ICONS_URL}#github` }))
  const link = el('a', { className: 'project-branch-link', href: githubUrl(projectBranchPath(repo, name)), target: '_blank', rel: 'noopener', title: label }, mark)
  link.setAttribute('aria-label', label)

  return link
}

// A project named anywhere but on its own page: a click opens its dialog, the dot of its status before its name.
/** @param {{ key: string, name: string, runs: number, start: number, status: string }} row */
export function projectLink(row) {
  const label = projectLabel(row)
  const dot = el('span', { className: 'project-status-dot' })
  dot.style.background = PROJECT_STATUSES[row.status].color
  const button = el('button', { type: 'button', className: 'project-link', title: `${label} · ${PROJECT_STATUSES[row.status].label}` }, dot, el('span', { textContent: label }))
  button.setAttribute('aria-haspopup', 'dialog')
  button.addEventListener('click', () => askToOpen(button, OPEN_PROJECT, row.key))

  return button
}

/**
 * A project a person or a squad wrote code for over the period, and how many code pull requests (model/projects.js).
 * @typedef {{ row: { key: string, name: string, runs: number, start: number, status: string }, code: number }} ProjectShare
 */

// The projects of a person or a squad on their card, on a single line of their own: how many, then the busiest one, its
// name cut short when it does not fit, every one of them named on hover; then the AC they delivered over the period. None
// without either.
/**
 * @param {ProjectShare[]} shares
 * @param {number} [acs]
 */
export function projectLine(shares, acs = 0) {
  if (shares.length === 0 && acs === 0) {
    return []
  }
  const line = el('p', { className: 'project-line' })
  if (shares.length) {
    line.append(el('span', { textContent: plural(shares.length, 'projet') }), projectLink(shares[0].row))
    line.title = shares.map(({ row }) => projectLabel(row)).join(', ')
  }
  if (acs) {
    line.append(el('span', { className: 'project-line-acs', textContent: plural(acs, 'AC livrée', 'AC livrées') }))
  }

  return [line]
}

// The projects of a person, a squad or a repository in their dialog, across its width, each with its code pull requests
// over the period and where it stands; else what says why the list is empty.
/**
 * @param {string} title
 * @param {ProjectShare[]} shares
 */
export function projectList(title, shares) {
  const list = shares.length
    ? el(
        'ul',
        { className: 'person-dialog-list project-dialog-list' },
        ...shares.map(({ row, code }) =>
          el(
            'li',
            {},
            projectLink(row),
            el('span', { className: 'pair-count', textContent: `${plural(code, 'PR', 'PR')} · ${PROJECT_STATUSES[row.status].label}` }),
          ),
        ),
      )
    : el('p', { className: 'muted', textContent: t('Aucun projet sur la période') })

  return el('div', {}, el('p', { className: 'person-dialog-list-title', textContent: title }), list)
}
