// The picker of the year in review (retro.html): the team first, then its squads, then the people of its year still in
// the team, by name, each opening their story, and a field to find oneself. No way out: the page leads nowhere else.

import { t } from '../../lib/i18n.js'
import { el } from '../../ui/dom.js'
import { avatar } from './visuals.js'

/** @typedef {import('../../model/retro-address.js').RetroWho} RetroWho */

/**
 * @param {HTMLElement} container
 * @param {Retro} retro
 * @param {(login: string) => string} nameOf
 * @param {(who: RetroWho) => void} open
 */
export function renderPicker(container, retro, nameOf, open) {
  const label = t('Ton nom ou ton identifiant GitHub')
  const search = /** @type {HTMLInputElement} */ (el('input', { type: 'search', className: 'wrapped-search', placeholder: label, autocomplete: 'off', spellcheck: false }))
  search.setAttribute('aria-label', label)
  const list = el(
    'ul',
    { className: 'wrapped-people' },
    ...retro.people.map(({ login }, index) => {
      const name = nameOf(login)
      const button = el(
        'button',
        { type: 'button', className: 'wrapped-person' },
        avatar(login, 40),
        el(
          'span',
          { className: 'wrapped-person-name' },
          el('strong', { textContent: name }),
          // The login under the name, unless it is the name.
          ...(name === login ? [] : [el('span', { textContent: `@${login}` })]),
        ),
      )
      button.addEventListener('click', () => open({ login }))
      const item = el('li', {}, button)
      item.dataset.search = `${name} ${login}`.toLowerCase()
      item.style.setProperty('--index', String(index + retro.squads.length))

      return item
    }),
  )
  const none = el('p', { className: 'wrapped-none', textContent: t('Personne de ce nom cette année.'), hidden: true })
  search.addEventListener('input', () => {
    const query = search.value.trim().toLowerCase()
    let found = 0
    for (const item of /** @type {HTMLElement[]} */ ([...list.children])) {
      item.hidden = query !== '' && !String(item.dataset.search).includes(query)
      found += item.hidden ? 0 : 1
    }
    none.hidden = found > 0
  })
  const team = el('button', { type: 'button', className: 'wrapped-team' }, el('strong', { textContent: t('Toute l’équipe') }), el('span', { textContent: t('L’année de tout le monde, ensemble') }))
  team.addEventListener('click', () => open('team'))
  // The squads, a card each, when the organization has any.
  const squads = retro.squads.length
    ? [
        el(
          'ul',
          { className: 'wrapped-squads' },
          ...retro.squads.map((squad, index) => {
            const button = el(
              'button',
              { type: 'button', className: 'wrapped-squad' },
              // The face of the head of the squad, when it has one.
              ...(squad.lead ? [avatar(squad.lead, 40)] : []),
              el(
                'span',
                { className: 'wrapped-squad-name' },
                el('strong', { textContent: squad.name }),
                el('span', { textContent: squad.lead ? t('Chef de squad : {name}', { name: nameOf(squad.lead) }) : t('L’année de la squad') }),
              ),
            )
            button.addEventListener('click', () => open({ squad: squad.name }))
            const item = el('li', {}, button)
            // They come in one after the other.
            item.style.setProperty('--index', String(index))

            return item
          }),
        ),
      ]
    : []
  container.replaceChildren(
    el(
      'div',
      { className: 'wrapped-picker' },
      el('p', { className: 'wrapped-eyebrow', textContent: t('Rétrospective') }),
      el('h1', { className: 'wrapped-picker-title', textContent: t('Ton année {year}', { year: retro.year }) }),
      el('p', { className: 'wrapped-picker-sub', textContent: t('Choisis ton nom GitHub : ton année en PR, en reviews et en projets, à revoir et à partager.') }),
      search,
      team,
      ...squads,
      list,
      none,
    ),
  )
}
