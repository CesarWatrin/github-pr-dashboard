// Pour moi: the reviews asked of one person, their open pull requests, and the notifications of new ones.

import { openPullRequests, personalQueue } from '../domain/open-pull-requests.js'
import { minutesIso } from '../lib/dates.js'
import { formatNumber } from '../lib/format.js'
import { displayName, isCurrent, mePeople } from '../model/people.js'
import { requiredApprovals } from '../model/pull-requests.js'
import { state, storeMe, storeNotify } from '../model/state.js'
import { notificationsOn, notificationsSupported, notifyNewReviews } from '../services/notifications.js'
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

const ME_LISTS = {
  toReview: {
    label: 'Reviews qu’on m’a demandées',
    tile: 'Reviews demandées',
    hint: 'PR des autres qui attendent encore ma review, les plus anciennes d’abord',
    empty: 'Aucune review demandée en attente',
  },
  ready: {
    label: 'Prêtes à merger',
    tile: 'Prêtes à merger',
    hint: (required) =>
      `Approuvées par ${required > 1 ? `au moins ${approvers(required)}` : approvers(required)}, sans demande de changements en cours : il ne reste qu’à merger`,
    empty: 'Aucune PR approuvée qui attend son merge',
  },
  changes: {
    label: unblockStance('changes').label,
    tile: unblockStance('changes').label,
    hint: 'Des changements demandés, sans nouvelle approbation depuis : à corriger, ou à faire relire de nouveau',
    empty: 'Aucune PR avec des changements demandés',
  },
  owners: {
    label: unblockStance('owners').label,
    tile: unblockStance('owners').label,
    hint: 'Pas encore validées, et un code owner du dépôt ne les a pas encore relues : GitHub bloque le merge',
    empty: unblockStance('owners').empty,
  },
  forgotten: { label: FORGOTTEN.label, tile: FORGOTTEN.label, hint: FORGOTTEN.hint, empty: FORGOTTEN.empty },
  open: {
    label: 'Mes PR ouvertes',
    tile: 'Mes autres PR ouvertes',
    hint: 'Les autres, sans review, en discussion ou pas encore assez approuvées : où en est chacune, ce qu’elle attend et depuis quand',
    empty: 'Aucune autre PR ouverte',
  },
}
const ME_TILES = Object.entries(ME_LISTS).map(([key, { tile }]) => ({ key, label: tile }))

// The people a pull request of the person waits for, after where it stands: those who decided or the code owners, else
// those still asked to review it.
function waitedFor(pr) {
  const stance = UNBLOCK_STANCES.find((other) => other.key === pr.stance)
  const [label, logins] = stance.by && pr.by.length ? [stance.by, pr.by] : ['en attente de', pr.requestedReviewers]
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

// Unlike the unblock page, about the code, the « Pour moi » page lists releases and integrations too: they wait for
// their reviews and code owners all the same. A tag tells them apart.
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
        document.createTextNode(' de '),
        personLink(pr.author, { withAvatar: false }),
        ...kindTag(pr),
        el('span', { className: 'feed-tag', textContent: UNBLOCK_STANCES.find((stance) => stance.key === pr.stance).tag }),
      ),
      minutesIso(pr.createdAt),
      'ouverte ',
    ),
  ready: (pr) => ownItem(pr),
  changes: (pr) => ownItem(pr),
  owners: (pr) => ownItem(pr),
  forgotten: (pr) => ownItem(pr, { tagged: true, forgotten: true }),
  open: (pr) => ownItem(pr, { tagged: true }),
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
  )

  return forgotten
    ? listItem(pr.author, text, minutesIso(pr.lastAt), `${FORGOTTEN.since} `)
    : listItem(pr.author, text, minutesIso(pr.since), `${stance.since} `)
}

// The person picked on « Pour moi », when still in the team, and their lists as of the last sync (null without one).
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

  return { me, queue: personalQueue(open, me, { forgottenBefore }) }
}

export function renderMe(mode) {
  const people = mePeople()
  const { me, queue } = meQueue()
  const picker = $('[data-me-picker]')
  const placeholder = new Option('Choisir une personne', '')
  placeholder.disabled = true
  picker.replaceChildren(placeholder, ...people.map((login) => new Option(displayName(login), login)))
  picker.value = me ?? ''

  const required = requiredApprovals()
  renderTiles($('[data-me-tiles]'), ME_TILES, Object.fromEntries(ME_TILES.map(({ key }) => [key, queue?.[key].length ?? null])), mode)
  for (const [key, list] of Object.entries(ME_LISTS)) {
    $(`[data-me-title="${key}"]`).textContent = queue ? `${list.label} (${formatNumber(queue[key].length)})` : list.label
    $(`[data-me-sub="${key}"]`).textContent = typeof list.hint === 'function' ? list.hint(required) : list.hint
    renderList($(`[data-me="${key}"]`), queue ? queue[key].map(ME_ITEMS[key]) : [], queue ? list.empty : 'Choisir une personne en haut de la page')
  }
  state.reviewsAsked = queue ? queue.toReview : null
  renderTitle()
  renderNotifyToggle()
  notifyNewReviews(me)
}

function renderNotifyToggle() {
  const button = $('[data-notify-toggle]')
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
    state.me = event.target.value
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
