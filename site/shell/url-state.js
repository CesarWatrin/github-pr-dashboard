// The address of the page follows its filters and the card open (model/url-state.js), so that it can be shared: read
// at load and when a link is pasted in an open tab, written back as the viewer changes them, without a new entry in the
// history of the browser. A link opened before the password is typed waits for the stats to open its card.

import { pullRequestOf } from '../model/pull-requests.js'
import { currentRoute, ROUTES } from '../model/routes.js'
import { state } from '../model/state.js'
import { applyUrlQuery, urlQueryOf } from '../model/url-state.js'
import { $ } from '../ui/dom.js'
import { askToOpen, OPEN_PERSON, OPEN_PROJECT, OPEN_PULL_REQUEST, OPEN_REPOSITORY, OPEN_SQUAD } from '../ui/links.js'

/** @type {ReturnType<typeof applyUrlQuery> | null} */
let pending = null
// The address last written, so that only one pasted or typed is read again.
let written = ''
/** @type {ReturnType<typeof setTimeout> | undefined} */
let timer

const OPEN_EVENTS = { person: OPEN_PERSON, repo: OPEN_REPOSITORY, project: OPEN_PROJECT, squad: OPEN_SQUAD }

/** @returns {string | null} */
function queryOfHash() {
  const index = location.hash.indexOf('?')

  return index < 0 ? null : location.hash.slice(index + 1)
}

// The state of the address, when it holds one; the search field shows its search.
function readQuery() {
  const query = queryOfHash()
  if (query === null) {
    return false
  }
  pending = applyUrlQuery(query)
  $('[data-search]', HTMLInputElement).value = state.query

  return true
}

// At load, before the first render.
export const readUrlState = () => readQuery()

// Once the stats are drawn: opens the card and the timeline of a pull request the address names.
export function openFromUrl() {
  if (!pending || !state.stats) {
    return
  }
  const { card, pullRequest } = pending
  pending = null
  const opener = $('[data-main]')
  if (card) {
    askToOpen(opener, OPEN_EVENTS[card.kind], card.key)
  }
  if (pullRequest) {
    const [repo, number] = pullRequest.split('#')
    const pr = pullRequestOf(repo, Number(number))
    if (pr) {
      askToOpen(opener, OPEN_PULL_REQUEST, pr)
    }
  }
  scheduleUrlWrite()
}

// The address of the state of the page, in place of the one shown.
function writeUrlState() {
  if (!state.stats) {
    return
  }
  const route = currentRoute()
  const hash = `${ROUTES[route].hash}?${urlQueryOf(route)}`
  if (location.hash !== hash) {
    history.replaceState(history.state, '', `${location.pathname}${location.search}${hash}`)
  }
  written = location.hash
}

// Written once whatever changed it has been drawn.
export function scheduleUrlWrite() {
  clearTimeout(timer)
  timer = setTimeout(writeUrlState)
}

// Any choice of the viewer may change the state: the address follows, and an address pasted in the tab is read.
export function setupUrlState({ render }) {
  for (const type of ['click', 'input', 'change', 'keyup']) {
    document.addEventListener(type, scheduleUrlWrite, true)
  }
  // A dialog closing does not bubble: caught on its way down.
  document.addEventListener('close', scheduleUrlWrite, true)
  window.addEventListener('hashchange', () => {
    if (location.hash !== written && readQuery() && state.stats) {
      render(false)
      openFromUrl()
    }
    scheduleUrlWrite()
  })
}
