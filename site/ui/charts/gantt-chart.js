// A timeline of spans, one row each, as in a Gantt chart. On the left, the head of each row (its name and what the page
// puts beside it); on the right, a rounded bar from its start to its end in the color of its kind, fading out where it
// goes on or where the range cuts it, flat where it stopped, with dots at its milestones; the weeks or months of the
// range above, faint lines down, a dashed line at now. A row shows its tooltip on hover and opens what it stands for on
// a click. Drawn in HTML, in percents of the track: it keeps the width of its card, a phone narrowing its left column.

import { bucketsOf } from '../../domain/buckets.js'
import { DAY_MS, MINUTE_MS, parisMidnight } from '../../domain/time.js'
import { el } from '../dom.js'
import { bindTooltip, hideTooltip, showTooltip } from '../tooltip.js'
import { axisLabel } from './axis.js'
import { measureText } from './measure.js'

// Fewest pixels between two labels of the axis.
const TICK_GAP = 16
// Up to this many days, the axis counts weeks; beyond, months.
const WEEK_AXIS_MAX_DAYS = 120

/**
 * A row: the nodes of its head; its span (from and to, minutes since the epoch, within the range); whether it fades in
 * (fadeStart, cut by the range), fades out (fadeEnd: it goes on) or ends flat (flatEnd: it stopped); its color, lighter
 * when quiet; the milestones dotted on it; its tooltip, the label read aloud, and what opens it.
 * @typedef {{ key: string, head: Node[], from: number, to: number, fadeStart: boolean, fadeEnd: boolean, flatEnd: boolean,
 *   color: string, quiet?: boolean, markers: { at: number }[], tooltip: import('../tooltip.js').Tooltip, ariaLabel: string,
 *   open: (opener: Element) => void }} GanttRow
 */

// The ticks of the axis: the start of each week or month of the range, those within it.
function axisTicks(range) {
  const bucket = (range.end - range.start) / DAY_MS <= WEEK_AXIS_MAX_DAYS ? 'week' : 'month'

  return bucketsOf(range.start, range.end, bucket)
    .map(({ key }) => ({ key, bucket, at: parisMidnight(key.length === 7 ? `${key}-01` : key) }))
    .filter((tick) => tick.at >= range.start)
}

// The fill of a bar: its color, fading in at its start or out at its end over a few pixels.
function barFill({ fadeStart, fadeEnd }) {
  const stops = [
    ...(fadeStart ? ['transparent 0', 'var(--bar-fill) min(28px, 45%)'] : ['var(--bar-fill) 0']),
    ...(fadeEnd ? ['var(--bar-fill) calc(100% - min(28px, 45%))', 'transparent 100%'] : ['var(--bar-fill) 100%']),
  ]

  return `linear-gradient(to right, ${stops.join(', ')})`
}

/**
 * @param {HTMLElement} container
 * @param {{ range: TimeRange, rows: GanttRow[], ariaLabel: string, now?: { at: number, label: string } | null }} options
 */
export function ganttChart(container, { range, rows, ariaLabel, now = null }) {
  /** @param {number} ms */
  const percent = (ms) => ((ms - range.start) / (range.end - range.start)) * 100
  const ticks = axisTicks(range)
  const nowShown = now !== null && now.at >= range.start && now.at <= range.end

  const axis = el('div', { className: 'gantt-axis-track' })
  const grid = el(
    'div',
    { className: 'gantt-grid' },
    ...ticks.map((tick) => {
      const line = el('span', { className: 'gantt-gridline' })
      line.style.left = `${percent(tick.at)}%`

      return line
    }),
  )
  if (nowShown) {
    const line = el('span', { className: 'gantt-now' })
    line.style.left = `${percent(now.at)}%`
    grid.append(line)
  }
  grid.setAttribute('aria-hidden', 'true')

  const body = el(
    'div',
    { className: 'gantt-rows' },
    grid,
    ...rows.map((row) => {
      const from = percent(row.from * MINUTE_MS)
      const to = percent(row.to * MINUTE_MS)
      const bar = el('span', {
        className: ['gantt-bar', row.quiet ? 'is-quiet' : '', row.flatEnd ? 'is-flat-end' : ''].filter(Boolean).join(' '),
      })
      bar.style.left = `${from}%`
      bar.style.width = `${Math.max(0, to - from)}%`
      bar.style.background = barFill(row)
      const markers = row.markers
        .filter((marker) => marker.at * MINUTE_MS >= range.start && marker.at * MINUTE_MS <= range.end)
        .map((marker) => {
          const dot = el('span', { className: 'gantt-marker' })
          dot.style.left = `${percent(marker.at * MINUTE_MS)}%`

          return dot
        })
      const button = el(
        'button',
        { type: 'button', className: 'gantt-row' },
        el('span', { className: 'gantt-head' }, ...row.head),
        el('span', { className: 'gantt-track' }, bar, ...markers),
      )
      button.style.setProperty('--bar-color', row.color)
      button.setAttribute('aria-label', row.ariaLabel)
      button.setAttribute('aria-haspopup', 'dialog')
      bindTooltip(button, (x, y) => showTooltip(row.tooltip, x, y), hideTooltip)
      button.addEventListener('click', () => {
        hideTooltip()
        row.open(button)
      })

      return button
    }),
  )
  const chart = el('div', { className: 'gantt-chart' }, el('div', { className: 'gantt-axis' }, el('span'), axis), body)
  chart.setAttribute('role', 'group')
  chart.setAttribute('aria-label', ariaLabel)
  container.replaceChildren(chart)

  // The labels of the axis, as many as its width holds apart, none over the label of now.
  const width = axis.clientWidth
  const taken = []
  const place = (text, at, className, anchor) => {
    const left = (percent(at) / 100) * width
    const size = measureText(text)
    const start = anchor === 'end' ? left - size : anchor === 'start' ? left : left - size / 2
    if (start < 0 || start + size > width || taken.some(([a, b]) => start < b + TICK_GAP && start + size > a - TICK_GAP)) {
      return
    }
    taken.push([start, start + size])
    const label = el('span', { className, textContent: text })
    label.style.left = `${start}px`
    axis.append(label)
  }
  if (nowShown) {
    place(now.label, now.at, 'gantt-axis-label is-now', 'end')
  }
  let previousYear = null
  for (const tick of ticks) {
    const year = tick.key.slice(0, 4)
    // A month shows its year in January, or where the year changes between two labels.
    place(axisLabel(tick.key, tick.bucket, tick.bucket === 'month' && previousYear !== null && year !== previousYear), tick.at, 'gantt-axis-label', 'start')
    previousYear = year
  }
}
