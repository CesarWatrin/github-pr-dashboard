// The card of each finding of analyze() (domain/analysis.js): what it says, its evidence, and a lead to act on.

import {
  BIG_PR_LINES,
  HUGE_PR_LINES,
  MAIN_REVIEWER_SHARE,
  SLOW_MEDIAN_SECONDS,
  SMALL_PR_LINES,
} from '../../domain/analysis.js'
import { parisDay } from '../../domain/time.js'
import { dayDate } from '../../lib/dates.js'
import {
  dayMonthFormat,
  formatDecimal,
  formatDuration,
  formatLines,
  formatNumber,
  formatSeconds,
  formatShare,
  plural,
  SIZE_LABELS,
} from '../../lib/format.js'
import { CYCLE_STAGES } from '../../model/cycle.js'
import { ROUTES } from '../../model/routes.js'
import { renderLegend } from '../../ui/charts/legend.js'
import { el } from '../../ui/dom.js'
import { personLink, repoLink } from '../../ui/links.js'

const FINDING_LEVELS = { high: 'Prioritaire', watch: 'À surveiller', good: 'En progrès' }
const strong = (text) => el('strong', { textContent: text })
const times = (ratio) => `${formatDecimal(Math.round(ratio * 10) / 10)} fois`

// Where the time goes before the merge, for the finding about the stage that takes the most of it.
const STAGE_FINDINGS = {
  pickup: {
    title: 'Les PR attendent leur première review',
    where: 'à attendre une première review',
    action: 'Des créneaux de review dans la journée, ou une rotation de relecteurs, pour qu’une PR trouve vite quelqu’un.',
  },
  review: {
    title: 'La relecture traîne',
    where: 'en relecture, de la première intervention à l’approbation',
    action: 'Des PR plus petites et mieux décrites ; pour les plus grosses, une relecture à deux, en direct.',
  },
  merge: {
    title: 'Les PR approuvées attendent leur merge',
    where: 'entre l’approbation et le merge',
    action: 'Merger dès l’approbation, ou activer l’auto-merge de GitHub.',
  },
}

// The figures that can drift from one half of the period to the other, as the page names them.
const DRIFT_FIGURES = {
  medianSize: { label: 'Taille médiane des PR', format: (value) => `${formatNumber(value)} lignes` },
  pickupHours: { label: 'Attente médiane de la 1re review', format: formatDuration },
  timeToMergeHours: { label: 'Délai médian de merge', format: formatDuration },
  unreviewedShare: { label: 'Mergées sans review', format: formatShare },
  hotfixShare: { label: 'Part de hotfix', format: formatShare },
  checksFailedShare: { label: 'Mergées avec un check rouge', format: formatShare },
}

// A few values side by side, their figure at the end of each bar: small enough not to need a chart.
function findingBars(caption, rows) {
  const max = Math.max(0, ...rows.map((row) => row.value ?? 0)) || 1

  return el(
    'figure',
    { className: 'finding-figure' },
    el('figcaption', { textContent: caption }),
    el(
      'ul',
      { className: 'finding-bars' },
      ...rows.map((row) => {
        const fill = el('span')
        fill.style.width = `${((row.value ?? 0) / max) * 100}%`

        return el(
          'li',
          {},
          el('span', { className: 'finding-bar-label', textContent: row.label }),
          el('span', { className: 'finding-bar' }, fill),
          el('span', { className: 'finding-bar-value', textContent: row.text }),
        )
      }),
    ),
  )
}

// Repositories, workflows or people, each with its figures: name and figures are text or nodes.
function findingRows(caption, rows) {
  return el(
    'figure',
    { className: 'finding-figure' },
    el('figcaption', { textContent: caption }),
    el(
      'ul',
      { className: 'finding-rows' },
      ...rows.map(({ name, figures }) =>
        el('li', {}, el('span', { className: 'finding-row-name' }, ...[name].flat()), el('span', { className: 'finding-row-figures' }, ...[figures].flat())),
      ),
    ),
  )
}

// A workflow: its repository, which opens its dialog, then its name.
const workflowName = ({ repo, workflow }) => [repoLink(repo), el('span', { className: 'finding-workflow', textContent: workflow, title: workflow })]

// The share of each stage in the time of a pull request up to its merge, in one bar cut like those of the cycle page.
function findingStages(shares) {
  const stages = CYCLE_STAGES.filter((stage) => stage.key in shares)
  const bar = el('div', { className: 'finding-stack' })
  bar.setAttribute('role', 'img')
  bar.setAttribute('aria-label', stages.map((stage) => `${stage.label.toLowerCase()} ${formatShare(shares[stage.key])}`).join(', '))
  for (const stage of stages) {
    const part = el('span', { title: `${stage.label} : ${formatShare(shares[stage.key])}` })
    part.style.flexGrow = shares[stage.key]
    part.style.background = stage.color
    bar.append(part)
  }
  const legend = el('div', { className: 'legend' })
  renderLegend(
    legend,
    stages.map((stage) => ({ color: stage.color, label: `${stage.label} ${formatShare(shares[stage.key])}` })),
  )

  return el('figure', { className: 'finding-figure' }, el('figcaption', { textContent: 'Part de chaque étape jusqu’au merge, en moyenne' }), bar, legend)
}

function findingChanges(metrics) {
  return el(
    'ul',
    { className: 'finding-changes' },
    ...metrics.map(({ key, before, after }) => {
      const { label, format } = DRIFT_FIGURES[key]

      return el('li', {}, el('span', { textContent: label }), el('span', { className: 'finding-change' }, `${format(before)} → `, strong(format(after))))
    }),
  )
}

// The first day of a month reads « 1er ».
const dayInText = (time) => dayMonthFormat.format(dayDate(parisDay(time))).replace(/^1 /, '1er ')

const driftText = ({ middle }) => [
  `La seconde moitié de la période, depuis le ${dayInText(middle)}, comparée à la première. La dernière semaine reste à part : ses PR ne sont pas encore toutes relues ou mergées.`,
]

// What each finding of analyze() says from its facts: where it belongs, what it finds, the figures behind it, a lead
// to act on, and the page that details it. A lead, not a verdict: a figure tells where to look, not why.
const FINDINGS = {
  size: {
    area: 'Taille des PR',
    title: () => 'Les grosses PR attendent plus, et sont moins relues',
    text: ({ small, big, ratio, bigShare }) => [
      `Relues, les PR de ${formatNumber(BIG_PR_LINES)} lignes ou plus mettent `,
      strong(formatDuration(big.timeToMergeHours)),
      ` à être mergées, contre `,
      strong(formatDuration(small.timeToMergeHours)),
      ` sous ${formatNumber(SMALL_PR_LINES)} lignes : ${times(ratio)} plus. Leur première review arrive au bout de ${formatDuration(big.pickupHours)}, au lieu de ${formatDuration(small.pickupHours)}`,
      big.commentsPer100Lines > 0 && small.commentsPer100Lines > big.commentsPer100Lines
        ? `, et elles reçoivent ${times(small.commentsPer100Lines / big.commentsPer100Lines)} moins de commentaires par ligne.`
        : '.',
      ` Elles font ${formatShare(bigShare)} des PR mergées.`,
    ],
    evidence: ({ buckets }) =>
      findingBars(
        'Délai médian de merge des PR relues, selon leur taille',
        buckets.flatMap((bucket, index) =>
          bucket.prs ? [{ label: `${SIZE_LABELS[index]} lignes`, value: bucket.timeToMergeHours, text: formatDuration(bucket.timeToMergeHours) }] : [],
        ),
      ),
    action: () =>
      `Découper le travail : une PR par intention, et à part les refactorings, les renommages et les fichiers générés. Sous ${formatNumber(BIG_PR_LINES)} lignes, une PR se relit d’une traite.`,
    route: 'cycle',
  },
  bottleneck: {
    area: 'Cycle de vie',
    title: ({ stage }) => STAGE_FINDINGS[stage].title,
    text: ({ stage, share, stageHours, toMergeHours }) => [
      'En moyenne, ',
      strong(formatShare(share)),
      ` du temps d’une PR relue, de son ouverture à son merge, se passe ${STAGE_FINDINGS[stage].where} : ${formatDuration(stageHours)} en médiane, pour `,
      strong(formatDuration(toMergeHours)),
      ' de l’ouverture au merge.',
    ],
    evidence: ({ shares, repositories }) => [
      findingStages(shares),
      repositories.length
        ? findingRows(
            'Les dépôts où cette étape dure le plus',
            repositories.map(({ repo, hours }) => ({ name: repoLink(repo), figures: `${formatDuration(hours)} en médiane` })),
          )
        : null,
    ],
    action: ({ stage }) => STAGE_FINDINGS[stage].action,
    route: 'cycle',
  },
  drift: {
    area: 'Tendance',
    title: () => 'Ce qui se dégrade',
    text: driftText,
    evidence: ({ metrics }) => findingChanges(metrics),
    action: () => 'Chercher ce qui a changé entre les deux moitiés : un projet, des arrivées, une échéance. Le bilan du mois montre quand.',
    route: 'report',
  },
  hugeUnreviewed: {
    area: 'Revue',
    title: () => 'Des PR géantes mergées sans review',
    text: ({ prs, share, othersShare, ratio, lines, authors }) => [
      strong(formatShare(share)),
      ` des PR de ${formatNumber(HUGE_PR_LINES)} lignes ou plus sont mergées sans aucune review ni commentaire, `,
      ratio === null ? 'quand toutes les autres sont relues' : strong(`${times(ratio)} plus souvent`),
      ratio === null ? '' : ` que les autres (${formatShare(othersShare)})`,
      ` : ${plural(prs, 'PR', 'PR')}, ${formatLines(lines)} lignes, écrites par ${plural(authors, 'personne')}.`,
    ],
    evidence: ({ repositories }) =>
      findingRows(
        'Les dépôts qui en comptent le plus',
        repositories.map(({ repo, prs }) => ({ name: repoLink(repo), figures: plural(prs, 'PR', 'PR') })),
      ),
    action: () =>
      'Regarder ce qu’elles contiennent : du code généré ou des données gagnent à être produits en CI ou rangés à part ; du vrai code mérite au moins une approbation, qu’une règle de branche peut exiger.',
    route: 'repositories',
  },
  mainReviewer: {
    area: 'Revue',
    title: () => 'Des dépôts suspendus à un relecteur',
    text: ({ count, people }) => [
      `Sur ${plural(count, 'dépôt')}, une seule personne intervient sur au moins `,
      strong(formatShare(MAIN_REVIEWER_SHARE)),
      ' des PR relues',
      people[0].repositories > 1 && count > people[0].repositories ? `, la même sur ${formatNumber(people[0].repositories)} d’entre eux` : '',
      people.length === 1 && count > 1 ? ', toujours la même' : '',
      ' : quand elle s’absente, les reviews attendent.',
    ],
    evidence: ({ repositories }) =>
      findingRows(
        'Le dépôt, la personne, la part des PR relues où elle intervient',
        repositories.map(({ repo, reviewer, share, reviewed }) => ({
          name: repoLink(repo),
          figures: [personLink(reviewer), ` ${formatShare(share)} de ${formatNumber(reviewed)}`],
        })),
      ),
    action: () =>
      'Associer un second relecteur à ces dépôts : en binôme sur quelques PR, puis en relais. Une équipe comme code owner, plutôt qu’une personne, répartit les demandes.',
    route: 'collaboration',
  },
  unreviewedRepositories: {
    area: 'Revue',
    title: () => 'Des dépôts mergés sans review',
    text: ({ count }) => [
      count > 1
        ? `${formatNumber(count)} dépôts mergent plus de la moitié de leurs PR de code sans aucune review ni commentaire.`
        : 'Un dépôt merge plus de la moitié de ses PR de code sans aucune review ni commentaire.',
    ],
    evidence: ({ repositories }) =>
      findingRows(
        'Part des PR mergées sans review',
        repositories.map(({ repo, merged, share, authors }) => ({
          name: repoLink(repo),
          figures: `${formatShare(share)} de ${formatNumber(merged)}, ${plural(authors, 'auteur')}`,
        })),
      ),
    action: () =>
      'Exiger une approbation par une règle de branche ; ou, pour un dépôt personnel, outil ou documentation, le décider en connaissance de cause.',
    route: 'repositories',
  },
  failingWorkflows: {
    area: 'Intégration continue',
    title: () => 'Des workflows qui échouent souvent',
    text: ({ count, checked }) => [
      count > 1 ? `${formatNumber(count)} workflows sur ${formatNumber(checked)} échouent` : `Un workflow sur ${formatNumber(checked)} échoue`,
      ' au moins une fois sur cinq.',
    ],
    evidence: ({ workflows }) =>
      findingRows(
        'Ceux qui échouent le plus',
        workflows.map((workflow) => ({
          name: workflowName(workflow),
          figures: `${formatShare(workflow.failureRate)} de ${formatNumber(workflow.runs)} exécutions`,
        })),
      ),
    action: () => 'Un échec si fréquent tient d’un job cassé ou de tests instables : le réparer, ou le désactiver, pour qu’un check rouge redevienne un signal.',
    route: 'devops',
  },
  slowWorkflows: {
    area: 'Intégration continue',
    title: () => 'Des workflows lents',
    text: ({ count, checked }) => [
      count > 1 ? `${formatNumber(count)} workflows sur ${formatNumber(checked)} prennent` : `Un workflow sur ${formatNumber(checked)} prend`,
      ` ${formatSeconds(SLOW_MEDIAN_SECONDS)} ou plus en médiane : autant d’attente à chaque push.`,
    ],
    evidence: ({ workflows }) =>
      findingRows(
        'Les plus lents, en médiane',
        workflows.map((workflow) => ({
          name: workflowName(workflow),
          figures: `${formatSeconds(workflow.medianSeconds)} sur ${formatNumber(workflow.runs)} exécutions`,
        })),
      ),
    action: () => 'Mettre en cache les dépendances, paralléliser les tests, ne lancer que les jobs que le changement concerne.',
    route: 'devops',
  },
  abandoned: {
    area: 'Livraison',
    title: () => 'Du travail abandonné',
    text: ({ prs, share, medianLines, mergedMedianLines }) => [
      strong(formatShare(share)),
      ` des PR de code ouvertes sur la période ont été fermées sans merge, soit ${plural(prs, 'PR', 'PR')}, d’une taille médiane de ${formatNumber(medianLines)} lignes, contre ${formatNumber(mergedMedianLines)} pour les PR mergées.`,
    ],
    action: () => 'Une grosse PR abandonnée est souvent un travail parti loin sans retour : l’ouvrir tôt en brouillon, pour en parler avant.',
    route: 'authors',
  },
  progress: {
    area: 'Tendance',
    title: () => 'Ce qui s’améliore',
    text: driftText,
    evidence: ({ metrics }) => findingChanges(metrics),
    action: () => 'Ce qui a changé entre les deux moitiés mérite d’être su, pour le garder.',
    route: 'report',
  },
}

// Each rule, in the list of those that found nothing.
export const RULE_LABELS = {
  size: 'Taille des PR et délai de merge',
  bottleneck: 'Étape qui retient les PR avant leur merge',
  drift: 'Ce qui se dégrade d’une moitié de la période à l’autre',
  hugeUnreviewed: 'PR géantes mergées sans review',
  mainReviewer: 'Dépôts suspendus à un relecteur',
  unreviewedRepositories: 'Dépôts mergés sans review',
  failingWorkflows: 'Workflows qui échouent souvent',
  slowWorkflows: 'Workflows lents',
  abandoned: 'PR fermées sans merge',
  progress: 'Ce qui s’améliore',
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
    el('p', { className: 'finding-action' }, strong('Piste'), ` ${view.action(finding)}`),
    el('a', { className: 'finding-link', href: route.hash, textContent: `Voir la page ${route.title}` }),
  )
}
