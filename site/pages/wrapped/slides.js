// The slides of the year in review: a person's (personSlides()) and the team's (teamSlides()), each a figure that counts
// up, a few words and maybe a picture (the months, avatars, projects, records). Slides without anything to say are left
// out: a year without a project has no slide of projects. The story (wrapped.js) plays them, from what the sync
// published (scripts/sync/retro.mjs).

import { capitalize, formatLines, formatNumber, noun, plural } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { biggestLink, duo, face, groupPhoto, isLate, monthBars, monthOnly, moreRepos, projectList, recordCards, records, summary, timeOfDay, weekdayName } from './visuals.js'

/**
 * A slide: its tone (the colors of its background), a line above, a figure that counts up and its unit, a title, a
 * detail, a picture, how long it shows when it says more than the others (milliseconds); the last one sums the year up
 * (final).
 * @typedef {{ tone: number, eyebrow: string, figure?: number, unit?: string, title?: string, detail?: string, visual?: HTMLElement, duration?: number, final?: boolean }} Slide
 */

/**
 * What a story reads besides its figures: the year it tells, the organization (for the links to GitHub), and the name of
 * a login.
 * @typedef {{ year: number, org: string, nameOf: (login: string) => string }} StoryContext
 */

/**
 * A person's year, slide by slide.
 * @param {RetroPerson} year
 * @param {StoryContext} context
 * @returns {Slide[]}
 */
export function personSlides(year, { year: retroYear, org, nameOf }) {
  const name = nameOf(year.login)
  const cards = recordCards(year.facts)
  const { latest, earliest } = year.facts
  /** @type {(Slide | false)[]} */
  const slides = [
    {
      tone: 0,
      eyebrow: t('Rétrospective {year}', { year: retroYear }),
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
    year.streak >= 3 && {
      tone: 5,
      eyebrow: t('Ta plus longue série'),
      figure: year.streak,
      unit: t('jours ouvrés d’affilée'),
      detail: t('avec au moins une PR ouverte chaque jour. Rien ne t’arrête.'),
    },
    year.projects > 0 && {
      tone: 4,
      eyebrow: t('Tes projets'),
      figure: year.projects,
      unit: noun(year.projects, 'projet'),
      detail: year.delivered ? t('dont {count} livrés cette année.', { count: formatNumber(year.delivered) }) : t('Pas encore livrés : la suite au prochain épisode.'),
      visual: projectList(year.projectList),
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
    (year.reviewedBy !== null || year.reviewedMost !== null) && {
      tone: 1,
      eyebrow: t('Ton duo de review'),
      // The same person both ways: a pair, named.
      ...(year.reviewedBy !== null && year.reviewedBy.login === year.reviewedMost?.login
        ? { title: nameOf(year.reviewedBy.login), detail: t('Dans les deux sens : un vrai binôme.') }
        : {}),
      visual: duo(year, nameOf),
    },
    year.biggest !== null && {
      tone: 2,
      eyebrow: t('Ta plus grosse PR'),
      figure: year.biggest.lines,
      unit: t('lignes'),
      detail: year.biggest.title ?? t('dans {repo}', { repo: year.biggest.repo }),
      visual: biggestLink(org, year.biggest),
    },
    cards.length > 0 && {
      tone: 3,
      eyebrow: t('Tes records'),
      title: t('Les PR qui ont marqué ton année'),
      visual: records(cards),
    },
    latest !== null && {
      tone: 6,
      eyebrow: isLate(latest) ? t('Couche-tard') : t('Ta PR la plus tardive'),
      title: timeOfDay(latest),
      detail: [
        isLate(latest) ? t('Ta PR la plus tardive de l’année. La nuit porte conseil, paraît-il.') : t('Jamais de PR la nuit : tu sais t’arrêter.'),
        earliest !== null && earliest !== latest ? t('La plus matinale : {time}.', { time: timeOfDay(earliest) }) : '',
      ]
        .filter(Boolean)
        .join(' '),
    },
    year.facts.fridays > 0 && {
      tone: 4,
      eyebrow: t('Le frisson du vendredi'),
      figure: year.facts.fridays,
      unit: noun(year.facts.fridays, 'PR mergée un vendredi après 16 h', 'PR mergées un vendredi après 16 h'),
      detail: t('Le week-end peut attendre.'),
    },
    year.repos.length > 0 && {
      tone: 3,
      eyebrow: t('Ton dépôt de cœur'),
      title: year.repos[0][0],
      detail: t('{count} de tes PR y sont allées.', { count: formatNumber(year.repos[0][1]) }),
      visual: moreRepos(year.repos),
    },
    {
      tone: 0,
      eyebrow: t('Rétrospective {year}', { year: retroYear }),
      title: t('Merci pour cette année, {name} !', { name }),
      visual: summary([
        [t('PR de code'), year.code],
        [t('Mergées'), year.merged],
        [t('PR relues'), year.reviewed],
        [t('Projets'), year.projects],
        [t('AC livrées'), year.acs],
        [t('Hotfix'), year.hotfixes],
      ]),
      final: true,
    },
  ]

  return /** @type {Slide[]} */ (slides.filter(Boolean))
}

/**
 * The team's year, or a squad's, slide by slide: what everyone did together, never who did the most. Its first slide
 * shows everyone, the heads of squads in front. A squad has no deployment of its own: its last slide counts its AC
 * instead.
 * @param {RetroTeam} year
 * @param {StoryContext} context
 * @param {string | null} [squad] the name of the squad, null for the team
 * @param {{ people: string[], leads: string[] }} [crew] the logins of its people, and of the heads of its squads
 * @returns {Slide[]}
 */
export function teamSlides(year, { year: retroYear, nameOf }, squad = null, crew = { people: [], leads: [] }) {
  const cards = recordCards(year.facts)
  /** @type {(Slide | false)[]} */
  const slides = [
    {
      tone: 0,
      eyebrow: t('Rétrospective {year}', { year: retroYear }),
      title: squad ?? t('L’équipe'),
      detail: t('{people} personnes, une année de PR, de reviews et de projets.', { people: formatNumber(year.people) }),
      visual: groupPhoto(crew.people, crew.leads, nameOf),
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
    year.projects > 0 && {
      tone: 4,
      eyebrow: t('Les projets livrés'),
      figure: year.delivered,
      unit: noun(year.delivered, 'projet'),
      detail: t('sur {count} menés cette année, et {acs}.', { count: formatNumber(year.projects), acs: plural(year.acs, 'AC livrée', 'AC livrées') }),
      visual: year.projectList.length ? projectList(year.projectList) : undefined,
    },
    year.reviewed > 0 && {
      tone: 6,
      eyebrow: t('Les uns pour les autres'),
      figure: year.reviewed,
      unit: t('PR relues'),
      detail: t('{comments} et {reviewers} relecteurs.', { comments: plural(year.comments, 'commentaire'), reviewers: formatNumber(year.reviewers) }),
    },
    cards.length > 0 && {
      tone: 3,
      eyebrow: t('Les records de l’équipe'),
      title: t('Les PR qui ont marqué l’année'),
      visual: records(cards),
    },
    year.facts.latest !== null && isLate(year.facts.latest) && {
      tone: 6,
      eyebrow: t('La PR la plus tardive'),
      title: timeOfDay(year.facts.latest),
      detail: t('Quelqu’un avait une idée à cette heure-là. On ne dira pas qui.'),
    },
    year.facts.fridays > 0 && {
      tone: 4,
      eyebrow: t('Le frisson du vendredi'),
      figure: year.facts.fridays,
      unit: noun(year.facts.fridays, 'PR mergée un vendredi après 16 h', 'PR mergées un vendredi après 16 h'),
      detail: t('Le week-end peut attendre.'),
    },
    year.repos.length > 0 && {
      tone: 2,
      eyebrow: t('Le dépôt le plus actif'),
      title: year.repos[0][0],
      detail: t('{count} PR de code.', { count: formatNumber(year.repos[0][1]) }),
      visual: moreRepos(year.repos),
    },
    {
      tone: 0,
      eyebrow: t('Rétrospective {year}', { year: retroYear }),
      title: squad ? t('Merci pour cette année, {name} !', { name: squad }) : t('Merci à toute l’équipe !'),
      visual: summary([
        [t('PR de code'), year.code],
        [t('Mergées'), year.merged],
        [t('PR relues'), year.reviewed],
        squad ? [t('AC livrées'), year.acs] : [t('Mises en prod'), year.deployments],
        [t('Projets livrés'), year.delivered],
        [t('Hotfix'), year.hotfixes],
      ]),
      final: true,
    },
  ]

  return /** @type {Slide[]} */ (slides.filter(Boolean))
}
