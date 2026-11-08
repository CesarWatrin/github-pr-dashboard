// The year in review (« Rétrospective »), full screen over the dashboard: a picker of the people of the year still in
// the team (and the whole team), then their story, slide after slide (slides.js), like a story on a social network: a
// bar per slide, a tap on the right or the right arrow for the next one, on the left or the left arrow for the one
// before, Space to pause, Escape back to the picker. It plays on by itself, the next slide coming when the bar of the
// slide is full (the end of its animation): under reduced motion, without animation, it waits for a tap. The address
// says whose year and which (`for` or `team`, `year`): a link leads anyone with the password straight to it.

import { formatNumber } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { displayName } from '../../model/people.js'
import { currentRoute } from '../../model/routes.js'
import { state } from '../../model/state.js'
import { wrappedPeople, wrappedPerson, wrappedTeam, wrappedYear, wrappedYears } from '../../model/wrapped.js'
import { $, el } from '../../ui/dom.js'
import { avatarUrl } from '../../ui/links.js'
import { personSlides, teamSlides } from './slides.js'

/** @typedef {import('./slides.js').Slide} Slide */

// How long a slide shows before the next one, unless paused: the time the bar of the slide takes to fill.
export const SLIDE_MS = 7000

/** @type {{ slides: Slide[], index: number, paused: boolean, root: HTMLElement } | null} */
let story = null
// What the page shows: the picker of a year, or whose story of which year; '' for nothing.
let shownKey = ''

// Back to the dashboard: the next visit opens on the picker.
function close() {
  state.wrappedFor = null
  state.wrappedTeam = false
  location.hash = '#/'
}

// Back to the picker.
function toPicker() {
  state.wrappedFor = null
  state.wrappedTeam = false
  renderWrapped()
}

/** @type {(label: string, onClick: () => void, className?: string) => HTMLButtonElement} */
function iconButton(label, onClick, className = '') {
  const button = /** @type {HTMLButtonElement} */ (el('button', { type: 'button', className: `wrapped-icon-button ${className}`, title: label }))
  button.setAttribute('aria-label', label)
  button.addEventListener('click', onClick)

  return button
}

const closeButton = () => iconButton(t('Fermer la rétrospective'), close, 'is-close')

// Drawn by render() and when the page shows: the picker, or the story picked. A story keeps playing whatever new stats
// come in meanwhile; it starts again only for another person or year.
export function renderWrapped() {
  const container = $('[data-wrapped]')
  const shown = state.stats !== null && currentRoute() === 'wrapped'
  document.documentElement.classList.toggle('is-wrapped', shown)
  if (!shown) {
    story = null
    shownKey = ''
    container.replaceChildren()

    return
  }
  const year = wrappedYear()
  const who = state.wrappedFor ? `person:${state.wrappedFor}` : state.wrappedTeam ? 'team' : null
  const key = who ? `story:${who}:${year}` : `picker:${year}:${state.stats.generatedAt}`
  if (key === shownKey) {
    return
  }
  shownKey = key
  if (!who) {
    story = null
    renderPicker(container, year)

    return
  }
  const slides = state.wrappedFor ? personSlides(wrappedPerson(state.wrappedFor, year)) : teamSlides(wrappedTeam(year))
  renderStory(container, slides, year)
}

// The people of the year, by name, each opening their story; the team first; a field to find oneself, and the years of
// the data when there are several.
/**
 * @param {HTMLElement} container
 * @param {number} year
 */
function renderPicker(container, year) {
  const people = wrappedPeople(year)
  const label = t('Ton nom ou ton identifiant GitHub')
  const search = /** @type {HTMLInputElement} */ (el('input', { type: 'search', className: 'wrapped-search', placeholder: label, autocomplete: 'off', spellcheck: false }))
  search.setAttribute('aria-label', label)
  const list = el(
    'ul',
    { className: 'wrapped-people' },
    ...people.map((login) => {
      const button = el(
        'button',
        { type: 'button', className: 'wrapped-person' },
        el('img', { src: avatarUrl(login, 80), alt: '', width: 40, height: 40, loading: 'lazy' }),
        el(
          'span',
          { className: 'wrapped-person-name' },
          el('strong', { textContent: displayName(login) }),
          // The login under the name, unless it is the name.
          ...(displayName(login) === login ? [] : [el('span', { textContent: `@${login}` })]),
        ),
      )
      button.addEventListener('click', () => {
        state.wrappedFor = login
        state.wrappedTeam = false
        renderWrapped()
      })
      const item = el('li', {}, button)
      item.dataset.search = `${displayName(login)} ${login}`.toLowerCase()

      return item
    }),
  )
  const none = el('p', { className: 'wrapped-none', textContent: t('Personne de ce nom cette année.'), hidden: true })
  search.addEventListener('input', () => {
    const query = search.value.trim().toLowerCase()
    let shown = 0
    for (const item of /** @type {HTMLElement[]} */ ([...list.children])) {
      item.hidden = query !== '' && !String(item.dataset.search).includes(query)
      shown += item.hidden ? 0 : 1
    }
    none.hidden = shown > 0
  })
  const team = el('button', { type: 'button', className: 'wrapped-team' }, el('strong', { textContent: t('Toute l’équipe') }), el('span', { textContent: t('L’année de tout le monde, ensemble') }))
  team.addEventListener('click', () => {
    state.wrappedFor = null
    state.wrappedTeam = true
    renderWrapped()
  })
  const years = wrappedYears()
  /** @type {HTMLElement[]} */
  const yearPicker = []
  if (years.length > 1) {
    const select = /** @type {HTMLSelectElement} */ (el('select', { className: 'wrapped-year' }, ...years.map((option) => new Option(String(option), String(option)))))
    select.setAttribute('aria-label', t('Année'))
    select.value = String(year)
    select.addEventListener('change', () => {
      state.wrappedYear = Number(select.value) === years[0] ? null : Number(select.value)
      renderWrapped()
    })
    yearPicker.push(select)
  }
  container.replaceChildren(
    el(
      'div',
      { className: 'wrapped-picker' },
      el('div', { className: 'wrapped-picker-head' }, closeButton()),
      el('p', { className: 'wrapped-eyebrow', textContent: t('Rétrospective') }),
      el('h2', { className: 'wrapped-picker-title', textContent: t('Ton année {year}', { year }) }),
      el('p', { className: 'wrapped-picker-sub', textContent: t('Choisis ton nom GitHub : ton année en PR, en reviews et en projets, à revoir et à partager.') }),
      el('div', { className: 'wrapped-picker-controls' }, search, ...yearPicker),
      team,
      list,
      none,
    ),
  )
}

// The story of a year: the bars of its slides, whose it is, pause and close, the slide, and the two halves to tap.
/**
 * @param {HTMLElement} container
 * @param {Slide[]} slides
 * @param {number} year
 */
function renderStory(container, slides, year) {
  const progress = el('div', { className: 'wrapped-progress' }, ...slides.map(() => el('span', { className: 'wrapped-segment' }, el('span', { className: 'wrapped-segment-fill' }))))
  const whose = state.wrappedFor
    ? el('span', { className: 'wrapped-whose' }, el('img', { src: avatarUrl(state.wrappedFor, 56), alt: '', width: 28, height: 28 }), el('span', { textContent: `${displayName(state.wrappedFor)} · ${year}` }))
    : el('span', { className: 'wrapped-whose' }, el('span', { textContent: `${t('L’équipe')} · ${year}` }))
  const pause = iconButton(t('Mettre en pause'), togglePause, 'is-pause')
  const previous = el('button', { type: 'button', className: 'wrapped-tap is-previous' })
  previous.setAttribute('aria-label', t('Diapositive précédente'))
  previous.addEventListener('click', () => go(-1))
  const next = el('button', { type: 'button', className: 'wrapped-tap is-next' })
  next.setAttribute('aria-label', t('Diapositive suivante'))
  next.addEventListener('click', () => go(1))
  // Read out as each slide comes.
  const stage = el('div', { className: 'wrapped-stage' })
  stage.setAttribute('aria-live', 'polite')
  const root = el(
    'div',
    { className: 'wrapped-story' },
    progress,
    el('div', { className: 'wrapped-head' }, whose, pause, closeButton()),
    stage,
    previous,
    next,
  )
  root.style.setProperty('--slide-ms', `${SLIDE_MS}ms`)
  container.replaceChildren(root)
  story = { slides, index: 0, paused: false, root }
  show(0)
}

// A figure that counts up to its value, at once under reduced motion.
/**
 * @param {HTMLElement} node
 * @param {number} value
 */
function countUp(node, value) {
  node.textContent = formatNumber(value)
  if (value <= 0 || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return
  }
  const start = performance.now()
  /** @param {number} now */
  const step = (now) => {
    const done = Math.min(1, (now - start) / 900)
    node.textContent = formatNumber(Math.round(value * (1 - (1 - done) ** 3)))
    if (done < 1 && node.isConnected) {
      requestAnimationFrame(step)
    }
  }
  requestAnimationFrame(step)
}

// The slide of an index: the bars before it full, its own filling, then the next slide.
/** @param {number} index */
function show(index) {
  if (!story) {
    return
  }
  story.index = index
  const slide = story.slides[index]
  const { root } = story
  root.dataset.tone = String(slide.tone)
  root.classList.toggle('is-final', Boolean(slide.final))
  for (const [at, segment] of [...root.querySelectorAll('.wrapped-segment')].entries()) {
    segment.classList.toggle('is-done', at < index)
    segment.classList.toggle('is-current', at === index)
    // A fresh bar, so that its animation starts again.
    const fill = el('span', { className: 'wrapped-segment-fill' })
    if (at === index) {
      fill.addEventListener('animationend', () => {
        if (story?.root === root && story.index === index && !story.paused) {
          go(1)
        }
      })
    }
    segment.replaceChildren(fill)
  }
  const figure = el('p', { className: 'wrapped-figure' })
  const content = el(
    'div',
    { className: 'wrapped-slide' },
    el('p', { className: 'wrapped-eyebrow', textContent: slide.eyebrow }),
    ...(slide.figure !== undefined ? [figure, el('p', { className: 'wrapped-unit', textContent: slide.unit ?? '' })] : []),
    ...(slide.title ? [el('h2', { className: 'wrapped-title', textContent: slide.title })] : []),
    ...(slide.detail ? [el('p', { className: 'wrapped-detail', textContent: slide.detail })] : []),
    ...(slide.visual ? [el('div', { className: 'wrapped-visual' }, slide.visual)] : []),
    ...(slide.final ? [finalActions()] : []),
  )
  root.querySelector('.wrapped-stage')?.replaceChildren(content)
  if (slide.figure !== undefined) {
    countUp(figure, slide.figure)
  }
}

// What the last slide offers: see it again, someone else, the link of this story.
function finalActions() {
  const again = el('button', { type: 'button', className: 'wrapped-action is-primary', textContent: t('Revoir') })
  again.addEventListener('click', () => show(0))
  const other = el('button', { type: 'button', className: 'wrapped-action', textContent: t('Quelqu’un d’autre') })
  other.addEventListener('click', toPicker)
  const copy = el('button', { type: 'button', className: 'wrapped-action', textContent: t('Copier le lien') })
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href)
      copy.textContent = t('Lien copié')
    } catch {
      copy.textContent = t('Copie impossible')
    }
  })

  return el('div', { className: 'wrapped-actions' }, again, other, copy)
}

// To the next slide (1) or the one before (-1); the last one stays.
/** @param {number} step */
function go(step) {
  if (!story) {
    return
  }
  const index = Math.min(story.slides.length - 1, Math.max(0, story.index + step))
  if (index !== story.index || step < 0) {
    show(index)
  }
}

/** @param {boolean} [paused] */
function togglePause(paused = !story?.paused) {
  if (!story) {
    return
  }
  story.paused = paused
  story.root.classList.toggle('is-paused', paused)
  const button = story.root.querySelector('.is-pause')
  const label = paused ? t('Reprendre') : t('Mettre en pause')
  button?.setAttribute('aria-label', label)
  button?.setAttribute('title', label)
}

// The keys of the story, and a pause when the tab hides.
export function setupWrapped() {
  document.addEventListener('keydown', (event) => {
    if (currentRoute() !== 'wrapped' || event.defaultPrevented || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      if (story) {
        toPicker()
      } else {
        close()
      }
    } else if (story && event.key === 'ArrowRight') {
      go(1)
    } else if (story && event.key === 'ArrowLeft') {
      go(-1)
    } else if (story && event.key === ' ') {
      event.preventDefault()
      togglePause()
    }
  })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      togglePause(true)
    }
  })
}
