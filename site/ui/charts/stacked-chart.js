// Columns over time buckets, each cut into the shares of its series: a whole column is 100 %, partial buckets lighter.

import { formatNumber, formatShare } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { svg } from '../dom.js'
import { STAGGER_SPREAD_MS } from '../motion.js'
import { bindTooltip, hideTooltip, showTooltip } from '../tooltip.js'
import { axisLabel, bucketTitle } from './axis.js'
import { columnPath, squarePath } from './geometry.js'
import { measureText } from './measure.js'

// The shares the axis marks.
const SHARE_TICKS = [0, 0.25, 0.5, 0.75, 1]
// The widest a column gets, however few the buckets.
const MAX_COLUMN_WIDTH = 40
// The height a part needs to write its share inside.
const LABEL_MIN_HEIGHT = 16

// A column per bucket, its series stacked from the axis up in their order, each taking its share of the bucket: what the
// series counts tells how the bucket splits, not how much it holds. A bucket without anything stays empty. The tooltip
// gives each share and what the series holds there (its detail, its count by default), then the rows of extraRows.
/**
 * @template {{ key: string, partial?: boolean }} Point
 * @param {HTMLElement} container
 * @param {object} options
 * @param {Point[]} options.points the buckets, oldest first
 * @param {Bucket} options.bucket
 * @param {{ label: string, color: string, value: (point: Point) => number, detail?: (point: Point) => string }[]} options.series
 * @param {string} options.ariaLabel
 * @param {(point: Point) => { label: string, value: string }[]} [options.extraRows] more rows for the tooltip of a bucket
 */
export function stackedChart(container, { points, bucket, series, ariaLabel, extraRows = () => [] }) {
  const width = container.clientWidth
  if (width === 0) {
    return
  }
  const height = container.clientHeight
  const margin = { top: 8, right: 4, bottom: 26, left: Math.max(...SHARE_TICKS.map((tick) => measureText(formatShare(tick)))) + 10 }
  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom
  const baselineY = margin.top + innerHeight
  /** @param {number} share */
  const yOf = (share) => baselineY - share * innerHeight
  const slot = innerWidth / points.length
  const columnWidth = Math.max(1, Math.min(MAX_COLUMN_WIDTH, slot * 0.7))
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(innerWidth / 64))))
  /** @param {number} index */
  const isLabelled = (index) => (points.length - 1 - index) % labelEvery === 0
  // Labels that skip months may skip January too: the first label of each year then tells it.
  /** @param {number} index */
  const yearOf = (index) => points[index].key.slice(0, 4)
  /** @param {number} index */
  const firstLabelOfYear = (index) => {
    const previous = index - labelEvery

    return labelEvery > 1 && (previous < 0 || yearOf(previous) !== yearOf(index))
  }
  // The shares of each bucket, in the order of the series; null for a bucket without anything.
  const splits = points.map((point) => {
    const counts = series.map((item) => item.value(point))
    const total = counts.reduce((sum, count) => sum + count, 0)

    return { counts, total, shares: total ? counts.map((count) => count / total) : null }
  })

  const root = svg('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': ariaLabel })
  for (const tick of SHARE_TICKS) {
    if (tick > 0) {
      root.append(svg('line', { class: 'gridline', x1: margin.left, x2: width - margin.right, y1: yOf(tick), y2: yOf(tick) }))
    }
    const label = svg('text', { class: 'tick', x: margin.left - 8, y: yOf(tick), 'text-anchor': 'end', 'dominant-baseline': 'middle' })
    label.textContent = formatShare(tick)
    root.append(label)
  }

  const groups = points.map((point, index) => {
    const group = svg('g', { class: point.partial ? 'bar-group stacked-group is-partial' : 'bar-group stacked-group' })
    group.style.setProperty('--delay', `${Math.round((index / points.length) * STAGGER_SPREAD_MS)}ms`)
    const left = margin.left + slot * index + (slot - columnWidth) / 2
    const { shares } = splits[index]
    if (shares) {
      const present = series.map((item, seriesIndex) => ({ item, share: shares[seriesIndex] })).filter(({ share }) => share > 0)
      let bottom = 0
      present.forEach(({ item, share }, partIndex) => {
        const top = partIndex === present.length - 1 ? 1 : bottom + share
        const partHeight = (top - bottom) * innerHeight
        // The last part, at the top, rounds its corners as a column does.
        const path = partIndex === present.length - 1 ? columnPath(left, yOf(top), columnWidth, partHeight) : squarePath(left, yOf(top), columnWidth, partHeight)
        group.append(svg('path', { class: 'bar', style: `fill: ${item.color}`, d: path }))
        const text = formatShare(share)
        if (partHeight >= LABEL_MIN_HEIGHT && measureText(text) + 6 <= columnWidth) {
          const label = svg('text', { class: 'stage-label', x: left + columnWidth / 2, y: yOf((bottom + top) / 2), 'text-anchor': 'middle', 'dominant-baseline': 'central' })
          label.textContent = text
          group.append(label)
        }
        bottom = top
      })
    }
    root.append(group)
    if (isLabelled(index)) {
      const axis = svg('text', { class: 'axis-label', x: margin.left + slot * index + slot / 2, y: baselineY + 18, 'text-anchor': 'middle' })
      axis.textContent = axisLabel(point.key, bucket, firstLabelOfYear(index))
      root.append(axis)
    }

    return group
  })
  root.append(svg('line', { class: 'baseline', x1: margin.left, x2: width - margin.right, y1: baselineY, y2: baselineY }))

  points.forEach((point, index) => {
    const title = bucketTitle(point.key, bucket)
    const { counts, shares } = splits[index]
    const rows = series.map((item, seriesIndex) => ({
      color: item.color,
      value: formatShare(shares?.[seriesIndex] ?? null),
      label: `${item.label}, ${item.detail ? item.detail(point) : formatNumber(counts[seriesIndex])}`,
    }))
    const hit = svg('rect', {
      class: 'hit',
      x: margin.left + slot * index,
      y: margin.top,
      width: slot,
      height: innerHeight,
      tabindex: 0,
      'aria-label': t('{label} : {value}', { label: title, value: rows.map((row) => `${row.label} ${row.value}`).join(', ') }),
    })
    bindTooltip(
      hit,
      (x, y) => {
        groups[index].classList.add('is-active')
        showTooltip({ title, rows: [...rows, ...extraRows(point)], note: point.partial ? t('Période incomplète') : null }, x, y)
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
