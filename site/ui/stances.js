// Where an open pull request stands (unblock page, « Mes PR »): the lists, their delays and their tags.

import { formatNumber } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { el } from './dom.js'
import { personLink } from './links.js'

// Where an open code pull request may stand, and how long it may stay there, in working days, before it shows as
// waiting for someone: what it waits for, on its list and in the legend of the page. The hints take the approvals merging needs.
export const approvers = (required) => (required > 1 ? t('{count} personnes', { count: formatNumber(required) }) : t('quelqu’un'))
export const UNBLOCK_STANCES = [
  {
    key: 'approved',
    label: t('Approuvées, pas mergées'),
    afterDays: 1,
    since: t('approuvée'),
    by: t('approuvée par'),
    tag: t('approuvée'),
    hint: (required) =>
      t('Approuvées par {who} depuis plus d’un jour ouvré, sans demande de changements en cours : il ne reste qu’à merger.', {
        who: required > 1 ? t('au moins {who}', { who: approvers(required) }) : approvers(required),
      }),
    empty: t('Aucune PR approuvée qui attend son merge'),
  },
  // Only where merging needs more than one approval.
  {
    key: 'approving',
    label: t('Approbation incomplète'),
    afterDays: 1,
    since: t('approuvée'),
    by: t('approuvée par'),
    tag: t('approbation incomplète'),
    hint: (required) =>
      required > 1
        ? t('Approuvées depuis plus d’un jour ouvré par moins de {who}, alors qu’il en faut {count} pour merger : il manque une relecture.', {
            who: approvers(required),
            count: formatNumber(required),
          })
        : t('Une seule approbation suffit pour merger : aucune PR n’est approuvée à moitié.'),
    empty: t('Aucune PR qui attend une approbation de plus'),
  },
  {
    key: 'owners',
    label: t('Bloquées par un code owner'),
    afterDays: 1,
    since: t('ouverte'),
    by: t('en attente de'),
    tag: t('code owner'),
    hint: t('Ouvertes depuis plus d’un jour ouvré, pas encore validées, et un code owner du dépôt ne les a pas encore relues : GitHub bloque le merge.'),
    empty: t('Aucune PR bloquée par un code owner'),
  },
  {
    key: 'changes',
    label: t('Changements demandés'),
    afterDays: 3,
    since: t('changements demandés'),
    by: t('demandés par'),
    tag: t('changements demandés'),
    hint: t('Changements demandés il y a plus de trois jours ouvrés, sans nouvelle approbation depuis : à corriger, ou à relire de nouveau.'),
    empty: t('Aucune demande de changements qui traîne'),
  },
  {
    key: 'discussed',
    label: t('En discussion'),
    afterDays: 3,
    since: t('dernier échange'),
    tag: t('en discussion'),
    hint: t('Reviews ou commentaires sans approbation ni demande de changements, et plus rien depuis trois jours ouvrés.'),
    empty: t('Aucune discussion au point mort'),
  },
  {
    key: 'waiting',
    label: t('Sans review'),
    afterDays: 1,
    since: t('ouverte'),
    tag: t('sans review'),
    hint: t('Ouvertes depuis plus d’un jour ouvré, sans aucune review ni commentaire d’une autre personne.'),
    empty: t('Aucune PR qui attend sa première review'),
  },
]
// An open pull request without any review or comment for this long is forgotten rather than waiting: listed apart,
// whatever it stands.
export const FORGOTTEN_AFTER_DAYS = 30
export const FORGOTTEN = {
  key: 'forgotten',
  label: t('Oubliées'),
  since: t('dernière activité'),
  hint: t('Plus aucune review ni commentaire depuis plus de {days} jours, où qu’elles en soient : à relancer, ou à fermer.', { days: FORGOTTEN_AFTER_DAYS }),
  empty: t('Aucune PR oubliée'),
}

// The lists of the « Mes PR » page, from personalQueue() of site/domain/open-pull-requests.js, in the order of the page. Named and
// defined as on the unblock page, without its delays, but the forgotten ones: a pull request of the person shows in
// one list only, forgotten whatever it stands, else after where it stands, the others in the last one.
export const unblockStance = (key) => UNBLOCK_STANCES.find((stance) => stance.key === key)

// Someone a pull request waits for: a person, a team of code owners (@slug), or a code owner the sync could not read.
export function reviewerName(login) {
  if (login === null) {
    return el('span', { textContent: t('un code owner') })
  }

  return login.startsWith('@') ? el('span', { className: 'feed-team', textContent: t('l’équipe {team}', { team: login.slice(1) }) }) : personLink(login, { withAvatar: false })
}

const KIND_TAGS = { integration: t('intégration'), release: t('release') }
export const kindTag = (pr) => (KIND_TAGS[pr.kind] ? [el('span', { className: 'feed-tag', textContent: KIND_TAGS[pr.kind] })] : [])
