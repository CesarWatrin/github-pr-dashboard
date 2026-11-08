// What the card and the dialog of a person share: stack, seniority, squads; and the avatars of a group of people, on the
// cards of squads and projects.

import { dateFormat } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { activities, displayName, isCurrent, seniority } from '../model/people.js'
import { stackType, topTechnologies } from '../model/repositories.js'
import { squadsOf } from '../model/squads.js'
import { el } from './dom.js'
import { technologyIcon } from './icons.js'
import { avatarUrl } from './links.js'

// The avatars of the people of a group still in the team, overlapping, as on a team photo, in the order given. The head
// of a squad comes first, ringed. Beyond max, a « +N » stands for the others, named on hover with the rest.
export function avatarStack(logins, { size = 28, lead = null, max = Infinity } = {}) {
  const current = logins.filter(isCurrent).sort((a, b) => Number(b === lead) - Number(a === lead))
  const shown = current.length > max ? current.slice(0, max - 1) : current
  const others = current.length - shown.length

  return el(
    'span',
    { className: 'squad-avatars', title: current.map(displayName).join(', ') },
    ...shown.map((login) =>
      el('img', { className: login === lead ? 'is-lead' : '', src: avatarUrl(login, size * 2), alt: '', loading: 'lazy', width: size, height: size }),
    ),
    ...(others > 0 ? [el('span', { className: 'avatar-more', textContent: `+${others}`, style: `--avatar-size: ${size}px` })] : []),
  )
}

// The stack badge of a person and the logos of their main technologies.
export function stackLine(stack) {
  const type = stackType(stack.counts)
  const technologies = topTechnologies(stack.technologies).map(([technology]) => technology)
  const logos = el('span', { className: 'stack-logos', title: technologies.join(', ') }, ...technologies.map((technology) => technologyIcon(technology)))
  if (technologies.length) {
    logos.setAttribute('role', 'img')
    logos.setAttribute('aria-label', t('Technos : {technologies}', { technologies: technologies.join(', ') }))
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

  return value ? [el(tag, { className, textContent: t('{value} d’ancienneté', { value: value.label }), title: value.title })] : []
}

// In the dialog of someone who left the team, opened from the former people or the record of every month: that they
// left, and when they were last active, in place of a seniority that no longer means anything.
export function formerText(login) {
  return [
    el(
      'p',
      { className: 'person-dialog-meta person-dialog-former' },
      el('span', { className: 'former-tag', textContent: t('Ne fait plus partie de l’équipe') }),
      document.createTextNode(t('Dernière activité le {date}', { date: dateFormat.format(activities().get(login).last * 60_000) })),
    ),
  ]
}

// The squads a person belongs to, as tags on their card and dialog: nothing outside any squad, or without squads.
export function squadTags(login) {
  const squads = squadsOf().filter((squad) => squad.members.includes(login))

  // The head of a squad: a star on its tag, and the words on hover.
  const tag = (squad) =>
    squad.lead === login
      ? el('span', { className: 'squad-tag is-lead', textContent: `★ ${squad.name}`, title: t('Chef de squad, {squad}', { squad: squad.name }) })
      : el('span', { className: 'squad-tag', textContent: squad.name })

  return squads.length ? [el('div', { className: 'squad-tags', title: t('Squads') }, ...squads.map(tag))] : []
}
