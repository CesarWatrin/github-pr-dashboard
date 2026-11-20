// The charts of a dossier of the annual review: what the person delivered and reviewed month by month, and when they act
// in the week, hour by hour.

import { formatDecimal, formatNumber, monthShortFormat } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { el, svg } from '../../ui/dom.js'
import { EFFORT_SERIES } from '../../ui/effort.js'
import { bindTooltip, hideTooltip, showTooltip } from '../../ui/tooltip.js'

/** @typedef {import('../../domain/review.js').ReviewedPerson} ReviewedPerson */
/** @typedef {import('../../domain/review/tallies.js').MonthTally} MonthTally */
/** @typedef {import('../../domain/effort.js').EffortKind} EffortKind */

const WIDTH = 320
const HEIGHT = 120
const LEFT = 28
const BOTTOM = 18
const TOP = 8

/** @param {number} value */
const decimal = (value) => formatDecimal(Math.round(value * 10) / 10)

/** @param {string} month */
const shortMonth = (month) => monthShortFormat.format(new Date(`${month}-15T12:00:00Z`)).replace('.', '')

// A column per month of what the person delivered, all their work together, stacked by kind of work in the colors of
// « Où va son effort » (hotfixes at what they are worth, hotfixWorth units), on its axis, and a line of the pull
// requests they reviewed, on a scale of its own.
/**
 * @param {ReviewedPerson} person
 * @param {string[]} months
 * @param {number} hotfixWorth
 */
export function monthChart(person, months, hotfixWorth) {
  /** @type {(month: MonthTally) => Record<EffortKind, number>} */
  const partsOf = ({ work }) => ({ ...work, tma: hotfixWorth * work.tma })
  const parts = person.series.map((month) => (month ? partsOf(month) : null))
  const delivered = person.deliveredSeries
  const reviews = person.series.map((month) => (month ? month.reviews : null))
  const kinds = EFFORT_SERIES.filter((kind) => parts.some((part) => part && part[kind.key] > 0))
  const top = Math.max(1, ...delivered.map((value) => value ?? 0))
  const reviewTop = Math.max(1, ...reviews.map((value) => value ?? 0))
  const axisTop = Math.ceil(top / 5) * 5
  const width = (WIDTH - LEFT) / months.length
  /** @param {number} value */
  const y = (value) => TOP + (HEIGHT - BOTTOM - TOP) * (1 - value / axisTop)
  /** @param {number} value */
  const reviewY = (value) => TOP + (HEIGHT - BOTTOM - TOP) * (1 - value / reviewTop)
  const chart = svg('svg', { viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: 'review-month-chart', role: 'img' })
  chart.setAttribute('aria-label', t('Unités livrées, par type de travail, et PR relues, mois par mois'))
  for (const value of [0, axisTop / 2, axisTop]) {
    chart.append(
      svg('line', { x1: LEFT, x2: WIDTH, y1: y(value), y2: y(value), class: value ? 'review-grid' : 'review-baseline' }),
      Object.assign(svg('text', { x: LEFT - 4, y: y(value) + 3, 'text-anchor': 'end' }), { textContent: formatNumber(value) }),
    )
  }
  months.forEach((month, index) => {
    const x = LEFT + index * width
    if (index % 2 === 0 || index === months.length - 1) {
      chart.append(Object.assign(svg('text', { x: x + width / 2, y: HEIGHT - 4, 'text-anchor': 'middle' }), { textContent: shortMonth(month) }))
    }
    const value = delivered[index]
    const part = parts[index]
    const column = svg('g', { class: 'review-column', tabindex: 0 })
    if (value === null || !part) {
      column.append(svg('rect', { x: x + 2, y: y(0) - 2, width: width - 4, height: 2, rx: 2, class: 'review-absent' }))
    } else {
      // A transparent column for the tooltip, then each kind of work from the axis up.
      column.append(svg('rect', { x: x + 2, y: y(axisTop), width: width - 4, height: y(0) - y(axisTop), class: 'review-hit' }))
      let base = 0
      for (const kind of kinds) {
        const segment = svg('rect', { x: x + 2, y: y(base + part[kind.key]), width: width - 4, height: Math.max(0, y(base) - y(base + part[kind.key])) })
        segment.style.fill = kind.color
        column.append(segment)
        base += part[kind.key]
      }
    }
    bindTooltip(
      column,
      (left, top) =>
        showTooltip(
          {
            title: shortMonth(month),
            rows:
              value === null || !part
                ? [{ label: t('pas encore dans l’équipe'), value: '–' }]
                : [
                    { label: t('Unités livrées'), value: decimal(value) },
                    ...kinds.map((kind) => ({ label: kind.label, value: decimal(part[kind.key]), color: kind.color })),
                    { label: t('PR relues'), value: formatNumber(reviews[index]), color: 'var(--text-primary)' },
                  ],
          },
          left,
          top,
        ),
      hideTooltip,
    )
    chart.append(column)
  })
  const points = reviews.flatMap((value, index) => (value === null ? [] : [[LEFT + index * width + width / 2, reviewY(value)]]))
  if (points.length > 1) {
    chart.append(svg('polyline', { points: points.map((point) => point.join(',')).join(' '), class: 'review-line' }))
  }
  for (const [cx, cy] of points) {
    chart.append(svg('circle', { cx, cy, r: 2.5, class: 'review-dot' }))
  }

  return el(
    'div',
    { className: 'review-chart' },
    chart,
    el(
      'p',
      { className: 'review-legend' },
      ...kinds.map((kind) => {
        const item = el('span', { textContent: kind.label })
        item.style.setProperty('--swatch', kind.color)

        return item
      }),
      el('span', { className: 'is-reviews', textContent: t('PR relues (jusqu’à {count})', { count: formatNumber(reviewTop) }) }),
    ),
    el('p', { className: 'review-small', textContent: t('En unités de travail ; un hotfix en vaut {worth}.', { worth: decimal(hotfixWorth) }) }),
  )
}

const DAYS = () => [t('Lun'), t('Mar'), t('Mer'), t('Jeu'), t('Ven'), t('Sam'), t('Dim')]

// Each hour of the week, darker for more actions; the working hours (9 to 18, Monday to Friday) ringed.
/** @param {ReviewedPerson} person */
export function weekChart(person) {
  const { grid } = person.rhythm
  const top = Math.max(1, ...grid.flat())
  const days = DAYS()
  const chart = el('div', { className: 'review-week' })
  chart.setAttribute('role', 'img')
  chart.setAttribute('aria-label', t('Activité sur GitHub par jour et par heure'))
  chart.append(el('span'), ...Array.from({ length: 24 }, (_, hour) => el('span', { textContent: hour % 3 === 0 ? String(hour) : '' })))
  grid.forEach((hours, day) => {
    chart.append(el('span', { textContent: days[day] }))
    hours.forEach((count, hour) => {
      const cell = el('b', { className: day < 5 && hour >= 9 && hour < 18 ? 'is-work' : '' })
      cell.style.setProperty('--level', count ? (0.15 + 0.85 * Math.sqrt(count / top)).toFixed(2) : '0')
      cell.title = t('{day} {hour} h : {count} actions', { day: days[day], hour, count })
      chart.append(cell)
    })
  })

  return chart
}
