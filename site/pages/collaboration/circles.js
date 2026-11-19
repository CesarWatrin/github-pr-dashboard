// The pairs and circles of review of the collaboration page (currentCircles() of model/team.js): how much of the reviews
// are returned, how much the busiest pairs take, how many reviewers do most of them; the busiest pairs, both ways; the
// circles of people who mostly review each other, and those whose pull requests wait for a first review.

import { COVERAGE, MAIN_REVIEWERS, NARROW_SHARE, suggestReviewers, TOP_PAIRS, WAITING_FACTOR } from '../../domain/review-circles.js'
import { formatDecimal, formatDuration, formatNumber, formatShare, plural } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { displayName } from '../../model/people.js'
import { state } from '../../model/state.js'
import { currentCircles } from '../../model/team.js'
import { $, el } from '../../ui/dom.js'
import { avatar, personLink } from '../../ui/links.js'
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
    el('span', { className: 'circle-pair-names' }, personLink(pair.first), el('span', { className: 'circle-pair-arrows', textContent: '⇄' }), personLink(pair.second)),
    el('span', { className: 'circle-pair-track' }, bar),
    el('span', { className: 'circle-pair-counts', textContent: `${formatNumber(pair.firstReviews)} · ${formatNumber(pair.secondReviews)}` }),
  )
}

// How many pairs show before « Voir tous les binômes », and how many entries each other list shows.
const SHOWN_PAIRS = 12
const SHOWN_ENTRIES = 8

// The stacks of a circle, as the team page says them: a circle of front developers reads as one.
/**
 * @param {string[]} members
 * @param {(login: string) => string} stackOf
 */
const stacksText = (members, stackOf) => [...new Set(members.map(stackOf).filter(Boolean))].join(' · ')

// Who could review some people more (suggestReviewers()): a line of faces and names, with what each reviews of them
// against what they would. Nothing when nobody fits.
/**
 * @param {import('../../domain/review-circles.js').ReviewExpectations} expectations
 * @param {string[]} people
 * @param {string} label
 */
function suggestionsLine(expectations, people, label) {
  const suggestions = suggestReviewers(expectations, people)
  if (suggestions.length === 0) {
    return []
  }

  return [
    el(
      'p',
      { className: 'circle-suggestions' },
      el('span', { textContent: label }),
      ...suggestions.map((suggestion) =>
        el(
          'span',
          { className: 'circle-main', title: t('relues : {actual}, attendues : {expected}', { actual: formatNumber(suggestion.actual), expected: formatNumber(Math.round(suggestion.expected)) }) },
          avatar(suggestion.reviewer),
          t('{name} ({actual} sur {expected})', { name: displayName(suggestion.reviewer), actual: formatNumber(suggestion.actual), expected: formatNumber(Math.round(suggestion.expected)) }),
        ),
      ),
    ),
  ]
}

// A circle: its people, the share of the reviews of their pull requests from inside, how long these wait for a first
// review against the rest of the team; flagged when they wait far longer.
/**
 * @param {Circle} circle
 * @param {(login: string) => string} stackOf
 * @param {import('../../domain/review-circles.js').ReviewExpectations} expectations
 */
function circleItem(circle, stackOf, expectations) {
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
      el(
        'span',
        { className: 'circle-tags' },
        ...(stacksText(circle.members, stackOf) ? [el('span', { className: 'circle-stack', textContent: stacksText(circle.members, stackOf) })] : []),
        ...(circle.waiting ? [el('span', { className: 'circle-flag', textContent: t('Attend') })] : []),
      ),
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
    ...(circle.waiting ? suggestionsLine(expectations, circle.members, t('Pourraient relire davantage leurs PR :')) : []),
  )
}

export function renderCircles() {
  if (!state.stats) {
    return
  }
  const { circles, missing, spread, stackOf, expectations } = currentCircles()
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
      ? circles.pairs.slice(0, SHOWN_PAIRS).map((pair) => pairLine(pair, busiest))
      : [el('li', { className: 'muted', textContent: t('Aucune review sur la période.') })]),
  )
  // Every other pair, folded: whoever is looked for is somewhere.
  $('[data-circle-more]').hidden = circles.pairs.length <= SHOWN_PAIRS
  $('[data-circle-pairs-all]').replaceChildren(...circles.pairs.slice(SHOWN_PAIRS).map((pair) => pairLine(pair, busiest)))
  $('[data-circle-one-sided]').replaceChildren(
    ...(circles.oneSided.length
      ? circles.oneSided.slice(0, SHOWN_ENTRIES).map((pair) => pairLine(pair, busiest))
      : [el('li', { className: 'muted', textContent: t('Aucun binôme à sens unique sur la période.') })]),
  )
  $('[data-circle-missing]').replaceChildren(
    ...(missing.length
      ? missing.slice(0, SHOWN_ENTRIES).map((gap) =>
          el(
            'li',
            { className: 'circle-gap' },
            el('span', { className: 'circle-pair-names' }, personLink(gap.reviewer), el('span', { className: 'circle-pair-arrows', textContent: '→' }), personLink(gap.author)),
            el('span', { className: 'circle-gap-figure', textContent: t('relues : {actual}, attendues : {expected}', { actual: formatNumber(gap.actual), expected: formatNumber(Math.round(gap.expected)) }) }),
          ),
        )
      : [el('li', { className: 'muted', textContent: t('Aucune relecture qui manque nettement sur la période.') })]),
  )
  const narrow = spread.filter((row) => row.narrow)
  $('[data-circle-spread-note]').textContent = t(
    'Par combien de personnes chacun est relu en pratique, face à la médiane des devs de sa stack : à partir de {share} de moins, avec ses {count} principaux relecteurs. Le temps d’attente ne le montre pas : on peut relancer les mêmes personnes en direct et ne jamais attendre.',
    { share: formatShare(1 - NARROW_SHARE), count: MAIN_REVIEWERS },
  )
  $('[data-circle-spread]').replaceChildren(
    ...(narrow.length
      ? narrow.slice(0, SHOWN_ENTRIES).map((row) =>
          el(
            'li',
            { className: 'circle-gap' },
            el('span', { className: 'circle-pair-names' }, personLink(row.author), ...(row.group ? [el('span', { className: 'circle-stack', textContent: row.group })] : [])),
            el(
              'span',
              { className: 'circle-gap-figure' },
              t('{effective} relecteurs effectifs, médiane {stack} : {median}', {
                effective: formatDecimal(Math.round(row.effective * 10) / 10),
                stack: row.group || t('de l’équipe'),
                median: formatDecimal(Math.round(row.groupMedian * 10) / 10),
              }),
            ),
            el(
              'span',
              { className: 'circle-gap-main' },
              t('{share} par', { share: formatShare(row.mainShare) }),
              ...row.main.map((main) => el('span', { className: 'circle-main' }, avatar(main.login), `${displayName(main.login)} ${formatShare(main.share)}`)),
            ),
            ...suggestionsLine(expectations, [row.author], t('Pourraient relire davantage ses PR :')),
          ),
        )
      : [el('li', { className: 'muted', textContent: t('Personne n’est relu par nettement moins de monde que les devs de sa stack.') })]),
  )
  $('[data-circles]').replaceChildren(
    ...(groups.length ? groups.map((circle) => circleItem(circle, stackOf, expectations)) : [el('li', { className: 'muted', textContent: t('Pas assez de reviews pour former des cercles.') })]),
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
