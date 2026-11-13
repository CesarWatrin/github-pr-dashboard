// Bilan du mois: a month of the team, or of one person picked, against the one before and the year; then the team's
// champions, repositories, arrivals and projects, or the person's badges, repositories, review partners and projects
// (report/lists.js); on the page and as text to paste (report/text.js).

import { isMissing, median } from '../domain/math.js'
import { monthlyActivity, monthlyLeaders } from '../domain/months.js'
import { parisDay } from '../domain/time.js'
import { capitalize, formatNumber, monthName } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { BADGES, badgeStandings, monthFigures } from '../model/badges.js'
import {
  monthStats,
  REPORT_FORMATS,
  REPORT_GROUPS,
  REPORT_YEAR_MONTHS,
  reportChange,
  reportMonths,
} from '../model/months.js'
import { activities, displayName, firstShown, isCurrent, mePeople } from '../model/people.js'
import {
  arrivalMonth,
  PERSON_REPORT_GROUPS,
  personBadges,
  personDuos,
  personMonth,
  personRepositories,
  topPairs,
} from '../model/person-report.js'
import { state } from '../model/state.js'
import { $, el } from '../ui/dom.js'
import { renderReportLists } from './report/lists.js'
import { reportText } from './report/text.js'

// How long « Bilan copié » shows beside the button.
const REPORT_COPIED_MS = 3000

// What the report of the month shown says, for the team or the person picked: its figures by group, against the month
// before and the median of the last whole months, then its lists. The page draws it; « Copier le bilan » writes it out.
function reportContent() {
  const months = reportMonths()
  if (!months.includes(state.reportMonth)) {
    state.reportMonth = null
  }
  // Anyone still in the team, as on « Mes PR ».
  const people = mePeople()
  if (!people.includes(state.reportPerson)) {
    state.reportPerson = null
  }
  const person = state.reportPerson
  // The month picked, else the current one, unfinished: its figures so far, without any change. Left on it, the page
  // follows the current month into the next one.
  const month = state.reportMonth ?? months.at(-1)
  const current = month === months.at(-1)
  // A person is set against their own months only, from the first one they show in.
  const since = person ? arrivalMonth(person) : null
  const theirs = (other) => !since || other >= since
  const before = months[months.indexOf(month) - 1] ?? null
  const previous = before && theirs(before) ? before : null
  // The year a month is set against: the last whole months, whichever month is shown.
  const whole = months.slice(0, -1).filter(theirs).slice(-REPORT_YEAR_MONTHS)
  const statsOf = (other) => (person ? personMonth(other, person) : monthStats(other))
  const stats = statsOf(month)
  const earlier = previous ? statsOf(previous) : null
  const year = whole.map(statsOf)
  const groups = (person ? PERSON_REPORT_GROUPS : REPORT_GROUPS).map((group) => ({
    label: group.label,
    rows: group.figures.map((figure) => {
      const value = figure.value(stats)
      const before = earlier ? figure.value(earlier) : null

      return {
        figure,
        format: REPORT_FORMATS[figure.kind],
        value,
        earlier: before,
        // An unfinished month rests on too few pull requests to compare with a whole one.
        change: current ? null : reportChange(figure, value, before),
        yearly: median(year.map((other) => figure.value(other)).filter((other) => !isMissing(other))),
      }
    }),
  }))

  return {
    months,
    people,
    person,
    month,
    current,
    previous,
    whole,
    sub: reportSub({ person, current, previous, whole }),
    groups,
    projects: reportProjects(month, stats.projects.rows),
    ...(person
      ? { badges: personBadges(month, person, current), repos: personRepositories(month, person), duos: personDuos(month, person) }
      : { champions: reportChampions(month, current), repos: reportRepositories(stats.period), arrivals: reportArrivals(month) }),
  }
}

// The projects that started in the month, and those delivered in it, as they started or were delivered.
/**
 * @param {string} month
 * @param {import('../domain/projects.js').ProjectRow[]} rows
 */
function reportProjects(month, rows) {
  /** @param {number | null} at */
  const inMonth = (at) => at !== null && parisDay(at * 60_000).slice(0, 7) === month

  return {
    started: rows.filter((row) => inMonth(row.start)).sort((a, b) => a.start - b.start),
    delivered: rows.filter((row) => row.status === 'delivered' && inMonth(row.deliveredAt)).sort((a, b) => a.deliveredAt - b.deliveredAt),
  }
}

// What the report says under its title, and the text under its own: what the month is set against.
function reportSub({ person, current, previous, whole }) {
  if (current) {
    return t('Mois en cours, jusqu’à la dernière synchro : provisoire, trop tôt pour le comparer au mois précédent')
  }
  const count = formatNumber(whole.length)
  const against = person ? t('la médiane de ses {count} derniers mois complets', { count }) : t('la médiane des {count} derniers mois complets', { count })
  if (previous) {
    return t('Comparé à {previous}, et à {against}', { previous: monthName(previous), against })
  }
  if (!person) {
    return t('Premier mois complet des données synchronisées : comparé à {against} seulement', { against })
  }

  return whole.length
    ? t('Premier mois de la personne dans les données synchronisées : comparé à {against} seulement', { against })
    : t('Premier mois de la personne dans les données synchronisées')
}

export function renderReport() {
  const content = reportContent()
  const { months, people, person, month, previous, sub, groups } = content
  const who = $('[data-report-person]', HTMLSelectElement)
  who.replaceChildren(new Option(t('Toute l’équipe'), ''), ...people.map((login) => new Option(displayName(login), login)))
  who.value = person ?? ''
  const picker = $('[data-report-month]', HTMLSelectElement)
  picker.replaceChildren(
    ...months.toReversed().map((option) => new Option(option === months.at(-1) ? t('{month}, en cours', { month: capitalize(monthName(option)) }) : capitalize(monthName(option)), option)),
  )
  picker.value = month
  $('[data-report-title]').textContent = person ? t('Les chiffres du mois : {name}', { name: displayName(person) }) : t('Les chiffres du mois')
  $('[data-report-sub]').textContent = sub
  $('[data-report-person-note]').hidden = !person

  const head = el(
    'thead',
    {},
    el(
      'tr',
      {},
      el('th', { scope: 'col', className: 'text', textContent: t('Indicateur') }),
      el('th', { scope: 'col', textContent: capitalize(monthName(month)) }),
      el('th', { scope: 'col', textContent: previous ? capitalize(monthName(previous)) : t('Mois précédent') }),
      el('th', { scope: 'col', textContent: t('Évolution') }),
      el('th', { scope: 'col', textContent: t('Médiane sur 12 mois') }),
    ),
  )
  const body = el(
    'tbody',
    {},
    ...groups.flatMap((group) => [
      el('tr', { className: 'report-group' }, el('th', { scope: 'rowgroup', colSpan: 5, className: 'text', textContent: group.label })),
      ...group.rows.map(({ figure, format, value, earlier, change, yearly }) =>
        el(
          'tr',
          {},
          el('th', { scope: 'row', className: 'text', textContent: figure.label }),
          el('td', { className: 'report-value', textContent: format(value) }),
          el('td', { className: isMissing(earlier) ? 'muted' : '', textContent: format(earlier) }),
          el('td', {}, change ? el('span', { className: `report-change is-${change.tone}`, textContent: change.text }) : el('span', { className: 'muted', textContent: '–' })),
          el('td', { textContent: format(yearly) }),
        ),
      ),
    ]),
  )
  $('[data-report-table]').replaceChildren(el('table', { className: 'report-table' }, head, body))
  renderReportLists(content)
}

// The champions of each badge for the month: from the history, or so far for the current month.
function reportChampions(month, current) {
  const { leaders } = badgeStandings()
  const ongoing = current ? { [month]: monthFigures(monthlyActivity(state.stats.pullRequests), month) } : null

  return BADGES.map((badge) => ({
    badge,
    leader: current ? monthlyLeaders(ongoing, badge.key)[0] : leaders.get(badge.key).find((leader) => leader.month === month),
  }))
}

// The busiest repositories of the month, as [repo, count]: by code pull requests opened, and by deployments.
function reportRepositories(period) {
  const code = new Map()
  for (const person of period.authors) {
    for (const [repo, stats] of Object.entries(person.repos)) {
      code.set(repo, (code.get(repo) ?? 0) + stats.code)
    }
  }

  return { code: topPairs([...code]), deployments: topPairs(period.delivery.repositories.map((row) => [row.repo, row.deployments])) }
}

// The people of the team who first showed in the month (firstShown()), those who may have been there before the
// synced data aside.
function reportArrivals(month) {
  return [...activities().keys()]
    .filter(isCurrent)
    .map((login) => ({ login, first: firstShown(login) }))
    .filter(({ first }) => first.known && parisDay(first.at).slice(0, 7) === month)
    .sort((a, b) => a.first.at - b.first.at)
}

/** @type {ReturnType<typeof setTimeout> | undefined} */
let copiedTimer

async function copyReport() {
  const status = $('[data-report-copied]')
  try {
    await navigator.clipboard.writeText(reportText(reportContent()))
    status.textContent = t('Bilan copié')
  } catch {
    status.textContent = t('Copie impossible dans ce navigateur')
  }
  clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => {
    status.textContent = ''
  }, REPORT_COPIED_MS)
}

// Listens to « Copier le bilan », to the person picker and to the month picker.
export function setupReport() {
  $('[data-report-copy]').addEventListener('click', copyReport)
  $('[data-report-person]').addEventListener('change', (event) => {
    state.reportPerson = /** @type {HTMLSelectElement} */ (event.target).value || null
    renderReport()
  })
  $('[data-report-month]').addEventListener('change', (event) => {
    const months = reportMonths()
    const { value } = /** @type {HTMLSelectElement} */ (event.target)
    state.reportMonth = value === months.at(-1) ? null : value
    renderReport()
  })
}
