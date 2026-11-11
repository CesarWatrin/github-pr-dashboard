// The composition root of the page: the only module that runs anything when loaded. It registers the tables, wires the
// listeners of every part, draws the frame, polls for new stats, then unlocks with the stored key or shows the lock
// screen. Every other module only declares.
//
// Layers, each importing only from those before it (tests/architecture.test.mjs):
//   domain/    rules shared with the sync, pure        lib/       formats and arithmetic, without DOM
//   model/     the state of the page and what it reads of the stats, without DOM
//   services/  the outside world: published stats, key, GitHub, notifications
//   ui/        building blocks of the view             pages/     one module per page
//   shell/     the frame around the pages: router, filters, render, session, sync, theme

import { CYCLE_STAGES } from './model/cycle.js'
import { state } from './model/state.js'
import { AC_SERIES } from './pages/acs.js'
import { setupReplay } from './pages/cartography/replay.js'
import { DEPLOYMENT_SERIES } from './pages/devops.js'
import { setupMe } from './pages/me.js'
import { ACTIVITY_SERIES, setupOverview } from './pages/overview/overview.js'
import { AC_OVERVIEW_SERIES, PROJECT_SERIES } from './pages/overview/projects.js'
import { setupProjects } from './pages/projects/projects.js'
import { setupReport } from './pages/report.js'
import { setupReviewers } from './pages/reviewers.js'
import { SQUAD_TYPES } from './pages/squads/charts.js'
import { setupSquads } from './pages/squads/squads.js'
import { readStoredKey } from './services/stats-key.js'
import { renderPeriodSelector, setupFilters } from './shell/filters.js'
import { renderLanguageToggle, setupLanguage } from './shell/language.js'
import { render, setupResize } from './shell/render.js'
import { renderRoute, setupNavigation } from './shell/router.js'
import { setupRetroLink } from './shell/retro-link.js'
import { refresh, setupSession, showDashboard, showLock } from './shell/session.js'
import { refreshClock, setupSync } from './shell/sync.js'
import { registerTables, renderTableLegends } from './shell/tables.js'
import { renderThemeToggle, setupTheme } from './shell/theme.js'
import { readUrlState, setupUrlState } from './shell/url-state.js'
import { renderLegend } from './ui/charts/legend.js'
import { setupCardDialog } from './ui/dialogs/card-dialog.js'
import { setupPersonDialog } from './ui/dialogs/person-dialog.js'
import { setupPullRequestDialog } from './ui/dialogs/pull-request-dialog.js'
import { setupRepositoryDialog } from './ui/dialogs/repository-dialog.js'
import { $ } from './ui/dom.js'
import { EFFORT_SERIES } from './ui/effort.js'
import { repoFilterNames, setupRepoFilter } from './ui/repo-filter.js'
import { renderStackLegends } from './ui/tables/table.js'
import { translatePage } from './ui/translate.js'

const POLL_INTERVAL_MS = 60_000
// While a sync started from the page runs, new data is looked for more often.
const SYNC_POLL_INTERVAL_MS = 10_000
const CLOCK_INTERVAL_MS = 30_000

// The static texts first, before anything writes in the page; then the filters a shared address holds.
translatePage()
registerTables()
readUrlState()

setupNavigation()
setupFilters({ render })
setupUrlState({ render })
setupTheme()
setupLanguage()
setupSync()
setupSession()
setupRetroLink()
setupSquads()
setupProjects()
setupReviewers()
setupReport()
setupMe()
setupReplay()
setupOverview()
setupCardDialog()
setupPersonDialog()
setupRepositoryDialog()
setupPullRequestDialog()
setupResize()
for (const name of repoFilterNames()) {
  setupRepoFilter(name)
}

renderThemeToggle()
renderLanguageToggle()
renderRoute()
renderPeriodSelector()
renderLegend($('[data-chart-legend]'), ACTIVITY_SERIES)
renderLegend($('[data-projects-chart-legend]'), PROJECT_SERIES)
renderLegend($('[data-acs-chart-legend]'), AC_SERIES)
renderLegend($('[data-acs-overview-chart-legend]'), AC_OVERVIEW_SERIES)
for (const name of ['chart', 'squads', 'people']) {
  renderLegend($(`[data-effort-${name}-legend]`), EFFORT_SERIES)
}
renderLegend($('[data-deployments-legend]'), DEPLOYMENT_SERIES)
renderLegend($('[data-cycle-legend]'), CYCLE_STAGES)
renderLegend($('[data-squads-stages-legend]'), CYCLE_STAGES)
renderLegend($('[data-squads-types-legend]'), SQUAD_TYPES)
renderStackLegends()
renderTableLegends()
setInterval(refresh, POLL_INTERVAL_MS)
setInterval(() => state.syncRequest && refresh(), SYNC_POLL_INTERVAL_MS)
setInterval(refreshClock, CLOCK_INTERVAL_MS)

const stored = await readStoredKey()
if (stored) {
  state.key = stored.key
  state.keyExpiresAt = stored.expiresAt
  showDashboard()
  refresh()
} else {
  showLock()
}
