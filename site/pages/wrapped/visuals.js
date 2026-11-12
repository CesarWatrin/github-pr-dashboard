// What the slides of the year in review show besides their figures (slides.js): the months as bars, short lists, the
// records of the year, the summary of the last slide, faces, and the words of times, days and statuses.

import { formatNumber, monthName, monthShortFormat, plural } from '../../lib/format.js'
import { LOCALE, t } from '../../lib/i18n.js'
import { el } from '../../ui/dom.js'
import { avatarUrl, githubUrl } from '../../ui/github.js'

// A pull request opened from this time, or before the day starts (5, see domain/wrapped/fun-facts.js), is a late one.
const LATE_FROM = 21 * 60
const DAY_STARTS_AT = 5 * 60

const weekdayFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', timeZone: 'UTC' })
// A day of the week, Monday 0: « mardi ».
/** @type {(day: number) => string} */
export const weekdayName = (day) => weekdayFormat.format(new Date(Date.UTC(2024, 0, 1 + day)))
// A month without its year: « mars ».
/** @type {(month: string) => string} */
export const monthOnly = (month) => new Intl.DateTimeFormat(LOCALE, { month: 'long', timeZone: 'UTC' }).format(new Date(`${month}-15T12:00:00Z`))
// A time of day, minutes since midnight: « 23 h 41 ».
/** @type {(minutes: number) => string} */
export const timeOfDay = (minutes) => t('{hours} h {minutes}', { hours: Math.floor(minutes / 60), minutes: String(minutes % 60).padStart(2, '0') })
// A time on the calendar, in minutes, the way one tells it: « 4 min », « 3 h », « 12 jours ».
/** @type {(minutes: number) => string} */
export function calendarTime(minutes) {
  if (minutes < 1) {
    return t('moins d’une minute')
  }
  if (minutes < 60) {
    return t('{count} min', { count: formatNumber(minutes) })
  }
  if (minutes < 48 * 60) {
    return plural(Math.round(minutes / 60), 'heure')
  }

  return plural(Math.round(minutes / (24 * 60)), 'jour')
}
// The words of a project's status, when it was not delivered within the year.
/** @type {Record<RetroProject['status'], string>} */
const STATUS_WORDS = { ongoing: t('en cours'), stalled: t('en pause'), abandoned: t('abandonné'), delivered: t('livré') }

// The avatar of a person, at twice its size for sharp screens; an empty circle when GitHub does not serve it, never the
// icon of a broken image.
/** @type {(login: string, size: number, className?: string) => HTMLImageElement} */
export function avatar(login, size, className = '') {
  const image = /** @type {HTMLImageElement} */ (el('img', { className, src: avatarUrl(login, size * 2), alt: '', width: size, height: size, loading: 'lazy' }))
  image.addEventListener('error', () => {
    image.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
  }, { once: true })

  return image
}

/** @type {(login: string, size: number) => HTMLElement} */
export const face = (login, size) => avatar(login, size, 'wrapped-face')

// The review partners of a person: who reviewed the most of their pull requests, and whose they reviewed the most; a
// single card when it is the same person both ways.
/** @type {(year: RetroPerson, nameOf: (login: string) => string) => HTMLElement} */
export function duo({ reviewedBy, reviewedMost }, nameOf) {
  /** @type {Map<string, string[]>} */
  const lines = new Map()
  if (reviewedBy) {
    lines.set(reviewedBy.login, [t('a relu {count} de tes PR', { count: formatNumber(reviewedBy.prs) })])
  }
  if (reviewedMost) {
    lines.set(reviewedMost.login, [...(lines.get(reviewedMost.login) ?? []), t('tu as relu {count} de ses PR', { count: formatNumber(reviewedMost.prs) })])
  }

  return el(
    'div',
    { className: 'wrapped-duo' },
    ...[...lines].map(([login, texts]) =>
      el('div', { className: 'wrapped-duo-person' }, face(login, 72), el('strong', { textContent: nameOf(login) }), ...texts.map((text) => el('span', { textContent: text }))),
    ),
  )
}

// The months of the year as bars, the busiest one lit.
/** @type {(months: { month: string, code: number }[], busiest: string | null) => HTMLElement} */
export function monthBars(months, busiest) {
  const most = Math.max(1, ...months.map((month) => month.code))
  const bars = el('div', { className: 'wrapped-bars' })
  bars.setAttribute('role', 'img')
  bars.setAttribute('aria-label', months.map((month) => `${monthName(month.month)} : ${formatNumber(month.code)}`).join(', '))
  for (const [index, month] of months.entries()) {
    const bar = el('span', { className: `wrapped-bar${month.month === busiest ? ' is-busiest' : ''}` }, el('span', { className: 'wrapped-bar-label', textContent: monthShortFormat.format(new Date(`${month.month}-15T12:00:00Z`)).charAt(0).toUpperCase() }))
    bar.style.setProperty('--height', `${Math.max(4, Math.round((month.code / most) * 100))}%`)
    // They grow one after the other.
    bar.style.setProperty('--index', String(index))
    bars.append(bar)
  }

  return bars
}

// A short list: each item a name and what it says.
/** @type {(items: [string, string][]) => HTMLElement} */
export const shortList = (items) =>
  el('ul', { className: 'wrapped-list' }, ...items.map(([name, detail]) => el('li', {}, el('span', { className: 'wrapped-list-name', textContent: name }), el('span', { className: 'wrapped-list-detail', textContent: detail }))))

// Projects, their status in words.
/** @type {(projects: RetroProject[]) => HTMLElement} */
export const projectList = (projects) => shortList(projects.map((project) => [project.name, project.delivered ? t('livré cette année') : STATUS_WORDS[project.status]]))

// The busiest repositories after the first one.
/** @type {(repos: [string, number][]) => HTMLElement | undefined} */
export const moreRepos = (repos) => (repos.length > 1 ? shortList(repos.slice(1).map(([repo, count]) => [repo, plural(count, 'PR', 'PR')])) : undefined)

// The figures of the year side by side, on the last slide.
/** @type {(figures: [string, number][]) => HTMLElement} */
export const summary = (figures) =>
  el(
    'dl',
    { className: 'wrapped-summary' },
    ...figures.map(([label, value]) => el('div', {}, el('dt', { textContent: label }), el('dd', { textContent: formatNumber(value) }))),
  )

// The records of the year, a card each: the smallest pull request merged, the quickest merge, the most patient one, the
// most discussed; those without anything to say left out.
/** @type {(facts: RetroFunFacts) => [string, string, string][]} */
export const recordCards = (facts) =>
  /** @type {[string, string, string][]} */ (
    [
      facts.smallest !== null && ['🐜', t('La plus petite'), plural(facts.smallest, 'ligne')],
      facts.fastest !== null && ['⚡', t('Merge éclair'), t('mergée en {time}', { time: calendarTime(facts.fastest) })],
      facts.slowest !== null && facts.slowest >= 24 * 60 && ['🐢', t('La plus patiente'), t('{time} avant son merge', { time: calendarTime(facts.slowest) })],
      facts.discussed !== null && ['💬', t('La plus discutée'), plural(facts.discussed, 'commentaire')],
    ].filter(Boolean)
  )

/** @type {(cards: [string, string, string][]) => HTMLElement} */
export const records = (cards) =>
  el(
    'ul',
    { className: 'wrapped-records' },
    ...cards.map(([icon, name, value]) =>
      el('li', {}, el('span', { className: 'wrapped-record-icon', textContent: icon }), el('span', { className: 'wrapped-record-name', textContent: name }), el('strong', { textContent: value })),
    ),
  )

// Late or early: the latest time a pull request was opened, the day starting at 5, and the earliest.
/** @type {(minutes: number) => boolean} */
export const isLate = (minutes) => minutes >= LATE_FROM || minutes < DAY_STARTS_AT

// The link of the biggest pull request, on its slide.
/**
 * @param {string} org
 * @param {NonNullable<RetroPerson['biggest']>} biggest
 */
export const biggestLink = (org, biggest) =>
  el('a', {
    className: 'wrapped-link',
    href: githubUrl(`${org}/${encodeURIComponent(biggest.repo)}/pull/${biggest.number}`),
    target: '_blank',
    rel: 'noopener',
    textContent: t('{repo} #{number} sur GitHub', { repo: biggest.repo, number: biggest.number }),
  })

