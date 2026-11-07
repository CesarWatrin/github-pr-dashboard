// Where an open pull request stands (unblock page, « Pour moi »): the lists, their delays and their tags.

import { formatNumber } from '../lib/format.js'
import { el } from './dom.js'
import { personLink } from './links.js'

// Where an open code pull request may stand, and how long it may stay there, in working days, before it shows as
// waiting for someone: what it waits for, on its list and in the legend of the page. The hints take the approvals merging needs.
export const approvers = (required) => (required > 1 ? `${formatNumber(required)} personnes` : 'quelqu’un')
export const UNBLOCK_STANCES = [
  {
    key: 'approved',
    label: 'Approuvées, pas mergées',
    afterDays: 1,
    since: 'approuvée',
    by: 'approuvée par',
    tag: 'approuvée',
    hint: (required) =>
      `Approuvées par ${required > 1 ? `au moins ${approvers(required)}` : approvers(required)} depuis plus d’un jour ouvré, sans demande de changements en cours : il ne reste qu’à merger.`,
    empty: 'Aucune PR approuvée qui attend son merge',
  },
  // Only where merging needs more than one approval.
  {
    key: 'approving',
    label: 'Approbation incomplète',
    afterDays: 1,
    since: 'approuvée',
    by: 'approuvée par',
    tag: 'approbation incomplète',
    hint: (required) =>
      required > 1
        ? `Approuvées depuis plus d’un jour ouvré par moins de ${approvers(required)}, alors qu’il en faut ${formatNumber(required)} pour merger : il manque une relecture.`
        : 'Une seule approbation suffit pour merger : aucune PR n’est approuvée à moitié.',
    empty: 'Aucune PR qui attend une approbation de plus',
  },
  {
    key: 'owners',
    label: 'Bloquées par un code owner',
    afterDays: 1,
    since: 'ouverte',
    by: 'en attente de',
    tag: 'code owner',
    hint: 'Ouvertes depuis plus d’un jour ouvré, pas encore validées, et un code owner du dépôt ne les a pas encore relues : GitHub bloque le merge.',
    empty: 'Aucune PR bloquée par un code owner',
  },
  {
    key: 'changes',
    label: 'Changements demandés',
    afterDays: 3,
    since: 'changements demandés',
    by: 'demandés par',
    tag: 'changements demandés',
    hint: 'Changements demandés il y a plus de trois jours ouvrés, sans nouvelle approbation depuis : à corriger, ou à relire de nouveau.',
    empty: 'Aucune demande de changements qui traîne',
  },
  {
    key: 'discussed',
    label: 'En discussion',
    afterDays: 3,
    since: 'dernier échange',
    tag: 'en discussion',
    hint: 'Reviews ou commentaires sans approbation ni demande de changements, et plus rien depuis trois jours ouvrés.',
    empty: 'Aucune discussion au point mort',
  },
  {
    key: 'waiting',
    label: 'Sans review',
    afterDays: 1,
    since: 'ouverte',
    tag: 'sans review',
    hint: 'Ouvertes depuis plus d’un jour ouvré, sans aucune review ni commentaire d’une autre personne.',
    empty: 'Aucune PR qui attend sa première review',
  },
]
// An open pull request without any review or comment for this long is forgotten rather than waiting: listed apart,
// whatever it stands.
export const FORGOTTEN_AFTER_DAYS = 30
export const FORGOTTEN = {
  key: 'forgotten',
  label: 'Oubliées',
  since: 'dernière activité',
  hint: `Plus aucune review ni commentaire depuis plus de ${FORGOTTEN_AFTER_DAYS} jours, où qu’elles en soient : à relancer, ou à fermer.`,
  empty: 'Aucune PR oubliée',
}

// The lists of the « Pour moi » page, from personalQueue() of site/domain/open-pull-requests.js, in the order of the page. Named and
// defined as on the unblock page, without its delays, but the forgotten ones: a pull request of the person shows in
// one list only, forgotten whatever it stands, else after where it stands, the others in the last one.
export const unblockStance = (key) => UNBLOCK_STANCES.find((stance) => stance.key === key)

// Someone a pull request waits for: a person, a team of code owners (@slug), or a code owner the sync could not read.
export function reviewerName(login) {
  if (login === null) {
    return el('span', { textContent: 'un code owner' })
  }

  return login.startsWith('@') ? el('span', { className: 'feed-team', textContent: `l’équipe ${login.slice(1)}` }) : personLink(login, { withAvatar: false })
}

const KIND_TAGS = { integration: 'intégration', release: 'release' }
export const kindTag = (pr) => (KIND_TAGS[pr.kind] ? [el('span', { className: 'feed-tag', textContent: KIND_TAGS[pr.kind] })] : [])
