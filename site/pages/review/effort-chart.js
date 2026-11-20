// The effort of everyone at a glance, on the annual review: a bar per person evaluated, cut into their kinds of work
// (TMA, projects, AC, the rest) in the colors of « Où va son effort », the most delivered first. In units of work a
// month, against the median of the team; or in shares of their work, to compare what each one does. The units a month
// close each row either way.

import { formatDecimal, formatShare } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { displayName } from '../../model/people.js'
import { $$, el } from '../../ui/dom.js'
import { EFFORT_SERIES } from '../../ui/effort.js'
import { bindTooltip, hideTooltip, showTooltip } from '../../ui/tooltip.js'

/** @typedef {import('../../domain/review.js').TeamReview} TeamReview */
/** @typedef {import('../../domain/review.js').ReviewedPerson} ReviewedPerson */

/** @param {number} value */
const one = (value) => formatDecimal(Math.round(value * 10) / 10)

// Whether the bars say units a month or shares of the work, the buttons of the card.
let inShares = false

// The bar of a person: a segment per kind of work, as wide as its units, or its share of their work.
/**
 * @param {ReviewedPerson} person
 * @param {number} top the most units a month of anyone
 */
function bar(person, top) {
  const parts = person.deliveredParts
  const total = person.deliveredMean
  const shown = EFFORT_SERIES.filter((kind) => parts[kind.key] > 0)
  const segments = el(
    'span',
    { className: 'review-effort-bar' },
    ...shown.map((kind) => {
      const segment = el('span')
      segment.style.flexGrow = String(parts[kind.key])
      segment.style.background = kind.color

      return segment
    }),
  )
  segments.style.width = `${inShares || !top ? 100 : (100 * total) / top}%`

  return segments
}

// A row: the name, which opens the dossier, the bar on its track, and the units a month; the details on hover.
/**
 * @param {ReviewedPerson} person
 * @param {number} top
 * @param {(person: ReviewedPerson, className: string) => HTMLElement} nameOf
 */
function row(person, top, nameOf) {
  const parts = person.deliveredParts
  const total = person.deliveredMean
  const track = el('span', { className: 'review-effort-track', tabIndex: 0 }, bar(person, top))
  track.setAttribute('role', 'img')
  track.setAttribute('aria-label', `${displayName(person.login)} : ${t('{count} unités par mois', { count: one(total) })}`)
  bindTooltip(
    track,
    (left, topAt) =>
      showTooltip(
        {
          title: displayName(person.login),
          rows: [
            { label: t('unités par mois'), value: one(total) },
            ...EFFORT_SERIES.filter((kind) => parts[kind.key] > 0).map((kind) => ({
              label: kind.label,
              value: `${one(parts[kind.key])} · ${formatShare(total ? parts[kind.key] / total : null)}`,
              color: kind.color,
            })),
          ],
        },
        left,
        topAt,
      ),
    hideTooltip,
  )

  return el(
    'li',
    { className: 'review-effort-row' },
    nameOf(person, 'review-effort-name'),
    track,
    el('span', { className: 'review-effort-total', textContent: one(total) }),
  )
}

// The chart: its legend, its rows, the median of the team as a line across them in units.
/**
 * @param {TeamReview} review
 * @param {(person: ReviewedPerson, className: string) => HTMLElement} nameOf
 */
export function effortChart(review, nameOf) {
  for (const button of $$('[data-review-effort-measure]')) {
    button.setAttribute('aria-checked', String((button.dataset.reviewEffortMeasure === 'shares') === inShares))
  }
  const people = [...review.people].sort((a, b) => b.deliveredMean - a.deliveredMean)
  const top = Math.max(0, ...people.map((person) => person.deliveredMean))
  const used = EFFORT_SERIES.filter((kind) => people.some((person) => person.deliveredParts[kind.key] > 0))
  const head = el('li', { className: 'review-effort-row is-head' }, el('span'), el('span', { className: 'review-effort-total', textContent: t('unités / mois') }))
  head.setAttribute('aria-hidden', 'true')
  const list = el('ol', { className: 'review-effort-rows' }, head, ...people.map((person) => row(person, top, nameOf)))
  if (!inShares && top) {
    list.style.setProperty('--median', `${(100 * review.delivery.median) / top}%`)
    list.classList.add('has-median')
  }

  return [
    el('p', {
      className: 'card-note',
      textContent: inShares
        ? t('Ce que chaque type de travail pèse dans ce que chacun livre, du plus livré au moins livré ; au bout, ses unités par mois. Un clic sur un nom ouvre son dossier.')
        : t('Unités livrées par mois sur l’année, tout le travail compris : une PR de projet, d’AC ou du reste selon sa taille, un hotfix pour {worth} unité. Le trait marque la médiane de l’équipe. Un clic sur un nom ouvre son dossier.', {
            worth: one(review.delivery.hotfixWorth),
          }),
    }),
    el(
      'ul',
      { className: 'effort-legend review-effort-legend' },
      ...used.map((kind) => {
        const swatch = el('span', { className: 'swatch' })
        swatch.style.background = kind.color

        return el('li', {}, swatch, el('span', { textContent: kind.label }))
      }),
      ...(inShares ? [] : [el('li', { className: 'review-effort-median-key' }, el('span', { className: 'swatch' }), el('span', { textContent: t('médiane de l’équipe : {count}', { count: one(review.delivery.median) }) }))]),
    ),
    list,
  ]
}

// Listens to « Unités / Parts » of the card.
/** @param {() => void} render */
export function setupEffortChart(render) {
  for (const button of $$('[data-review-effort-measure]')) {
    button.addEventListener('click', () => {
      inShares = button.dataset.reviewEffortMeasure === 'shares'
      render()
    })
  }
}
