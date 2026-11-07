// The dialog of a person, and the figures of a person (card and dialog).

import {
  formatDecimal,
  formatDuration,
  formatLines,
  formatNumber,
  formatPercent,
  formatShare,
} from '../../lib/format.js'
import { SHOWN_BADGES } from '../../model/badges.js'
import { displayName, isFormer } from '../../model/people.js'
import { topTechnologies } from '../../model/repositories.js'
import { periodTitle } from '../../model/selection.js'
import { state } from '../../model/state.js'
import { personDetails, teamRows } from '../../model/team.js'
import { badgeRow } from '../badges.js'
import { el } from '../dom.js'
import { avatarUrl, githubPill, githubUrl, OPEN_PERSON } from '../links.js'
import { formerText, seniorityText, squadTags, stackLine } from '../people.js'
import { repoFilterLabel, repoOptions } from '../repo-filter.js'
import { dialogSection, showCardDialog, statList, topList } from './card-dialog.js'

// The figures of each person's card on the team page, over the period: what the person wrote, then what they reviewed.
// The hints make the legend under the cards.
export const TEAM_STATS = [
  { key: 'code', label: 'PR de code', hint: 'PR ouvertes sur la période, hors release et synchronisation de branches.' },
  { key: 'merged', label: 'Mergées', hint: 'Parmi ces PR, celles qui ont été mergées.' },
  {
    key: 'medianTimeToMergeHours',
    label: 'Merge en',
    format: formatDuration,
    hint: 'Délai médian de ces PR mergées, de la création au merge.',
  },
  {
    key: 'reviewed',
    label: 'PR relues',
    hint: 'PR de code d’autres personnes avec au moins une review ou un commentaire de sa part sur la période.',
  },
  {
    key: 'commentsPerPr',
    label: 'Comm. / PR',
    format: formatDecimal,
    hint: 'Commentaires dans le code, commentaires généraux et reviews « commentaire », par PR relue.',
  },
  {
    key: 'reviewers',
    label: 'Relecteurs',
    hint: 'Personnes différentes intervenues sur ses PR de code. Peu de relecteurs : son code circule peu.',
  },
]

// The figures of the dialog that opens from a person's card, read from { row, author, reviewer, network }: the row of
// the card, the person's rows of the authors and reviewers tables and their place in the review network, all over the
// repositories selected on the team page. The hints are those of the tables' columns.
const PERSON_WRITTEN = [
  { label: 'PR de code', value: ({ row }) => row.code, hint: TEAM_STATS[0].hint },
  { label: 'Mergées', value: ({ row }) => row.merged, hint: TEAM_STATS[1].hint },
  { label: 'Lignes ajoutées', value: ({ author }) => author?.added, format: formatLines, hint: 'Total des lignes ajoutées par les PR mergées.' },
  { label: 'Lignes supprimées', value: ({ author }) => author?.deleted, format: formatLines, hint: 'Total des lignes supprimées par les PR mergées.' },
  { label: 'Taux de merge', value: ({ author }) => author?.mergeRate, format: formatPercent, hint: 'Mergées / (mergées + fermées sans merge).' },
  { label: 'Merge en', value: ({ row }) => row.medianTimeToMergeHours, format: formatDuration, hint: TEAM_STATS[2].hint },
  {
    label: 'Attente 1re review',
    value: ({ author }) => author?.medianTimeToFirstReviewHours,
    format: formatDuration,
    hint: 'Médiane, de la création à la première review ou au premier commentaire d’une autre personne.',
  },
  {
    label: 'Mergées sans review',
    value: ({ author }) => author?.unreviewedRate,
    format: formatShare,
    hint: 'Part des PR mergées sans review ni commentaire d’une autre personne que l’auteur.',
  },
]

const PERSON_REVIEWED = [
  { label: 'PR relues', value: ({ reviewer }) => reviewer?.prs ?? 0, hint: TEAM_STATS[3].hint },
  { label: 'Comm. / PR', value: ({ reviewer }) => reviewer?.commentsPerPr, format: formatDecimal, hint: TEAM_STATS[4].hint },
  {
    label: 'Approb. sans comm.',
    value: ({ reviewer }) => reviewer?.silentApprovalRate,
    format: formatShare,
    hint: 'Part des PR approuvées sans y laisser de commentaire.',
  },
  { label: 'Modif. demandées', value: ({ reviewer }) => reviewer?.changesRequested, hint: 'Reviews « changements demandés ».' },
  {
    label: 'Merges effectués',
    value: ({ reviewer }) => reviewer?.merges,
    hint: 'PR de code mergées par la personne, les siennes comprises.',
  },
  {
    label: 'Taille relue',
    value: ({ reviewer }) => reviewer?.medianSize,
    hint: 'Taille médiane des PR relues, en lignes ajoutées et supprimées.',
  },
]

// Only in the dialog, but explained in the legend under the cards, "Les chiffres des cartes".
export const DEPENDENCY_STAT = {
  label: 'Dépendance au relecteur principal',
  value: ({ network }) => network?.topReviewerShare,
  format: formatShare,
  hint: 'Dans la fiche d’une personne : part de ses PR relues sur lesquelles intervient son relecteur principal, la personne qui relit le plus son code. Proche de 100 % : son code ne circule qu’entre deux personnes.',
}

const PERSON_CIRCULATION = [
  { label: 'Relecteurs distincts', value: ({ network }) => network?.reviewers, hint: TEAM_STATS[5].hint },
  DEPENDENCY_STAT,
]

export function openPersonDialog(row, opener) {
  const details = personDetails(row)
  const name = displayName(row.login)
  const technologies = topTechnologies(row.stack.technologies)
  const scope = state.repos.team ? `${periodTitle()} · ${repoFilterLabel('team', repoOptions('team'))}` : periodTitle()
  // Each figure is set against the median of the peers it applies to: those who wrote code, or those who reviewed.
  const peers = (keep) => details.peers.details.filter(keep)
  const writers = peers(({ row: other }) => other.code > 0)
  const reviewers = peers(({ row: other }) => other.reviewed > 0)

  showCardDialog(
    [
      el(
        'header',
        { className: 'person-dialog-head' },
        el('img', { className: 'person-dialog-avatar', src: avatarUrl(row.login, 176), alt: '', width: 88, height: 88 }),
        el(
          'div',
          { className: 'person-dialog-identity' },
          el(
            'div',
            { className: 'person-dialog-title' },
            el('h2', { id: 'person-dialog-name', textContent: name, title: name }),
            githubPill(encodeURIComponent(row.login), 'Profil GitHub'),
          ),
          // The login is only worth showing when the display name differs from it.
          ...(name === row.login ? [] : [el('p', { className: 'person-dialog-meta', textContent: row.login })]),
          ...(isFormer(row.login) ? formerText(row.login) : seniorityText('p', 'person-dialog-meta', row.login)),
          stackLine(row.stack),
          ...squadTags(row.login),
          el('p', {
            className: 'person-dialog-meta',
            textContent: technologies.map(([technology, share]) => `${technology} ${formatShare(share)}`).join(' · '),
          }),
        ),
        ...badgeRow(row.login, 'person-dialog-badges', 'large', SHOWN_BADGES),
      ),
      el('p', {
        className: 'person-dialog-scope',
        textContent: `${scope} · sous chaque chiffre, la médiane (méd.) des ${formatNumber(details.peers.details.length)} personnes ${details.peers.label}`,
      }),
      dialogSection('Ce que la personne écrit', statList(PERSON_WRITTEN, details, writers)),
      dialogSection('Ce que la personne relit', statList(PERSON_REVIEWED, details, reviewers)),
      dialogSection(
        'Avec qui, et où',
        statList(PERSON_CIRCULATION, details, writers),
        el(
          'div',
          { className: 'person-dialog-columns' },
          topList('Son code est relu par', details.reviewedBy, true),
          topList('Relit le code de', details.reviews, true),
          topList('Ses dépôts', details.codeRepos, false),
          topList('Dépôts relus', details.reviewer?.topRepos ?? [], false),
        ),
      ),
    ],
    opener,
  )
}

// The dialog of a person, from anywhere. Someone without any figure over the period, such as an author of release pull
// requests only, has no dialog: their GitHub profile opens instead.
export function openPersonOf(login, opener) {
  const row = teamRows({ withFormer: true }).find((other) => other.login === login)
  if (row) {
    openPersonDialog(row, opener)
  } else {
    window.open(githubUrl(encodeURIComponent(login)), '_blank', 'noopener')
  }
}

// A name clicked anywhere opens the dialog of the person (ui/links.js).
export function setupPersonDialog() {
  document.addEventListener(OPEN_PERSON, (event) => openPersonOf(/** @type {CustomEvent} */ (event).detail, event.target))
}
