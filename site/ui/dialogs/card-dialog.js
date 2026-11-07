// The dialog of a card (a person, a repository, a squad): it leans towards the pointer, and its figures stand against
// the median of their peers.

import { isMissing, median } from '../../domain/math.js'
import { formatNumber } from '../../lib/format.js'
import { $, el, svg } from '../dom.js'
import { personLink, repoLink } from '../links.js'
import { reducedMotion } from '../motion.js'

// How far the open card leans towards the pointer, at its edges.
const PERSON_TILT_DEG = 4

// Figures as a list of terms: each definition has a label, a value read from the source, an optional format and hint.
// Given the sources of peers, each figure also shows their median.
export function statList(definitions, source, peers = null) {
  return el(
    'dl',
    { className: 'person-stats' },
    ...definitions.map((stat) => {
      const read = (item) => (stat.value ? stat.value(item) : item[stat.key])
      const format = stat.format ?? formatNumber

      return el(
        'div',
        {},
        el('dt', { textContent: stat.label, title: stat.hint ?? '' }),
        el('dd', { textContent: format(read(source)) }),
        ...(peers ? [peerMedian(peers.map(read).filter((value) => !isMissing(value)), format)] : []),
      )
    }),
  )
}

// The median of the peers, under a figure. A median of counts stays a whole number.
function peerMedian(values, format) {
  const middle = median(values)
  const shown = !isMissing(middle) && values.every(Number.isInteger) ? Math.round(middle) : middle

  return el('span', { className: 'person-stats-peer', textContent: `méd. ${format(shown)}` })
}

// The busiest people or repositories of a person or a repository, each with its count of pull requests.
export function topList(title, items, withAvatar) {
  const list = items.length
    ? el(
        'ul',
        { className: 'person-dialog-list' },
        ...items.map(([key, prs]) =>
          el(
            'li',
            {},
            // A person or a repository opens its own dialog in place of this one.
            withAvatar ? personLink(key) : repoLink(key, 'repo-link person-dialog-list-name'),
            el('span', { className: 'pair-count', textContent: `${formatNumber(prs)} PR` }),
          ),
        ),
      )
    : el('p', { className: 'muted', textContent: '–' })

  return el('div', {}, el('p', { className: 'person-dialog-list-title', textContent: title }), list)
}

// The dialog of a person or a repository shows its card, in place of the one shown if any. Closing gives the focus back
// to what opened the first one, even where a click does not focus a button.
// The head of the card, its first child, stays in place with the close button; the rest goes in a body that scrolls
// when the window is too short for the whole card (fitCardDialog()).
export function showCardDialog([head, ...children], opener) {
  const close = el(
    'button',
    { type: 'button', className: 'icon-button person-dialog-close', title: 'Fermer' },
    svg('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true' }),
  )
  close.firstChild.append(svg('path', { d: 'M4 4l8 8M12 4l-8 8' }))
  close.setAttribute('aria-label', 'Fermer')
  close.addEventListener('click', () => $('[data-person-dialog]').close())
  const body = el('div', { className: 'person-dialog-body' }, ...children)
  $('[data-person-dialog-card]').replaceChildren(close, head, body)
  cardDialogObserver.disconnect()
  for (const node of [body, ...body.children]) {
    cardDialogObserver.observe(node)
  }
  resetPersonTilt()
  const dialog = $('[data-person-dialog]')
  if (dialog.open) {
    close.focus()

    return
  }
  dialog.addEventListener('close', () => opener.isConnected && opener.focus(), { once: true })
  dialog.showModal()
}

// The body of the card scrolls only when it does not fit: a scrolling box flattens the layers that come apart as the
// card leans, so they stay apart whenever the whole card fits. Measured again as the window or the content resizes.
function fitCardDialog() {
  const body = $('[data-person-dialog-card] .person-dialog-body')
  if (!body) {
    return
  }
  body.classList.remove('is-scrollable')
  body.classList.toggle('is-scrollable', body.scrollHeight > body.clientHeight + 1)
}

const cardDialogObserver = new ResizeObserver(() => requestAnimationFrame(fitCardDialog))

export const dialogSection = (title, ...children) => el('section', { className: 'person-dialog-section' }, el('h3', { textContent: title }), ...children)

// The open card leans towards the pointer, its layers apart, and catches the light where the pointer is, like a printed
// card held in the hand. Only for a mouse, and never for those who ask their system to reduce motion.
function tiltPersonCard(event) {
  if (event.pointerType !== 'mouse' || reducedMotion.matches) {
    return
  }
  // Measured on the scene, which does not turn: the card's own box changes as it leans.
  const box = $('[data-person-dialog-scene]').getBoundingClientRect()
  const x = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width))
  const y = Math.min(1, Math.max(0, (event.clientY - box.top) / box.height))
  const card = $('[data-person-dialog-card]')
  card.classList.add('is-tilting')
  card.style.setProperty('--tilt-x', `${((0.5 - y) * 2 * PERSON_TILT_DEG).toFixed(2)}deg`)
  card.style.setProperty('--tilt-y', `${((x - 0.5) * 2 * PERSON_TILT_DEG).toFixed(2)}deg`)
  card.style.setProperty('--glare-x', `${(x * 100).toFixed(1)}%`)
  card.style.setProperty('--glare-y', `${(y * 100).toFixed(1)}%`)
}

function resetPersonTilt() {
  const card = $('[data-person-dialog-card]')
  card.classList.remove('is-tilting')
  for (const property of ['--tilt-x', '--tilt-y', '--glare-x', '--glare-y']) {
    card.style.removeProperty(property)
  }
}

// Listens to the dialog of the cards: closing it, and the card leaning towards the pointer.
export function setupCardDialog() {
  // The dialog of a person closes from its button, with Escape, or with a click beside the card. The path of the click is
  // the one it had when made: a name in the card replaces the card's content, and its button with it, before the click
  // gets here.
  $('[data-person-dialog]').addEventListener('click', (event) => {
    if (!event.composedPath().includes($('[data-person-dialog-card]'))) {
      event.currentTarget.close()
    }
  })
  $('[data-person-dialog]').addEventListener('close', resetPersonTilt)
  $('[data-person-dialog-scene]').addEventListener('pointermove', tiltPersonCard)
  $('[data-person-dialog-scene]').addEventListener('pointerleave', resetPersonTilt)
}
