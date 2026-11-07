// What the card and the dialog of a person share: stack, seniority, squads.

import { dateFormat } from '../lib/format.js'
import { activities, seniority } from '../model/people.js'
import { stackType, topTechnologies } from '../model/repositories.js'
import { squadsOf } from '../model/squads.js'
import { el } from './dom.js'
import { technologyIcon } from './icons.js'

// The stack badge of a person and the logos of their main technologies.
export function stackLine(stack) {
  const type = stackType(stack.counts)
  const technologies = topTechnologies(stack.technologies).map(([technology]) => technology)
  const logos = el('span', { className: 'stack-logos', title: technologies.join(', ') }, ...technologies.map((technology) => technologyIcon(technology)))
  if (technologies.length) {
    logos.setAttribute('role', 'img')
    logos.setAttribute('aria-label', `Technos : ${technologies.join(', ')}`)
  }

  return el(
    'div',
    { className: 'person-card-stack' },
    type ? el('span', { className: `stack-type is-${type.key}`, textContent: type.label }) : el('span', { className: 'muted', textContent: '–' }),
    logos,
  )
}

// "7 mois d’ancienneté", with the date it counts from on hover; nothing for someone the stats do not know.
export function seniorityText(tag, className, login) {
  const value = seniority(login)

  return value ? [el(tag, { className, textContent: `${value.label} d’ancienneté`, title: value.title })] : []
}

// In the dialog of someone who left the team, opened from the former people or the record of every month: that they
// left, and when they were last active, in place of a seniority that no longer means anything.
export function formerText(login) {
  return [
    el(
      'p',
      { className: 'person-dialog-meta person-dialog-former' },
      el('span', { className: 'former-tag', textContent: 'Ne fait plus partie de l’équipe' }),
      document.createTextNode(`Dernière activité le ${dateFormat.format(activities().get(login).last * 60_000)}`),
    ),
  ]
}

// The squads a person belongs to, as tags on their card and dialog: nothing outside any squad, or without squads.
export function squadTags(login) {
  const squads = squadsOf().filter((squad) => squad.members.includes(login))

  // The head of a squad: a star on its tag, and the words on hover.
  const tag = (squad) =>
    squad.lead === login
      ? el('span', { className: 'squad-tag is-lead', textContent: `★ ${squad.name}`, title: `Chef de squad, ${squad.name}` })
      : el('span', { className: 'squad-tag', textContent: squad.name })

  return squads.length ? [el('div', { className: 'squad-tags', title: 'Squads' }, ...squads.map(tag))] : []
}
