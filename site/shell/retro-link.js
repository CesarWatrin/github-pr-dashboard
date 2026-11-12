// The link of the year in review, last of the sidebar: it opens retro.html in a tab of its own with the key the stats
// carry (retroKey, from RETRO_KEY), and the button beside it copies that whole link, to give it to the team. Hidden
// while the stats carry no key.

import { RETRO_YEAR } from '../domain/wrapped.js'
import { t } from '../lib/i18n.js'
import { state } from '../model/state.js'
import { $ } from '../ui/dom.js'

// How long the button says the link is copied.
const COPIED_MS = 2000

// The whole address of the year in review, its key after the #: what the team needs, nothing more.
const retroUrl = () => new URL(`retro.html#k=${state.stats?.retroKey}`, location.href).href

export function renderRetroLink() {
  const key = state.stats?.retroKey
  $('[data-retro]').hidden = !key
  $('[data-retro-link]', HTMLAnchorElement).href = key ? retroUrl() : 'retro.html'
}

// Names the link after the year it tells (« Rétro 2026 »), then copies the link on a click and says so on the button
// for a moment: a check mark, and its label.
export function setupRetroLink() {
  $('[data-retro-label]').textContent = t('Rétro {year}', { year: RETRO_YEAR })
  const button = $('[data-retro-copy]', HTMLButtonElement)
  const label = button.getAttribute('aria-label') ?? ''
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let reset
  button.addEventListener('click', async () => {
    let done = t('Lien copié')
    try {
      await navigator.clipboard.writeText(retroUrl())
    } catch {
      done = t('Copie impossible')
    }
    button.classList.toggle('is-copied', done === t('Lien copié'))
    button.setAttribute('aria-label', done)
    button.title = done
    clearTimeout(reset)
    reset = setTimeout(() => {
      button.classList.remove('is-copied')
      button.setAttribute('aria-label', label)
      button.title = label
    }, COPIED_MS)
  })
}
