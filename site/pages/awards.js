// Palmarès: the leaders of the month, the holders of each badge, the leaders of every month.

import { monthlyActivity, monthlyLeaders } from '../domain/months.js'
import { parisDay } from '../domain/time.js'
import { capitalize, monthName, plural } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { BADGE_TIERS, BADGES, badgeStandings, monthFigures, TIER_ORDER } from '../model/badges.js'
import { displayName, isCurrent } from '../model/people.js'
import { state } from '../model/state.js'
import { badgeMedal, badgeWhy, leadersLine } from '../ui/badges.js'
import { $, el } from '../ui/dom.js'
import { personLink } from '../ui/links.js'
import { bindTooltip, hideTooltip, showTooltip } from '../ui/tooltip.js'

function awardHead(badge) {
  return el(
    'div',
    { className: 'award-head' },
    el('span', { className: 'award-icon', textContent: badge.icon, ariaHidden: 'true' }),
    el('span', { className: 'award-name' }, el('strong', { textContent: badge.name }), el('span', { textContent: capitalize(badge.what) })),
  )
}

// For each badge, the leaders of the last whole month and those of the current one so far.
function renderChampions({ history, leaders }) {
  const last = Object.keys(history).sort().at(-1)
  const current = parisDay(Date.parse(state.stats.generatedAt)).slice(0, 7)
  const ongoing = { [current]: monthFigures(monthlyActivity(state.stats.pullRequests), current) }
  const currentMonth = monthName(current).replace(/ \d+$/, '')
  const currentName = capitalize(currentMonth)
  $('[data-awards-champions-sub]').textContent = last
    ? t('{last}, le dernier mois complet, et {current} en cours, provisoire', { last: capitalize(monthName(last)), current: currentMonth })
    : t('{current} en cours, provisoire : pas encore de mois complet', { current: currentName })
  $('[data-awards-champions]').replaceChildren(
    ...BADGES.map((badge) =>
      el(
        'article',
        { className: 'award' },
        awardHead(badge),
        el(
          'dl',
          { className: 'award-months' },
          ...(last
            ? [
                el(
                  'div',
                  {},
                  el('dt', { textContent: capitalize(monthName(last)) }),
                  el('dd', {}, leadersLine(leaders.get(badge.key).find((leader) => leader.month === last), badge)),
                ),
              ]
            : []),
          el(
            'div',
            {},
            el('dt', { textContent: t('{month}, en cours', { month: currentName }) }),
            el('dd', {}, leadersLine(monthlyLeaders(ongoing, badge.key)[0], badge)),
          ),
        ),
      ),
    ),
  )
}

// For each badge, the people of the team who hold it, the best tier and the longest run first.
function renderHolders({ byLogin }) {
  $('[data-awards-holders]').replaceChildren(
    ...BADGES.map((badge) => {
      const holders = [...byLogin]
        .filter(([login]) => isCurrent(login))
        .flatMap(([login, badges]) => badges.filter((won) => won.key === badge.key).map((won) => ({ login, won })))
        .sort(
          (a, b) =>
            TIER_ORDER.indexOf(a.won.tier) - TIER_ORDER.indexOf(b.won.tier) ||
            b.won.streak - a.won.streak ||
            b.won.total - a.won.total ||
            displayName(a.login).localeCompare(displayName(b.login), 'fr'),
        )

      // The list scrolls once long: the tooltip of each medal would be cut by its edges, so the medals take the
      // tooltip of the charts, over the page.
      const medal = (won) => {
        const node = badgeMedal(won, 'small')
        const tip = { title: `${won.icon} ${won.name} · ${BADGE_TIERS[won.tier]}`, rows: [], note: badgeWhy(won) }
        bindTooltip(node, (x, y) => showTooltip(tip, x, y), hideTooltip)

        return node
      }
      const list = holders.length
        ? el(
            'ul',
            { className: 'award-holders' },
            ...holders.map(({ login, won }) =>
              el(
                'li',
                {},
                medal(won),
                el(
                  'span',
                  { className: 'award-holder' },
                  personLink(login),
                  el('span', {
                    className: 'award-value',
                    textContent: won.streak > 1 ? t('{count} mois d’affilée', { count: won.streak }) : plural(won.total, 'mois', 'mois'),
                  }),
                ),
              ),
            ),
          )
        : el('p', { className: 'muted', textContent: t('Personne de l’équipe pour l’instant') })
      list.addEventListener('scroll', hideTooltip)

      return el('article', { className: 'award' }, awardHead(badge), list)
    }),
  )
}

// Every whole month of the history, the latest first, with the leaders of each badge.
function renderAwardMonths({ history, leaders }) {
  const months = Object.keys(history).sort().toReversed()
  $('[data-awards-months-sub]').textContent = months.length
    ? t('Les champions de chaque mois complet depuis la première synchro, en {month}', { month: monthName(months.at(-1)) })
    : t('Pas encore de mois complet')
  $('[data-awards-months]').replaceChildren(
    el(
      'table',
      { className: 'awards-table' },
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          el('th', { scope: 'col', className: 'text', textContent: t('Mois') }),
          ...BADGES.map((badge) => el('th', { scope: 'col', className: 'text', textContent: `${badge.icon} ${badge.name}` })),
        ),
      ),
      el(
        'tbody',
        {},
        ...months.map((month) =>
          el(
            'tr',
            {},
            el('th', { scope: 'row', className: 'text', textContent: capitalize(monthName(month)) }),
            ...BADGES.map((badge) => {
              const leader = leaders.get(badge.key).find((other) => other.month === month)

              return el('td', { className: 'text' }, leadersLine(leader, badge, { withFormer: true }))
            }),
          ),
        ),
      ),
    ),
  )
}

export function renderAwards() {
  const standings = badgeStandings()
  renderChampions(standings)
  renderHolders(standings)
  renderAwardMonths(standings)
}
