// The pairs and circles of review of the collaboration page (currentCircles() of model/team.js): how much of the reviews
// are returned, how much the busiest pairs take, how many reviewers do most of them; the busiest pairs, both ways; the
// circles of people who mostly review each other, and those whose pull requests wait for a first review.

import { COVERAGE, TOP_PAIRS, WAITING_FACTOR } from '../../domain/review-circles.js'
import { formatDecimal, formatDuration, formatNumber, formatShare, plural } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { displayName } from '../../model/people.js'
import { state } from '../../model/state.js'
import { currentCircles } from '../../model/team.js'
import { $, el } from '../../ui/dom.js'
import { personLink } from '../../ui/links.js'
import { avatarStack } from '../../ui/people.js'
import { renderTiles } from '../../ui/tiles.js'

/** @typedef {import('../../domain/review-circles.js').ReviewCircles} ReviewCircles */
/** @typedef {ReviewCircles['circles'][number]} Circle */

const CIRCLE_TILES = [
  { key: 'reciprocity', label: t('Reviews rendues'), format: formatShare },
  { key: 'topPairsShare', label: t('Part des {count} premiers binômes', { count: TOP_PAIRS }), format: formatShare, better: 'down' },
  { key: 'reviewersForCoverage', label: t('Relecteurs pour {share} des reviews', { share: formatShare(COVERAGE) }), better: 'up' },
  { key: 'waiting', label: t('Groupes qui attendent'), better: 'down' },
]

// A pair, both ways: two names, and a bar cut into what each reviewed of the other, its width the share of the busiest
// pair.
/**
 * @param {ReviewCircles['pairs'][number]} pair
 * @param {number} busiest
 */
function pairLine(pair, busiest) {
  const total = pair.firstReviews + pair.secondReviews
  const bar = el('span', { className: 'circle-pair-bar' })
  bar.style.width = `${(100 * total) / busiest}%`
  const first = el('span', { className: 'circle-pair-first' })
  first.style.flexGrow = String(pair.firstReviews)
  const second = el('span', { className: 'circle-pair-second' })
  second.style.flexGrow = String(pair.secondReviews)
  bar.append(first, second)
  const reading = t('{first} a relu {firstCount} de {second}, {second} {secondCount} de {first}', {
    first: displayName(pair.first),
    second: displayName(pair.second),
    firstCount: plural(pair.firstReviews, 'PR', 'PR'),
    secondCount: plural(pair.secondReviews, 'PR', 'PR'),
  })
  bar.setAttribute('role', 'img')
  bar.setAttribute('aria-label', reading)

  return el(
    'li',
    { className: 'circle-pair', title: reading },
    el('span', { className: 'circle-pair-names' }, personLink(pair.first, { withAvatar: false }), el('span', { className: 'circle-pair-arrows', textContent: '⇄' }), personLink(pair.second, { withAvatar: false })),
    el('span', { className: 'circle-pair-track' }, bar),
    el('span', { className: 'circle-pair-counts', textContent: `${formatNumber(pair.firstReviews)} · ${formatNumber(pair.secondReviews)}` }),
  )
}

// A circle: its people, the share of the reviews of their pull requests from inside, how long these wait for a first
// review against the rest of the team; flagged when they wait far longer.
/** @param {Circle} circle */
function circleItem(circle) {
  const alone = circle.members.length === 1
  const wait = circle.firstReview
  const factor = typeof wait.slowest === 'number' && typeof circle.rest.slowest === 'number' && circle.rest.slowest > 0 ? wait.slowest / circle.rest.slowest : null

  return el(
    'li',
    { className: `circle${circle.waiting ? ' is-waiting' : ''}` },
    el(
      'div',
      { className: 'circle-head' },
      avatarStack(circle.members, { size: 24, max: 8 }),
      ...(circle.waiting ? [el('span', { className: 'circle-flag', textContent: t('Attend') })] : []),
    ),
    el('p', { className: 'circle-names' }, ...circle.members.flatMap((login, index) => [...(index ? [document.createTextNode(', ')] : []), personLink(login, { withAvatar: false })])),
    el(
      'p',
      { className: 'circle-figure' },
      alone
        ? t('Hors des cercles : ses PR sont relues par des personnes qui relisent surtout ailleurs.')
        : t('{share} des reviews de leurs PR viennent du cercle.', { share: formatShare(circle.insideShare) }),
    ),
    el(
      'p',
      { className: 'circle-figure' },
      wait.count
        ? t('1re review : {median} en médiane, {slowest} pour les plus lentes.', { median: formatDuration(wait.median), slowest: formatDuration(wait.slowest) })
        : t('Pas encore de review sur la période.'),
    ),
    ...(circle.waiting && factor
      ? [el('p', { className: 'circle-figure circle-alert', textContent: t('Leurs PR les plus lentes attendent {factor} fois plus que celles du reste de l’équipe.', { factor: formatDecimal(Math.round(factor * 10) / 10) }) })]
      : []),
  )
}

export function renderCircles() {
  if (!state.stats) {
    return
  }
  const { circles } = currentCircles()
  const groups = circles.circles.filter((circle) => circle.members.length > 1 || circle.waiting)
  const outside = circles.circles.filter((circle) => circle.members.length === 1 && !circle.waiting).map((circle) => circle.members[0])
  renderTiles(
    $('[data-circles-tiles]'),
    CIRCLE_TILES,
    {
      reciprocity: circles.reciprocity,
      topPairsShare: circles.topPairsShare,
      reviewersForCoverage: circles.total ? circles.reviewersForCoverage : null,
      waiting: circles.total ? circles.circles.filter((circle) => circle.waiting).length : null,
    },
    'enter',
  )
  const busiest = circles.pairs[0] ? circles.pairs[0].firstReviews + circles.pairs[0].secondReviews : 1
  $('[data-circle-pairs]').replaceChildren(
    ...(circles.pairs.length
      ? circles.pairs.slice(0, TOP_PAIRS).map((pair) => pairLine(pair, busiest))
      : [el('li', { className: 'muted', textContent: t('Aucune review sur la période.') })]),
  )
  $('[data-circles]').replaceChildren(
    ...(groups.length ? groups.map(circleItem) : [el('li', { className: 'muted', textContent: t('Pas assez de reviews pour former des cercles.') })]),
    ...(outside.length
      ? [
          el(
            'li',
            { className: 'circle is-outside' },
            el('div', { className: 'circle-head' }, avatarStack(outside, { size: 24, max: 8 })),
            el('p', { className: 'circle-figure', textContent: t('Hors des cercles, sans attente anormale : {people}.', { people: outside.map(displayName).join(', ') }) }),
          ),
        ]
      : []),
  )
  $('[data-circles-note]').textContent = t(
    'Un cercle réunit des personnes qui se relisent nettement plus entre elles qu’avec les autres. Un groupe attend quand ses PR les plus lentes (1 sur 10) attendent leur première review plus de {factor} fois plus longtemps que celles du reste de l’équipe. Reviews rendues : la part des reviews retournées dans l’autre sens au sein de chaque binôme. Les filtres de la page s’appliquent, la squad et les dépôts compris.',
    { factor: WAITING_FACTOR },
  )
}
