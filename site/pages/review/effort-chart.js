// Everyone at a glance, on the annual review: a bar per person evaluated, on the measure picked above the chart. Their
// effort, cut into their kinds of work (TMA, projects, AC, the rest) in the colors of « Où va son effort », the most
// delivered first: in units of work a month against the median of the team, or in shares of their work, the units a
// month closing each row either way. Or one of their marks, 0 to 100, the best first, against the median of the team.

import { median } from '../../domain/math.js'
import { formatDecimal, formatShare } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { displayName } from '../../model/people.js'
import { $, el } from '../../ui/dom.js'
import { EFFORT_SERIES } from '../../ui/effort.js'
import { bindTooltip, hideTooltip, showTooltip } from '../../ui/tooltip.js'

/** @typedef {import('../../domain/review.js').TeamReview} TeamReview */
/** @typedef {import('../../domain/review.js').ReviewedPerson} ReviewedPerson */
/** @typedef {'productivity' | 'efficiency' | 'collaboration' | 'importance' | 'overall'} MarkKey */

/** @param {number} value */
const one = (value) => formatDecimal(Math.round(value * 10) / 10)

// The marks the chart can show, each with what it weighs; the overall mark last.
/** @type {{ key: MarkKey, label: string, of: (person: ReviewedPerson) => number, what: string }[]} */
const MARKS = [
  { key: 'productivity', label: t('Productivité'), of: (person) => person.marks.productivity, what: t('ce que la personne livre par mois, tout son travail compris, puis ses PR mergées') },
  { key: 'efficiency', label: t('Efficacité'), of: (person) => person.marks.efficiency, what: t('délai de merge, PR abandonnées, merges sans review, checks en échec, régularité') },
  { key: 'collaboration', label: t('Collaboration'), of: (person) => person.marks.collaboration, what: t('PR relues par mois, commentaires, personnes qui dépendent de ses reviews, réactivité') },
  { key: 'importance', label: t('Importance'), of: (person) => person.marks.importance, what: t('sa part du code, des reviews et de la TMA, les dépôts qui reposent sur elle, ses projets et AC, les PR des autres qu’elle merge') },
  { key: 'overall', label: t('Note globale'), of: (person) => person.overall, what: t('les quatre notes pesées, et le résultat de sa squad pour un chef de squad') },
]

// What the bars show, the list above the chart: the effort in units or in shares, or a mark.
/** @type {'units' | 'shares' | MarkKey} */
let measure = 'units'

/**
 * @param {Node[]} children
 * @param {string} width
 */
function bar(children, width) {
  const segments = el('span', { className: 'review-effort-bar' }, ...children)
  segments.style.width = width

  return segments
}

/**
 * @param {number} value
 * @param {string} color
 */
function segment(value, color) {
  const part = el('span')
  part.style.flexGrow = String(value)
  part.style.background = color

  return part
}

// A row: the name, which opens the dossier, the bar on its track, its figure; the details on hover.
/**
 * @param {ReviewedPerson} person
 * @param {{ bar: HTMLElement, figure: string, label: string, rows: { label: string, value: string, color?: string }[] }} shown
 * @param {(person: ReviewedPerson, className: string) => HTMLElement} nameOf
 */
function row(person, shown, nameOf) {
  const track = el('span', { className: 'review-effort-track', tabIndex: 0 }, shown.bar)
  track.setAttribute('role', 'img')
  track.setAttribute('aria-label', `${displayName(person.login)} : ${shown.label}`)
  bindTooltip(track, (left, top) => showTooltip({ title: displayName(person.login), rows: shown.rows }, left, top), hideTooltip)

  return el('li', { className: 'review-effort-row' }, nameOf(person, 'review-effort-name'), track, el('span', { className: 'review-effort-total', textContent: shown.figure }))
}

// The effort of a person: a segment per kind of work, as wide as its units against the most of anyone, or its share.
/**
 * @param {ReviewedPerson} person
 * @param {number} top
 */
function effortRow(person, top) {
  const parts = person.deliveredParts
  const total = person.deliveredMean
  const kinds = EFFORT_SERIES.filter((kind) => parts[kind.key] > 0)

  return {
    bar: bar(
      kinds.map((kind) => segment(parts[kind.key], kind.color)),
      `${measure === 'shares' || !top ? 100 : (100 * total) / top}%`,
    ),
    figure: one(total),
    label: t('{count} unités par mois', { count: one(total) }),
    rows: [
      { label: t('unités par mois'), value: one(total) },
      ...kinds.map((kind) => ({ label: kind.label, value: `${one(parts[kind.key])} · ${formatShare(total ? parts[kind.key] / total : null)}`, color: kind.color })),
    ],
  }
}

// A mark of a person, on a scale of 0 to 100; their four marks and the overall one on hover.
/**
 * @param {ReviewedPerson} person
 * @param {(typeof MARKS)[number]} mark
 */
const markRow = (person, mark) => ({
  bar: bar([segment(1, 'var(--series-1)')], `${mark.of(person)}%`),
  figure: String(mark.of(person)),
  label: `${mark.label} ${mark.of(person)}`,
  rows: MARKS.map((other) => ({ label: other.label, value: String(other.of(person)), ...(other.key === mark.key && { color: 'var(--series-1)' }) })),
})

/** @param {string} value */
function medianKey(value) {
  return el('li', { className: 'review-effort-median-key' }, el('span', { className: 'swatch' }), el('span', { textContent: t('médiane de l’équipe : {count}', { count: value }) }))
}

// The chart: its note, its legend, its rows, the median of the team as a line across them but for the shares.
/**
 * @param {TeamReview} review
 * @param {(person: ReviewedPerson, className: string) => HTMLElement} nameOf
 */
export function effortChart(review, nameOf) {
  $('[data-review-effort-measure]', HTMLSelectElement).value = measure
  const mark = MARKS.find((item) => item.key === measure)
  /** @type {(person: ReviewedPerson) => number} */
  const sortBy = mark ? mark.of : (person) => person.deliveredMean
  const people = [...review.people].sort((a, b) => sortBy(b) - sortBy(a))
  const top = Math.max(0, ...people.map((person) => person.deliveredMean))
  const head = el('li', { className: 'review-effort-row is-head' }, el('span'), el('span', { className: 'review-effort-total', textContent: mark ? t('note') : t('unités / mois') }))
  head.setAttribute('aria-hidden', 'true')
  const list = el('ol', { className: 'review-effort-rows' }, head, ...people.map((person) => row(person, mark ? markRow(person, mark) : effortRow(person, top), nameOf)))
  const markMedian = mark ? Math.round(median(people.map(mark.of)) ?? 0) : 0
  const medianAt = mark ? markMedian : measure === 'units' && top ? (100 * review.delivery.median) / top : null
  if (typeof medianAt === 'number') {
    list.style.setProperty('--median', `${medianAt}%`)
    list.classList.add('has-median')
  }
  const used = EFFORT_SERIES.filter((kind) => people.some((person) => person.deliveredParts[kind.key] > 0))
  const legend = mark
    ? [medianKey(String(markMedian))]
    : [
        ...used.map((kind) => {
          const swatch = el('span', { className: 'swatch' })
          swatch.style.background = kind.color

          return el('li', {}, swatch, el('span', { textContent: kind.label }))
        }),
        ...(measure === 'units' ? [medianKey(one(review.delivery.median))] : []),
      ]

  return [
    el('p', {
      className: 'card-note',
      textContent: mark
        ? t('{mark} : le rang de chacun dans l’équipe, de 0 à 100, la meilleure en haut. Elle pèse {what}. Le trait marque la médiane de l’équipe. Un clic sur un nom ouvre son dossier.', { mark: mark.label, what: mark.what })
        : measure === 'shares'
          ? t('Ce que chaque type de travail pèse dans ce que chacun livre, du plus livré au moins livré ; au bout, ses unités par mois. Un clic sur un nom ouvre son dossier.')
          : t('Unités livrées par mois sur l’année, tout le travail compris : une PR de projet, d’AC ou du reste selon sa taille, un hotfix pour {worth} unité. Le trait marque la médiane de l’équipe. Un clic sur un nom ouvre son dossier.', {
              worth: one(review.delivery.hotfixWorth),
            }),
    }),
    el('ul', { className: 'effort-legend review-effort-legend' }, ...legend),
    list,
  ]
}

// Listens to the list of what the bars show.
/** @param {() => void} render */
export function setupEffortChart(render) {
  const select = $('[data-review-effort-measure]', HTMLSelectElement)
  select.addEventListener('change', () => {
    measure = /** @type {typeof measure} */ (select.value)
    render()
  })
}
