// Lines over months (trends page), on an axis fit for the figure.

import { WORK_DAY_HOURS } from '../../domain/time.js'
import { compactFormat, decimalFormat, formatShare } from '../../lib/format.js'
import { svg } from '../dom.js'
import { bindTooltip, hideTooltip, showTooltip } from '../tooltip.js'
import { axisLabel, bucketTitle } from './axis.js'
import { niceStep } from './geometry.js'
import { measureText } from './measure.js'

// The axis of a trend, from zero, in about four steps labelled in the unit of the figure: long durations in working
// days, short ones in minutes.
function trendAxis(kind, maxValue) {
  if (kind === 'share') {
    return { step: niceStep(Math.max(0.04, maxValue) / 4, false), format: formatShare }
  }
  if (kind === 'duration') {
    if (maxValue >= 2 * WORK_DAY_HOURS) {
      const days = niceStep(maxValue / WORK_DAY_HOURS / 4, false)

      return { step: days * WORK_DAY_HOURS, format: (hours) => `${decimalFormat.format(hours / WORK_DAY_HOURS)} j` }
    }
    if (maxValue >= 1) {
      return { step: niceStep(maxValue / 4, false), format: (hours) => `${decimalFormat.format(hours)} h` }
    }

    return { step: niceStep((Math.max(1 / 6, maxValue) * 60) / 4, true) / 60, format: (hours) => `${Math.round(hours * 60)} min` }
  }
  if (kind === 'decimal') {
    return { step: niceStep(Math.max(0.4, maxValue) / 4, false), format: (value) => decimalFormat.format(value) }
  }

  return { step: niceStep(Math.max(4, maxValue) / 4, true), format: (value) => compactFormat.format(value) }
}

// Lines over months, one per series ({ key, label, color }, the value of each point under its key), broken where a
// month has none; the unfinished month joins its line lighter. A crosshair and the tooltip follow the pointer or the
// keyboard, month by month.
export function lineChart(container, { points, series, kind, format, ariaLabel }) {
  const width = container.clientWidth
  if (width === 0) {
    return
  }
  const height = container.clientHeight
  const margin = { top: 12, right: 10, bottom: 26, left: 8 }
  const values = points.flatMap((point) => series.map((item) => point[item.key])).filter(Number.isFinite)
  const maxValue = Math.max(0, ...values)
  const axis = trendAxis(kind, maxValue)
  const top = Math.max(axis.step, Math.ceil(maxValue / axis.step - 1e-9) * axis.step)
  const ticks = Array.from({ length: Math.round(top / axis.step) + 1 }, (_, index) => index * axis.step)
  margin.left = Math.max(...ticks.map((tick) => measureText(axis.format(tick)))) + 10

  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom
  const baselineY = margin.top + innerHeight
  const yOf = (value) => baselineY - (value / top) * innerHeight
  const slot = innerWidth / points.length
  const xOf = (index) => margin.left + slot * index + slot / 2
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(innerWidth / 64))))
  const yearOf = (index) => points[index].key.slice(0, 4)
  // Labels that skip months may skip January too: the first label of each year then tells it.
  const firstLabelOfYear = (index) => labelEvery > 1 && (index - labelEvery < 0 || yearOf(index - labelEvery) !== yearOf(index))

  const root = svg('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': ariaLabel })
  for (const tick of ticks) {
    if (tick > 0) {
      root.append(svg('line', { class: 'gridline', x1: margin.left, x2: width - margin.right, y1: yOf(tick), y2: yOf(tick) }))
    }
    const label = svg('text', { class: 'tick', x: margin.left - 8, y: yOf(tick), 'text-anchor': 'end', 'dominant-baseline': 'middle' })
    label.textContent = axis.format(tick)
    root.append(label)
  }
  points.forEach((point, index) => {
    if ((points.length - 1 - index) % labelEvery === 0) {
      const label = svg('text', { class: 'axis-label', x: xOf(index), y: baselineY + 18, 'text-anchor': 'middle' })
      label.textContent = axisLabel(point.key, 'month', firstLabelOfYear(index))
      root.append(label)
    }
  })
  root.append(svg('line', { class: 'baseline', x1: margin.left, x2: width - margin.right, y1: baselineY, y2: baselineY }))
  const crosshair = svg('line', { class: 'crosshair', x1: 0, x2: 0, y1: margin.top, y2: baselineY, visibility: 'hidden' })
  root.append(crosshair)

  const dot = (index, item, className = 'trend-dot') =>
    svg('circle', { class: className, cx: xOf(index), cy: yOf(points[index][item.key]), r: 4, style: `fill: ${item.color}` })
  for (const item of series) {
    const has = (index) => Number.isFinite(points[index]?.[item.key])
    const runs = []
    points.forEach((point, index) => {
      if (point.partial || !has(index)) {
        return
      }
      if (index > 0 && has(index - 1) && !points[index - 1].partial) {
        runs.at(-1).push(index)
      } else {
        runs.push([index])
      }
    })
    for (const run of runs) {
      if (run.length === 1) {
        root.append(dot(run[0], item))
        continue
      }
      const d = run.map((index, position) => `${position ? 'L' : 'M'}${xOf(index)},${yOf(points[index][item.key])}`).join(' ')
      root.append(svg('path', { class: 'trend-line', d, style: `stroke: ${item.color}` }))
    }
    const partial = points.findIndex((point) => point.partial)
    if (partial >= 0 && has(partial)) {
      if (has(partial - 1)) {
        const d = `M${xOf(partial - 1)},${yOf(points[partial - 1][item.key])} L${xOf(partial)},${yOf(points[partial][item.key])}`
        root.append(svg('path', { class: 'trend-line is-partial', d, style: `stroke: ${item.color}` }))
      }
      root.append(dot(partial, item, 'trend-dot is-partial'))
    }
    // The latest whole month ends its line on a dot.
    const last = points.findLastIndex((point, index) => !point.partial && has(index))
    if (last >= 0 && runs.some((run) => run.length > 1 && run.at(-1) === last)) {
      root.append(dot(last, item))
    }
  }

  const markers = svg('g', {})
  root.append(markers)
  points.forEach((point, index) => {
    const title = `${bucketTitle(point.key, 'month')}${point.partial ? ', en cours' : ''}`
    const hit = svg('rect', {
      class: 'hit',
      x: margin.left + slot * index,
      y: margin.top,
      width: slot,
      height: innerHeight,
      tabindex: 0,
      'aria-label': `${title} : ${series.map((item) => `${item.label} ${format(point[item.key])}`).join(', ')}`,
    })
    bindTooltip(
      hit,
      (x, y) => {
        crosshair.setAttribute('x1', xOf(index))
        crosshair.setAttribute('x2', xOf(index))
        crosshair.setAttribute('visibility', 'visible')
        markers.replaceChildren(...series.filter((item) => Number.isFinite(point[item.key])).map((item) => dot(index, item)))
        showTooltip(
          {
            title,
            rows: series.map((item) => ({ color: item.color, value: format(point[item.key]), label: item.label })),
            note: point.partial ? 'Mois incomplet, jusqu’à la dernière synchro' : null,
          },
          x,
          y,
        )
      },
      () => {
        crosshair.setAttribute('visibility', 'hidden')
        markers.replaceChildren()
        hideTooltip()
      },
    )
    root.append(hit)
  })

  container.replaceChildren(root)
}
