// The slides that thank each person of the team or of a squad (« Merci à chacun »), before the last slide of its story:
// a card per person, their face, their name and the anecdote of their year (domain/wrapped/thanks.js), a few to a
// slide, which stays long enough to read them all.

import { thanksOf } from '../../domain/wrapped/thanks.js'
import { elides, formatLines, plural } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { el } from '../../ui/dom.js'
import { face } from './visuals.js'

/** @typedef {import('./slides.js').Slide} Slide */
/** @typedef {import('../../domain/wrapped/thanks.js').Thanks} Thanks */

// The people thanked on a slide, and how long it stays: a moment, then a little longer for each of them.
export const THANKS_PER_SLIDE = 6
const THANKS_BASE_MS = 3000
const THANKS_CARD_MS = 1500

// An anecdote in words, after the name of the person.
/** @type {(thanks: Thanks, nameOf: (login: string) => string) => string} */
function anecdote({ kind, value, other }, nameOf) {
  switch (kind) {
    case 'merged':
      return t('a mergé {count}', { count: plural(value, 'PR de code', 'PR de code') })
    case 'reviewed':
      return t('a relu {count} des collègues', { count: plural(value, 'PR', 'PR') })
    case 'delivered':
      return t('a livré {count}', { count: plural(value, 'projet') })
    case 'acs':
      return t('a livré {count}', { count: plural(value, 'AC', 'AC') })
    case 'hotfixes':
      return t('a sorti {count} pour sauver la prod', { count: plural(value, 'hotfix', 'hotfix') })
    case 'deleted':
      return t('a supprimé {lines} lignes : merci pour le ménage', { lines: formatLines(value) })
    case 'added':
      return t('a écrit {lines} lignes de code', { lines: formatLines(value) })
    case 'comments':
      return t('a laissé {count} en review', { count: plural(value, 'commentaire') })
    case 'duo': {
      const name = nameOf(other ?? '')

      return elides(name) ? t('a relu {count} d’{name}', { count: plural(value, 'PR', 'PR'), name }) : t('a relu {count} de {name}', { count: plural(value, 'PR', 'PR'), name })
    }
    case 'streak':
      return t('une PR ouverte {count} jours ouvrés d’affilée', { count: value })
    case 'days':
      return t('des PR ouvertes sur {count} jours différents', { count: value })
    default:
      return t('merci pour cette année')
  }
}

/**
 * The slides of thanks of the people of a team or a squad, in their order.
 * @param {RetroPerson[]} people
 * @param {(login: string) => string} nameOf
 * @returns {Slide[]}
 */
export function thanksSlides(people, nameOf) {
  const thanks = thanksOf(people)
  const pages = Math.ceil(thanks.length / THANKS_PER_SLIDE)

  return Array.from({ length: pages }, (_, page) => {
    const shown = thanks.slice(page * THANKS_PER_SLIDE, (page + 1) * THANKS_PER_SLIDE)

    return {
      tone: (page % 6) + 1,
      eyebrow: pages > 1 ? t('Merci à chacun · {page}/{pages}', { page: page + 1, pages }) : t('Merci à chacun'),
      visual: el(
        'ul',
        { className: 'wrapped-thanks' },
        ...shown.map((one) =>
          el('li', {}, face(one.login, 44), el('strong', { textContent: nameOf(one.login) }), el('span', { textContent: anecdote(one, nameOf) })),
        ),
      ),
      duration: THANKS_BASE_MS + THANKS_CARD_MS * shown.length,
    }
  })
}
