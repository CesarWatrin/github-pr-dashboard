// The words of the annual review: the recommendations, the profiles, and the sentence of each note of a person.

import { formatDecimal, formatDuration, formatNumber, formatShare } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { displayName } from '../../model/people.js'
import { stackType } from '../../model/repositories.js'

/** @typedef {import('../../domain/review.js').ReviewedPerson} ReviewedPerson */
/** @typedef {'exceptional' | 'above' | 'meets' | 'below' | 'lead'} Group */

// The groups of the board, in their order: the recommendations, then the heads of squad, judged apart.
/** @type {{ key: Group, label: string, hint: string }[]} */
export const GROUPS = [
  { key: 'exceptional', label: t('Bien au-delà des attentes'), hint: t('Haut niveau sur la livraison, la review et le poids dans l’équipe.') },
  { key: 'above', label: t('Au-dessus des attentes'), hint: t('Au-dessus de l’équipe sur la plupart des axes.') },
  { key: 'meets', label: t('Conforme aux attentes'), hint: t('Une contribution correcte sans écart marquant, ou un point de process à corriger.') },
  { key: 'below', label: t('En dessous des attentes'), hint: t('En retrait sur plusieurs axes, ou une présence à expliquer.') },
  { key: 'lead', label: t('Chef de squad'), hint: t('Jugés d’abord sur le résultat de leur squad, et sur ce que GitHub ne montre pas.') },
]

/** @param {ReviewedPerson} person */
export const groupOf = (person) => /** @type {Group} */ (person.squad ? 'lead' : person.verdict)

// The profiles of the review, as the page names them: those who do mostly maintenance (TMA), some, or little.
/** @type {Record<string, string>} */
export const PROFILE_LABELS = { Build: t('hors TMA'), Mixte: t('TMA partielle'), TMA: t('TMA') }

// The stack of a person, as the team page says it: front, back, mobile or full-stack.
/** @param {ReviewedPerson} person */
export const stackOf = (person) => stackType({ front: 0, back: 0, mobile: 0, other: 0, ...person.categories })?.label ?? '–'

/** @type {Record<string, string>} */
export const STANDINGS = { above: t('au-dessus des devs comparables'), below: t('en dessous des devs comparables'), within: t('dans la norme des devs comparables') }

/** @param {number} value */
const one = (value) => formatDecimal(Math.round(value * 10) / 10)

// The sentence of each note (site/domain/review/notes.js), from its figures.
/** @type {Record<string, (values: Record<string, number | string>) => string>} */
const NOTES = {
  squadLeads: (v) => t('Sa squad est parmi les plus performantes (résultat {mark}/100) : {units} unités livrées par membre et par mois, {reviews} PR relues.', { mark: Number(v.mark), units: one(Number(v.units)), reviews: formatNumber(Math.round(Number(v.reviews))) }),
  squadLags: (v) => t('Sa squad est en retrait sur l’année (résultat {mark}/100) : {units} unités livrées par membre et par mois, {reviews} PR relues.', { mark: Number(v.mark), units: one(Number(v.units)), reviews: formatNumber(Math.round(Number(v.reviews))) }),
  presence: (v) => t('Active sur GitHub {share} des jours ouvrés seulement ({days} sur {available}) : vérifier un temps partiel, d’autres missions ou des absences avant de conclure.', { share: formatShare(Number(v.share)), days: Number(v.days), available: Number(v.available) }),
  delivers: (v) => t('Livre nettement plus que la médiane des devs {profile} ({times} fois), un écart statistiquement solide.', { profile: PROFILE_LABELS[String(v.profile)], times: one(Number(v.times)) }),
  fewHotfixes: (v) => t('Moins de hotfixes livrés que les autres devs TMA ({mine} par mois contre {profile}), un écart statistiquement solide.', { mine: one(Number(v.mine)), profile: one(Number(v.profile)) }),
  delivery: (v) => t('Livre moins que la médiane des devs {profile} ({share} de la médiane), un écart statistiquement solide.', { profile: PROFILE_LABELS[String(v.profile)], share: formatShare(Number(v.share)) }),
  pillar: (v) => t('Pilier de la review : {mine} PR relues par mois, contre {team} en médiane.', { mine: formatNumber(Math.round(Number(v.mine))), team: formatNumber(Math.round(Number(v.team))) }),
  fewReviews: (v) => t('Relit peu le code des autres : {mine} PR par mois, contre {team} en médiane.', { mine: formatNumber(Math.round(Number(v.mine))), team: formatNumber(Math.round(Number(v.team))) }),
  dependents: (v) => t('{count} personnes passent par ses reviews pour au moins 30 % de leurs PR.', { count: Number(v.count) }),
  deepReviews: (v) => t('Reviews approfondies : {mine} commentaires par PR relue, contre {team} en médiane.', { mine: one(Number(v.mine)), team: one(Number(v.team)) }),
  silent: (v) => t('{share} de ses approbations sont données sans aucun commentaire.', { share: formatShare(Number(v.share)) }),
  focused: (v) =>
    t('Relit surtout les mêmes personnes : {share} de ses reviews vont à {people}. Relire plus largement diffuse la connaissance du code.', {
      share: formatShare(Number(v.share)),
      people: String(v.logins).split(',').map(displayName).join(', '),
    }),
  fewRemarks: (v) =>
    t('Presque aucun retour en review : {share} des {reviewed} PR relues portent une remarque ou une demande de changements. Vérifier que ses reviews ne sont pas des validations de principe.', {
      share: formatShare(Number(v.share)),
      reviewed: formatNumber(Number(v.reviewed)),
    }),
  busFactor: (v) => t('Seul repère de {count} dépôts (au moins 40 % de leurs PR) : un risque en cas d’absence, ce savoir est à partager.', { count: Number(v.count) }),
  owner: (v) => t('Référent de {repos} (au moins 40 % des PR).', { repos: v.repos }),
  unreviewed: (v) => t('{share} de ses PR sont mergées sans aucune review, alors que {approvals} approbations sont requises.', { share: formatShare(Number(v.share)), approvals: Number(v.approvals) }),
  closed: (v) => t('{share} de ses PR sont fermées sans être mergées : du travail jeté ou mal cadré.', { share: formatShare(Number(v.share)) }),
  slow: (v) => t('Ses PR mettent longtemps à être mergées : {mine} en médiane, contre {team} pour l’équipe.', { mine: formatDuration(Number(v.mine)), team: formatDuration(Number(v.team)) }),
  fast: (v) => t('PR mergées vite ({mine} en médiane) tout en passant par la review.', { mine: formatDuration(Number(v.mine)) }),
  big: (v) => t('PR volumineuses : {mine} lignes en médiane, contre {team} pour l’équipe. Plus petites, elles passeraient plus vite en review.', { mine: formatNumber(Math.round(Number(v.mine))), team: formatNumber(Math.round(Number(v.team))) }),
  irregular: () => t('Activité très irrégulière d’un mois à l’autre.'),
  regular: () => t('Très régulière d’un mois à l’autre.'),
  failed: (v) => t('{share} de ses PR sont mergées alors que les checks étaient en échec.', { share: formatShare(Number(v.share)) }),
  fixesFast: (v) => t('Corrige vite : ses hotfixes sont mergés en {mine} en médiane.', { mine: formatDuration(Number(v.mine)) }),
  fixesSlow: (v) => t('Ses hotfixes mettent {mine} à être mergés en médiane, contre {team} pour l’équipe.', { mine: formatDuration(Number(v.mine)), team: formatDuration(Number(v.team)) }),
  builder: (v) => t('Contribue à beaucoup de sujets produit : {projects} projets et {acs} AC sur ces mois.', { projects: Number(v.projects), acs: Number(v.acs) }),
  merger: (v) => t('Merge souvent les PR des autres ({count} sur ces mois).', { count: Number(v.count) }),
  reactive: (v) => t('Réactive en review : intervient {mine} après l’ouverture d’une PR, en médiane.', { mine: formatDuration(Number(v.mine)) }),
  calm: (v) => t('Livre beaucoup sans déborder : {share} de son activité tombe dans les heures ouvrées.', { share: formatShare(Number(v.share)) }),
  offHours: (v) => t('{share} de son activité tombe la nuit ou le week-end : à surveiller, surcharge ou organisation à part.', { share: formatShare(Number(v.share)) }),
}

/** @param {{ key: string, values: Record<string, number | string> }} note */
export const noteText = (note) => NOTES[note.key]?.(note.values) ?? note.key
