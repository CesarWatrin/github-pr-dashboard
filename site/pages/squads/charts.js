// The four charts under the ranking: the column that ranks, the cycle, the types of repositories, who reads whom.

import { isMissing } from '../../domain/math.js'
import { formatLines, formatNumber, formatShare } from '../../lib/format.js'
import { cycleSummary } from '../../model/cycle.js'
import { CATEGORIES, repoInfo } from '../../model/repositories.js'
import { periodTitle } from '../../model/selection.js'
import { squadsOf } from '../../model/squads.js'
import { state } from '../../model/state.js'
import { barChart } from '../../ui/charts/bar-chart.js'
import { heatmapChart } from '../../ui/charts/heatmap-chart.js'
import { shareChart } from '../../ui/charts/share-chart.js'
import { $ } from '../../ui/dom.js'
import { rankedSquads, rankingFormat, rankingValue, SQUAD_FIGURES, squadRows } from './figures.js'

// Below this width, the matrix of the squads writes its thousands short.
const SQUAD_MATRIX_COMPACT_WIDTH = 500

// The squads side by side on the column that ranks them, per member when the ranking is: it follows the clicks.
function renderSquadComparison(rows) {
  const figure = SQUAD_FIGURES[state.squadSort.key]
  const format = figure.key === 'members' ? formatNumber : rankingFormat(figure)
  const perMember = state.squadPerMember && figure.perMember
  // A figure the ranking shows in more than one way (the lines) names what its bars show.
  const label = figure.chartLabel ?? figure.label
  $('[data-squads-compare-title]').textContent = `${label}${perMember ? ' par personne' : ''}`
  $('[data-squads-compare-sub]').textContent = `${figure.hint} Le graphique suit la colonne qui classe le classement.`
  barChart($('[data-squads-compare]'), {
    rows: rankedSquads(rows).filter((row) => !isMissing(rankingValue(row, figure))),
    label: (row) => row.name,
    value: (row) => rankingValue(row, figure),
    format,
    color: 'var(--series-1)',
    ariaLabel: `${label} de chaque squad${perMember ? ', par personne' : ''}, ${periodTitle()}`,
    tooltip: (row) => ({
      title: row.name,
      rows: [
        { label: label.toLowerCase(), value: format(rankingValue(row, figure)) },
        ...(figure.key === 'added'
          ? [{ label: 'lignes supprimées', value: format(perMember ? row.deleted / row.size : row.deleted) }]
          : []),
        { label: 'membres', value: formatNumber(row.size) },
      ],
    }),
  })
}

// Where the time of a code pull request goes, squad by squad, as on the cycle page: the whole organization first.
function renderSquadStages(rows, organization) {
  shareChart($('[data-squads-stages]'), {
    rows: [organization, ...rows].map((row) => ({
      label: row.name === '*' ? 'Toute l’organisation' : row.name,
      ...cycleSummary(row.period.cycles),
    })),
    ariaLabel: 'Part de chaque étape dans le temps des PR de code, par squad',
  })
}

// What each squad writes: the share of its code pull requests in each type of repository, in the colors of the types,
// the whole organization first.
export const SQUAD_TYPES = CATEGORIES.map((category) => ({ key: category.key, label: category.label, color: category.color ?? 'var(--text-muted)' }))

function renderSquadTypes(rows, organization) {
  shareChart($('[data-squads-types]'), {
    rows: [organization, ...rows].map((row) => {
      const counts = Object.fromEntries(SQUAD_TYPES.map((type) => [type.key, 0]))
      for (const author of row.period.authors) {
        for (const [repo, stats] of Object.entries(author.repos)) {
          counts[repoInfo(repo).category] += stats.code
        }
      }
      const code = Object.values(counts).reduce((total, count) => total + count, 0)

      return {
        label: row.name === '*' ? 'Toute l’organisation' : row.name,
        counts,
        code,
        shares: code ? Object.fromEntries(SQUAD_TYPES.map((type) => [type.key, counts[type.key] / code])) : null,
      }
    }),
    stages: SQUAD_TYPES,
    tooltipRows: (row) => [
      ...SQUAD_TYPES.map((type) => ({ color: type.color, value: formatShare(row.shares[type.key]), label: `${type.label.toLowerCase()}, ${formatNumber(row.counts[type.key])} PR` })),
      { label: 'PR de code', value: formatNumber(row.code) },
    ],
    ariaLabel: 'Part des PR de code de chaque squad par type de dépôt',
  })
}

// Who reads whom between squads: a row per squad for its pull requests, a column per squad for their readers, each
// cell the pull requests of the row its people read over the period. A person of two squads counts in both; the
// diagonal is what a squad reads of itself.
function renderSquadMatrix(rows, organization) {
  const squadsOfLogin = new Map()
  for (const row of rows) {
    for (const login of row.members) {
      squadsOfLogin.set(login, [...(squadsOfLogin.get(login) ?? []), row.name])
    }
  }
  const cells = new Map()
  for (const pair of organization.period.reviewPairs) {
    const prs = Object.values(pair.repos).reduce((total, count) => total + count, 0)
    for (const author of squadsOfLogin.get(pair.author) ?? []) {
      for (const reviewer of squadsOfLogin.get(pair.reviewer) ?? []) {
        const key = `${author}\n${reviewer}`
        cells.set(key, (cells.get(key) ?? 0) + prs)
      }
    }
  }
  const axis = rows.map((row) => ({ key: row.name, label: row.name }))
  const container = $('[data-squads-matrix]')
  heatmapChart(container, {
    rows: axis,
    columns: axis,
    value: (row, column) => cells.get(`${row.key}\n${column.key}`) ?? 0,
    // Narrow cells, on a phone, take thousands short (« 1,2 k »): the tooltip keeps the whole number.
    format: container.clientWidth < SQUAD_MATRIX_COMPACT_WIDTH ? formatLines : formatNumber,
    ariaLabel: `Relectures entre squads, ${periodTitle()}`,
    tooltip: (row, column, count) => ({
      title: row.key === column.key ? `${row.label}, entre ses membres` : `${row.label}, relue par ${column.label}`,
      rows: [{ label: count > 1 ? 'PR relues' : 'PR relue', value: formatNumber(count) }],
    }),
  })
}

// The charts of the squads page, drawn again as the page resizes, only when it shows.
export function renderSquadCharts(rows = null) {
  if (!squadsOf().length || $('[data-route="squads"]').hidden) {
    return
  }
  const { squads, organization } = rows ?? squadRows()
  renderSquadComparison(squads)
  renderSquadStages(squads, organization)
  renderSquadTypes(squads, organization)
  renderSquadMatrix(squads, organization)
}
