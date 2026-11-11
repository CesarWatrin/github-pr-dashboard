// The people of the stats: their names, who is still in the team, since when they are around.

import { activityBounds, hasLeft } from '../domain/team.js'
import { DAY_MS } from '../domain/time.js'
import { dateFormat } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { loadedStats, state } from './state.js'

// A person first seen this close to the start of the synced data was already there before it: more than all of it.
const SENIORITY_START_DAYS = 14
const MONTH_MS = (365.25 / 12) * DAY_MS

// Explained in the legend under the cards, with the figures.
export const SENIORITY_LEGEND = {
  label: t('Ancienneté'),
  hint: t(
    'Depuis la première PR de la personne dans l’organisation, même au-delà des données synchronisées, ou sa première review ou son premier commentaire s’ils sont plus anciens. Sans PR, une première activité dans les {days} premiers jours des données compte pour plus que toute leur durée.',
    { days: SENIORITY_START_DAYS },
  ),
}

/** @type {(login: string) => string} */
export const displayName = (login) => state.stats?.people?.[login] ?? login

// Each person's first and last activity in the stats, whatever the period, worked out once per stats.
/** @returns {ActivityBounds} */
export function activities() {
  const stats = loadedStats()
  if (state.activity?.stats !== stats) {
    state.activity = { stats, bounds: activityBounds(stats.pullRequests) }
  }

  return state.activity.bounds
}

// A person without any activity for FORMER_AFTER_DAYS has left the team: no row, card, list or matrix of people shows
// them any more, only the former people of the team page. Their pull requests still count in the totals.
/** @param {string} login */
export function isFormer(login) {
  return hasLeft(activities(), login, Date.parse(loadedStats().generatedAt))
}

/** @type {(login: string) => boolean} */
export const isCurrent = (login) => !isFormer(login)

// A period without the people who left, for a network of reviews: main reviewers are then picked among those still here.
/** @type {(period: Pick<PeriodStats, 'authors' | 'reviewPairs'>) => Pick<PeriodStats, 'authors' | 'reviewPairs'>} */
export const withoutFormer = ({ authors, reviewPairs }) => ({
  authors: authors.filter((person) => isCurrent(person.login)),
  reviewPairs: reviewPairs.filter((pair) => isCurrent(pair.author) && isCurrent(pair.reviewer)),
})

// When a person first showed, whatever the period, in milliseconds: their first pull request in the organization, which
// the sync looks up beyond the window (firstPullRequests), or their first review, comment or merge of the data when
// earlier. Exact (known) unless it comes from the data within its first SENIORITY_START_DAYS: the person may well have
// been there before. Null for someone the stats do not know.
/**
 * @param {string} login
 * @returns {{ at: number, fromPullRequest: boolean, known: boolean } | null}
 */
export function firstShown(login) {
  const activity = activities().get(login)
  if (!activity) {
    return null
  }
  const stats = loadedStats()
  const opened = stats.firstPullRequests?.[login] ?? Infinity
  const at = Math.min(activity.first, opened) * 60_000
  const fromPullRequest = opened <= activity.first

  return {
    at,
    fromPullRequest,
    known: fromPullRequest || at - Date.parse(stats.windowStart) >= SENIORITY_START_DAYS * DAY_MS,
  }
}

// How long a person has been around, whatever the period: since their first pull request in the organization, or their
// first review, comment or merge when earlier; more than the whole years of the synced data when that one is not known.
/**
 * @param {string} login
 * @returns {{ label: string, title: string } | null}
 */
export function seniority(login) {
  const first = firstShown(login)
  if (!first) {
    return null
  }
  const stats = loadedStats()
  const start = Date.parse(stats.windowStart)
  const end = Date.parse(stats.generatedAt)
  if (!first.known) {
    // Years of 365 days, as the window counts them: three, or fewer while the sync reads back the older ones.
    const years = Math.max(1, Math.floor((end - start) / (365 * DAY_MS) + 1e-9))

    return {
      label: years === 1 ? t('plus d’un an') : t('plus de {years} ans', { years }),
      title: t('Première activité dès les premiers jours des données synchronisées'),
    }
  }
  const months = Math.floor((end - first.at) / MONTH_MS)
  const what = first.fromPullRequest ? 'Première PR dans l’organisation le {date}' : 'Première activité le {date}'

  return { label: months < 1 ? t('moins d’un mois') : monthsLabel(months), title: t(what, { date: dateFormat.format(first.at) }) }
}

// « 7 mois », « 1 an et 3 mois », « 2 ans ».
/** @param {number} months */
function monthsLabel(months) {
  if (months < 12) {
    return months > 1 ? t('{months} mois', { months }) : t('1 mois')
  }
  const years = Math.floor(months / 12)
  const rest = months % 12
  const whole = years > 1 ? t('{years} ans', { years }) : t('{years} an', { years })

  return rest > 1 ? t('{years} et {months} mois', { years: whole, months: rest }) : rest === 1 ? t('{years} et 1 mois', { years: whole }) : whole
}

// Of [login, count] pairs, those of the people still in the team.
/** @type {(pair: [login: string, ...rest: unknown[]]) => boolean} */
export const inTeam = ([login]) => isCurrent(login)

// Who the page can be for: the people still in the team, by name.
/** @returns {string[]} */
export function mePeople() {
  return [...activities().keys()]
    .filter(isCurrent)
    .sort((a, b) => displayName(a).localeCompare(displayName(b), 'fr', { sensitivity: 'base' }))
}
