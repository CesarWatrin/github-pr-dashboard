// The badges: the leaders of each month over the history the sync publishes, and the medals each person holds.

import { monthlyActivity, monthlyLeaders } from '../domain/months.js'
import { parisDay } from '../domain/time.js'
import { formatLines } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { loadedStats, state } from './state.js'

// Badges, like GitHub achievements: the most of something in the whole team over a whole Paris month since the first
// sync (the monthly history it keeps), ties sharing it. Their tier comes from the longest run of months in a row: bronze
// for one, silver for two, gold for three or more. The key is one of the monthly figures of monthlyActivity(), counted
// in units, singular then plural, and shown with format when given.
/**
 * @typedef {{ key: keyof MonthlyFigures, icon: string, name: string, what: string, units: [string, string], format?: (value: number | null | undefined) => string }} Badge
 * @typedef {'gold' | 'silver' | 'bronze'} Tier
 * @typedef {ReturnType<typeof monthlyLeaders>} MonthLeaders
 */

/**
 * A badge a person won: in how many months, and the longest run of them in a row, which gives its tier.
 * @typedef {Badge & { total: number, streak: number, from: string, to: string, tier: Tier }} WonBadge
 */

/**
 * The badges of the whole team, worked out once per stats: the leaders of each badge month by month, those of each person.
 * @typedef {{ stats: Stats, history: MonthlyHistory, leaders: Map<string, MonthLeaders>, byLogin: Map<string, WonBadge[]> }} BadgeStandings
 */

/** @type {Badge[]} */
export const BADGES = [
  { key: 'opened', icon: '🦈', name: t('Requin des PR'), what: t('le plus de PR ouvertes, merges de branches compris'), units: ['PR', 'PR'] },
  { key: 'reviewed', icon: '🔍', name: t('Œil de lynx'), what: t('le plus de PR relues'), units: ['PR relue', 'PR relues'] },
  { key: 'comments', icon: '🪶', name: t('Plume'), what: t('le plus de commentaires de review'), units: ['commentaire', 'commentaires'] },
  { key: 'hotfixes', icon: '🚒', name: t('Pompier'), what: t('le plus de hotfix'), units: ['hotfix', 'hotfix'] },
  {
    key: 'added',
    icon: '🏗️',
    name: t('Bâtisseur'),
    what: t('le plus de lignes ajoutées'),
    units: ['ligne ajoutée', 'lignes ajoutées'],
    format: formatLines,
  },
  {
    key: 'deleted',
    icon: '🧹',
    name: t('Coup de balai'),
    what: t('le plus de lignes supprimées'),
    units: ['ligne supprimée', 'lignes supprimées'],
    format: formatLines,
  },
]
/** @type {Record<Tier, string>} */
export const BADGE_TIERS = { bronze: t('Bronze'), silver: t('Argent'), gold: t('Or') }
// The medals a person's card and dialog show, the best ones: the others gather under a "+N", so that neither grows.
export const SHOWN_BADGES = 3
/** @type {Tier[]} */
export const TIER_ORDER = ['gold', 'silver', 'bronze']
export const BADGES_LEGEND = {
  label: t('Badges'),
  hint: t(
    '{badges}, de toute l’équipe sur un mois complet. Bronze pour un mois, argent pour deux mois d’affilée, or pour trois ou plus. Ils se gagnent depuis la première synchro et restent acquis, quels que soient la période et le filtre.',
    { badges: BADGES.map((badge) => t('{icon} {name} : {what}', { icon: badge.icon, name: badge.name, what: badge.what })).join(' · ') },
  ),
}

// The whole Paris months of the synced data, oldest first: the first one, cut by the start of the data, and the
// current one are left out.
/** @returns {string[]} */
export function badgeMonths() {
  /** @param {string} month */
  const next = (month) => {
    const [year, number] = month.split('-').map(Number)

    return number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, '0')}`
  }
  const stats = loadedStats()
  const current = parisDay(Date.parse(stats.generatedAt)).slice(0, 7)
  const months = []
  for (let month = next(parisDay(Date.parse(stats.windowStart)).slice(0, 7)); month < current; month = next(month)) {
    months.push(month)
  }

  return months
}

// The monthly figures the badges are won over, as { 'YYYY-MM': { login: figures } }: the history the sync keeps since
// its first run, whole months only, so that badges outlast the window. Stats published before it come without one:
// the whole months of the window are then worked out from its pull requests.
/** @returns {MonthlyHistory} */
function badgeHistory() {
  const stats = loadedStats()
  if (stats.monthly) {
    return stats.monthly
  }
  const activity = monthlyActivity(stats.pullRequests)

  return Object.fromEntries(badgeMonths().map((month) => [month, monthFigures(activity, month)]))
}

// Everyone's figures of a month, from monthlyActivity(), as the history keeps them.
/** @type {(activity: Map<string, Map<string, MonthlyFigures>>, month: string) => Record<string, MonthlyFigures>} */
export const monthFigures = (activity, month) =>
  Object.fromEntries(
    [...activity]
      .filter(([, perMonth]) => perMonth.has(month))
      .map(([person, perMonth]) => [person, /** @type {MonthlyFigures} */ (perMonth.get(month))]),
  )

// The rank of a month: months in a row follow each other even across a gap in the history.
/** @param {string} month */
function monthRank(month) {
  const [year, number] = month.split('-').map(Number)

  return year * 12 + number
}

// The badges of the whole team, worked out once per stats over everyone, the people who left included: a month someone
// who left was the top of, nobody else was. For each badge, its leaders month by month; for each person, each badge won:
// the months won, the longest run of them in a row and its tier.
/** @returns {BadgeStandings} */
export function badgeStandings() {
  const stats = loadedStats()
  if (state.badges?.stats !== stats) {
    const history = badgeHistory()
    /** @type {Map<string, MonthLeaders>} */
    const leaders = new Map()
    /** @type {Map<string, WonBadge[]>} */
    const byLogin = new Map()
    for (const badge of BADGES) {
      leaders.set(badge.key, monthlyLeaders(history, badge.key))
      /** @type {Map<string, string[]>} */
      const won = new Map()
      for (const { month, people } of /** @type {MonthLeaders} */ (leaders.get(badge.key))) {
        for (const person of people) {
          won.set(person, [...(won.get(person) ?? []), month])
        }
      }
      for (const [person, wonMonths] of won) {
        // The longest run of months in a row, the latest one on a tie.
        let run = { from: wonMonths[0], to: wonMonths[0], length: 1 }
        let longest = run
        for (const month of wonMonths.slice(1)) {
          run =
            monthRank(month) === monthRank(run.to) + 1
              ? { from: run.from, to: month, length: run.length + 1 }
              : { from: month, to: month, length: 1 }
          if (run.length >= longest.length) {
            longest = run
          }
        }
        byLogin.set(person, [
          ...(byLogin.get(person) ?? []),
          {
            ...badge,
            total: wonMonths.length,
            streak: longest.length,
            from: longest.from,
            to: longest.to,
            tier: longest.length >= 3 ? 'gold' : longest.length === 2 ? 'silver' : 'bronze',
          },
        ])
      }
    }
    state.badges = { stats, history, leaders, byLogin }
  }

  return state.badges
}

/** @type {(login: string) => WonBadge[]} */
export const badgesOf = (login) => badgeStandings().byLogin.get(login) ?? []
