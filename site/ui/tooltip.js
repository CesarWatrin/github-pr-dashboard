// The tooltip of the charts and cells.

import { $, el } from './dom.js'

/**
 * @typedef {{ title: string, rows: { label: string, value: string, color?: string }[], note?: string }} Tooltip
 */

/**
 * @param {Tooltip} content
 * @param {number} x
 * @param {number} y
 */
export function showTooltip({ title, rows, note }, x, y) {
  const tooltip = $('[data-tooltip]')
  tooltip.replaceChildren(el('p', { className: 'tooltip-title', textContent: title }))
  for (const row of rows) {
    const key = el('span', { className: 'line-key' })
    if (row.color) {
      key.style.background = row.color
    } else {
      key.classList.add('is-empty')
    }
    tooltip.append(
      el('div', { className: 'tooltip-row' }, key, el('strong', { textContent: row.value }), el('span', { textContent: row.label })),
    )
  }
  if (note) {
    tooltip.append(el('p', { className: 'tooltip-note', textContent: note }))
  }
  tooltip.hidden = false

  const box = tooltip.getBoundingClientRect()
  const left = Math.min(Math.max(8, x + 14), window.innerWidth - box.width - 8)
  const top = y - box.height - 14 < 8 ? y + 18 : y - box.height - 14
  tooltip.style.left = `${left}px`
  tooltip.style.top = `${top}px`
}

export function hideTooltip() {
  $('[data-tooltip]').hidden = true
}

// Hover and keyboard focus show the same tooltip.
export function bindTooltip(target, onActivate, onDeactivate) {
  target.addEventListener('pointermove', (event) => onActivate(event.clientX, event.clientY))
  target.addEventListener('pointerleave', onDeactivate)
  target.addEventListener('focus', () => {
    const box = target.getBoundingClientRect()
    onActivate(box.left + box.width / 2, box.top + box.height / 2)
  })
  target.addEventListener('blur', onDeactivate)
}
