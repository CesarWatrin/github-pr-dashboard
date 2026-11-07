// Tables: the definitions of TABLES (filled by shell/tables.js), drawn sorted and filtered, their rows following one
// another.

import { isMissing } from '../../domain/math.js'
import { formatNumber } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { STACK_CATEGORIES } from '../../model/repositories.js'
import { matchesQuery } from '../../model/selection.js'
import { state } from '../../model/state.js'
import { $, $$, el } from '../dom.js'
import { personLink } from '../links.js'
import { STAGGER_SPREAD_MS, STAGGERED_ROWS } from '../motion.js'
import { stackCell } from './cells.js'

// The tables of the pages, by name: registered by shell/tables.js before anything is drawn, so that this module draws
// them without knowing the pages.
export const TABLES = {}

export function renderStackLegends() {
  for (const legend of $$('[data-stack-legend]')) {
    legend.replaceChildren(
      document.createTextNode(t('Stack :')),
      ...STACK_CATEGORIES.map((category) => {
        const swatch = el('span', { className: 'swatch' })
        swatch.style.background = category.color

        return el('span', {}, swatch, document.createTextNode(category.label))
      }),
      el('span', { className: 'muted', textContent: t('docs, infra et outillage exclus') }),
    )
  }
}

const columnValue = (column, row) => (column.value ? column.value(row) : row[column.key])

function compareValues(a, b) {
  if (a === b) {
    return 0
  }
  if (isMissing(a)) {
    return 1
  }
  if (isMissing(b)) {
    return -1
  }

  return typeof a === 'string' ? a.localeCompare(b, 'fr') : a - b
}

function renderCell(column, row, barMax) {
  if (column.kind === 'person') {
    return el('td', { className: 'person' }, personLink(row.login))
  }
  if (column.kind === 'stack') {
    return stackCell(row.stack)
  }
  if (column.cell) {
    return column.cell(row)
  }
  const text = column.format ? column.format(row) : formatNumber(row[column.key])
  if (column.kind === 'bar') {
    const fill = el('span')
    fill.style.width = `${(100 * row[column.key]) / barMax}%`

    return el(
      'td',
      {},
      el('span', { className: 'bar-cell' }, el('span', { textContent: text }), el('span', { className: 'inline-bar' }, fill)),
    )
  }
  const classes = [column.kind === 'text' ? 'text' : '', text === '–' ? 'muted' : ''].filter(Boolean)

  return el('td', { className: classes.join(' '), textContent: text })
}

export function renderTable(name, highlight) {
  const { columns, searchTexts, rowKey = (row) => row.login } = TABLES[name]
  const rows = TABLES[name].rows()
  const sort = state.sort[name]
  const sortColumn = columns.find((column) => column.key === sort.key)
  const barColumn = columns.find((column) => column.kind === 'bar')
  const barMax = Math.max(1, ...rows.map((row) => row[barColumn.key]))
  const previous = state.previousRows[name]
  const visible = rows
    .filter((row) => matchesQuery(...searchTexts(row)))
    .sort((a, b) => {
      const order = compareValues(columnValue(sortColumn, a), columnValue(sortColumn, b))

      return order === 0 ? rowKey(a).localeCompare(rowKey(b)) : order * sort.direction
    })

  const headCells = columns.map((column) => {
    const active = column.key === sort.key
    const button = el(
      'button',
      { type: 'button' },
      document.createTextNode(column.label),
      el('span', { className: 'sort-icon', textContent: active ? (sort.direction < 0 ? '↓' : '↑') : '' }),
    )
    button.addEventListener('click', () => {
      const textual = column.kind === 'person' || column.kind === 'text'
      state.sort[name] = { key: column.key, direction: active ? -sort.direction : textual ? 1 : -1 }
      renderTable(name, false)
    })
    const cell = el('th', { scope: 'col', className: column.kind === 'text' ? 'text' : '' }, button)
    if (active) {
      cell.setAttribute('aria-sort', sort.direction < 0 ? 'descending' : 'ascending')
    }

    return cell
  })

  const bodyRows = visible.map((row, index) => {
    const tr = el('tr', {}, ...columns.map((column) => renderCell(column, row, barMax)))
    tr.style.setProperty('--delay', `${Math.round((Math.min(index, STAGGERED_ROWS) / STAGGERED_ROWS) * STAGGER_SPREAD_MS)}ms`)
    if (highlight && previous.size > 0 && previous.get(rowKey(row)) !== JSON.stringify(row)) {
      tr.classList.add('is-updated')
    }

    return tr
  })
  if (bodyRows.length === 0) {
    bodyRows.push(el('tr', {}, el('td', { colSpan: columns.length, className: 'muted', textContent: t('Aucun résultat') })))
  }

  state.previousRows[name] = new Map(rows.map((row) => [rowKey(row), JSON.stringify(row)]))
  $(`[data-${name}]`).replaceChildren(
    el('table', {}, el('thead', {}, el('tr', {}, ...headCells)), el('tbody', {}, ...bodyRows)),
  )
}

export function renderTables(highlight) {
  for (const name of Object.keys(TABLES)) {
    renderTable(name, highlight)
  }
}
