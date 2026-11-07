// Bilan du mois: a month against the one before and the year, on the page and as text to paste.

import { isMissing, median } from '../domain/math.js'
import { monthlyActivity, monthlyLeaders } from '../domain/months.js'
import { parisDay } from '../domain/time.js'
import { dayDate } from '../lib/dates.js'
import { capitalize, dayMonthFormat, formatNumber, monthName } from '../lib/format.js'
import { inContext, t } from '../lib/i18n.js'
import { BADGES, badgeStandings, monthFigures } from '../model/badges.js'
import {
  monthStats,
  REPORT_FORMATS,
  REPORT_GROUPS,
  REPORT_YEAR_MONTHS,
  reportChange,
  reportMonths,
} from '../model/months.js'
import { activities, displayName, firstShown, isCurrent } from '../model/people.js'
import { ROUTES } from '../model/routes.js'
import { state } from '../model/state.js'
import { amountOf, leadersLine } from '../ui/badges.js'
import { $, el } from '../ui/dom.js'
import { personLink, repoLink } from '../ui/links.js'
import { renderList } from '../ui/list.js'

// The busiest repositories of a month, on the report.
const REPORT_TOP_REPOS = 5
// How long « Bilan copié » shows beside the button.
const REPORT_COPIED_MS = 3000

// What the report of the month shown says: its figures by group, against the month before and the median of the last
// whole months, its champions, busiest repositories and arrivals. The page draws it; « Copier le bilan » writes it out.
function reportContent() {
  const months = reportMonths()
  if (!months.includes(state.reportMonth)) {
    state.reportMonth = null
  }
  // The month picked, else the current one, unfinished: its figures so far, without any change. Left on it, the page
  // follows the current month into the next one.
  const month = state.reportMonth ?? months.at(-1)
  const current = month === months.at(-1)
  const previous = months[months.indexOf(month) - 1] ?? null
  // The year a month is set against: the last whole months, whichever month is shown.
  const whole = months.slice(0, -1).slice(-REPORT_YEAR_MONTHS)
  const stats = monthStats(month)
  const before = previous ? monthStats(previous) : null
  const groups = REPORT_GROUPS.map((group) => ({
    label: group.label,
    rows: group.figures.map((figure) => {
      const value = figure.value(stats)
      const earlier = before ? figure.value(before) : null

      return {
        figure,
        format: REPORT_FORMATS[figure.kind],
        value,
        earlier,
        // An unfinished month rests on too few pull requests to compare with a whole one.
        change: current ? null : reportChange(figure, value, earlier),
        yearly: median(whole.map((other) => figure.value(monthStats(other))).filter((other) => !isMissing(other))),
      }
    }),
  }))

  return {
    months,
    month,
    current,
    previous,
    whole,
    groups,
    champions: reportChampions(month, current),
    repos: reportRepositories(stats.period),
    arrivals: reportArrivals(month),
  }
}

export function renderReport() {
  const { months, month, current, previous, whole, groups, champions, repos, arrivals } = reportContent()
  const picker = $('[data-report-month]', HTMLSelectElement)
  picker.replaceChildren(
    ...months.toReversed().map((option) => new Option(option === months.at(-1) ? t('{month}, en cours', { month: capitalize(monthName(option)) }) : capitalize(monthName(option)), option)),
  )
  picker.value = month
  const against = t('la médiane des {count} derniers mois complets', { count: formatNumber(whole.length) })
  $('[data-report-sub]').textContent = current
    ? t('Mois en cours, jusqu’à la dernière synchro : provisoire, trop tôt pour le comparer au mois précédent')
    : previous
      ? t('Comparé à {previous}, et à {against}', { previous: monthName(previous), against })
      : t('Premier mois complet des données synchronisées : comparé à {against} seulement', { against })

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

  $('[data-report-champions]').replaceChildren(
    ...champions.map(({ badge, leader }) =>
      el(
        'li',
        {},
        el('span', { className: 'report-badge' }, el('span', { textContent: badge.icon, ariaHidden: 'true' }), document.createTextNode(badge.name)),
        leadersLine(leader, badge),
      ),
    ),
  )
  const list = (target, pairs, unit) =>
    renderList(
      $(target),
      pairs.map(([repo, count]) => el('li', {}, repoLink(repo), el('span', { className: 'pair-count', textContent: amountOf(count, unit) }))),
      t('Aucun'),
    )
  list('[data-report-repos="code"]', repos.code, REPORT_REPO_UNITS.code)
  list('[data-report-repos="deployments"]', repos.deployments, REPORT_REPO_UNITS.deployments)
  renderList(
    $('[data-report-arrivals]'),
    arrivals.map(({ login, first }) =>
      el('li', {}, personLink(login), el('span', { className: 'pair-count', textContent: t('le {date}', { date: dayMonthFormat.format(dayDate(parisDay(first.at))) }) })),
    ),
    t('Aucune arrivée ce mois-ci'),
  )
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
const REPORT_REPO_UNITS = { code: ['PR de code', 'PR de code'], deployments: ['déploiement', 'déploiements'] }

function reportRepositories(period) {
  const code = new Map()
  for (const person of period.authors) {
    for (const [repo, stats] of Object.entries(person.repos)) {
      code.set(repo, (code.get(repo) ?? 0) + stats.code)
    }
  }
  const top = (pairs) => pairs.filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, REPORT_TOP_REPOS)

  return { code: top([...code]), deployments: top(period.delivery.repositories.map((row) => [row.repo, row.deployments])) }
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

// The report as text to paste in a chat or a meeting: *bold* titles and bullets, as Google Chat and Slack read them;
// a change in green or orange on the page gets a dot of that color. Figures without a value, such as the CI of a month
// GitHub had forgotten the runs of, are left out.
const REPORT_TONE_MARKS = { better: ' 🟢', worse: ' 🟠', neutral: '' }

function reportText({ month, current, previous, groups, champions, repos, arrivals }) {
  const lines = [
    `*${t('Bilan de {month}', { month: monthName(month) })}*`,
    current
      ? t('Mois en cours, jusqu’à la dernière synchro : chiffres provisoires.')
      : previous
        ? t('Évolutions par rapport à {month}.', { month: monthName(previous) })
        : t('Premier mois complet des données synchronisées.'),
  ]
  for (const group of groups) {
    const rows = group.rows.filter((row) => !isMissing(row.value))
    if (rows.length) {
      lines.push(
        '',
        `*${group.label}*`,
        ...rows.map(({ figure, format, value, change }) =>
          `• ${t('{label} : {value}', { label: figure.label, value: format(value) })}${change ? ` (${change.text}${REPORT_TONE_MARKS[change.tone]})` : ''}`,
        ),
      )
    }
  }
  const person = (login) => (isCurrent(login) ? displayName(login) : t('une personne partie'))
  lines.push(
    '',
    `*${t('Champions du mois')}*`,
    ...champions.map(({ badge, leader }) =>
      `• ${badge.icon} ${t('{label} : {value}', {
        label: badge.name,
        // « personne » is nobody here, not the noun of a count: its English has a key of its own.
        value: leader
          ? `${leader.people.map(person).join(', ')} (${amountOf(leader.value, badge.units, badge.format)})`
          : inContext('aucune', 'personne'),
      })}`,
    ),
  )
  const repoLine = (label, pairs) =>
    `• ${t('{label} : {value}', { label, value: pairs.length ? pairs.map(([repo, count]) => `${repo} (${formatNumber(count)})`).join(', ') : t('aucun') })}`
  lines.push(
    '',
    `*${t('Dépôts les plus actifs')}*`,
    repoLine(t('PR de code ouvertes'), repos.code),
    repoLine(t('Déploiements'), repos.deployments),
  )
  if (arrivals.length) {
    lines.push('', t('{label} : {value}', { label: `*${t('Arrivées')}*`, value: arrivals.map(({ login }) => displayName(login)).join(', ') }))
  }
  lines.push('', `${location.origin}${location.pathname}${ROUTES.report.hash}`)

  return lines.join('\n')
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

// Listens to « Copier le bilan » and to the month picker.
export function setupReport() {
  $('[data-report-copy]').addEventListener('click', copyReport)
  $('[data-report-month]').addEventListener('change', (event) => {
    const months = reportMonths()
    const { value } = /** @type {HTMLSelectElement} */ (event.target)
    state.reportMonth = value === months.at(-1) ? null : value
    renderReport()
  })
}
