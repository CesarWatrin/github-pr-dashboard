// The button back to the top of the page, on every page: shown once the page has scrolled down by more than a screen,
// it scrolls back up, smoothly unless the viewer asks for less motion.

import { $ } from '../ui/dom.js'
import { reducedMotion } from '../ui/motion.js'

export function setupScrollTop() {
  const button = $('[data-scroll-top]')
  let frame = 0
  const update = () => {
    frame = 0
    button.hidden = window.scrollY < window.innerHeight
  }
  window.addEventListener(
    'scroll',
    () => {
      frame ||= requestAnimationFrame(update)
    },
    { passive: true },
  )
  window.addEventListener('hashchange', update)
  button.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' })
    // The keyboard goes back to the top too: to the title of the page.
    const title = $('[data-route-title]')
    title.tabIndex = -1
    title.focus({ preventScroll: true })
  })
  update()
}
