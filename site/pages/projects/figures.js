// The figures of a project, on its card, in its dialog and in the table, their hints making the legend under the table;
// its statuses, their colors and words; how its dates and its duration read.

import { isMissing } from '../../domain/math.js'
import { STALLED_AFTER_DAYS } from '../../domain/projects.js'
import { MINUTE_MS, parisDay } from '../../domain/time.js'
import { dayDate } from '../../lib/dates.js'
import { formatDecimal, formatDuration, formatLines, formatNumber, formatShare, plural, rangeShortFormat } from '../../lib/format.js'
import { LOCALE, t } from '../../lib/i18n.js'
import { el } from '../../ui/dom.js'

// A month of the calendar, in days, for a duration.
const MONTH_DAYS = 365.25 / 12

// Where a project stands at the last sync: a color for the timeline and its legend, a little lighter than the series, a
// stalled one lighter still; always with its word.
export const PROJECT_STATUSES = {
  ongoing: {
    key: 'ongoing',
    label: t('En cours'),
    color: 'color-mix(in srgb, var(--series-1) 85%, var(--surface))',
    hint: t('Sa branche n’est pas mergée depuis sa dernière PR, et il a bougé dans les {days} derniers jours.', { days: STALLED_AFTER_DAYS }),
  },
  delivered: {
    key: 'delivered',
    label: t('Livré'),
    color: 'color-mix(in srgb, var(--series-3) 85%, var(--surface))',
    hint: t('Sa branche project/…/main est mergée dans une branche principale, et aucune PR du projet n’a été ouverte depuis.'),
  },
  stalled: {
    key: 'stalled',
    label: t('À l’arrêt'),
    color: 'color-mix(in srgb, var(--series-2) 55%, var(--surface))',
    hint: t('Pas livré, et plus rien depuis {days} jours : ni PR, ni review, ni commentaire, ni merge.', { days: STALLED_AFTER_DAYS }),
  },
}

// The order of the statuses in the table: those that call for attention first.
export const STATUS_ORDER = ['ongoing', 'stalled', 'delivered']

// A project's day, from minutes since the epoch: « 3 mars 2026 ».
/** @type {(minutes: number | null | undefined) => string} */
export const formatDay = (minutes) => (isMissing(minutes) ? '–' : rangeShortFormat.format(dayDate(parisDay(minutes * MINUTE_MS))))

// The same day in short, for the table: « 03/03/26 ».
const shortDayFormat = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' })
/** @type {(minutes: number | null | undefined) => string} */
export const formatShortDay = (minutes) => (isMissing(minutes) ? '–' : shortDayFormat.format(dayDate(parisDay(minutes * MINUTE_MS))))

// A duration on the calendar, from days: in days under two weeks, in weeks under two months, else in months; the weeks
// short in the table.
/**
 * @param {number | null | undefined} days
 * @param {{ short?: boolean }} [options]
 */
export function formatSpan(days, { short = false } = {}) {
  if (isMissing(days)) {
    return '–'
  }
  if (days < 1) {
    return t('moins d’un jour')
  }
  if (days < 14) {
    return plural(Math.round(days), 'jour')
  }
  if (days < 9 * 7) {
    return short ? t('{count} sem.', { count: formatNumber(Math.round(days / 7)) }) : plural(Math.round(days / 7), 'semaine')
  }

  return plural(Math.round(days / MONTH_DAYS), 'mois', 'mois')
}

// The status of a project as a tag: a dot of its color, and its word.
export function statusTag(status) {
  const { label, color, hint } = PROJECT_STATUSES[status]
  const dot = el('span', { className: 'project-status-dot' })
  dot.style.background = color

  return el('span', { className: `project-status is-${status}`, title: hint }, dot, document.createTextNode(label))
}

// Lines added over lines deleted, in the colors of a diff, as in the tables.
export const linesNodes = ({ added, deleted }) => [
  el('span', { className: 'project-lines-added', textContent: `+${formatLines(added)}` }),
  el('span', { className: 'project-lines-deleted', textContent: `−${formatLines(deleted)}` }),
]

/** @type {(row: { merges: { at: number }[] }) => number | null} */
export const lastMergeOf = (row) => row.merges.at(-1)?.at ?? null

// Every figure of a project: those about its life count whatever the period, the others over the period, for the squad
// picked.
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
  repos: { key: 'repos', label: t('Dépôts'), value: (row) => row.repos.length, format: formatNumber, hint: t('Dépôts où le projet a des PR.') },
}
export const projectFigures = (...keys) => keys.map((key) => PROJECT_FIGURES[key])
