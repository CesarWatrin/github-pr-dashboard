// A timeline of spans, one row each, as in a Gantt chart: a bar from the start to the end of each, in the color of its
// kind with its word beside it, cut at the edges of the range and marked so, its weeks filled after how busy they were,
// and markers on it; the weeks or months of the range on its axis. A row shows its tooltip on hover and opens what it
// stands for on a click. On a narrow screen, the names go above their bars: the chart keeps the width of the page.

import { bucketsOf } from '../../domain/buckets.js'
import { DAY_MS, MINUTE_MS, parisMidnight } from '../../domain/time.js'
import { svg } from '../dom.js'
import { STAGGER_SPREAD_MS } from '../motion.js'
import { bindTooltip, hideTooltip, showTooltip } from '../tooltip.js'
import { axisLabel } from './axis.js'
import { measureText, truncateText } from './measure.js'

const NARROW_WIDTH = 600
const ROW_HEIGHT = 32
const NARROW_ROW_HEIGHT = 46
const BAR_HEIGHT = 14
const AXIS_HEIGHT = 24
const LABEL_MAX_WIDTH = 190
// Fewest pixels between two labels of the axis.
const TICK_SPACING = 64
// Up to this many days, the axis counts weeks; beyond, months.
const WEEK_AXIS_MAX_DAYS = 120
const WEEK_MINUTES = (7 * DAY_MS) / MINUTE_MS

/**
 * A row: its span (from and to, minutes since the epoch, already within the range), whether the range cut it at either
 * end, its color and the word that goes with it (tag), the busy weeks of its span (weeks, from its start), markers on it,
 * its tooltip and the label read aloud, and what opens it.
 * @typedef {{ key: string, label: string, from: number, to: number, cutStart: boolean, cutEnd: boolean, color: string,
 *   tag: string, weeks: number[], markers: { at: number }[], tooltip: import('../tooltip.js').Tooltip, ariaLabel: string,
 *   open: (opener: Element) => void }} GanttRow
 */

// The ticks of the axis: the start of each week or month of the range, those within it.
function axisTicks(range) {
  const bucket = (range.end - range.start) / DAY_MS <= WEEK_AXIS_MAX_DAYS ? 'week' : 'month'

  return bucketsOf(range.start, range.end, bucket)
    .map(({ key }) => ({ key, bucket, at: parisMidnight(key.length === 7 ? `${key}-01` : key) }))
    .filter((tick) => tick.at >= range.start)
}

/**
 * @param {HTMLElement} container
 * @param {{ range: TimeRange, rows: GanttRow[], ariaLabel: string }} options
 */
export function ganttChart(container, { range, rows, ariaLabel }) {
  const width = container.clientWidth
  if (width === 0) {
    return
  }
  const narrow = width < NARROW_WIDTH
  const labelWidth = narrow ? 0 : Math.min(LABEL_MAX_WIDTH, Math.max(40, ...rows.map((row) => measureText(row.label))) + 16)
  const left = labelWidth + 4
  const right = width - 4
  const plotWidth = right - left
  const rowHeight = narrow ? NARROW_ROW_HEIGHT : ROW_HEIGHT
  const height = AXIS_HEIGHT + rows.length * rowHeight + 4
  /** @param {number} minutes */
  const xOf = (minutes) => left + ((minutes * MINUTE_MS - range.start) / (range.end - range.start)) * plotWidth
  const busiest = Math.max(1, ...rows.flatMap((row) => row.weeks))

  const root = svg('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'group', 'aria-label': ariaLabel })
  const ticks = axisTicks(range)
  const labelEvery = Math.max(1, Math.ceil(TICK_SPACING / Math.max(1, plotWidth / Math.max(1, ticks.length))))
  let previousYear = null
  ticks.forEach((tick, index) => {
    const x = left + ((tick.at - range.start) / (range.end - range.start)) * plotWidth
    root.append(svg('line', { class: 'gridline', x1: x, x2: x, y1: AXIS_HEIGHT - 4, y2: height }))
    if (index % labelEvery === 0 && x + TICK_SPACING / 2 <= width) {
      const year = tick.key.slice(0, 4)
      const label = svg('text', { class: 'axis-label', x, y: AXIS_HEIGHT - 10, 'text-anchor': index === 0 ? 'start' : 'middle' })
      label.textContent = axisLabel(tick.key, tick.bucket, tick.bucket === 'month' && previousYear !== null && year !== previousYear && labelEvery > 1)
      previousYear = year
      root.append(label)
    }
  })

  rows.forEach((row, index) => {
    const top = AXIS_HEIGHT + index * rowHeight
    const middle = narrow ? top + rowHeight - BAR_HEIGHT / 2 - 6 : top + rowHeight / 2
    const group = svg('g', { class: 'gantt-row', style: `--bar-color: ${row.color}` })
    group.style.setProperty('--delay', `${Math.round((index / Math.max(1, rows.length)) * STAGGER_SPREAD_MS)}ms`)

    const name = svg('text', { class: 'gantt-label', x: narrow ? left : 0, y: narrow ? top + 14 : middle, 'dominant-baseline': 'middle' })
    name.textContent = truncateText(row.label, narrow ? plotWidth * 0.6 : labelWidth - 12)
    group.append(name)

    const x1 = xOf(row.from)
    const x2 = Math.max(x1 + 3, xOf(row.to))
    const barTop = middle - BAR_HEIGHT / 2
    group.append(svg('rect', { class: 'gantt-bar', x: x1, y: barTop, width: x2 - x1, height: BAR_HEIGHT, rx: 3 }))
    // How busy each week was: a column from the bottom of the bar, as tall as its pull requests against the busiest week.
    row.weeks.forEach((count, week) => {
      const from = xOf(row.from + week * WEEK_MINUTES)
      const to = Math.min(x2, xOf(row.from + (week + 1) * WEEK_MINUTES))
      if (count > 0 && to > from) {
        const tall = (BAR_HEIGHT * count) / busiest
        group.append(svg('rect', { class: 'gantt-week', x: from, y: barTop + BAR_HEIGHT - tall, width: to - from, height: tall }))
      }
    })
    // Cut by the range: an arrow on that side, pointing out of it.
    if (row.cutStart) {
      group.append(svg('path', { class: 'gantt-cut', d: `M${x1 + 8} ${middle - 5}L${x1 + 3} ${middle}L${x1 + 8} ${middle + 5}` }))
    }
    if (row.cutEnd) {
      group.append(svg('path', { class: 'gantt-cut', d: `M${x2 - 8} ${middle - 5}L${x2 - 3} ${middle}L${x2 - 8} ${middle + 5}` }))
    }
    for (const marker of row.markers) {
      const x = xOf(marker.at)
      if (x >= left && x <= right) {
        group.append(svg('path', { class: 'gantt-marker', d: `M${x} ${middle - 7}L${x + 5} ${middle}L${x} ${middle + 7}L${x - 5} ${middle}Z` }))
      }
    }
    // The word of its color: beside the bar where it fits, above it on a narrow screen.
    const tagWidth = measureText(row.tag)
    const place = narrow
      ? { x: right, y: top + 14, 'text-anchor': 'end' }
      : x2 + 8 + tagWidth <= right
        ? { x: x2 + 8, y: middle }
        : x1 - 8 - tagWidth >= left
          ? { x: x1 - 8, y: middle, 'text-anchor': 'end' }
          : null
    if (place) {
      const tag = svg('text', { class: 'gantt-tag', 'dominant-baseline': 'middle', ...place })
      tag.textContent = row.tag
      group.append(tag)
    }

    const hit = svg('rect', { class: 'hit gantt-hit', x: 0, y: top, width, height: rowHeight, tabindex: 0, role: 'button', 'aria-label': row.ariaLabel })
    hit.setAttribute('aria-haspopup', 'dialog')
    bindTooltip(
      hit,
      (x, y) => {
        group.classList.add('is-active')
        showTooltip(row.tooltip, x, y)
      },
      () => {
        group.classList.remove('is-active')
        hideTooltip()
      },
    )
    hit.addEventListener('click', () => {
      hideTooltip()
      row.open(hit)
    })
    hit.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        hideTooltip()
        row.open(hit)
      }
    })
    group.append(hit)
    root.append(group)
  })

  container.replaceChildren(root)
}
