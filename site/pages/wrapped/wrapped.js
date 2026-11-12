// The year in review (« Rétrospective », retro.html), a page apart from the dashboard that leads nowhere else: a picker
// of the people of the year still in the team (and the whole team), then their story, slide after slide (slides.js,
// then the thanks of thanks.js for a team), like a story on a social network: a bar per slide, a tap on the right or
// the right arrow for the next one, on the left or the left arrow for the one before, Space to pause, Escape back to
// the picker. It plays on by itself, the next slide coming when the bar of the slide is full (the end of its
// animation): under reduced motion, without animation, it waits for a tap. The address says whose story shows (`for` or
// `team`, model/retro-address.js), never the key of the link. The picker lives in picker.js; the screen without a key,
// in locked.js.

import { formatNumber } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { retroAddress } from '../../model/retro-address.js'
import { $, el } from '../../ui/dom.js'
import { renderPicker } from './picker.js'
import { personSlides, teamSlides } from './slides.js'
import { thanksSlides } from './thanks.js'
import { avatar } from './visuals.js'

/** @typedef {import('./slides.js').Slide} Slide */
/** @typedef {import('../../model/retro-address.js').RetroWho} RetroWho */

// How long a slide shows before the next one, unless paused: the time the bar of the slide takes to fill.
export const SLIDE_MS = 7000
// The sparks rising through a story (wrapped-motion.css).
const SPARKS = 18

// The icons of the buttons, drawn like those of the dashboard: 16 × 16, a stroke.
const ICONS = {
  pause: 'M5.5 3.5v9M10.5 3.5v9',
  play: 'M5 3.2v9.6L12.5 8Z',
  people: 'M6 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1.5 13.5c.4-2.4 2.1-3.8 4.5-3.8s4.1 1.4 4.5 3.8M10.5 2.7a2.4 2.4 0 0 1 0 4.6M12 9.9c1.3.5 2.2 1.7 2.5 3.6',
}

/** @type {{ retro: Retro, who: RetroWho } | null} */
let shown = null
/** @type {{ slides: Slide[], index: number, paused: boolean, root: HTMLElement } | null} */
let story = null

/** @type {(login: string) => string} */
const nameOf = (login) => shown?.retro.names[login] ?? login

const container = () => $('[data-wrapped]')

/** @type {(name: keyof typeof ICONS) => SVGSVGElement} */
function icon(name) {
  const image = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  image.setAttribute('viewBox', '0 0 16 16')
  image.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', ICONS[name])
  image.append(path)

  return image
}

/** @type {(label: string, name: keyof typeof ICONS, onClick: () => void, className: string) => HTMLButtonElement} */
function iconButton(label, name, onClick, className) {
  const button = /** @type {HTMLButtonElement} */ (el('button', { type: 'button', className: `wrapped-icon-button ${className}`, title: label }, icon(name)))
  button.setAttribute('aria-label', label)
  button.addEventListener('click', onClick)

  return button
}

// The story of someone, the team's, or the picker (null); the address follows, without the key.
/** @param {RetroWho} who */
function open(who) {
  if (!shown) {
    return
  }
  shown.who = who
  history.replaceState(null, '', `${location.pathname}${location.search}${retroAddress(who)}`)
  draw()
}

/**
 * The year in review opened, on the story asked by the address, or on the picker when it names nobody of the year.
 * @param {Retro} retro
 * @param {RetroWho} who
 */
export function showRetro(retro, who) {
  shown = { retro, who: null }
  open(storyOf(retro, who) ? who : null)
}

// The figures of a story: a person's, a squad's or the team's, with the people its last slides thank (those of the year
// among the members of a squad, everyone for the team); null for the picker, or someone the year does not know.
/**
 * @param {Retro} retro
 * @param {RetroWho} who
 * @returns {{ person: RetroPerson } | { group: RetroTeam, squad: string | null, thanked: RetroPerson[] } | null}
 */
function storyOf(retro, who) {
  if (who === null) {
    return null
  }
  if (who === 'team') {
    return { group: retro.team, squad: null, thanked: retro.people }
  }
  if ('login' in who) {
    const person = retro.people.find((other) => other.login === who.login)

    return person ? { person } : null
  }
  const squad = retro.squads.find((other) => other.name === who.squad)
  // A year in review published before the squads had their members thanks nobody.
  const members = new Set(squad?.members ?? [])

  return squad ? { group: squad, squad: squad.name, thanked: retro.people.filter((person) => members.has(person.login)) } : null
}

function draw() {
  if (!shown) {
    return
  }
  const { retro, who } = shown
  const found = storyOf(retro, who)
  if (!found) {
    story = null
    renderPicker(container(), retro, nameOf, open)

    return
  }
  const context = { year: retro.year, org: retro.org, nameOf }
  if ('person' in found) {
    renderStory(personSlides(found.person, context), { login: found.person.login }, retro.year)
  } else {
    // The thanks to each person come before the last slide.
    const slides = teamSlides(found.group, context, found.squad)
    slides.splice(-1, 0, ...thanksSlides(found.thanked, nameOf))
    renderStory(slides, found.squad, retro.year)
  }
}

/**
 * The story of a year: the bars of its slides, whose it is, pause and back to the picker, the slide, and the two parts to
 * tap.
 * @param {Slide[]} slides
 * @param {{ login: string } | string | null} whose a person, the name of a squad, or null for the team
 * @param {number} year
 */
function renderStory(slides, whose, year) {
  const progress = el('div', { className: 'wrapped-progress' }, ...slides.map(() => el('span', { className: 'wrapped-segment' }, el('span', { className: 'wrapped-segment-fill' }))))
  const head =
    whose !== null && typeof whose === 'object'
      ? el('span', { className: 'wrapped-whose' }, avatar(whose.login, 28), el('span', { textContent: `${nameOf(whose.login)} · ${year}` }))
      : el('span', { className: 'wrapped-whose' }, el('span', { textContent: `${whose ?? t('L’équipe')} · ${year}` }))
  const pause = iconButton(t('Mettre en pause'), 'pause', () => togglePause(), 'is-pause')
  const back = iconButton(t('Choisir quelqu’un d’autre'), 'people', () => open(null), 'is-back')
  const previous = el('button', { type: 'button', className: 'wrapped-tap is-previous' })
  previous.setAttribute('aria-label', t('Diapositive précédente'))
  previous.addEventListener('click', () => go(-1))
  const next = el('button', { type: 'button', className: 'wrapped-tap is-next' })
  next.setAttribute('aria-label', t('Diapositive suivante'))
  next.addEventListener('click', () => go(1))
  // Read out as each slide comes.
  const stage = el('div', { className: 'wrapped-stage' })
  stage.setAttribute('aria-live', 'polite')
  const root = el('div', { className: 'wrapped-story' }, sparks(), progress, el('div', { className: 'wrapped-head' }, head, pause, back), stage, previous, next)
  root.style.setProperty('--slide-ms', `${SLIDE_MS}ms`)
  container().replaceChildren(root)
  story = { slides, index: 0, paused: false, root }
  show(0)
}

/** @type {(min: number, max: number) => number} */
const between = (min, max) => min + Math.random() * (max - min)

// Pieces of a decoration, each placed and timed at random through custom properties.
/**
 * @param {string} className
 * @param {number} count
 * @param {() => Record<string, string>} place
 */
function scatter(className, count, place) {
  const root = el('div', { className })
  root.setAttribute('aria-hidden', 'true')
  for (let index = 0; index < count; index++) {
    const piece = el('i')
    for (const [name, value] of Object.entries(place())) {
      piece.style.setProperty(name, value)
    }
    root.append(piece)
  }

  return root
}

// The sparks rising through the story, behind what it says.
const sparks = () =>
  scatter('wrapped-sparks', SPARKS, () => ({
    '--x': `${between(2, 98).toFixed(1)}%`,
    '--size': `${between(2, 5).toFixed(1)}px`,
    '--delay': `${between(-12, 0).toFixed(2)}s`,
    '--duration': `${between(8, 15).toFixed(2)}s`,
    '--drift': `${between(-40, 40).toFixed(0)}px`,
  }))

// A figure that counts up to its value, at once under reduced motion. Its size follows its length, so that the longest
// still fits the slide (--chars); then shrinks some more (--fit) when the digits of the font are wider than the styles
// count on (a fallback font, on Linux), measured on its value: never past its slide.
/**
 * @param {HTMLElement} node
 * @param {number} value
 */
function countUp(node, value) {
  node.textContent = formatNumber(value)
  node.style.setProperty('--chars', String(node.textContent.length))
  // Sizes of the layout, which the animation of its entrance does not transform.
  node.style.removeProperty('--fit')
  if (node.clientWidth > 0 && node.scrollWidth > node.clientWidth) {
    node.style.setProperty('--fit', String(Math.floor((node.clientWidth / node.scrollWidth) * 1000) / 1000))
  }
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
  root.style.setProperty('--slide-ms', `${slide.duration ?? SLIDE_MS}ms`)
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

// What the last slide offers: see it again, back home (the picker), share the link of this story (without the key):
// through the sharing of the device where there is one (a phone), else copied.
function finalActions() {
  const again = el('button', { type: 'button', className: 'wrapped-action is-primary', textContent: t('Revoir') })
  again.addEventListener('click', () => show(0))
  const other = el('button', { type: 'button', className: 'wrapped-action', textContent: t('Accueil') })
  other.addEventListener('click', () => open(null))
  const copy = el('button', { type: 'button', className: 'wrapped-action', textContent: t('Partager') })
  copy.addEventListener('click', async () => {
    const shared = { title: document.title, url: location.href }
    if (navigator.canShare?.(shared)) {
      try {
        await navigator.share(shared)

        return
      } catch (error) {
        // Closed without sharing: nothing to say. Refused otherwise: copied instead.
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
      }
    }
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
  button?.replaceChildren(icon(paused ? 'play' : 'pause'))
}

// The keys of the story, a pause when the tab hides, and the story an address pasted in the tab asks for.
export function setupWrapped() {
  document.addEventListener('keydown', (event) => {
    if (!story?.root.isConnected || event.defaultPrevented || event.target instanceof HTMLInputElement) {
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      open(null)
    } else if (event.key === 'ArrowRight') {
      go(1)
    } else if (event.key === 'ArrowLeft') {
      go(-1)
    } else if (event.key === ' ') {
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
