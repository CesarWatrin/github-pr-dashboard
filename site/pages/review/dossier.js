// The dossier of a person of the annual review: their recommendation and overall mark, the four marks, strengths and
// what to work on, their months, then their figures by theme against those of the team, and the rhythm of their weeks.

import { effortSummary } from '../../domain/effort.js'
import { formatDecimal, formatDuration, formatLines, formatNumber, formatShare } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { displayName, seniority } from '../../model/people.js'
import { el } from '../../ui/dom.js'
import { effortBar } from '../../ui/effort.js'
import { personLink } from '../../ui/links.js'
import { monthChart, weekChart } from './charts.js'
import { GROUPS, groupOf, noteText, PROFILE_LABELS, STANDINGS, stackOf } from './words.js'

/** @typedef {import('../../domain/review.js').ReviewedPerson} ReviewedPerson */
/** @typedef {import('../../domain/review.js').TeamReview} TeamReview */

/** @param {number} value */
const one = (value) => formatDecimal(Math.round(value * 10) / 10)

// A mark from 0 to 100, its bar and what it rests on.
/**
 * @param {string} label
 * @param {number} value
 * @param {string} reading
 */
function mark(label, value, reading) {
  const fill = el('i')
  fill.style.width = `${value}%`
  const bar = el('span', { className: 'review-mark-bar' }, fill)

  return el(
    'div',
    { className: 'review-mark' },
    el('p', { className: 'review-mark-head' }, el('span', { textContent: label }), el('strong', { textContent: String(value) })),
    bar,
    el('p', { className: 'review-mark-reading', textContent: reading }),
  )
}

// A figure of a list, with the median of the team beside it when one compares, tinted when it is clearly better or worse.
/**
 * @param {string} label
 * @param {string} value
 * @param {{ mine?: number | null, team?: number | null, lowerIsBetter?: boolean, format?: (value: number) => string }} [compare]
 */
function figure(label, value, { mine = null, team = null, lowerIsBetter = true, format = String } = {}) {
  const cell = el('dd', { textContent: value })
  if (typeof mine === 'number' && typeof team === 'number' && team > 0) {
    const better = lowerIsBetter ? mine < team * 0.85 : mine > team * 1.15
    const worse = lowerIsBetter ? mine > team * 1.15 : mine < team * 0.85
    cell.append(el('small', { className: better ? 'is-better' : worse ? 'is-worse' : '', textContent: ` · ${t('équipe')} ${format(team)}` }))
  }

  return [el('dt', { textContent: label }), cell]
}

/**
 * @param {string} title
 * @param {...Node} children
 */
const panel = (title, ...children) => el('div', { className: 'review-panel' }, el('h4', { textContent: title }), ...children)

/** @param {number} hour */
const clock = (hour) => `${Math.floor(hour)} h ${String(Math.round((hour % 1) * 60)).padStart(2, '0')}`

/**
 * @param {ReviewedPerson} person
 * @param {TeamReview} review
 */
export function dossier(person, review) {
  const group = groupOf(person)
  const team = review.team
  const since = seniority(person.login)
  const effort = effortSummary({ counts: person.effort, added: { projects: 0, tma: 0, acs: 0, rest: 0 } })
  const { rhythm } = person
  const day = typedDay(person)

  const head = el(
    'div',
    { className: 'review-dossier-head' },
    el(
      'div',
      { className: 'review-dossier-id' },
      el('p', { className: 'review-eyebrow', textContent: `${stackOf(person)} · ${t('{share} de TMA', { share: formatShare(person.hotfixShare) })}` }),
      el('h2', { id: 'review-dialog-title' }, personLink(person.login)),
      el(
        'p',
        { className: 'review-tags' },
        ...(person.profile === 'Build' ? [] : [el('span', { className: 'review-tag is-tma', textContent: PROFILE_LABELS[person.profile] })]),
        ...(person.squad ? [el('span', { className: 'review-tag is-lead', textContent: t('★ Chef de {squad}', { squad: person.squad.name }) })] : []),
        el('span', { className: 'review-tag', textContent: t('{count} mois évalués', { count: person.months }) }),
        ...(since ? [el('span', { className: 'review-tag', title: since.title, textContent: t('Ancienneté : {label}', { label: since.label }) })] : []),
      ),
    ),
    el(
      'div',
      { className: `review-verdict is-${group}` },
      el('span', { className: 'review-pill', textContent: GROUPS.find((item) => item.key === group)?.label ?? '' }),
      el('p', { className: 'review-overall' }, el('strong', { textContent: String(person.overall) }), el('span', { textContent: ' / 100' })),
    ),
  )

  const marks = el(
    'div',
    { className: 'review-marks' },
    mark(
      t('Productivité'),
      person.marks.productivity,
      t('{count} unités par mois, tout son travail compris, médiane de l’équipe : {median} · {standing}', {
        count: one(person.deliveredMean),
        median: one(review.delivery.median),
        standing: STANDINGS[person.standing],
      }),
    ),
    mark(
      t('Efficacité'),
      person.marks.efficiency,
      t('merge en {merge}, {closed} abandonnées, {unreviewed} sans review', {
        merge: formatDuration(person.mergeHours),
        closed: formatShare(person.closedShare),
        unreviewed: formatShare(person.unreviewedShare),
      }),
    ),
    mark(
      t('Collaboration'),
      person.marks.collaboration,
      t('{reviews} PR relues par mois, {comments} commentaire par PR relue', { reviews: formatNumber(Math.round(person.reviewsMean)), comments: one(person.commentsPerReview) }),
    ),
    mark(
      t('Importance'),
      person.marks.importance,
      t('{code} du code livré, {reviews} des reviews de l’équipe', { code: formatShare(person.codeShare), reviews: formatShare(person.reviewShare) }),
    ),
  )

  /**
   * @param {string} title
   * @param {string} className
   * @param {import('../../domain/review/notes.js').Note[]} notes
   * @param {string} empty
   */
  const notes = (title, className, notes, empty) =>
    panel(title, notes.length ? el('ul', { className }, ...notes.map((note) => el('li', { textContent: noteText(note) }))) : el('p', { className: 'review-empty', textContent: empty }))

  return el(
    'article',
    { className: `review-dossier is-${group}` },
    head,
    marks,
    el(
      'div',
      { className: 'review-notes' },
      notes(t('Points forts'), 'review-strengths', person.strengths, t('Aucun point ne ressort nettement de l’équipe.')),
      notes(t('Points à travailler'), 'review-weaknesses', person.weaknesses, t('Rien de notable : continuer ainsi.')),
    ),
    el(
      'div',
      { className: 'review-panels' },
      panel(t('Mois par mois'), monthChart(person, review.months, review.delivery.hotfixWorth)),
      panel(
        t('Livraison'),
        el(
          'dl',
          {},
          ...figure(t('PR de code ouvertes / mergées'), `${formatNumber(person.code)} / ${formatNumber(person.merged)}`),
          ...figure(
            t('Unités livrées par mois'),
            t('{value} [{low} – {high}]', { value: one(person.deliveredMean), low: one(person.deliveredInterval[0]), high: one(person.deliveredInterval[1]) }),
          ),
          ...figure(
            t('dont TMA / projets / AC / le reste'),
            [person.deliveredParts.tma, person.deliveredParts.projects, person.deliveredParts.acs, person.deliveredParts.rest].map(one).join(' / '),
          ),
          ...(person.hotfixes ? figure(t('Hotfixes mergés par mois'), one(person.hotfixesMean)) : []),
          ...figure(t('PR mergées par mois'), one(person.mergedMean)),
          ...figure(t('Taille médiane d’une PR'), t('{count} lignes', { count: formatNumber(Math.round(person.size ?? 0)) }), {
            mine: person.size,
            team: team.size,
            format: (value) => formatNumber(Math.round(value)),
          }),
          ...figure(t('Lignes ajoutées / supprimées'), `+${formatLines(person.added)} / −${formatLines(person.deleted)}`),
          ...figure(t('Projets / AC'), `${person.projects} / ${person.acs}`),
          ...(person.hotfixes
            ? figure(t('Hotfix : délai de merge médian'), formatDuration(person.hotfixMergeHours), {
                mine: person.hotfixMergeHours,
                team: team.hotfixMergeHours,
                format: formatDuration,
              })
            : []),
        ),
      ),
      panel(
        t('Flux et review'),
        el(
          'dl',
          {},
          ...figure(t('Délai de merge médian'), formatDuration(person.mergeHours), { mine: person.mergeHours, team: team.mergeHours, format: formatDuration }),
          ...figure(t('Attente de la première review'), formatDuration(person.firstReviewHours), {
            mine: person.firstReviewHours,
            team: team.firstReviewHours,
            format: formatDuration,
          }),
          ...figure(t('Mergées sans review'), formatShare(person.unreviewedShare)),
          ...figure(t('Fermées sans merge'), formatShare(person.closedShare), { mine: person.closedShare, team: team.closedShare, format: formatShare }),
          ...figure(t('PR des autres relues'), t('{count} ({month} par mois)', { count: formatNumber(person.reviewed), month: formatNumber(Math.round(person.reviewsMean)) })),
          ...figure(t('Approbations sans commentaire'), formatShare(person.silentShare)),
          ...figure(t('Avec remarque ou changements demandés'), t('{count} ({share})', { count: formatNumber(person.remarked), share: formatShare(person.remarkedShare) }), {
            mine: person.remarkedShare,
            team: team.remarkedShare,
            lowerIsBetter: false,
            format: formatShare,
          }),
          ...figure(t('Réactivité en review'), formatDuration(person.reviewHours), { mine: person.reviewHours, team: team.reviewHours, format: formatDuration }),
          ...figure(t('PR des autres mergées'), formatNumber(person.mergesOfOthers)),
        ),
      ),
      panel(
        t('Poids dans l’équipe'),
        el(
          'dl',
          {},
          ...figure(t('Part du code livré'), formatShare(person.codeShare)),
          ...figure(t('Part des reviews'), formatShare(person.reviewShare)),
          ...figure(t('Part de la TMA'), formatShare(person.hotfixTeamShare)),
          ...figure(t('Dépôts réguliers (5 PR et plus)'), formatNumber(person.breadth)),
        ),
        ...(person.reviewedMost.length
          ? [el('p', { className: 'review-small', textContent: t('Relit le plus : {people}.', { people: person.reviewedMost.map((author) => `${displayName(author.login)} (${formatShare(author.share)})`).join(', ') }) })]
          : []),
        ...(person.dependents.length
          ? [el('p', { className: 'review-small', textContent: t('Relit au moins 30 % des PR de : {people}.', { people: person.dependents.map((dependent) => `${displayName(dependent.login)} (${formatShare(dependent.share)})`).join(', ') }) })]
          : []),
        ...(person.owned.length
          ? [el('p', { className: 'review-small', textContent: t('Repère de : {repos}.', { repos: person.owned.map((owned) => `${owned.repo} (${formatShare(owned.share)})`).join(', ') }) })]
          : []),
        el('h4', { textContent: t('Où va son effort') }),
        effortBar(effort),
      ),
      panel(
        t('Rythme de travail'),
        el(
          'dl',
          {},
          ...figure(t('Jours ouvrés actifs'), t('{days} sur {available} ({share})', { days: person.activeDays, available: person.availableDays, share: formatShare(person.presence) })),
          ...figure(t('Dans les heures ouvrées'), formatShare(rhythm.work)),
          ...figure(t('Tôt ou tard / nuit / week-end'), `${formatShare(rhythm.edges)} / ${formatShare(rhythm.night)} / ${formatShare(rhythm.weekend)}`),
          ...figure(t('Journée type sur GitHub'), day),
          ...figure(t('Livré par jour actif'), t('{count} unités', { count: formatDecimal(Math.round(person.deliveredPerDay * 100) / 100) })),
        ),
        weekChart(person),
        el('p', { className: 'review-small', textContent: t('Cases cerclées : de 9 h à 18 h, du lundi au vendredi. Plus une case est foncée, plus il y a d’actions (PR, reviews, merges).') }),
      ),
    ),
  )
}

// When a person's working day starts and ends on GitHub: the hours of the weekdays between which nine of their actions
// in ten fall.
/** @param {ReviewedPerson} person */
function typedDay(person) {
  const weekdays = person.rhythm.grid.slice(0, 5)
  const hours = Array.from({ length: 24 }, (_, hour) => weekdays.reduce((total, day) => total + day[hour], 0))
  const total = hours.reduce((sum, count) => sum + count, 0)
  if (!total) {
    return '–'
  }
  // The hours between which nine actions in ten fall.
  let seen = 0
  let start = 0
  while (seen + hours[start] <= total * 0.05) {
    seen += hours[start++]
  }
  seen = 0
  let end = 23
  while (seen + hours[end] <= total * 0.05) {
    seen += hours[end--]
  }

  return `${clock(start)} → ${clock(end + 1)}`
}
