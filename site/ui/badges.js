// The medals of the badges, and the leaders of a month (awards page, monthly report).

import { capitalize, formatNumber, monthName, noun } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { BADGE_TIERS, badgesOf, TIER_ORDER } from '../model/badges.js'
import { isCurrent } from '../model/people.js'
import { el } from './dom.js'
import { personLink } from './links.js'

// What a badge was won for: the longest run of months, and the total when there were more.
export function badgeWhy(badge) {
  const run =
    badge.streak > 1
      ? t('{count} mois d’affilée, de {from} à {to}', { count: badge.streak, from: monthName(badge.from), to: monthName(badge.to) })
      : t('en {month}', { month: monthName(badge.to) })
  const total = badge.total > badge.streak ? t(', {count} mois en tout', { count: badge.total }) : ''

  return t('{what} de l’équipe {run}{total}.', { what: capitalize(badge.what), run, total })
}

// A badge as a medal of its tier's metal, a face with its icon inside a brushed ring, the length of its run of months on
// a tab. What it means shows over it on hover or keyboard focus, in a tooltip of its own: the one of the charts would
// sit under the dialog.
export function badgeMedal(badge, size) {
  const tier = BADGE_TIERS[badge.tier]
  const medal = el(
    'span',
    { className: `badge-medal is-${badge.tier} is-${size}`, tabIndex: 0 },
    el('span', { className: 'badge-face' }, el('span', { className: 'badge-icon', textContent: badge.icon })),
    ...(badge.streak > 1 ? [el('span', { className: 'badge-streak', textContent: `×${badge.streak}` })] : []),
    el(
      'span',
      { className: 'badge-tip' },
      el('span', { className: 'badge-tip-head' }, el('strong', { textContent: `${badge.icon} ${badge.name}` }), el('span', { className: 'badge-tier', textContent: tier })),
      el('span', { className: 'badge-tip-text', textContent: badgeWhy(badge) }),
    ),
  )
  medal.setAttribute('role', 'img')
  medal.setAttribute('aria-label', t('{name}, {tier} : {why}', { name: badge.name, tier, why: badgeWhy(badge) }))
  medal.lastChild.setAttribute('aria-hidden', 'true')

  return medal
}

// The medals of a person, gold first; nothing for someone without any badge. Past the limit, the others gather under
// a "+N" whose tooltip names them.
export function badgeRow(login, className, size, limit = Infinity) {
  const won = badgesOf(login).toSorted((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) || b.streak - a.streak)
  const others = won.slice(limit)

  return won.length
    ? [
        el(
          'div',
          { className },
          ...won.slice(0, limit).map((badge) => badgeMedal(badge, size)),
          ...(others.length ? [moreBadges(others, size)] : []),
        ),
      ]
    : []
}

// The medals left out, as "+N" the size of a medal: on hover or focus, their names and tiers.
function moreBadges(badges, size) {
  const more = el(
    'span',
    { className: `badge-more is-${size}`, tabIndex: 0 },
    el('span', { textContent: `+${badges.length}` }),
    el(
      'span',
      { className: 'badge-tip' },
      ...badges.map((badge) =>
        el(
          'span',
          { className: 'badge-tip-head' },
          el('strong', { textContent: `${badge.icon} ${badge.name}` }),
          el('span', { className: 'badge-tier', textContent: BADGE_TIERS[badge.tier] }),
        ),
      ),
    ),
  )
  more.setAttribute('role', 'img')
  const names = badges.map((badge) => `${badge.name}, ${BADGE_TIERS[badge.tier]}`)
  more.setAttribute('aria-label', t('Et aussi : {names}', { names: names.join(t(' ; ')) }))
  more.lastChild.setAttribute('aria-hidden', 'true')

  return more
}

export const amountOf = (value, [one, many], format = formatNumber) => `${format(value)} ${noun(value, one, many)}`

// The people who led a badge over a month, and how much. Someone who left the team shows without a name, as everywhere,
// but in the record of every month (withFormer), where their name opens their dialog, as among the former people.
export function leadersLine(leader, badge, { withFormer = false } = {}) {
  if (!leader) {
    return el('span', { className: 'muted', textContent: t('Personne') })
  }

  return el(
    'span',
    { className: 'award-leaders' },
    ...leader.people.map((login) =>
      withFormer || isCurrent(login) ? personLink(login) : el('span', { className: 'award-former', textContent: t('une personne partie') }),
    ),
    el('span', { className: 'award-value', textContent: amountOf(leader.value, badge.units, badge.format) }),
  )
}
