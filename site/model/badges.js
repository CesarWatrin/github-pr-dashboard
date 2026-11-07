// The badges: the leaders of each month over the history the sync publishes, and the medals each person holds.

import { monthlyActivity, monthlyLeaders } from '../domain/months.js'
import { parisDay } from '../domain/time.js'
import { formatLines } from '../lib/format.js'
import { state } from './state.js'

// Badges, like GitHub achievements: the most of something in the whole team over a whole Paris month since the first
// sync (the monthly history it keeps), ties sharing it. Their tier comes from the longest run of months in a row: bronze
// for one, silver for two, gold for three or more. The key is one of the monthly figures of monthlyActivity(), counted
// in units, singular then plural, and shown with format when given.
export const BADGES = [
  { key: 'opened', icon: '🦈', name: 'Requin des PR', what: 'le plus de PR ouvertes, merges de branches compris', units: ['PR', 'PR'] },
  { key: 'reviewed', icon: '🔍', name: 'Œil de lynx', what: 'le plus de PR relues', units: ['PR relue', 'PR relues'] },
  { key: 'comments', icon: '🪶', name: 'Plume', what: 'le plus de commentaires de review', units: ['commentaire', 'commentaires'] },
  { key: 'hotfixes', icon: '🚒', name: 'Pompier', what: 'le plus de hotfix', units: ['hotfix', 'hotfix'] },
  {
    key: 'added',
    icon: '🏗️',
    name: 'Bâtisseur',
    what: 'le plus de lignes ajoutées',
    units: ['ligne ajoutée', 'lignes ajoutées'],
    format: formatLines,
  },
  {
    key: 'deleted',
    icon: '🧹',
    name: 'Coup de balai',
    what: 'le plus de lignes supprimées',
    units: ['ligne supprimée', 'lignes supprimées'],
    format: formatLines,
  },
]
export const BADGE_TIERS = { bronze: 'Bronze', silver: 'Argent', gold: 'Or' }
// The medals a person's card and dialog show, the best ones: the others gather under a "+N", so that neither grows.
export const SHOWN_BADGES = 3
export const TIER_ORDER = ['gold', 'silver', 'bronze']
export const BADGES_LEGEND = {
  label: 'Badges',
  hint: `${BADGES.map((badge) => `${badge.icon} ${badge.name} : ${badge.what}`).join(' · ')}, de toute l’équipe sur un mois complet. Bronze pour un mois, argent pour deux mois d’affilée, or pour trois ou plus. Ils se gagnent depuis la première synchro et restent acquis, quels que soient la période et le filtre.`,
}

// The whole Paris months of the synced data, oldest first: the first one, cut by the start of the data, and the
// current one are left out.
export function badgeMonths() {
  const next = (month) => {
    const [year, number] = month.split('-').map(Number)

    return number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, '0')}`
  }
  const current = parisDay(Date.parse(state.stats.generatedAt)).slice(0, 7)
  const months = []
  for (let month = next(parisDay(Date.parse(state.stats.windowStart)).slice(0, 7)); month < current; month = next(month)) {
    months.push(month)
  }

  return months
}

// The monthly figures the badges are won over, as { 'YYYY-MM': { login: figures } }: the history the sync keeps since
// its first run, whole months only, so that badges outlast the window. Stats published before it come without one:
// the whole months of the window are then worked out from its pull requests.
function badgeHistory() {
  if (state.stats.monthly) {
    return state.stats.monthly
  }
  const activity = monthlyActivity(state.stats.pullRequests)

  return Object.fromEntries(badgeMonths().map((month) => [month, monthFigures(activity, month)]))
}

// Everyone's figures of a month, from monthlyActivity(), as the history keeps them.
export const monthFigures = (activity, month) =>
  Object.fromEntries([...activity].filter(([, perMonth]) => perMonth.has(month)).map(([person, perMonth]) => [person, perMonth.get(month)]))

// The rank of a month: months in a row follow each other even across a gap in the history.
function monthRank(month) {
  const [year, number] = month.split('-').map(Number)

  return year * 12 + number
}

// The badges of the whole team, worked out once per stats over everyone, the people who left included: a month someone
// who left was the top of, nobody else was. For each badge, its leaders month by month; for each person, each badge won:
// the months won, the longest run of them in a row and its tier.
export function badgeStandings() {
  if (state.badges?.stats !== state.stats) {
    const history = badgeHistory()
    const leaders = new Map()
    const byLogin = new Map()
    for (const badge of BADGES) {
      leaders.set(badge.key, monthlyLeaders(history, badge.key))
      const won = new Map()
      for (const { month, people } of leaders.get(badge.key)) {
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
    state.badges = { stats: state.stats, history, leaders, byLogin }
  }

  return state.badges
}

export const badgesOf = (login) => badgeStandings().byLogin.get(login) ?? []
