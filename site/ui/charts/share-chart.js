// Bars cut into shares that fill the width (the stages of the cycle, by default).

import { formatDuration, formatNumber, formatShare } from '../../lib/format.js'
import { CYCLE_STAGES } from '../../model/cycle.js'
import { el, svg } from '../dom.js'
import { STAGGER_SPREAD_MS } from '../motion.js'
import { bindTooltip, hideTooltip, showTooltip } from '../tooltip.js'
import { barPath, squarePath } from './geometry.js'
import { measureText, truncateText } from './measure.js'

// Bars cut into the stages of the cycle, one row per group of pull requests: each stage takes its share of their
// time, written inside when it fits. rows are { label, shares, timed, ...medians }, shares null without any timed pull
// request. Other parts than the stages ({ key, label, color }) may cut the bars, with the rows of their tooltip.
const cycleShareRows = (row) => [
  ...CYCLE_STAGES.map((stage) => ({
    color: stage.color,
    value: formatShare(row.shares[stage.key]),
    label: `${stage.label.toLowerCase()}, médiane ${formatDuration(row[stage.key])}`,
  })),
  { label: 'PR relues arrivées en prod', value: formatNumber(row.timed) },
]

/**
 * @param {HTMLElement} container
 * @param {object} options
 * @param {any[]} options.rows each with its label and the share of each part (shares)
 * @param {string} options.ariaLabel
 * @param {{ key: string, label: string, color: string }[]} [options.stages] the parts: the stages of the cycle by default
 * @param {(row: any) => { label: string, value: string, color?: string }[]} [options.tooltipRows]
 */
export function shareChart(container, { rows, ariaLabel, stages = CYCLE_STAGES, tooltipRows = cycleShareRows }) {
  const width = container.clientWidth
  if (width === 0) {
    return
  }
  const shown = rows.filter((row) => row.shares)
  if (shown.length === 0) {
    container.replaceChildren(el('p', { className: 'chart-empty', textContent: 'Aucune donnée sur la période' }))

    return
  }
  const rowHeight = 32
  const height = shown.length * rowHeight
  const labelMax = width * 0.4
  const labelWidth = Math.min(labelMax, Math.max(...shown.map((row) => measureText(row.label))))
  const start = labelWidth + 10
  const barWidth = Math.max(20, width - start)

  const root = svg('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': ariaLabel })
  shown.forEach((row, index) => {
    const y = index * rowHeight
    const group = svg('g', { class: 'bar-group' })
    group.style.setProperty('--delay', `${Math.round((index / shown.length) * STAGGER_SPREAD_MS)}ms`)
    const name = svg('text', { class: 'axis-label', x: labelWidth, y: y + rowHeight / 2, 'text-anchor': 'end', 'dominant-baseline': 'middle' })
    name.textContent = truncateText(row.label, labelMax)
    group.append(name)
    const present = stages.filter((stage) => row.shares[stage.key] > 0)
    let x = start
    present.forEach((stage, stageIndex) => {
      const stageWidth = row.shares[stage.key] * barWidth
      const last = stageIndex === present.length - 1
      const path = last ? barPath(x, y + 6, stageWidth, rowHeight - 12) : squarePath(x, y + 6, stageWidth, rowHeight - 12)
      group.append(svg('path', { class: 'bar', style: `fill: ${stage.color}`, d: path }))
      const text = formatShare(row.shares[stage.key])
      if (measureText(text) + 12 <= stageWidth) {
        const label = svg('text', { class: 'stage-label', x: x + stageWidth / 2, y: y + rowHeight / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central' })
        label.textContent = text
        group.append(label)
      }
      x += stageWidth
    })

    const content = { title: row.label, rows: tooltipRows(row) }
    const text = stages.map((stage) => `${stage.label.toLowerCase()} ${formatShare(row.shares[stage.key])}`).join(', ')
    const hit = svg('rect', { class: 'hit', x: 0, y, width, height: rowHeight, tabindex: 0, 'aria-label': `${row.label} : ${text}` })
    bindTooltip(
      hit,
      (pointerX, pointerY) => {
        group.classList.add('is-active')
        showTooltip(content, pointerX, pointerY)
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
