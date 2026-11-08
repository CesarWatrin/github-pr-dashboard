// The figures of a project, on its card, in its dialog and in the table, their hints making the legend under the table;
// its short dates, the other projects of its name, its lines. Its statuses, its name and its day are those of every page
// (ui/projects.js).

import { isMissing } from '../../domain/math.js'
import { STALLED_AFTER_DAYS } from '../../domain/projects.js'
import { MINUTE_MS, parisDay } from '../../domain/time.js'
import { dayDate } from '../../lib/dates.js'
import { formatDecimal, formatDuration, formatLines, formatShare, formatSpan } from '../../lib/format.js'
import { LOCALE, t } from '../../lib/i18n.js'
import { el } from '../../ui/dom.js'
import { formatDay, PROJECT_STATUSES } from '../../ui/projects.js'

// The same day in short, for the table: « 03/03/26 ».
const shortDayFormat = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' })
/** @type {(minutes: number | null | undefined) => string} */
export const formatShortDay = (minutes) => (isMissing(minutes) ? '–' : shortDayFormat.format(dayDate(parisDay(minutes * MINUTE_MS))))

// The other projects that took the name of a project, each from its start to its end; null when none did.
/** @type {(row: { namesakes: { start: number, end: number }[] }) => string | null} */
export function namesakesText({ namesakes }) {
  if (namesakes.length === 0) {
    return null
  }
  const spans = namesakes.map(({ start, end }) => t('du {start} au {end}', { start: formatDay(start), end: formatDay(end) })).join(' ; ')

  return namesakes.length === 1 ? t('Un autre projet a porté ce nom, {spans}.', { spans }) : t('D’autres projets ont porté ce nom, {spans}.', { spans })
}

// Lines added over lines deleted, in the colors of a diff, as in the tables.
export const linesNodes = ({ added, deleted }) => [
  el('span', { className: 'project-lines-added', textContent: `+${formatLines(added)}` }),
  el('span', { className: 'project-lines-deleted', textContent: `−${formatLines(deleted)}` }),
]

/** @type {(row: { merges: { at: number }[] }) => number | null} */
export const lastMergeOf = (row) => row.merges.at(-1)?.at ?? null

// Every figure of a project: those about its life count whatever the period, the others over the period, for the squad
// and the repositories picked.
export const PROJECT_FIGURES = {
  status: {
    key: 'status',
    label: t('Statut'),
    format: (status) => PROJECT_STATUSES[status].label,
    hint: t('À la dernière synchro : en cours, à l’arrêt depuis {days} jours sans activité, ou livré. Le tri les range dans cet ordre.', {
      days: STALLED_AFTER_DAYS,
    }),
  },
  start: { key: 'start', label: t('Début'), format: formatDay, hint: t('Sa première PR ouverte, dans les données synchronisées.') },
  lastMerge: {
    key: 'lastMerge',
    label: t('Mergé le'),
    value: lastMergeOf,
    format: formatDay,
    hint: t('Le dernier merge de sa branche project/…/main dans une branche principale (develop, main, master, staging).'),
  },
  lastActivity: {
    key: 'lastActivity',
    label: t('Dernière activité'),
    format: formatDay,
    hint: t('Sa dernière PR ouverte ou mergée, review ou commentaire.'),
  },
  days: {
    key: 'days',
    label: t('Durée'),
    format: formatSpan,
    hint: t('Au calendrier, de son début à sa livraison, ou à sa dernière activité s’il n’est pas livré.'),
  },
  code: { key: 'code', label: t('PR de code'), hint: t('PR de code du projet ouvertes sur la période.') },
  merged: { key: 'merged', label: t('Mergées'), hint: t('Parmi ces PR, celles qui ont été mergées.') },
  open: { key: 'open', label: t('Ouvertes'), hint: t('PR de code du projet encore ouvertes à la dernière synchro, hors brouillons.') },
  people: { key: 'people', label: t('Personnes'), hint: t('Personnes qui ont ouvert ces PR, parties comprises.') },
  teamShare: {
    key: 'teamShare',
    label: t('Part de l’équipe'),
    format: formatShare,
    hint: t('Part des personnes de l’équipe, ou de la squad choisie, qui ont ouvert ces PR.'),
  },
  reviewers: {
    key: 'reviewers',
    label: t('Relecteurs'),
    value: (row) => row.reviewers.length,
    hint: t('Personnes intervenues sur des PR de code du projet sur la période.'),
  },
  lines: {
    key: 'added',
    label: t('Lignes'),
    content: linesNodes,
    hint: t('Lignes ajoutées (+) et supprimées (−) par les PR mergées du projet.'),
  },
  added: { key: 'added', label: t('Lignes ajoutées'), format: formatLines, hint: t('Total des lignes ajoutées par les PR mergées.') },
  deleted: { key: 'deleted', label: t('Lignes supprimées'), format: formatLines, hint: t('Total des lignes supprimées par les PR mergées.') },
  medianTimeToMergeHours: {
    key: 'medianTimeToMergeHours',
    label: t('Merge en'),
    format: formatDuration,
    hint: t('Médiane, de la création au merge de ses PR de code, en heures ouvrées.'),
  },
  integrationHours: {
    key: 'integrationHours',
    label: t('Intégration'),
    format: formatDuration,
    hint: t('Heures ouvrées entre la dernière PR de code mergée et le dernier merge de sa branche dans une branche principale.'),
  },
  perWeek: {
    key: 'perWeek',
    label: t('Rythme'),
    format: (value) => (isMissing(value) ? '–' : t('{value} / sem.', { value: formatDecimal(Math.round(value * 10) / 10) })),
    hint: t('PR de code ouvertes par semaine, sur la partie de la période où le projet avance.'),
  },
}
export const projectFigures = (...keys) => keys.map((key) => PROJECT_FIGURES[key])
