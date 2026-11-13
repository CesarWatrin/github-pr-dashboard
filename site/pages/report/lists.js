// The cards under the figures of the monthly report: for the team, the champions of the badges, the busiest
// repositories, the arrivals and the projects of the month; for a person, their figures of the badges, their busiest
// repositories, who they reviewed with and their projects. Every list is drawn, the hidden card's empty.

import { parisDay } from '../../domain/time.js'
import { dayDate } from '../../lib/dates.js'
import { dayMonthFormat } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { amountOf, leadersLine } from '../../ui/badges.js'
import { $, el } from '../../ui/dom.js'
import { personLink, repoLink } from '../../ui/links.js'
import { renderList } from '../../ui/list.js'
import { projectLink } from '../../ui/projects.js'

// What the lists of the report count, singular then plural.
const REPORT_UNITS = {
  code: ['PR de code', 'PR de code'],
  deployments: ['déploiement', 'déploiements'],
  reviews: ['PR relue', 'PR relues'],
  prs: ['PR', 'PR'],
}

// A badge, its icon before its name.
const badgeName = (badge) =>
  el('span', { className: 'report-badge' }, el('span', { textContent: badge.icon, ariaHidden: 'true' }), document.createTextNode(badge.name))

// [key, count] pairs as a list, each key drawn by link().
function pairList(target, pairs, unit, link) {
  renderList(
    $(target),
    pairs.map(([key, count]) => el('li', {}, link(key), el('span', { className: 'pair-count', textContent: amountOf(count, unit) }))),
    t('Aucun'),
  )
}

// From what reportContent() says of the month.
export function renderReportLists(content) {
  const { person } = content
  $('[data-report-champions-title]').textContent = person ? t('Ses badges du mois') : t('Champions du mois')
  $('[data-report-champions-sub]').textContent = person
    ? t('Ses chiffres des badges du Palmarès, et ceux où la personne mène l’équipe')
    : t('Les badges du Palmarès')
  $('[data-report-champions]').replaceChildren(
    ...(person
      ? content.badges.map(({ badge, value, leads }) =>
          el(
            'li',
            {},
            badgeName(badge),
            el(
              'span',
              { className: 'report-badge-figure' },
              ...(leads ? [el('span', { className: 'report-change is-better', textContent: t('En tête de l’équipe') })] : []),
              el('span', { className: 'award-value', textContent: amountOf(value, badge.units, badge.format) }),
            ),
          ),
        )
      : content.champions.map(({ badge, leader }) => el('li', {}, badgeName(badge), leadersLine(leader, badge)))),
  )

  $('[data-report-repos-title]').textContent = person ? t('Ses dépôts les plus actifs') : t('Dépôts les plus actifs')
  $('[data-report-repos-label]').textContent = person ? t('PR relues') : t('Déploiements')
  pairList('[data-report-repos="code"]', content.repos.code, REPORT_UNITS.code, repoLink)
  pairList(
    '[data-report-repos="other"]',
    person ? content.repos.reviews : content.repos.deployments,
    person ? REPORT_UNITS.reviews : REPORT_UNITS.deployments,
    repoLink,
  )

  $('[data-report-arrivals-card]').hidden = Boolean(person)
  renderList(
    $('[data-report-arrivals]'),
    (content.arrivals ?? []).map(({ login, first }) =>
      el('li', {}, personLink(login), el('span', { className: 'pair-count', textContent: t('le {date}', { date: dayMonthFormat.format(dayDate(parisDay(first.at))) }) })),
    ),
    t('Aucune arrivée ce mois-ci'),
  )
  $('[data-report-duos-card]').hidden = !person
  pairList('[data-report-duos="reviewedBy"]', content.duos?.reviewedBy ?? [], REPORT_UNITS.prs, personLink)
  pairList('[data-report-duos="reviewed"]', content.duos?.reviewed ?? [], REPORT_UNITS.prs, personLink)

  for (const { key, at, empty } of [
    { key: 'started', at: (row) => row.start, empty: t('Aucun projet démarré ce mois-ci') },
    { key: 'delivered', at: (row) => row.deliveredAt, empty: t('Aucun projet livré ce mois-ci') },
  ]) {
    renderList(
      $(`[data-report-projects="${key}"]`),
      content.projects[key].map((row) =>
        el('li', {}, projectLink(row), el('span', { className: 'pair-count', textContent: t('le {date}', { date: dayMonthFormat.format(dayDate(parisDay(at(row) * 60_000))) }) })),
      ),
      empty,
    )
  }
}
