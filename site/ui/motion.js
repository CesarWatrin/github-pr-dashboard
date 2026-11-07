// How pages enter: cards rising, bars growing, rows following one another; nothing under reduced motion.

import { currentRoute } from '../model/routes.js'
import { state } from '../model/state.js'
import { $ } from './dom.js'

// How long a page that shows plays its entrance: cards rising, bars growing, rows following one another.
const ENTRANCE_MS = 1000
// Bars and rows start one after the other, within this spread.
export const STAGGER_SPREAD_MS = 320
export const STAGGERED_ROWS = 16

export const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

/** @type {ReturnType<typeof setTimeout> | undefined} */
let entranceTimer

// The page that shows plays its entrance once: its cards rise, its bars grow and its rows follow one another.
export function playEntrance() {
  const route = $(`[data-route="${currentRoute()}"]`)
  if (!state.stats || reducedMotion.matches) {
    return
  }
  route.classList.remove('is-entering')
  void route.offsetWidth
  route.classList.add('is-entering')
  clearTimeout(entranceTimer)
  entranceTimer = setTimeout(() => route.classList.remove('is-entering'), ENTRANCE_MS)
}
