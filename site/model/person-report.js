// The monthly report of one person (Bilan du mois, someone picked): their own pull requests, their reviews of anyone's,
// the projects and AC they worked on, their code pull requests month by month by kind of work, their figures of the
// badges and who they reviewed with. Each month is set against their own months, from the first one they show in: never
// against other people.

import { round } from '../domain/math.js'
import { monthlyActivity, monthlyLeaders } from '../domain/months.js'
import { parisDay } from '../domain/time.js'
import { sumOf } from '../lib/math.js'
import { t } from '../lib/i18n.js'
import { BADGES, badgeStandings, monthFigures } from './badges.js'
import { personEffortSeries } from './effort.js'
import { monthRange, monthStats, REPORT_FIGURES, REPORT_YEAR_MONTHS, reportMonths } from './months.js'
import { firstShown, isCurrent } from './people.js'
import { loadedStats } from './state.js'

/**
 * @typedef {import('./months.js').ReportFigure} ReportFigure
 * @typedef {{ prs: number, comments: number, approved: number, changesRequested: number, merges: number }} ReviewTotals
 * @typedef {MonthStats & { reviews: ReviewTotals }} PersonMonthStats
 * @typedef {Omit<ReportFigure, 'value'> & { value: (month: PersonMonthStats) => number | null | undefined }} PersonFigure
 * @typedef {[key: string, count: number]} CountPair
 */

// The repositories and people a list of the report names at most.
export const REPORT_TOP = 5

/** @type {(labels: string[]) => ReportFigure[]} */
const reported = (labels) => labels.map((label) => /** @type {ReportFigure} */ (REPORT_FIGURES.get(label)))

// The figures of a person's report, in groups: those of the team's report over their own pull requests, then their
// reviews.
/** @type {{ label: string, figures: PersonFigure[] }[]} */
export const PERSON_REPORT_GROUPS = [
  {
    label: t('Ses PR'),
    figures: reported([
      'PR ouvertes',
      'PR de code mergées',
      'Lignes ajoutées',
      'Lignes supprimées',
      'Délai médian de merge',
      'Délai médian jusqu’en prod',
      'Part de hotfix',
      'Attente médiane de la 1re review',
      'Mergées sans review',
      'PR mergées avec un check rouge',
    ]),
  },
  {
    label: t('Ses reviews'),
    figures: [
      { label: t('PR relues'), value: ({ reviews }) => reviews.prs, kind: 'count' },
      { label: t('Commentaires laissés'), value: ({ reviews }) => reviews.comments, kind: 'count' },
      { label: t('Commentaires par PR relue'), value: ({ reviews }) => (reviews.prs ? round(reviews.comments / reviews.prs, 2) : null), kind: 'decimal' },
      { label: t('Approbations'), value: ({ reviews }) => reviews.approved, kind: 'count' },
      { label: t('Changements demandés'), value: ({ reviews }) => reviews.changesRequested, kind: 'count' },
      { label: t('Merges effectués'), value: ({ reviews }) => reviews.merges, kind: 'count' },
    ],
  },
  { label: t('Projets'), figures: reported(['Projets actifs', 'Projets démarrés', 'Projets livrés', 'PR de code sur des projets']) },
  {
    label: t('Améliorations continues'),
    figures: reported(['AC démarrées', 'AC livrées', 'Délai médian des AC jusqu’au merge', 'PR de code en AC']),
  },
]

// What a person reviewed in a month, every repository: their row of the reviewers of the whole team.
/**
 * @param {string} month
 * @param {string} login
 */
function reviewerOf(month, login) {
  return monthStats(month).period.reviewers.find((person) => person.login === login)
}

// A person's stats of a month: those of the pull requests they opened (monthStats()), and their reviews.
/**
 * @param {string} month
 * @param {string} login
 * @returns {PersonMonthStats}
 */
export function personMonth(month, login) {
  const parts = Object.values(reviewerOf(month, login)?.repos ?? {})

  return {
    ...monthStats(month, login),
    reviews: {
      prs: sumOf(parts, 'prs'),
      comments: sumOf(parts, 'comments'),
      approved: sumOf(parts, 'approved'),
      changesRequested: sumOf(parts, 'changesRequested'),
      merges: sumOf(parts, 'merges'),
    },
  }
}

// The first month a person shows in, when known (firstShown()): the months before it say nothing of them. Null for
// someone already there when the synced data starts.
/** @type {(login: string) => string | null} */
export function arrivalMonth(login) {
  const first = firstShown(login)

  return first?.known ? parisDay(first.at).slice(0, 7) : null
}

// A person's code pull requests month by month, each in one kind of work as « Où va l’effort » counts them (projects,
// TMA, AC, the rest): the month shown and the REPORT_YEAR_MONTHS before it, from the first one they show in; the current
// month so far, partial.
/**
 * @param {string} month
 * @param {string} login
 */
export function personEffortMonths(month, login) {
  const months = reportMonths()
  const since = arrivalMonth(login)
  const earliest = months[Math.max(0, months.indexOf(month) - REPORT_YEAR_MONTHS)]
  const first = since && since > earliest ? (since < month ? since : month) : earliest

  return personEffortSeries(login, { start: monthRange(first).start, end: monthRange(month).end, bucket: 'month' })
}

// The largest counts first, then by key; REPORT_TOP of them.
/** @type {(pairs: CountPair[]) => CountPair[]} */
export const topPairs = (pairs) =>
  pairs
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, REPORT_TOP)

// The busiest repositories of a person over a month: by code pull requests opened, and by pull requests reviewed.
/**
 * @param {string} month
 * @param {string} login
 * @returns {{ code: CountPair[], reviews: CountPair[] }}
 */
export function personRepositories(month, login) {
  const own = monthStats(month, login).period.authors.find((person) => person.login === login)

  return {
    code: topPairs(Object.entries(own?.repos ?? {}).map(([repo, stats]) => [repo, stats.code])),
    reviews: topPairs(Object.entries(reviewerOf(month, login)?.repos ?? {}).map(([repo, stats]) => [repo, stats.prs])),
  }
}

// Who reviewed the code pull requests a person opened over a month, and whose they reviewed, each distinct reviewer
// counting once a pull request, as the review networks do (reviewPairs); the people still in the team only.
/**
 * @param {string} month
 * @param {string} login
 * @returns {{ reviewedBy: CountPair[], reviewed: CountPair[] }}
 */
export function personDuos(month, login) {
  const { reviewPairs } = monthStats(month).period
  /** @type {(repos: Record<string, number>) => number} */
  const count = (repos) => Object.values(repos).reduce((total, value) => total + value, 0)
  /** @type {(pairs: CountPair[]) => CountPair[]} */
  const top = (pairs) => topPairs(pairs.filter(([other]) => isCurrent(other)))

  return {
    reviewedBy: top(reviewPairs.filter((pair) => pair.author === login).map((pair) => [pair.reviewer, count(pair.repos)])),
    reviewed: top(reviewPairs.filter((pair) => pair.reviewer === login).map((pair) => [pair.author, count(pair.repos)])),
  }
}

// A person's figure of each badge over a month, and whether they led the team on it, ties sharing: from the history of
// the badges, or so far for the current month.
/**
 * @param {string} month
 * @param {string} login
 * @param {boolean} current
 */
export function personBadges(month, login, current) {
  const { history, leaders } = badgeStandings()
  const figures = current ? monthFigures(monthlyActivity(loadedStats().pullRequests), month) : (history[month] ?? {})

  return BADGES.map((badge) => {
    const leader = current
      ? monthlyLeaders({ [month]: figures }, badge.key)[0]
      : leaders.get(badge.key)?.find((one) => one.month === month)

    return { badge, value: figures[login]?.[badge.key] ?? 0, leads: leader?.people.includes(login) ?? false }
  })
}
