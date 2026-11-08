// What every page shows of a project: its statuses and their colors, its name, its day, its status as a tag, the name
// of a stage, the pull request that merges its branch on GitHub, its name as a link that opens its dialog (pages/projects/cards.js listens to OPEN_PROJECT), wherever it
// shows, and the projects of a person or a squad, on their card and in their dialog.

import { isMissing } from '../domain/math.js'
import { STALLED_AFTER_DAYS } from '../domain/projects.js'
import { MINUTE_MS, parisDay } from '../domain/time.js'
import { dayDate } from '../lib/dates.js'
import { monthLongFormat, plural, rangeShortFormat } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { state } from '../model/state.js'
import { el, svg } from './dom.js'
import { ICONS_URL } from './icons.js'
import { askToOpen, githubUrl, OPEN_PROJECT, pullRequestPath } from './links.js'

// Where a project, or one of its stages, stands at the last sync: a color for the timeline and its legend, a little lighter than the series, a
// stalled one lighter still, an abandoned one in the red of what was dropped; always with its word.
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
    hint: t('Sa branche project/…/main est mergée dans une branche principale (pour un projet en étapes, chacune livrée ou abandonnée), et aucune PR du projet n’a été ouverte depuis.'),
  },
  abandoned: {
    key: 'abandoned',
    label: t('Abandonné'),
    color: 'color-mix(in srgb, var(--diff-deleted) 50%, var(--surface))',
    hint: t('Toutes les PR qui mergent sa branche project/…/main, ou celles de chacune de ses étapes, ont été fermées sans merge, et plus aucune PR du projet n’est ouverte.'),
  },
  stalled: {
    key: 'stalled',
    label: t('À l’arrêt'),
    color: 'color-mix(in srgb, var(--series-2) 55%, var(--surface))',
    hint: t('Pas livré, et plus rien depuis {days} jours : ni PR, ni review, ni commentaire, ni merge.', { days: STALLED_AFTER_DAYS }),
  },
}

// The order of the statuses in the table: those that call for attention first.
export const STATUS_ORDER = ['ongoing', 'stalled', 'abandoned', 'delivered']

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

// The name of a stage of a project (stage of domain/projects.js): « Étape 2.1 », « Étape pilot »; the main branch of the
// project, merged on its own beside its stages, « Branche main ».
/** @type {(stage: string | null) => string} */
export const stageLabel = (stage) => (stage === null ? t('Branche main') : t('Étape {stage}', { stage }))

// What the pull request of a merge brings, in its title: the branch of the project, one of its stages for a project in
// stages, or the stage named.
/**
 * @param {{ name: string, stages?: unknown[] }} row
 * @param {string | null} [stage] the stage named, null for the main branch of the project; none for the project
 */
export function mergedBranch(row, stage) {
  if (stage === undefined && row.stages?.length) {
    return t('une étape du projet')
  }

  return stage ? t('l’étape {stage}', { stage }) : `project/${row.name}/main`
}

// Where the branch of a project, project/<name>/main, or one of its stages, comes back in one of its repositories, on
// GitHub: the pull request that merges it into a long-lived branch (mergeRequestsOf() of domain/projects.js), merged,
// still open or closed without a merge; else, without any, the pull requests of the project in that repository. Its
// state gives its color: green once merged, red when closed, grey otherwise.
/**
 * @param {{ name: string, stages?: unknown[], mergeRequests: Record<string, { number: number, state: 'merged' | 'open' | 'closed' }> }} row
 * @param {string} repo
 * @param {string} [branch] what it merges, in its title (mergedBranch())
 * @returns {{ path: string, state: 'merged' | 'open' | 'closed' | 'none', title: string }}
 */
export function projectMergeOf(row, repo, branch = mergedBranch(row)) {
  const request = row.mergeRequests[repo]
  if (!request) {
    const own = `project/${row.name}/main`
    const query = encodeURIComponent(`is:pr head:${own} OR base:${own}`)

    return { path: `${state.stats.org}/${encodeURIComponent(repo)}/pulls?q=${query}`, state: 'none', title: t('Pas de PR de merge de {branch} dans {repo} : ses PR sur GitHub', { branch: own, repo }) }
  }
  const titles = {
    merged: t('La PR qui merge {branch} dans {repo}, mergée', { branch, repo }),
    open: t('La PR qui merge {branch} dans {repo}, encore ouverte', { branch, repo }),
    closed: t('La PR qui merge {branch} dans {repo}, fermée sans merge', { branch, repo }),
  }

  return { path: pullRequestPath(repo, request.number), state: request.state, title: titles[request.state] }
}

// The pull request that merges the branch of a project in one of its repositories, as the GitHub mark in the color of its
// state: a link to it on GitHub, named on hover.
/**
 * @param {Parameters<typeof projectMergeOf>[0]} row
 * @param {string} repo
 */
export function projectMergeLink(row, repo) {
  const { path, state: mergeState, title } = projectMergeOf(row, repo)
  const mark = svg('svg', { viewBox: '0 0 24 24', width: 14, height: 14, 'aria-hidden': 'true' })
  mark.append(svg('use', { href: `${ICONS_URL}#github` }))
  const link = el('a', { className: `project-merge-link is-${mergeState}`, href: githubUrl(path), target: '_blank', rel: 'noopener', title }, mark)
  link.setAttribute('aria-label', title)

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
// name cut short when it does not fit, every one of them named on hover; none without any.
/** @param {ProjectShare[]} shares */
export function projectLine(shares) {
  if (shares.length === 0) {
    return []
  }
  const line = el('p', { className: 'project-line' }, el('span', { textContent: plural(shares.length, 'projet') }), projectLink(shares[0].row))
  line.title = shares.map(({ row }) => projectLabel(row)).join(', ')

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
