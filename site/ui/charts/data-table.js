// The figures of a chart as a table, for screen readers and for reading them all.

import { el } from '../dom.js'

export function dataTable(container, headers, rows) {
  container.replaceChildren(
    el(
      'table',
      {},
      el('thead', {}, el('tr', {}, ...headers.map((label) => el('th', { scope: 'col', textContent: label })))),
      el('tbody', {}, ...rows.map((cells) => el('tr', {}, ...cells.map((text) => el('td', { textContent: text }))))),
    ),
  )
}
