// A grid of intensities, rows × columns.

import { formatNumber } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { el, svg } from '../dom.js'
import { STAGGER_SPREAD_MS } from '../motion.js'
import { bindTooltip, hideTooltip, showTooltip } from '../tooltip.js'
import { measureText, truncateText } from './measure.js'

// Grid of intensities, one cell per row and column, darker as the value grows. rows and columns are { key, label },
// flagged grouped when they add up several entries: these stay out of the color scale, which they would flatten.
// value(row, column) is a count, tooltip(row, column, value) the content of the tooltip of a cell. Labels of columns
// too wide for their cell are tilted; on cells too narrow for tilted labels side by side (a phone), only one column in
// two or three keeps its label, the last one always, as the other charts thin their axis out.
const TILTED_LABEL_SPACING = 18

export function heatmapChart(container, { rows, columns, value, ariaLabel, tooltip, format = formatNumber }) {
  const width = container.clientWidth
  if (width === 0) {
    return
  }
  if (rows.length === 0 || columns.length === 0) {
    container.replaceChildren(el('p', { className: 'chart-empty', textContent: t('Aucune donnée sur la période') }))

    return
  }
  const maxLabel = 120
  const rowLabels = rows.map((row) => truncateText(row.label, maxLabel))
  const columnLabels = columns.map((column) => truncateText(column.label, maxLabel))
  const labelWidth = Math.max(...rowLabels.map(measureText)) + 10
  const columnLabelWidth = Math.max(...columnLabels.map(measureText))
  const fit = (right) => Math.min(52, (width - labelWidth - right) / columns.length)
  let cell = fit(0)
  const tilted = columnLabelWidth > cell - 6
  if (tilted) {
    // A label tilted by 45° reaches past the right of its column: the last one needs room.
    cell = fit(Math.max(0, columnLabelWidth * Math.SQRT1_2 - cell / 2))
  }
  const header = tilted ? Math.ceil(columnLabelWidth * Math.SQRT1_2) + 14 : 22
  const height = header + rows.length * cell
  const values = rows.map((row) => columns.map((column) => value(row, column)))
  const max = Math.max(
    1,
    ...values.flatMap((cells, rowIndex) => (rows[rowIndex].grouped ? [] : cells.filter((_, index) => !columns[index].grouped))),
  )

  const root = svg('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': ariaLabel })
  const step = tilted ? Math.ceil(TILTED_LABEL_SPACING / cell) : 1
  columns.forEach((column, index) => {
    if ((columns.length - 1 - index) % step !== 0) {
      return
    }
    const x = labelWidth + cell * index + cell / 2
    const label = tilted
      ? svg('text', { class: 'axis-label', x, y: header - 8, transform: `rotate(-45 ${x} ${header - 8})` })
      : svg('text', { class: 'axis-label', x, y: header - 8, 'text-anchor': 'middle' })
    label.textContent = columnLabels[index]
    root.append(label)
  })
  rows.forEach((row, rowIndex) => {
    const y = header + cell * rowIndex
    const label = svg('text', { class: 'axis-label', x: labelWidth - 10, y: y + cell / 2, 'text-anchor': 'end', 'dominant-baseline': 'middle' })
    label.textContent = rowLabels[rowIndex]
    root.append(label)
    columns.forEach((column, columnIndex) => {
      const amount = values[rowIndex][columnIndex]
      const x = labelWidth + cell * columnIndex
      const group = svg('g', { class: 'heat-group' })
      group.style.setProperty('--delay', `${Math.round(((rowIndex + columnIndex) / (rows.length + columns.length)) * STAGGER_SPREAD_MS)}ms`)
      const share = Math.min(1, amount / max)
      const rect = svg('rect', { class: amount ? 'heat-cell' : 'heat-cell is-empty', x: x + 1, y: y + 1, width: cell - 2, height: cell - 2, rx: 4 })
      if (amount) {
        rect.style.fill = `color-mix(in srgb, var(--series-1) ${Math.round(18 + 82 * share)}%, var(--surface))`
      }
      group.append(rect)
      if (amount && cell >= 22) {
        const text = svg('text', {
          class: share > 0.5 ? 'heat-label is-strong' : 'heat-label',
          x: x + cell / 2,
          y: y + cell / 2,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
        })
        text.textContent = format(amount)
        group.append(text)
      }
      root.append(group)
      // Only the cells with a value take the keyboard focus: an empty grid would take dozens of tab stops.
      if (amount) {
        const content = tooltip(row, column, amount)
        group.setAttribute('tabindex', 0)
        group.setAttribute('aria-label', content.title)
        bindTooltip(
          group,
          (pointerX, pointerY) => {
            group.classList.add('is-active')
            showTooltip(content, pointerX, pointerY)
          },
          () => {
            group.classList.remove('is-active')
            hideTooltip()
          },
        )
      }
    })
  })

  container.replaceChildren(root)
}
