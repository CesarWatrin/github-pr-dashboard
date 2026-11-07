// The evidence of a finding of the analysis, under its text: bars, rows, the stages of the cycle, what moved.

import { parisDay } from '../../domain/time.js'
import { dayDate } from '../../lib/dates.js'
import { dayMonthFormat, formatDecimal, formatDuration, formatNumber, formatShare } from '../../lib/format.js'
import { language, t } from '../../lib/i18n.js'
import { CYCLE_STAGES } from '../../model/cycle.js'
import { renderLegend } from '../../ui/charts/legend.js'
import { el, withNodes } from '../../ui/dom.js'
import { repoLink } from '../../ui/links.js'

export const strong = (text) => el('strong', { textContent: text })
// A ratio as the findings say it, rounded to a tenth: « 2,5 » fois plus.
export const ratioOf = (ratio) => formatDecimal(Math.round(ratio * 10) / 10)

// A sentence of a finding in the language of the page, with nodes in it, its figures in bold say: a placeholder given a
// node takes it, the others their text.
export function sentence(french, values) {
  const texts = Object.fromEntries(Object.entries(values).filter(([, value]) => !(value instanceof Node)))

  return withNodes(t(french, texts), values)
}

// Where the time goes before the merge, for the finding about the stage that takes the most of it.
export const STAGE_FINDINGS = {
  pickup: {
    title: t('Les PR attendent leur première review'),
    where: t('à attendre une première review'),
    action: t('Des créneaux de review dans la journée, ou une rotation de relecteurs, pour qu’une PR trouve vite quelqu’un.'),
  },
  review: {
    title: t('La relecture traîne'),
    where: t('en relecture, de la première intervention à l’approbation'),
    action: t('Des PR plus petites et mieux décrites ; pour les plus grosses, une relecture à deux, en direct.'),
  },
  merge: {
    title: t('Les PR approuvées attendent leur merge'),
    where: t('entre l’approbation et le merge'),
    action: t('Merger dès l’approbation, ou activer l’auto-merge de GitHub.'),
  },
}

// The figures that can drift from one half of the period to the other, as the page names them.
const DRIFT_FIGURES = {
  medianSize: { label: t('Taille médiane des PR'), format: (value) => t('{value} lignes', { value: formatNumber(value) }) },
  pickupHours: { label: t('Attente médiane de la 1re review'), format: formatDuration },
  timeToMergeHours: { label: t('Délai médian de merge'), format: formatDuration },
  unreviewedShare: { label: t('Mergées sans review'), format: formatShare },
  hotfixShare: { label: t('Part de hotfix'), format: formatShare },
  checksFailedShare: { label: t('Mergées avec un check rouge'), format: formatShare },
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
    const part = el('span', { title: t('{label} : {value}', { label: stage.label, value: formatShare(shares[stage.key]) }) })
    part.style.flexGrow = shares[stage.key]
    part.style.background = stage.color
    bar.append(part)
  }
  const legend = el('div', { className: 'legend' })
  renderLegend(
    legend,
    stages.map((stage) => ({ color: stage.color, label: `${stage.label} ${formatShare(shares[stage.key])}` })),
  )

  return el('figure', { className: 'finding-figure' }, el('figcaption', { textContent: t('Part de chaque étape jusqu’au merge, en moyenne') }), bar, legend)
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

// In French, the first day of a month reads « 1er ».
const dayInText = (time) => {
  const day = dayMonthFormat.format(dayDate(parisDay(time)))

  return language === 'fr' ? day.replace(/^1 /, '1er ') : day
}

export const driftText = ({ middle }) => [
  t('La seconde moitié de la période, depuis le {day}, comparée à la première. La dernière semaine reste à part : ses PR ne sont pas encore toutes relues ou mergées.', {
    day: dayInText(middle),
  }),
]
