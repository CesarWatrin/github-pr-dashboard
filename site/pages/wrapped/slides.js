// The slides of the year in review: a person's (personSlides()) and the team's (teamSlides()), each a figure that counts
// up, a few words and maybe a picture (the months, avatars, projects, badges). Slides without anything to say are left
// out: a year without a project has no slide of projects. The story (wrapped.js) plays them.

import { capitalize, formatLines, formatNumber, monthName, monthShortFormat, noun, plural } from '../../lib/format.js'
import { LOCALE, t } from '../../lib/i18n.js'
import { displayName } from '../../model/people.js'
import { el } from '../../ui/dom.js'
import { avatarUrl, githubUrl, pullRequestPath } from '../../ui/links.js'
import { PROJECT_STATUSES } from '../../ui/projects.js'

/**
 * A slide: its tone (the colors of its background), a line above, a figure that counts up and its unit, a title, a
 * detail, a picture; the last one sums the year up (final).
 * @typedef {{ tone: number, eyebrow: string, figure?: number, unit?: string, title?: string, detail?: string, visual?: HTMLElement, final?: boolean }} Slide
 */

/** @typedef {ReturnType<typeof import('../../model/wrapped.js').wrappedPerson>} WrappedPerson */
/** @typedef {ReturnType<typeof import('../../model/wrapped.js').wrappedTeam>} WrappedTeam */

const weekdayFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', timeZone: 'UTC' })
// A day of the week, Monday 0: « mardi ».
/** @type {(day: number) => string} */
const weekdayName = (day) => weekdayFormat.format(new Date(Date.UTC(2024, 0, 1 + day)))
// A month without its year: « mars ».
/** @type {(month: string) => string} */
const monthOnly = (month) => new Intl.DateTimeFormat(LOCALE, { month: 'long', timeZone: 'UTC' }).format(new Date(`${month}-15T12:00:00Z`))

/** @type {(login: string, size: number) => HTMLElement} */
const face = (login, size) => el('img', { className: 'wrapped-face', src: avatarUrl(login, size * 2), alt: '', width: size, height: size })

// The months of the year as bars, the busiest one lit.
/** @type {(months: { month: string, code: number }[], busiest: string | null) => HTMLElement} */
function monthBars(months, busiest) {
  const most = Math.max(1, ...months.map((month) => month.code))
  const bars = el('div', { className: 'wrapped-bars' })
  bars.setAttribute('role', 'img')
  bars.setAttribute('aria-label', months.map((month) => `${monthName(month.month)} : ${formatNumber(month.code)}`).join(', '))
  for (const month of months) {
    const bar = el('span', { className: `wrapped-bar${month.month === busiest ? ' is-busiest' : ''}` }, el('span', { className: 'wrapped-bar-label', textContent: monthShortFormat.format(new Date(`${month.month}-15T12:00:00Z`)).charAt(0).toUpperCase() }))
    bar.style.setProperty('--height', `${Math.max(4, Math.round((month.code / most) * 100))}%`)
    bars.append(bar)
  }

  return bars
}

// A short list: each item a name and what it says.
/** @type {(items: [string, string][]) => HTMLElement} */
const shortList = (items) =>
  el('ul', { className: 'wrapped-list' }, ...items.map(([name, detail]) => el('li', {}, el('span', { className: 'wrapped-list-name', textContent: name }), el('span', { className: 'wrapped-list-detail', textContent: detail }))))

// Projects, their status in words.
/** @type {(projects: { name: string, status: string, delivered: boolean }[]) => HTMLElement} */
const projectList = (projects) =>
  shortList(projects.slice(0, 5).map((project) => [project.name, project.delivered ? t('livré cette année') : PROJECT_STATUSES[project.status].label.toLowerCase()]))

// The figures of the year side by side, on the last slide.
/** @type {(figures: [string, number][]) => HTMLElement} */
const summary = (figures) =>
  el(
    'dl',
    { className: 'wrapped-summary' },
    ...figures.map(([label, value]) => el('div', {}, el('dt', { textContent: label }), el('dd', { textContent: formatNumber(value) }))),
  )

// A person's year, slide by slide.
/**
 * @param {WrappedPerson} year
 * @returns {Slide[]}
 */
export function personSlides(year) {
  const name = displayName(year.login)
  const delivered = year.projects.filter((project) => project.delivered).length
  /** @type {(Slide | false)[]} */
  const slides = [
    {
      tone: 0,
      eyebrow: t('Rétrospective {year}', { year: year.year }),
      title: name,
      detail: t('Ton année en PR, en reviews et en projets. C’est parti !'),
      visual: face(year.login, 120),
    },
    year.code > 0 && {
      tone: 1,
      eyebrow: t('Cette année, tu as ouvert'),
      figure: year.code,
      unit: noun(year.code, 'PR de code', 'PR de code'),
      detail: t('dont {merged} mergées, sur {days} jours différents.', { merged: formatNumber(year.merged), days: formatNumber(year.days) }),
    },
    year.added + year.deleted > 0 && {
      tone: 2,
      eyebrow: t('Et tu as écrit'),
      figure: year.added,
      unit: t('lignes ajoutées'),
      detail: t('et {deleted} supprimées : le ménage compte aussi.', { deleted: formatLines(year.deleted) }),
    },
    year.busiestMonth !== null && {
      tone: 3,
      eyebrow: t('Ton mois le plus chargé'),
      title: capitalize(monthOnly(year.busiestMonth)),
      detail: [
        t('{count} PR ce mois-là.', { count: formatNumber(year.months.find((month) => month.month === year.busiestMonth)?.code ?? 0) }),
        year.busiestWeekday !== null ? t('Ton jour pour ouvrir une PR : le {day}.', { day: weekdayName(year.busiestWeekday) }) : '',
      ]
        .filter(Boolean)
        .join(' '),
      visual: monthBars(year.months, year.busiestMonth),
    },
    year.projects.length > 0 && {
      tone: 4,
      eyebrow: t('Tes projets'),
      figure: year.projects.length,
      unit: noun(year.projects.length, 'projet'),
      detail: delivered ? t('dont {count} livrés cette année.', { count: formatNumber(delivered) }) : t('Pas encore livrés : la suite au prochain épisode.'),
      visual: projectList(year.projects),
    },
    (year.acs > 0 || year.hotfixes > 0) && {
      tone: 5,
      eyebrow: t('Et au quotidien'),
      figure: year.acs,
      unit: noun(year.acs, 'AC livrée', 'AC livrées'),
      detail:
        year.hotfixes > 0
          ? t('et {count} pour réparer la prod.', { count: plural(year.hotfixes, 'hotfix', 'hotfix') })
          : t('Des améliorations continues, livrées dans develop.'),
    },
    year.reviewed > 0 && {
      tone: 6,
      eyebrow: t('Pour les autres, tu as relu'),
      figure: year.reviewed,
      unit: noun(year.reviewed, 'PR', 'PR'),
      detail: t('et laissé {count}.', { count: plural(year.comments, 'commentaire') }),
    },
    (year.reviewedBy.length > 0 || year.reviewedMost.length > 0) && {
      tone: 1,
      eyebrow: t('Ton duo de review'),
      visual: el(
        'div',
        { className: 'wrapped-duo' },
        ...[
          year.reviewedBy[0] && [year.reviewedBy[0].login, t('a relu {count} de tes PR', { count: formatNumber(year.reviewedBy[0].prs) })],
          year.reviewedMost[0] && [year.reviewedMost[0].login, t('tu as relu {count} de ses PR', { count: formatNumber(year.reviewedMost[0].prs) })],
        ]
          .filter(Boolean)
          .map(([login, text]) => el('div', { className: 'wrapped-duo-person' }, face(login, 72), el('strong', { textContent: displayName(login) }), el('span', { textContent: text }))),
      ),
    },
    year.biggest !== null && {
      tone: 2,
      eyebrow: t('Ta plus grosse PR'),
      figure: year.biggest.lines,
      unit: t('lignes'),
      detail: year.biggest.title ?? t('dans {repo}', { repo: year.biggest.repo }),
      visual: el('a', {
        className: 'wrapped-link',
        href: githubUrl(pullRequestPath(year.biggest.repo, year.biggest.number)),
        target: '_blank',
        rel: 'noopener',
        textContent: t('{repo} #{number} sur GitHub', { repo: year.biggest.repo, number: year.biggest.number }),
      }),
    },
    year.repos.length > 0 && {
      tone: 3,
      eyebrow: t('Ton dépôt de cœur'),
      title: year.repos[0][0],
      detail: t('{count} de tes PR y sont allées.', { count: formatNumber(year.repos[0][1]) }),
      visual: year.repos.length > 1 ? shortList(year.repos.slice(1, 4).map(([repo, count]) => [repo, plural(count, 'PR', 'PR')])) : undefined,
    },
    year.badges.length > 0 && {
      tone: 4,
      eyebrow: t('Tes badges de l’année'),
      figure: year.badges.reduce((total, badge) => total + badge.months.length, 0),
      unit: t('mois en tête de l’équipe'),
      visual: el(
        'ul',
        { className: 'wrapped-badges' },
        ...year.badges.map((badge) =>
          el('li', {}, el('span', { className: 'wrapped-badge-icon', textContent: badge.icon }), el('strong', { textContent: badge.name }), el('span', { textContent: plural(badge.months.length, 'mois', 'mois') })),
        ),
      ),
    },
    {
      tone: 0,
      eyebrow: t('Rétrospective {year}', { year: year.year }),
      title: t('Merci pour cette année, {name} !', { name }),
      visual: summary([
        [t('PR de code'), year.code],
        [t('Mergées'), year.merged],
        [t('PR relues'), year.reviewed],
        [t('Projets'), year.projects.length],
        [t('AC livrées'), year.acs],
        [t('Hotfix'), year.hotfixes],
      ]),
      final: true,
    },
  ]

  return /** @type {Slide[]} */ (slides.filter(Boolean))
}

// The team's year, slide by slide: what everyone did together, never who did the most.
/**
 * @param {WrappedTeam} year
 * @returns {Slide[]}
 */
export function teamSlides(year) {
  const delivered = year.projects.filter((project) => project.delivered)
  /** @type {(Slide | false)[]} */
  const slides = [
    {
      tone: 0,
      eyebrow: t('Rétrospective {year}', { year: year.year }),
      title: t('L’équipe'),
      detail: t('{people} personnes, une année de PR, de reviews et de projets.', { people: formatNumber(year.people) }),
    },
    year.code > 0 && {
      tone: 1,
      eyebrow: t('Ensemble, vous avez ouvert'),
      figure: year.code,
      unit: t('PR de code'),
      detail: t('dont {merged} mergées.', { merged: formatNumber(year.merged) }),
    },
    year.added + year.deleted > 0 && {
      tone: 2,
      eyebrow: t('Et écrit'),
      figure: year.added,
      unit: t('lignes ajoutées'),
      detail: t('et {deleted} supprimées.', { deleted: formatLines(year.deleted) }),
    },
    year.deployments > 0 && {
      tone: 5,
      eyebrow: t('En production'),
      figure: year.deployments,
      unit: noun(year.deployments, 'mise en production', 'mises en production'),
      detail: t('sur {days} jours différents.', { days: formatNumber(year.deploymentDays) }),
    },
    year.busiestMonth !== null && {
      tone: 3,
      eyebrow: t('Le mois le plus chargé'),
      title: capitalize(monthOnly(year.busiestMonth)),
      detail: t('{count} PR ce mois-là.', { count: formatNumber(year.months.find((month) => month.month === year.busiestMonth)?.code ?? 0) }),
      visual: monthBars(year.months, year.busiestMonth),
    },
    year.projects.length > 0 && {
      tone: 4,
      eyebrow: t('Les projets livrés'),
      figure: delivered.length,
      unit: noun(delivered.length, 'projet'),
      detail: t('sur {count} menés cette année, et {acs}.', { count: formatNumber(year.projects.length), acs: plural(year.acs, 'AC livrée', 'AC livrées') }),
      visual: delivered.length ? projectList(delivered) : undefined,
    },
    year.reviewed > 0 && {
      tone: 6,
      eyebrow: t('Les uns pour les autres'),
      figure: year.reviewed,
      unit: t('PR relues'),
      detail: t('{comments} et {reviewers} relecteurs.', { comments: plural(year.comments, 'commentaire'), reviewers: formatNumber(year.reviewers) }),
    },
    year.repos.length > 0 && {
      tone: 2,
      eyebrow: t('Le dépôt le plus actif'),
      title: year.repos[0][0],
      detail: t('{count} PR de code.', { count: formatNumber(year.repos[0][1]) }),
      visual: year.repos.length > 1 ? shortList(year.repos.slice(1, 4).map(([repo, count]) => [repo, plural(count, 'PR', 'PR')])) : undefined,
    },
    {
      tone: 0,
      eyebrow: t('Rétrospective {year}', { year: year.year }),
      title: t('Merci à toute l’équipe !'),
      visual: summary([
        [t('PR de code'), year.code],
        [t('Mergées'), year.merged],
        [t('PR relues'), year.reviewed],
        [t('Mises en prod'), year.deployments],
        [t('Projets livrés'), delivered.length],
        [t('Hotfix'), year.hotfixes],
      ]),
      final: true,
    },
  ]

  return /** @type {Slide[]} */ (slides.filter(Boolean))
}
