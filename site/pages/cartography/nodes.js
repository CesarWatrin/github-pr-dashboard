// The nodes of the networks of the map page: people in the ring of their stack, repositories in the colour of their type.

import { t } from '../../lib/i18n.js'
import { displayName } from '../../model/people.js'
import { CATEGORIES, STACK_CATEGORIES, stackType } from '../../model/repositories.js'
import { squadsOf } from '../../model/squads.js'
import { avatarUrl } from '../../ui/links.js'

// The colour of a repository type; the repositories that are neither front, back nor mobile in the muted ink.
export const typeColor = (category) => CATEGORIES.find((type) => type.key === category)?.color ?? 'var(--text-muted)'
export const TYPE_LEGEND = CATEGORIES.map((type) => ({ label: type.label, color: type.color ?? 'var(--text-muted)' }))

// A person: their avatar in a ring of the share of their code pull requests in front, back and mobile repositories.
export function personNode(login, value, stackFor) {
  const { counts } = stackFor(login)
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)

  return {
    id: `person:${login}`,
    label: displayName(login),
    value,
    image: avatarUrl(login, 96),
    ring: total ? STACK_CATEGORIES.map((type) => ({ color: type.color, share: counts[type.key] / total })) : [],
  }
}

// What a person's tooltip says under their figures: their squads and the type of their work.
export function personNote(login, stackFor) {
  const squads = squadsOf()
    .filter((squad) => squad.members.includes(login))
    .map((squad) => squad.name)
  const type = stackType(stackFor(login).counts)

  return (
    [squads.length ? t('Squad : {squads}', { squads: squads.join(', ') }) : null, type ? t('Plutôt {type}', { type: type.label }) : null]
      .filter(Boolean)
      .join(' · ') || null
  )
}
