// Lists of events, as in the activity feed.

import { dateTimeFormat, formatRelative } from '../lib/format.js'
import { el } from './dom.js'
import { avatar } from './links.js'

export function listItem(login, text, at, timePrefix = '') {
  const time = el('time', { dateTime: at, title: dateTimeFormat.format(new Date(at)), textContent: formatRelative(at) })
  time.dataset.relative = at

  return el(
    'li',
    { className: 'feed-item' },
    avatar(login),
    el('div', {}, text, el('span', { className: 'feed-time' }, document.createTextNode(timePrefix), time)),
  )
}

export function renderList(container, items, emptyText) {
  container.replaceChildren(...(items.length ? items : [el('li', { className: 'feed-empty', textContent: emptyText })]))
}
