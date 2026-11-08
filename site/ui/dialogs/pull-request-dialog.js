// The timeline of a pull request, opened from its link in any list.

import { pullRequestTimeline } from '../../domain/timeline.js'
import { minuteDate } from '../../lib/dates.js'
import { dateTimeFormat, formatDuration, formatNumber, plural } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { projectKeyOf, projectOf } from '../../model/projects.js'
import { state } from '../../model/state.js'
import { $, el, svg } from '../dom.js'
import { githubPill, OPEN_PULL_REQUEST, personLink, pullRequestPath } from '../links.js'
import { projectLink } from '../projects.js'
import { kindTag } from '../stances.js'

// Timeline of a pull request: its steps, the working time it waited before each, what it still waits for, and who
// intervened (pullRequestTimeline() of site/domain/timeline.js), as of the last sync; and the project it belongs to.

const TIMELINE_STEPS = {
  opened: { label: t('Ouverte'), by: t('par') },
  commented: { label: t('Premier commentaire'), by: t('de') },
  reviewed: { label: t('Première review'), by: t('de') },
  changes: { label: t('Changements demandés'), by: t('par') },
  approved: { label: t('Approuvée'), by: t('par') },
  merged: { label: t('Mergée'), by: t('par') },
  deployed: { label: t('En prod'), note: t('Avec le déploiement suivant du dépôt') },
  closed: { label: t('Fermée sans merge'), note: t('Sans date : les données ne la gardent pas') },
}
const TIMELINE_PENDING = {
  open: t('Toujours ouverte'),
  draft: t('Toujours en brouillon'),
  production: t('Pas encore en prod'),
}
const TIMELINE_FIGURES = [
  { key: 'pickup', label: t('Prise en charge') },
  { key: 'toMerge', label: t('De l’ouverture au merge') },
  { key: 'toProduction', label: t('De l’ouverture à la prod') },
]

function timelineStep(step) {
  const definition = TIMELINE_STEPS[step.key]
  const title = el('p', { className: 'pr-step-title' }, el('strong', { textContent: definition.label }))
  if (step.login && definition.by) {
    title.append(document.createTextNode(` ${definition.by} `), personLink(step.login, { withAvatar: false }))
  }
  const details = [
    ...(step.at === null
      ? []
      : [el('time', { dateTime: minuteDate(step.at).toISOString(), textContent: dateTimeFormat.format(minuteDate(step.at)) })]),
    ...(definition.note ? [document.createTextNode(step.at === null ? definition.note : ` · ${definition.note}`)] : []),
  ]

  return el(
    'li',
    { className: `pr-step is-${step.key}` },
    ...(step.wait === null ? [] : [el('p', { className: 'pr-step-wait', textContent: t('{wait} d’attente', { wait: formatDuration(step.wait) }) })]),
    el('span', { className: 'pr-step-dot' }),
    el('div', { className: 'pr-step-body' }, title, el('p', { className: 'pr-step-time' }, ...details)),
  )
}

function pendingStep(pending) {
  return el(
    'li',
    { className: `pr-step is-pending is-${pending.key}` },
    el('p', { className: 'pr-step-wait', textContent: t('{wait} d’attente à la dernière synchro', { wait: formatDuration(pending.wait) }) }),
    el('span', { className: 'pr-step-dot' }),
    el(
      'div',
      { className: 'pr-step-body' },
      el('p', { className: 'pr-step-title' }, el('strong', { textContent: TIMELINE_PENDING[pending.key] })),
    ),
  )
}

function interventionSummary(person) {
  const parts = [
    ...(person.approved ? [plural(person.approved, 'approbation')] : []),
    ...(person.changes ? [plural(person.changes, 'demande de changements', 'demandes de changements')] : []),
    ...(person.comments ? [plural(person.comments, 'commentaire')] : []),
  ]

  return parts.join(' · ') || t('review')
}

// The state of the checks of the last commit, as the sync publishes it for the pull requests the page opens the
// timeline of (checks, null without any); a record without it, older, only tells a failure (checksFailed). Each shows
// an icon as GitHub's checks do, drawn here in the page's 16×16 style, next to its words: a check mark when they
// passed, a cross when they failed, a dot while they run or wait, a slashed circle without any.
const CHECK_ICONS = {
  success: [['path', { d: 'M3.5 8.5l3 3 6-7' }]],
  failure: [['path', { d: 'M4.5 4.5l7 7M11.5 4.5l-7 7' }]],
  pending: [['circle', { cx: 8, cy: 8, r: 4 }]],
  none: [
    ['circle', { cx: 8, cy: 8, r: 5.5 }],
    ['path', { d: 'M4.1 11.9l7.8-7.8' }],
  ],
}
const CHECK_STATES = {
  SUCCESS: { key: 'success', label: t('CI réussie') },
  FAILURE: { key: 'failure', label: t('CI en échec') },
  ERROR: { key: 'failure', label: t('CI en erreur') },
  PENDING: { key: 'pending', label: t('CI en cours') },
  EXPECTED: { key: 'pending', label: t('CI attendue') },
}
const NO_CHECKS = { key: 'none', label: t('Sans CI') }

function checksIcon(key) {
  const icon = svg('svg', { class: 'pr-checks-icon', viewBox: '0 0 16 16', 'aria-hidden': 'true' })
  for (const [tag, attributes] of CHECK_ICONS[key]) {
    icon.append(svg(tag, attributes))
  }

  return icon
}

function checksTag(pr) {
  const check = 'checks' in pr ? (CHECK_STATES[pr.checks] ?? NO_CHECKS) : pr.checksFailed ? CHECK_STATES.FAILURE : null
  if (!check) {
    return []
  }

  return [
    el(
      'span',
      { className: `pr-checks is-${check.key}`, title: t('Checks du dernier commit, à la dernière synchro') },
      checksIcon(check.key),
      document.createTextNode(check.label),
    ),
  ]
}

const PULL_REQUEST_STATUS = { merged: t('Mergée'), closed: t('Fermée sans merge'), draft: t('Brouillon'), open: t('Ouverte') }
const pullRequestStatus = (pr) => (pr.mergedAt !== null ? 'merged' : pr.closed ? 'closed' : pr.draft ? 'draft' : 'open')

// The dialog of a pull request. Closing gives the focus back to the link that opened it, when still there.
export function openPullRequestDialog(pr, opener) {
  const { steps, pending, people, durations } = pullRequestTimeline(pr, Date.parse(state.stats.generatedAt) / 60_000)
  const close = el(
    'button',
    { type: 'button', className: 'icon-button pr-dialog-close', title: t('Fermer') },
    svg('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true' }),
  )
  close.firstChild.append(svg('path', { d: 'M4 4l8 8M12 4l-8 8' }))
  close.setAttribute('aria-label', t('Fermer'))
  close.addEventListener('click', () => $('[data-pr-dialog]', HTMLDialogElement).close())

  const tags = [
    el('span', { className: `feed-tag pr-status is-${pullRequestStatus(pr)}`, textContent: PULL_REQUEST_STATUS[pullRequestStatus(pr)] }),
    ...kindTag(pr),
    ...(pr.hotfix ? [el('span', { className: 'feed-tag', textContent: t('hotfix') })] : []),
  ]
  const figures = TIMELINE_FIGURES.filter(({ key }) => durations[key] !== null).map(({ key, label }) =>
    el('div', {}, el('dt', { textContent: label }), el('dd', { textContent: formatDuration(durations[key]) })),
  )
  // The title when the stats carry it, the repository and number above it; else these as the title.
  const reference = `${pr.repo}#${pr.number}`
  // The project of the pull request, which opens its dialog over this one.
  const projectKey = projectKeyOf(pr)
  const project = projectKey === null ? null : projectOf(projectKey)
  const head = el(
    'header',
    { className: 'pr-dialog-head' },
    el('div', { className: 'pr-dialog-tags' }, ...(pr.title ? [el('span', { className: 'pr-dialog-ref', textContent: reference })] : []), ...tags),
    el('h2', { id: 'pr-dialog-title', className: 'pr-dialog-title', textContent: pr.title || reference }),
    el(
      'p',
      { className: 'pr-dialog-meta' },
      el('span', {}, document.createTextNode(`${t('Par')} `), personLink(pr.author, { withAvatar: false })),
      el('span', { textContent: t('{count} lignes modifiées', { count: formatNumber(pr.lines) }) }),
      ...(project ? [el('span', { className: 'pr-dialog-project' }, document.createTextNode(`${t('Projet')} `), projectLink(project.row))] : []),
      ...checksTag(pr),
      githubPill(pullRequestPath(pr.repo, pr.number), t('Voir sur GitHub')),
    ),
  )
  const timeline = el('ol', { className: 'pr-timeline' }, ...steps.map(timelineStep), ...(pending ? [pendingStep(pending)] : []))
  const interventions = people.length
    ? el(
        'ul',
        { className: 'pr-people' },
        ...people.map((person) =>
          el('li', {}, personLink(person.login), el('span', { className: 'pr-people-summary', textContent: interventionSummary(person) })),
        ),
      )
    : el('p', { className: 'pr-dialog-note', textContent: t('Aucune intervention d’une autre personne.') })

  // The head stays in place, with the close button; only the body under it scrolls, from its top for each pull request.
  $('[data-pr-dialog-card]').replaceChildren(
    close,
    head,
    el(
      'div',
      { className: 'pr-dialog-body' },
      ...(figures.length ? [el('dl', { className: 'pr-dialog-figures' }, ...figures)] : []),
      el(
        'section',
        { className: 'pr-dialog-section' },
        el('h3', { textContent: t('Frise') }),
        el('p', { className: 'pr-dialog-note', textContent: t('Attentes en heures ouvrées : du lundi au vendredi, de 9 h à 18 h.') }),
        timeline,
      ),
      el('section', { className: 'pr-dialog-section' }, el('h3', { textContent: t('Interventions') }), interventions),
    ),
  )
  const dialog = $('[data-pr-dialog]', HTMLDialogElement)
  if (dialog.open) {
    close.focus()

    return
  }
  dialog.addEventListener('close', () => opener.isConnected && opener.focus(), { once: true })
  dialog.showModal()
}

// A pull request clicked in a list opens its timeline (ui/links.js), which closes from its button, with Escape or on
// its backdrop: its card fills the dialog, so only a click on the backdrop reaches the dialog itself.
export function setupPullRequestDialog() {
  document.addEventListener(OPEN_PULL_REQUEST, (event) => openPullRequestDialog(/** @type {CustomEvent} */ (event).detail, event.target))
  $('[data-pr-dialog]').addEventListener('click', (event) => {
    if (event.target === event.currentTarget) {
      /** @type {HTMLDialogElement} */ (event.currentTarget).close()
    }
  })
}
