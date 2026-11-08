// Drawing the pages: everything at once on new data or new filters, the charts of the page that shows.

import { CUSTOM_PERIOD, DEFAULT_PERIOD, PERIODS } from '../model/periods.js'
import { clampRange, periodAvailable } from '../model/selection.js'
import { squadKey } from '../model/squads.js'
import { state } from '../model/state.js'
import { renderAnalysis } from '../pages/analysis/analysis.js'
import { renderSizeCharts } from '../pages/authors.js'
import { renderAwards } from '../pages/awards.js'
import { renderCartography } from '../pages/cartography/cartography.js'
import { renderCollaboration } from '../pages/collaboration.js'
import { renderCycleCharts, renderCycleTiles } from '../pages/cycle.js'
import { renderDevopsCharts, renderDevopsTiles } from '../pages/devops.js'
import { renderMe } from '../pages/me.js'
import {
  renderActivityChart,
  renderChartTable,
  renderFeed,
  renderTechnologiesChart,
  renderToday,
  renderTotals,
} from '../pages/overview.js'
import { renderProjects, renderProjectTimeline } from '../pages/projects/projects.js'
import { renderReport } from '../pages/report.js'
import { renderRepositories } from '../pages/repositories.js'
import { renderMiniCharts, renderPersonPicker } from '../pages/reviewers.js'
import { renderSquadCharts } from '../pages/squads/charts.js'
import { renderSquads } from '../pages/squads/squads.js'
import { renderTeam } from '../pages/team.js'
import { renderTmaCharts, renderTmaTiles } from '../pages/tma.js'
import { renderTrends } from '../pages/trends.js'
import { renderUnapproved, renderUnblock } from '../pages/unblock.js'
import { $, $$ } from '../ui/dom.js'
import { renderRepoFilter, repoFilterNames } from '../ui/repo-filter.js'
import { renderTables } from '../ui/tables/table.js'
import { renderPeriodSelector, renderSquadFilter } from './filters.js'
import { renderSyncMenu } from './sync.js'

export function renderCharts() {
  if (!state.stats) {
    return
  }
  renderActivityChart()
  renderSizeCharts()
  renderTechnologiesChart()
  renderTmaCharts()
  renderDevopsCharts()
  renderCycleCharts()
  renderCollaboration()
  renderCartography()
  renderTrends()
  renderSquadCharts()
  renderProjectTimeline()
  if (state.person) {
    renderMiniCharts()
  }
}

export function render(animate) {
  // A stored period may no longer exist or not be covered yet, and picked days leave the synced data as time goes by.
  state.range = clampRange(state.range)
  if (state.period === CUSTOM_PERIOD ? !state.range : !PERIODS[state.period] || !periodAvailable(state.period)) {
    state.period = DEFAULT_PERIOD
  }
  for (const org of $$('[data-org]')) {
    org.textContent = state.stats.org
  }
  $('[data-empty]').hidden = true
  $('[data-main]').classList.remove('is-loading')
  state.renderedSquad = squadKey()
  renderPeriodSelector()
  renderSquadFilter()
  const tileMode = animate ? 'update' : 'enter'
  renderToday(tileMode)
  renderTotals(tileMode)
  renderCycleTiles(tileMode)
  renderTmaTiles(tileMode)
  renderDevopsTiles(tileMode)
  renderPersonPicker()
  renderCharts()
  renderChartTable()
  for (const name of repoFilterNames()) {
    renderRepoFilter(name)
  }
  renderTables(animate)
  renderTeam()
  renderAwards()
  renderReport()
  renderAnalysis()
  renderRepositories()
  renderProjects(tileMode)
  renderSquads()
  renderFeed(animate)
  renderUnblock(tileMode)
  renderMe(tileMode)
  renderUnapproved(animate)
  renderSyncMenu()
}

// Draws the charts again as the page changes width: they are measured to fit it.
export function setupResize() {
  let resizeFrame = 0
  let observedWidth = 0
  new ResizeObserver(([entry]) => {
    if (entry.contentRect.width === observedWidth) {
      return
    }
    observedWidth = entry.contentRect.width
    cancelAnimationFrame(resizeFrame)
    resizeFrame = requestAnimationFrame(renderCharts)
  }).observe($('[data-main]'))
}
