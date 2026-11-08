// The card of each finding of analyze() (domain/analysis.js): what it says, its evidence (evidence.js), and a lead to
// act on.

import {
  BIG_PR_LINES,
  HUGE_PR_LINES,
  MAIN_REVIEWER_SHARE,
  SLOW_MEDIAN_SECONDS,
  SMALL_PR_LINES,
} from '../../domain/analysis/thresholds.js'
import {
  formatDuration,
  formatLines,
  formatNumber,
  formatSeconds,
  formatShare,
  plural,
  SIZE_LABELS,
} from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { ROUTES } from '../../model/routes.js'
import { el } from '../../ui/dom.js'
import { personLink, repoLink } from '../../ui/links.js'
import {
  driftText,
  findingBars,
  findingChanges,
  findingRows,
  findingStages,
  ratioOf,
  sentence,
  STAGE_FINDINGS,
  strong,
  workflowName,
} from './evidence.js'
import { PROJECT_FINDINGS, PROJECT_RULE_LABELS } from './project-findings.js'

const FINDING_LEVELS = { high: t('Prioritaire'), watch: t('À surveiller'), good: t('En progrès') }

// What each finding of analyze() says from its facts: where it belongs, what it finds, the figures behind it, a lead
// to act on, and the page that details it. A lead, not a verdict: a figure tells where to look, not why.
const FINDINGS = {
  size: {
    area: t('Taille des PR'),
    title: () => t('Les grosses PR attendent plus, et sont moins relues'),
    text: ({ small, big, ratio, bigShare }) => {
      const pickups = { big: formatDuration(big.pickupHours), small: formatDuration(small.pickupHours) }

      return [
        ...sentence('Relues, les PR de {big} lignes ou plus mettent {bigMerge} à être mergées, contre {smallMerge} sous {small} lignes : {ratio} fois plus.', {
          big: formatNumber(BIG_PR_LINES),
          bigMerge: strong(formatDuration(big.timeToMergeHours)),
          smallMerge: strong(formatDuration(small.timeToMergeHours)),
          small: formatNumber(SMALL_PR_LINES),
          ratio: ratioOf(ratio),
        }),
        ' ',
        big.commentsPer100Lines > 0 && small.commentsPer100Lines > big.commentsPer100Lines
          ? t('Leur première review arrive au bout de {big}, au lieu de {small}, et elles reçoivent {ratio} fois moins de commentaires par ligne.', {
              ...pickups,
              ratio: ratioOf(small.commentsPer100Lines / big.commentsPer100Lines),
            })
          : t('Leur première review arrive au bout de {big}, au lieu de {small}.', pickups),
        ' ',
        t('Elles font {share} des PR mergées.', { share: formatShare(bigShare) }),
      ]
    },
    evidence: ({ buckets }) =>
      findingBars(
        t('Délai médian de merge des PR relues, selon leur taille'),
        buckets.flatMap((bucket, index) =>
          bucket.prs ? [{ label: t('{size} lignes', { size: SIZE_LABELS[index] }), value: bucket.timeToMergeHours, text: formatDuration(bucket.timeToMergeHours) }] : [],
        ),
      ),
    action: () =>
      t('Découper le travail : une PR par intention, et à part les refactorings, les renommages et les fichiers générés. Sous {lines} lignes, une PR se relit d’une traite.', {
        lines: formatNumber(BIG_PR_LINES),
      }),
    route: 'cycle',
  },
  bottleneck: {
    area: t('Cycle de vie'),
    title: ({ stage }) => STAGE_FINDINGS[stage].title,
    text: ({ stage, share, stageHours, toMergeHours }) =>
      sentence('En moyenne, {share} du temps d’une PR relue, de son ouverture à son merge, se passe {where} : {hours} en médiane, pour {toMerge} de l’ouverture au merge.', {
        share: strong(formatShare(share)),
        where: STAGE_FINDINGS[stage].where,
        hours: formatDuration(stageHours),
        toMerge: strong(formatDuration(toMergeHours)),
      }),
    evidence: ({ shares, repositories }) => [
      findingStages(shares),
      repositories.length
        ? findingRows(
            t('Les dépôts où cette étape dure le plus'),
            repositories.map(({ repo, hours }) => ({ name: repoLink(repo), figures: t('{value} en médiane', { value: formatDuration(hours) }) })),
          )
        : null,
    ],
    action: ({ stage }) => STAGE_FINDINGS[stage].action,
    route: 'cycle',
  },
  drift: {
    area: t('Tendance'),
    title: () => t('Ce qui se dégrade'),
    text: driftText,
    evidence: ({ metrics }) => findingChanges(metrics),
    action: () => t('Chercher ce qui a changé entre les deux moitiés : un projet, des arrivées, une échéance. Le bilan du mois montre quand.'),
    route: 'report',
  },
  hugeUnreviewed: {
    area: t('Revue'),
    title: () => t('Des PR géantes mergées sans review'),
    text: ({ prs, share, othersShare, ratio, lines, authors }) => {
      const values = {
        share: strong(formatShare(share)),
        lines: formatNumber(HUGE_PR_LINES),
        prs: plural(prs, 'PR', 'PR'),
        total: formatLines(lines),
        authors: plural(authors, 'personne'),
      }

      return ratio === null
        ? sentence('{share} des PR de {lines} lignes ou plus sont mergées sans aucune review ni commentaire, quand toutes les autres sont relues : {prs}, {total} lignes, écrites par {authors}.', values)
        : sentence('{share} des PR de {lines} lignes ou plus sont mergées sans aucune review ni commentaire, {often} que les autres ({others}) : {prs}, {total} lignes, écrites par {authors}.', {
            ...values,
            often: strong(t('{ratio} fois plus souvent', { ratio: ratioOf(ratio) })),
            others: formatShare(othersShare),
          })
    },
    evidence: ({ repositories }) =>
      findingRows(
        t('Les dépôts qui en comptent le plus'),
        repositories.map(({ repo, prs }) => ({ name: repoLink(repo), figures: plural(prs, 'PR', 'PR') })),
      ),
    action: () =>
      t('Regarder ce qu’elles contiennent : du code généré ou des données gagnent à être produits en CI ou rangés à part ; du vrai code mérite au moins une approbation, qu’une règle de branche peut exiger.'),
    route: 'repositories',
  },
  mainReviewer: {
    area: t('Revue'),
    title: () => t('Des dépôts suspendus à un relecteur'),
    text: ({ count, people }) => [
      ...sentence('Sur {count}, une seule personne intervient sur au moins {share} des PR relues', {
        count: plural(count, 'dépôt'),
        share: strong(formatShare(MAIN_REVIEWER_SHARE)),
      }),
      people[0].repositories > 1 && count > people[0].repositories ? t(', la même sur {count} d’entre eux', { count: formatNumber(people[0].repositories) }) : '',
      people.length === 1 && count > 1 ? t(', toujours la même') : '',
      t(' : quand elle s’absente, les reviews attendent.'),
    ],
    evidence: ({ repositories }) =>
      findingRows(
        t('Le dépôt, la personne, la part des PR relues où elle intervient'),
        repositories.map(({ repo, reviewer, share, reviewed }) => ({
          name: repoLink(repo),
          figures: [personLink(reviewer), ' ', t('{share} de {count}', { share: formatShare(share), count: formatNumber(reviewed) })],
        })),
      ),
    action: () =>
      t('Associer un second relecteur à ces dépôts : en binôme sur quelques PR, puis en relais. Une équipe comme code owner, plutôt qu’une personne, répartit les demandes.'),
    route: 'collaboration',
  },
  unreviewedRepositories: {
    area: t('Revue'),
    title: () => t('Des dépôts mergés sans review'),
    text: ({ count }) => [
      count > 1
        ? t('{count} dépôts mergent plus de la moitié de leurs PR de code sans aucune review ni commentaire.', { count: formatNumber(count) })
        : t('Un dépôt merge plus de la moitié de ses PR de code sans aucune review ni commentaire.'),
    ],
    evidence: ({ repositories }) =>
      findingRows(
        t('Part des PR mergées sans review'),
        repositories.map(({ repo, merged, share, authors }) => ({
          name: repoLink(repo),
          figures: t('{share} de {count}, {authors}', { share: formatShare(share), count: formatNumber(merged), authors: plural(authors, 'auteur') }),
        })),
      ),
    action: () =>
      t('Exiger une approbation par une règle de branche ; ou, pour un dépôt personnel, outil ou documentation, le décider en connaissance de cause.'),
    route: 'repositories',
  },
  failingWorkflows: {
    area: t('Intégration continue'),
    title: () => t('Des workflows qui échouent souvent'),
    text: ({ count, checked }) => [
      count > 1
        ? t('{count} workflows sur {checked} échouent au moins une fois sur cinq.', { count: formatNumber(count), checked: formatNumber(checked) })
        : t('Un workflow sur {checked} échoue au moins une fois sur cinq.', { checked: formatNumber(checked) }),
    ],
    evidence: ({ workflows }) =>
      findingRows(
        t('Ceux qui échouent le plus'),
        workflows.map((workflow) => ({
          name: workflowName(workflow),
          figures: t('{share} de {runs} exécutions', { share: formatShare(workflow.failureRate), runs: formatNumber(workflow.runs) }),
        })),
      ),
    action: () => t('Un échec si fréquent tient d’un job cassé ou de tests instables : le réparer, ou le désactiver, pour qu’un check rouge redevienne un signal.'),
    route: 'devops',
  },
  slowWorkflows: {
    area: t('Intégration continue'),
    title: () => t('Des workflows lents'),
    text: ({ count, checked }) => {
      const values = { count: formatNumber(count), checked: formatNumber(checked), duration: formatSeconds(SLOW_MEDIAN_SECONDS) }

      return [
        count > 1
          ? t('{count} workflows sur {checked} prennent {duration} ou plus en médiane : autant d’attente à chaque push.', values)
          : t('Un workflow sur {checked} prend {duration} ou plus en médiane : autant d’attente à chaque push.', values),
      ]
    },
    evidence: ({ workflows }) =>
      findingRows(
        t('Les plus lents, en médiane'),
        workflows.map((workflow) => ({
          name: workflowName(workflow),
          figures: t('{duration} sur {runs} exécutions', { duration: formatSeconds(workflow.medianSeconds), runs: formatNumber(workflow.runs) }),
        })),
      ),
    action: () => t('Mettre en cache les dépendances, paralléliser les tests, ne lancer que les jobs que le changement concerne.'),
    route: 'devops',
  },
  abandoned: {
    area: t('Livraison'),
    title: () => t('Du travail abandonné'),
    text: ({ prs, share, medianLines, mergedMedianLines }) =>
      sentence('{share} des PR de code ouvertes sur la période ont été fermées sans merge, soit {prs}, d’une taille médiane de {lines} lignes, contre {merged} pour les PR mergées.', {
        share: strong(formatShare(share)),
        prs: plural(prs, 'PR', 'PR'),
        lines: formatNumber(medianLines),
        merged: formatNumber(mergedMedianLines),
      }),
    action: () => t('Une grosse PR abandonnée est souvent un travail parti loin sans retour : l’ouvrir tôt en brouillon, pour en parler avant.'),
    route: 'authors',
  },
  ...PROJECT_FINDINGS,
  progress: {
    area: t('Tendance'),
    title: () => t('Ce qui s’améliore'),
    text: driftText,
    evidence: ({ metrics }) => findingChanges(metrics),
    action: () => t('Ce qui a changé entre les deux moitiés mérite d’être su, pour le garder.'),
    route: 'report',
  },
}

// Each rule, in the list of those that found nothing.
export const RULE_LABELS = {
  size: t('Taille des PR et délai de merge'),
  bottleneck: t('Étape qui retient les PR avant leur merge'),
  drift: t('Ce qui se dégrade d’une moitié de la période à l’autre'),
  hugeUnreviewed: t('PR géantes mergées sans review'),
  mainReviewer: t('Dépôts suspendus à un relecteur'),
  unreviewedRepositories: t('Dépôts mergés sans review'),
  failingWorkflows: t('Workflows qui échouent souvent'),
  slowWorkflows: t('Workflows lents'),
  abandoned: t('PR fermées sans merge'),
  ...PROJECT_RULE_LABELS,
  progress: t('Ce qui s’améliore'),
}

export function findingCard(finding) {
  const view = FINDINGS[finding.key]
  const route = ROUTES[view.route]

  return el(
    'article',
    { className: `card finding is-${finding.level}` },
    el(
      'div',
      { className: 'finding-head' },
      el('span', { className: 'finding-area', textContent: view.area }),
      el('span', { className: `finding-level is-${finding.level}`, textContent: FINDING_LEVELS[finding.level] }),
    ),
    el('h2', { className: 'finding-title', textContent: view.title(finding) }),
    el('p', { className: 'finding-text' }, ...view.text(finding)),
    ...[view.evidence?.(finding)].flat().filter(Boolean),
    el('p', { className: 'finding-action' }, strong(t('Piste')), ` ${view.action(finding)}`),
    el('a', { className: 'finding-link', href: route.hash, textContent: t('Voir la page {title}', { title: route.title }) }),
  )
}
