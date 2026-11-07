// The evidence of a finding of the analysis, under its text: bars, rows, the stages of the cycle, what moved.

import { parisDay } from '../../domain/time.js'
import { dayDate } from '../../lib/dates.js'
import { dayMonthFormat, formatDecimal, formatDuration, formatNumber, formatShare } from '../../lib/format.js'
import { CYCLE_STAGES } from '../../model/cycle.js'
import { renderLegend } from '../../ui/charts/legend.js'
import { el } from '../../ui/dom.js'
import { repoLink } from '../../ui/links.js'

export const strong = (text) => el('strong', { textContent: text })
export const times = (ratio) => `${formatDecimal(Math.round(ratio * 10) / 10)} fois`

// Where the time goes before the merge, for the finding about the stage that takes the most of it.
export const STAGE_FINDINGS = {
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
export function findingBars(caption, rows) {
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
export function findingRows(caption, rows) {
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
export const workflowName = ({ repo, workflow }) => [repoLink(repo), el('span', { className: 'finding-workflow', textContent: workflow, title: workflow })]

// The share of each stage in the time of a pull request up to its merge, in one bar cut like those of the cycle page.
export function findingStages(shares) {
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

export function findingChanges(metrics) {
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

export const driftText = ({ middle }) => [
  `La seconde moitié de la période, depuis le ${dayInText(middle)}, comparée à la première. La dernière semaine reste à part : ses PR ne sont pas encore toutes relues ou mergées.`,
]
