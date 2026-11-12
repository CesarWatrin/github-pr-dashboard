// Mes PR: the reviews asked of one person, their open pull requests and drafts, and the notifications of new ones.

import { openPullRequests, ownDrafts, personalQueue } from '../domain/open-pull-requests.js'
import { minutesIso } from '../lib/dates.js'
import { formatNumber } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { displayName, isCurrent, mePeople } from '../model/people.js'
import { pullRequestOf, requiredApprovals } from '../model/pull-requests.js'
import { state, storeMe, storeNotify } from '../model/state.js'
import { notificationsOn, notificationsSupported, notifyNewItems } from '../services/notifications.js'
import { $, el } from '../ui/dom.js'
import { personLink, pullRequestLink } from '../ui/links.js'
import { listItem, renderList } from '../ui/list.js'
import {
  approvers,
  FORGOTTEN,
  FORGOTTEN_AFTER_DAYS,
  kindTag,
  reviewerName,
  UNBLOCK_STANCES,
  unblockStance,
} from '../ui/stances.js'
import { renderTiles } from '../ui/tiles.js'
import { renderTitle } from '../ui/title.js'

// The lists of the page, in its order: first what the person has to act on (urgent), which the red badges, the tab and
// the notifications count, then what waits on someone else. The grey badge counts the person's own: every list but the
// reviews asked of them, drafts included.
const ME_LISTS = {
  toReview: {
    label: t('Reviews qu’on m’a demandées'),
    tile: t('Reviews demandées'),
    hint: t('PR des autres qui attendent encore ma review, les plus anciennes d’abord'),
    empty: t('Aucune review demandée en attente'),
    urgent: true,
  },
  ready: {
    label: t('Prêtes à merger'),
    tile: t('Prêtes à merger'),
    hint: (required) =>
      t('Approuvées par {who}, sans demande de changements en cours : il ne reste qu’à merger', {
        who: required > 1 ? t('au moins {count}', { count: approvers(required) }) : approvers(required),
      }),
    empty: t('Aucune PR approuvée qui attend son merge'),
    urgent: true,
  },
  changes: {
    label: unblockStance('changes').label,
    tile: unblockStance('changes').label,
    hint: t('Des changements demandés, sans nouvelle approbation depuis : à corriger, ou à faire relire de nouveau'),
    empty: t('Aucune PR avec des changements demandés'),
    urgent: true,
  },
  forgotten: {
    label: FORGOTTEN.label,
    tile: FORGOTTEN.label,
    hint: FORGOTTEN.hint,
    empty: FORGOTTEN.empty,
    urgent: true,
  },
  owners: {
    label: unblockStance('owners').label,
    tile: unblockStance('owners').label,
    hint: t('Pas encore validées, et un code owner du dépôt ne les a pas encore relues : GitHub bloque le merge'),
    empty: unblockStance('owners').empty,
  },
  open: {
    label: t('Mes PR ouvertes'),
    tile: t('Mes autres PR ouvertes'),
    hint: t('Les autres, sans review, en discussion ou pas encore assez approuvées : où en est chacune, ce qu’elle attend et depuis quand'),
    empty: t('Aucune autre PR ouverte'),
  },
  drafts: {
    label: t('Mes brouillons'),
    tile: t('Mes brouillons'),
    hint: t('Mes PR encore en brouillon, les plus anciennes d’abord : elles n’attendent encore personne'),
    empty: t('Aucune PR en brouillon'),
  },
}
const ME_TILES = Object.entries(ME_LISTS).map(([key, { tile }]) => ({ key, label: tile }))

// The people a pull request of the person waits for, after where it stands: those who decided or the code owners, else
// those still asked to review it.
function waitedFor(pr) {
  const stance = UNBLOCK_STANCES.find((other) => other.key === pr.stance)
  const [label, logins] = stance.by && pr.by.length ? [stance.by, pr.by] : [t('en attente de'), pr.requestedReviewers]
  if (!logins.length) {
    return []
  }

  return [
    el(
      'span',
      { className: 'feed-by' },
      document.createTextNode(` · ${label} `),
      ...logins.flatMap((login, index) => [...(index ? [document.createTextNode(', ')] : []), reviewerName(login)]),
    ),
  ]
}

// The title of a pull request, quiet under its link, so that one tells them apart: whole on hover, nothing when the
// stats do not carry it.
function prTitle(pr) {
  const title = pullRequestOf(pr.repo, pr.number)?.title

  return title ? [el('span', { className: 'feed-pr-title', textContent: title, title })] : []
}

// Unlike the unblock page, about the code, the « Mes PR » page lists releases and integrations too: they wait for
// their reviews and code owners all the same. A tag tells them apart.
/** @type {PullRequestKind[]} */
const ME_KINDS = ['code', 'integration', 'release']

const ME_ITEMS = {
  // Someone else's pull request, where it stands, since its opening.
  toReview: (pr) =>
    listItem(
      pr.author,
      el(
        'p',
        { className: 'feed-text' },
        pullRequestLink(pr.repo, pr.number),
        document.createTextNode(` ${t('de')} `),
        personLink(pr.author, { withAvatar: false }),
        ...kindTag(pr),
        el('span', { className: 'feed-tag', textContent: UNBLOCK_STANCES.find((stance) => stance.key === pr.stance).tag }),
        ...prTitle(pr),
      ),
      minutesIso(pr.createdAt),
      `${t('ouverte')} `,
    ),
  ready: (pr) => ownItem(pr),
  changes: (pr) => ownItem(pr),
  owners: (pr) => ownItem(pr),
  forgotten: (pr) => ownItem(pr, { tagged: true, forgotten: true }),
  open: (pr) => ownItem(pr, { tagged: true }),
  // A draft, since its opening.
  drafts: (pr) =>
    listItem(
      pr.author,
      el('p', { className: 'feed-text' }, pullRequestLink(pr.repo, pr.number), ...kindTag(pr), ...prTitle(pr)),
      minutesIso(pr.createdAt),
      `${t('ouverte')} `,
    ),
}

// One of the person's own pull requests: who it waits for and since when it stands where it does, or, forgotten, its
// latest activity; where it stands when its list does not say.
function ownItem(pr, { tagged = false, forgotten = false } = {}) {
  const stance = UNBLOCK_STANCES.find((other) => other.key === pr.stance)
  const text = el(
    'p',
    { className: 'feed-text' },
    pullRequestLink(pr.repo, pr.number),
    ...kindTag(pr),
    ...(tagged ? [el('span', { className: 'feed-tag', textContent: stance.tag })] : []),
    ...(forgotten ? [] : waitedFor(pr)),
    ...prTitle(pr),
  )

  return forgotten
    ? listItem(pr.author, text, minutesIso(pr.lastAt), `${FORGOTTEN.since} `)
    : listItem(pr.author, text, minutesIso(pr.since), `${stance.since} `)
}

// The person picked on « Mes PR », when still in the team, and their lists as of the last sync (null without one).
function meQueue() {
  const me = mePeople().includes(state.me) ? state.me : null
  if (!me) {
    return { me, queue: null }
  }
  const open = openPullRequests(state.stats.pullRequests, { requiredApprovals: requiredApprovals(), kinds: ME_KINDS }).filter(
    (pr) => isCurrent(pr.author),
  )
  // Forgotten as on the unblock page: no review nor comment for FORGOTTEN_AFTER_DAYS.
  const forgottenBefore = Date.now() / 60_000 - FORGOTTEN_AFTER_DAYS * 24 * 60

  return {
    me,
    queue: { ...personalQueue(open, me, { forgottenBefore }), drafts: ownDrafts(state.stats.pullRequests, me, { kinds: ME_KINDS }) },
  }
}

export function renderMe(mode) {
  const people = mePeople()
  const { me, queue } = meQueue()
  const picker = $('[data-me-picker]', HTMLSelectElement)
  const placeholder = new Option(t('Choisir une personne'), '')
  placeholder.disabled = true
  picker.replaceChildren(placeholder, ...people.map((login) => new Option(displayName(login), login)))
  picker.value = me ?? ''

  const required = requiredApprovals()
  renderTiles($('[data-me-tiles]'), ME_TILES, Object.fromEntries(ME_TILES.map(({ key }) => [key, queue?.[key].length ?? null])), mode)
  for (const [key, list] of Object.entries(ME_LISTS)) {
    $(`[data-me-title="${key}"]`).textContent = queue ? `${list.label} (${formatNumber(queue[key].length)})` : list.label
    $(`[data-me-sub="${key}"]`).textContent = typeof list.hint === 'function' ? list.hint(required) : list.hint
    renderList($(`[data-me="${key}"]`), queue ? queue[key].map(ME_ITEMS[key]) : [], queue ? list.empty : t('Choisir une personne en haut de la page'))
  }
  // What its urgent lists hold, each pull request in one list only: what the tab, the red badges and the notifications
  // count. And how many pull requests of the person's own they hold, for the grey badge.
  const lists = Object.entries(ME_LISTS)
  state.forMe = queue ? lists.filter(([, list]) => list.urgent).flatMap(([key]) => queue[key].map((pr) => ({ list: key, pr }))) : null
  state.meOwn = queue ? lists.filter(([key]) => key !== 'toReview').reduce((sum, [key]) => sum + queue[key].length, 0) : 0
  renderTitle()
  renderNotifyToggle()
  notifyNewItems(me)
}

function renderNotifyToggle() {
  const button = $('[data-notify-toggle]', HTMLButtonElement)
  button.hidden = !notificationsSupported()
  if (button.hidden) {
    return
  }
  const denied = Notification.permission === 'denied'
  button.disabled = denied
  button.setAttribute('aria-pressed', String(notificationsOn()))
  $('[data-notify-denied]').hidden = !denied
}

async function toggleNotifications() {
  if (notificationsOn()) {
    state.notify = false
  } else {
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    state.notify = permission === 'granted'
  }
  storeNotify()
  renderNotifyToggle()
}

// Listens to the person picker and the notifications toggle, and to the permission of the browser.
export function setupMe() {
  $('[data-me-picker]').addEventListener('change', (event) => {
    state.me = /** @type {HTMLSelectElement} */ (event.target).value
    storeMe()
    renderMe('enter')
  })
  $('[data-notify-toggle]').addEventListener('click', toggleNotifications)
  // Notifications allowed or blocked from the browser's settings while the page is open.
  navigator.permissions
    ?.query({ name: 'notifications' })
    .then((status) => status.addEventListener('change', renderNotifyToggle))
    .catch(() => {
      // Unknown permission name: the toggle is drawn again with the next stats.
    })
}
