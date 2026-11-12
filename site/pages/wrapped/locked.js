// The screen of the year in review (retro.html) without a key that opens it, in its style: how to get the link, or why
// the link no longer opens it, or that nothing is published or reachable yet (with a button to try again).

import { t } from '../../lib/i18n.js'
import { $, el } from '../../ui/dom.js'

// What the screen without a key says, by why: no key yet, a key that no longer opens it, nothing published yet, or
// nothing reachable (with a button to try again).
const LOCKED = {
  none: {
    title: () => t('Il te faut le lien de la Rétrospective'),
    text: () => t('Cette page s’ouvre avec le lien partagé à l’équipe. Demande-le, puis ouvre-le dans ce navigateur : il s’en souviendra 30 jours.'),
  },
  wrong: {
    title: () => t('Ce lien n’ouvre plus la Rétrospective'),
    text: () => t('Sa clé a changé depuis : demande le nouveau lien.'),
  },
  missing: {
    title: () => t('La Rétrospective arrive bientôt'),
    text: () => t('Elle n’est pas encore publiée : reviens un peu plus tard.'),
  },
  unavailable: {
    title: () => t('La Rétrospective ne répond pas'),
    text: () => t('Les données sont injoignables pour le moment : réessaie dans un instant.'),
  },
}

/**
 * The screen without a key that opens the year in review, in its style.
 * @param {keyof typeof LOCKED} reason
 * @param {number} year
 * @param {() => void} [retry]
 */
export function renderLocked(reason, year, retry) {
  const { title, text } = LOCKED[reason]
  $('[data-wrapped]').replaceChildren(
    el(
      'div',
      { className: 'wrapped-locked' },
      el('span', { className: 'wrapped-locked-mark', textContent: reason === 'missing' ? '⏳' : '🔑' }),
      el('p', { className: 'wrapped-eyebrow', textContent: t('Rétrospective {year}', { year }) }),
      el('h1', { className: 'wrapped-locked-title', textContent: title() }),
      el('p', { className: 'wrapped-locked-text', textContent: text() }),
      ...(retry
        ? [
            (() => {
              const button = el('button', { type: 'button', className: 'wrapped-action is-primary', textContent: t('Réessayer') })
              button.addEventListener('click', retry)

              return button
            })(),
          ]
        : []),
    ),
  )
}
