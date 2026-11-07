// Horizontal bars, for rankings.

import { t } from '../../lib/i18n.js'
import { el, svg } from '../dom.js'
import { ICON_SIZE, technologyIcon } from '../icons.js'
import { STAGGER_SPREAD_MS } from '../motion.js'
import { bindTooltip, hideTooltip, showTooltip } from '../tooltip.js'
import { barPath } from './geometry.js'
import { measureText, truncateText } from './measure.js'

// Horizontal bars, one row per item, value at the tip.
/**
 * @template Row
 * @param {HTMLElement} container
 * @param {object} options
 * @param {Row[]} options.rows
 * @param {(row: Row) => string} options.label
 * @param {(row: Row) => number} options.value
 * @param {(value: number) => string} options.format
 * @param {number} [options.max] the value of a whole bar: the largest of the rows by default
 * @param {string} options.color
 * @param {string} options.ariaLabel
 * @param {(row: Row) => import('../tooltip.js').Tooltip} options.tooltip
 * @param {(row: Row) => string} [options.technology] the technology whose logo leads the label
 */
export function barChart(container, { rows, label, value, format, max, color, ariaLabel, tooltip, technology }) {
  const width = container.clientWidth
  if (width === 0) {
    return
  }
  if (rows.length === 0) {
    container.replaceChildren(el('p', { className: 'chart-empty', textContent: t('Aucune donnée sur la période') }))

    return
  }
  const rowHeight = 28
  const height = rows.length * rowHeight
  const labelMax = width * 0.4
  const iconSpace = technology ? ICON_SIZE + 6 : 0
  const labelWidth = Math.min(labelMax, Math.max(...rows.map((row) => measureText(label(row)))) + iconSpace)
  const valueWidth = Math.max(...rows.map((row) => measureText(format(value(row))))) + 8
  const start = labelWidth + 10
  const domainMax = (max ?? Math.max(...rows.map(value))) || 1
  const scale = (amount) => (Math.max(0, amount) / domainMax) * Math.max(20, width - start - valueWidth)

  const root = svg('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': ariaLabel })
  rows.forEach((row, index) => {
    const y = index * rowHeight
    const barWidth = Math.max(2, scale(value(row)))
    const group = svg('g', { class: 'bar-group' })
    group.style.setProperty('--delay', `${Math.round((index / rows.length) * STAGGER_SPREAD_MS)}ms`)
    const name = svg('text', { class: 'axis-label', x: labelWidth, y: y + rowHeight / 2, 'text-anchor': 'end', 'dominant-baseline': 'middle' })
    name.textContent = truncateText(label(row), labelMax - iconSpace)
    if (technology) {
      const iconX = labelWidth - measureText(name.textContent) - iconSpace
      group.append(technologyIcon(technology(row), { x: iconX, y: y + (rowHeight - ICON_SIZE) / 2 }))
    }
    const amount = svg('text', { class: 'value-label', x: start + barWidth + 6, y: y + rowHeight / 2, 'dominant-baseline': 'middle' })
    amount.textContent = format(value(row))
    group.append(name, svg('path', { class: 'bar', style: `fill: ${color}`, d: barPath(start, y + 7, barWidth, rowHeight - 14) }), amount)

    const hit = svg('rect', { class: 'hit', x: 0, y, width, height: rowHeight, tabindex: 0, 'aria-label': t('{label} : {value}', { label: label(row), value: format(value(row)) }) })
    bindTooltip(
      hit,
      (x, pointerY) => {
        group.classList.add('is-active')
        showTooltip(tooltip(row), x, pointerY)
      },
      () => {
        group.classList.remove('is-active')
        hideTooltip()
      },
    )
    root.append(group, hit)
  })

  container.replaceChildren(root)
}
