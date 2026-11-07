// Columns over time buckets: series side by side, partial buckets lighter.

import { compactFormat, formatDecimal, formatNumber } from '../../lib/format.js'
import { svg } from '../dom.js'
import { STAGGER_SPREAD_MS } from '../motion.js'
import { bindTooltip, hideTooltip, showTooltip } from '../tooltip.js'
import { axisLabel, bucketTitle } from './axis.js'
import { columnPath, niceStep } from './geometry.js'
import { measureText } from './measure.js'

// Columns over time buckets: one series, or several grouped side by side.
/**
 * @param {HTMLElement} container
 * @param {object} options
 * @param {any[]} options.points the buckets, oldest first
 * @param {string} options.bucket day, week or month
 * @param {{ label: string, color: string, value: (point: any) => number }[]} options.series
 * @param {string} options.ariaLabel
 * @param {boolean} [options.decimals]
 * @param {(value: number) => string} [options.format]
 * @param {(point: any) => { label: string, value: string }[]} [options.extraRows] more rows for the tooltip of a bucket
 */
export function columnChart(
  container,
  { points, bucket, series, ariaLabel, decimals = false, format = decimals ? formatDecimal : formatNumber, extraRows = () => [] },
) {
  const width = container.clientWidth
  if (width === 0) {
    return
  }
  const height = container.clientHeight
  const margin = { top: 22, right: 4, bottom: 26, left: 8 }
  const values = points.flatMap((point) => series.map((item) => item.value(point) ?? 0))
  const maxValue = Math.max(0, ...values)
  const step = niceStep(Math.max(decimals ? 0.1 : 1, maxValue) / 4, !decimals)
  const top = Math.max(step, Math.ceil(maxValue / step - 1e-9) * step)
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, index) => index * step)
  margin.left = Math.max(...ticks.map((tick) => measureText(compactFormat.format(tick)))) + 10

  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom
  const baselineY = margin.top + innerHeight
  const yOf = (value) => baselineY - (value / top) * innerHeight
  const slot = innerWidth / points.length
  const groupWidth = Math.min(series.length * 24 + (series.length - 1) * 2, slot * 0.7)
  const barWidth = Math.max(1, (groupWidth - (series.length - 1) * 2) / series.length)
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(innerWidth / 64))))
  const isLabelled = (index) => (points.length - 1 - index) % labelEvery === 0
  // Labels that skip months may skip January too: the first label of each year then tells it.
  const yearOf = (index) => points[index].key.slice(0, 4)
  const firstLabelOfYear = (index) => {
    const previous = index - labelEvery

    return labelEvery > 1 && (previous < 0 || yearOf(previous) !== yearOf(index))
  }

  const root = svg('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': ariaLabel })
  for (const tick of ticks) {
    if (tick > 0) {
      root.append(svg('line', { class: 'gridline', x1: margin.left, x2: width - margin.right, y1: yOf(tick), y2: yOf(tick) }))
    }
    const label = svg('text', { class: 'tick', x: margin.left - 8, y: yOf(tick), 'text-anchor': 'end', 'dominant-baseline': 'middle' })
    label.textContent = compactFormat.format(tick)
    root.append(label)
  }

  // A single series labels its peak and its latest value; grouped series rely on the legend and tooltip.
  const labelled = new Set()
  if (series.length === 1) {
    const singleValues = points.map((point) => series[0].value(point) ?? 0)
    labelled.add(singleValues.indexOf(Math.max(...singleValues)))
    labelled.add(points.length - 1)
  }

  const groups = points.map((point, index) => {
    const group = svg('g', { class: point.partial ? 'bar-group is-partial' : 'bar-group' })
    group.style.setProperty('--delay', `${Math.round((index / points.length) * STAGGER_SPREAD_MS)}ms`)
    const left = margin.left + slot * index + (slot - groupWidth) / 2
    series.forEach((item, seriesIndex) => {
      const value = item.value(point) ?? 0
      const barHeight = (value / top) * innerHeight
      if (barHeight > 0) {
        const x = left + seriesIndex * (barWidth + 2)
        group.append(svg('path', { class: 'bar', style: `fill: ${item.color}`, d: columnPath(x, baselineY - barHeight, barWidth, barHeight) }))
      }
    })
    root.append(group)

    const center = margin.left + slot * index + slot / 2
    const value = series[0].value(point)
    if (labelled.has(index) && value > 0) {
      const valueLabel = svg('text', { class: 'value-label', x: center, y: yOf(value) - 6, 'text-anchor': 'middle' })
      valueLabel.textContent = format(value)
      root.append(valueLabel)
    }
    if (isLabelled(index)) {
      const axis = svg('text', { class: 'axis-label', x: center, y: baselineY + 18, 'text-anchor': 'middle' })
      axis.textContent = axisLabel(point.key, bucket, firstLabelOfYear(index))
      root.append(axis)
    }

    return group
  })
  root.append(svg('line', { class: 'baseline', x1: margin.left, x2: width - margin.right, y1: baselineY, y2: baselineY }))

  points.forEach((point, index) => {
    const title = bucketTitle(point.key, bucket)
    const hit = svg('rect', {
      class: 'hit',
      x: margin.left + slot * index,
      y: margin.top,
      width: slot,
      height: innerHeight,
      tabindex: 0,
      'aria-label': `${title} : ${series.map((item) => `${format(item.value(point))} ${item.label}`).join(', ')}`,
    })
    bindTooltip(
      hit,
      (x, y) => {
        groups[index].classList.add('is-active')
        showTooltip(
          {
            title,
            rows: [
              ...series.map((item) => ({ color: item.color, value: format(item.value(point)), label: item.label })),
              ...extraRows(point),
            ],
            note: point.partial ? 'Période incomplète' : null,
          },
          x,
          y,
        )
      },
      () => {
        groups[index].classList.remove('is-active')
        hideTooltip()
      },
    )
    root.append(hit)
  })

  container.replaceChildren(root)
}
