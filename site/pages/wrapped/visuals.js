// What the slides of the year in review show besides their figures (slides.js): the months as bars, short lists, the
// records of the year, the summary of the last slide, faces, and the words of times, days and statuses.

import { formatNumber, monthName, monthShortFormat, noun, plural } from '../../lib/format.js'
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

// The size of the faces at the back of a group photo, smaller the more people stand there so that they fit the slide:
// past `from` people, `size` pixels. Heads stand in front, larger.
const PHOTO_SIZES = [
  { from: 36, size: 40 },
  { from: 12, size: 48 },
  { from: 0, size: 60 },
]
const LEAD_SCALE = 1.4

// The people of a team or a squad on its first slide, as on a group photo: everyone in rows at the back, overlapping,
// and the heads of squads in front, larger and ringed with the light of the slide.
/** @type {(people: string[], leads: string[], nameOf: (login: string) => string) => HTMLElement | undefined} */
export function groupPhoto(people, leads, nameOf) {
  const front = [...new Set(leads)]
  const back = people.filter((login) => !front.includes(login))
  if (!front.length && !back.length) {
    return undefined
  }
  const size = (PHOTO_SIZES.find(({ from }) => back.length > from) ?? PHOTO_SIZES[PHOTO_SIZES.length - 1]).size
  const leadSize = Math.round(size * LEAD_SCALE)
  /** @type {(logins: string[], rowSize: number, className: string, offset: number) => HTMLElement} */
  const row = (logins, rowSize, className, offset) => {
    const faces = el('div', { className })
    faces.style.setProperty('--face', `${rowSize}px`)
    for (const [index, login] of logins.entries()) {
      const image = avatar(login, rowSize)
      // They step in one after the other, the heads last.
      image.style.setProperty('--index', String(offset + index))
      faces.append(image)
    }

    return faces
  }
  const photo = el(
    'div',
    { className: 'wrapped-photo' },
    ...(back.length ? [row(back, size, 'wrapped-photo-row', 0)] : []),
    ...(front.length ? [row(front, leadSize, 'wrapped-photo-row is-front', back.length)] : []),
  )
  photo.setAttribute('role', 'img')
  photo.setAttribute('aria-label', [...front, ...back].map(nameOf).join(', '))

  return photo
}

// The review partners of a person: who reviewed the most of their pull requests, and whose they reviewed the most, a
// card each with their face, their name and how many, large. The same person both ways makes a pair, which the slide
// names: the person's face and their partner's side by side, then a card for each way.
/** @type {(year: RetroPerson, nameOf: (login: string) => string) => HTMLElement} */
export function duo({ login, reviewedBy, reviewedMost }, nameOf) {
  /** @type {(prs: number, words: string) => HTMLElement[]} */
  const count = (prs, words) => [el('span', { className: 'wrapped-duo-figure', textContent: formatNumber(prs) }), el('span', { className: 'wrapped-duo-words', textContent: words })]
  const ways = [
    reviewedBy && { ...reviewedBy, words: noun(reviewedBy.prs, 'de tes PR relue', 'de tes PR relues') },
    reviewedMost && { ...reviewedMost, words: noun(reviewedMost.prs, 'de ses PR relue par toi', 'de ses PR relues par toi') },
  ].filter((way) => way !== null)
  if (reviewedBy && reviewedBy.login === reviewedMost?.login) {
    const faces = el('div', { className: 'wrapped-duo-faces' }, face(login, 88), face(reviewedBy.login, 88))

    return el('div', { className: 'wrapped-duo is-pair' }, faces, ...ways.map((way) => el('div', { className: 'wrapped-duo-card' }, ...count(way.prs, way.words))))
  }

  return el(
    'div',
    { className: 'wrapped-duo' },
    ...ways.map((way) =>
      el('div', { className: 'wrapped-duo-card' }, face(way.login, 64), el('strong', { className: 'wrapped-duo-name', textContent: nameOf(way.login) }), ...count(way.prs, way.words)),
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

