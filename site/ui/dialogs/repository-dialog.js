// The dialog of a repository, and the figures of a repository (card and dialog).

import { formatDecimal, formatDuration, formatLines, formatNumber, formatShare } from '../../lib/format.js'
import { inTeam } from '../../model/people.js'
import { CATEGORIES } from '../../model/repositories.js'
import { repositoryRows } from '../../model/repository-rows.js'
import { periodTitle } from '../../model/selection.js'
import { state } from '../../model/state.js'
import { MIN_PEERS, PERSON_TOP } from '../../model/team.js'
import { el } from '../dom.js'
import { technologyIcon } from '../icons.js'
import { githubPill, githubUrl, OPEN_REPOSITORY } from '../links.js'
import { formatTechnologyShare, repoTypeTag } from '../tables/cells.js'
import { dialogSection, showCardDialog, statList, topList } from './card-dialog.js'

// The figures of a repository over the period, on its card and in its dialog. Their hints make the legend under the
// cards.
export const REPOSITORY_FIGURES = {
  code: { key: 'code', label: 'PR de code', hint: 'PR ouvertes sur la période, hors release et synchronisation de branches.' },
  merged: { key: 'merged', label: 'Mergées', hint: 'Parmi ces PR, celles qui ont été mergées.' },
  authors: { key: 'authors', label: 'Auteurs', hint: 'Personnes qui ont ouvert ces PR, parties comprises.' },
  medianSize: { key: 'medianSize', label: 'Taille médiane', hint: 'Lignes ajoutées et supprimées des PR mergées.' },
  added: { key: 'added', label: 'Lignes ajoutées', format: formatLines, hint: 'Total des lignes ajoutées par les PR mergées.' },
  deleted: { key: 'deleted', label: 'Lignes supprimées', format: formatLines, hint: 'Total des lignes supprimées par les PR mergées.' },
  unreviewedRate: {
    key: 'unreviewedRate',
    label: 'Sans review',
    format: formatShare,
    hint: 'Part des PR mergées sans review ni commentaire d’une autre personne que l’auteur.',
  },
  hotfixes: { key: 'hotfixes', label: 'Hotfix', hint: 'PR de code ouvertes sur la période depuis une branche qui commence par hotfix.' },
  reviewers: { key: 'reviewers', label: 'Relecteurs', hint: 'Personnes intervenues sur des PR de code du dépôt sur la période.' },
  reviewed: { key: 'reviewed', label: 'PR relues', hint: 'PR du dépôt avec une review ou un commentaire sur la période.' },
  medianTimeToFirstReviewHours: {
    key: 'medianTimeToFirstReviewHours',
    label: '1re review',
    format: formatDuration,
    hint: 'Médiane, de la création à la première review ou au premier commentaire d’une autre personne.',
  },
  medianTimeToMergeHours: { key: 'medianTimeToMergeHours', label: 'Merge en', format: formatDuration, hint: 'Médiane, de la création au merge.' },
  commentsPerPr: {
    key: 'commentsPerPr',
    label: 'Comm. / PR',
    format: formatDecimal,
    hint: 'Commentaires dans le code, commentaires généraux et reviews « commentaire », par PR relue.',
  },
  silentApprovalRate: {
    key: 'silentApprovalRate',
    label: 'Approb. sans comm.',
    format: formatShare,
    hint: 'Part des approbations données sans laisser de commentaire.',
  },
  deployments: {
    key: 'deployments',
    label: 'Déploiements',
    hint: 'PR mergées dans master ou main sur la période : releases, hotfix et merges directs.',
  },
  medianLeadTimeHours: {
    key: 'medianLeadTimeHours',
    label: 'Jusqu’en prod',
    format: formatDuration,
    hint: 'Médiane, de l’ouverture d’une PR de code à son arrivée en prod, pour celles arrivées sur la période.',
  },
  reworkRate: { key: 'reworkRate', label: 'Taux de reprise', format: formatShare, hint: 'Part des déploiements qui sont des correctifs : hotfix ou revert.' },
  ciRuns: { key: 'ciRuns', label: 'Exécutions CI', hint: 'Exécutions GitHub Actions sur des PR ou des push qui ont abouti à un verdict.' },
  ciFailureRate: { key: 'ciFailureRate', label: 'CI en échec', format: formatShare, hint: 'Part de ces exécutions en échec.' },
  ciRerunRate: { key: 'ciRerunRate', label: 'CI relancée', format: formatShare, hint: 'Part de ces exécutions relancées au moins une fois.' },
}
export const repositoryFigures = (...keys) => keys.map((key) => REPOSITORY_FIGURES[key])

const REPOSITORY_WRITTEN = repositoryFigures('code', 'merged', 'authors', 'medianSize', 'added', 'deleted', 'unreviewedRate', 'hotfixes')
const REPOSITORY_REVIEWED = repositoryFigures(
  'reviewers',
  'reviewed',
  'medianTimeToFirstReviewHours',
  'medianTimeToMergeHours',
  'commentsPerPr',
  'silentApprovalRate',
)
const REPOSITORY_DELIVERED = repositoryFigures('deployments', 'medianLeadTimeHours', 'reworkRate', 'ciRuns', 'ciFailureRate', 'ciRerunRate')
// Explained in the legend under the cards, with the figures.
export const BUS_FACTOR_LEGEND = {
  label: 'Bus factor',
  hint: 'Le plus petit nombre de personnes de l’équipe qui ont écrit à elles seules au moins la moitié des PR de code du dépôt sur la période : à 1, le dépôt repose sur une seule personne. « Auteurs partis » : celles encore là en ont écrit moins de la moitié.',
}

// The dialog of a repository, from anywhere. A repository without anything over the period has no dialog: it opens on
// GitHub instead.
export function openRepoOf(repo, opener) {
  const row = repositoryRows({ all: true }).find((other) => other.repo === repo)
  if (row) {
    openRepoDialog(row, opener)
  } else {
    window.open(githubUrl(`${state.stats.org}/${encodeURIComponent(repo)}`), '_blank', 'noopener')
  }
}

// Nothing for a repository without any code pull request.
export function busFactorTag(value) {
  if (value === null) {
    return []
  }

  return [
    el('span', {
      className: value <= 1 ? 'bus-factor is-fragile' : 'bus-factor',
      textContent: value === 0 ? 'Auteurs partis' : `Bus factor ${value}`,
      title: BUS_FACTOR_LEGEND.hint,
    }),
  ]
}

// The dialog of a repository: its figures over the period, each set against the median of the repositories of the same
// type that have such figures, or of all of them when that type has too few; who writes it and who reviews it.
export function openRepoDialog(row, opener) {
  const all = repositoryRows({ all: true })
  const sameType = all.filter((other) => other.category === row.category)
  const peers = sameType.length >= MIN_PEERS ? sameType : all
  const type = CATEGORIES.find((category) => category.key === row.category)
  const peersLabel = peers === all ? 'dépôts' : type.key === 'other' ? 'autres dépôts' : `dépôts ${type.label.toLowerCase()}`
  const technologies = row.technologies.map(([name, share]) => `${name} ${formatTechnologyShare(share)}`).join(' · ')
  const main = row.technologies[0]?.[0]

  showCardDialog(
    [
      el(
        'header',
        { className: 'person-dialog-head' },
        el('span', { className: 'repo-dialog-logo' }, technologyIcon(main, { width: 44, height: 44 })),
        el(
          'div',
          { className: 'person-dialog-identity' },
          el(
            'div',
            { className: 'person-dialog-title' },
            el('h2', { id: 'person-dialog-name', textContent: row.repo, title: row.repo }),
            githubPill(`${state.stats.org}/${encodeURIComponent(row.repo)}`, 'Dépôt GitHub'),
          ),
          el('div', { className: 'person-card-stack' }, repoTypeTag(row.category), ...busFactorTag(row.busFactor)),
          ...(technologies ? [el('p', { className: 'person-dialog-meta', textContent: technologies })] : []),
        ),
      ),
      el('p', {
        className: 'person-dialog-scope',
        textContent: `${periodTitle()} · sous chaque chiffre, la médiane (méd.) des ${formatNumber(peers.length)} ${peersLabel}`,
      }),
      dialogSection('Le code', statList(REPOSITORY_WRITTEN, row, peers.filter((other) => other.code > 0))),
      dialogSection('La revue', statList(REPOSITORY_REVIEWED, row, peers.filter((other) => other.reviewed > 0))),
      dialogSection('La mise en prod', statList(REPOSITORY_DELIVERED, row, peers.filter((other) => other.deployments > 0 || other.ciRuns > 0))),
      dialogSection(
        'Qui l’écrit, qui le relit',
        el(
          'div',
          { className: 'person-dialog-columns is-pair' },
          topList('Ses auteurs', row.writers.filter(inTeam).slice(0, PERSON_TOP), true),
          topList('Ses relecteurs', row.readers.slice(0, PERSON_TOP), true),
        ),
      ),
    ],
    opener,
  )
}

// A repository clicked anywhere opens its dialog (ui/links.js).
export function setupRepositoryDialog() {
  document.addEventListener(OPEN_REPOSITORY, (event) => openRepoOf(/** @type {CustomEvent} */ (event).detail, event.target))
}
