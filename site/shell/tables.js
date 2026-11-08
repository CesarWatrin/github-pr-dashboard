// The tables of the pages and their repository filters: the one place that knows them all.

import { t } from '../lib/i18n.js'
import { BADGES_LEGEND } from '../model/badges.js'
import { authorRows, reviewerRows } from '../model/contributors.js'
import { displayName, isCurrent, SENIORITY_LEGEND } from '../model/people.js'
import { currentProjects, projectRepoCounts } from '../model/projects.js'
import { withCategory } from '../model/repositories.js'
import { currentCi, currentPeriod } from '../model/selection.js'
import { currentNetwork } from '../model/team.js'
import { AUTHOR_COLUMNS } from '../pages/authors.js'
import { COLLABORATION_COLUMNS, renderCollaboration } from '../pages/collaboration.js'
import { CYCLE_COLUMNS, cycleRows, renderCycleCharts, renderCycleTiles } from '../pages/cycle.js'
import { DEPENDENCY_COLUMNS, DEPLOYMENT_COLUMNS, WORKFLOW_COLUMNS } from '../pages/devops.js'
import { REPO_COLUMNS, repoRows } from '../pages/overview/overview.js'
import { PROJECT_COLUMNS, projectSearchTexts, renderProjects } from '../pages/projects/projects.js'
import { renderRepositories } from '../pages/repositories.js'
import { REVIEWER_COLUMNS } from '../pages/reviewers.js'
import { renderTeam } from '../pages/team.js'
import { TMA_COLUMNS } from '../pages/tma.js'
import { DEPENDENCY_STAT, TEAM_STATS } from '../ui/dialogs/person-dialog.js'
import { BUS_FACTOR_LEGEND, REPOSITORY_FIGURES } from '../ui/dialogs/repository-dialog.js'
import { $, el } from '../ui/dom.js'
import { REPO_FILTERS } from '../ui/repo-filter.js'
import { TABLES } from '../ui/tables/table.js'

// Registers the tables of the pages, then their repository filters: those of the tables, and those of the team and
// repositories pages, which have no table. Called once, before anything is drawn.
export function registerTables() {
  Object.assign(TABLES, {
    authors: {
      columns: AUTHOR_COLUMNS,
      rows: authorRows,
      searchTexts: (row) => [row.login, displayName(row.login)],
      repoCounts: () => {
        const counts = new Map()
        for (const person of currentPeriod().authors) {
          for (const [repo, stats] of Object.entries(person.repos)) {
            counts.set(repo, (counts.get(repo) ?? 0) + stats.code + stats.release + stats.integration)
          }
        }

        return counts
      },
      repoCountsLabel: t('PR ouvertes sur la période'),
    },
    reviewers: {
      columns: REVIEWER_COLUMNS,
      rows: reviewerRows,
      searchTexts: (row) => [row.login, displayName(row.login), ...row.topRepos.map(([repo]) => repo)],
      // Counted once per pull request, however many people reviewed it.
      repoCounts: () => new Map(currentPeriod().repositories.map((row) => [row.repo, row.prs])),
      repoCountsLabel: t('PR relues sur la période'),
    },
    cycle: {
      columns: CYCLE_COLUMNS,
      rows: cycleRows,
      rowKey: (row) => row.repo,
      searchTexts: (row) => [row.repo],
      // The filter lists the repositories of the authors, and applies to the whole page.
      source: 'authors',
      repoCounts: () => TABLES.collaboration.repoCounts(),
      repoCountsLabel: t('PR de code ouvertes sur la période'),
      onFilter: () => {
        renderCycleTiles('enter')
        renderCycleCharts()
      },
    },
    collaboration: {
      columns: COLLABORATION_COLUMNS,
      rows: () => currentNetwork().authors,
      searchTexts: (row) => [row.login, displayName(row.login), ...(row.topReviewer ? [row.topReviewer, displayName(row.topReviewer)] : [])],
      // The filter lists the repositories of the authors, and applies to the whole page.
      source: 'authors',
      repoCounts: () => {
        const counts = new Map()
        for (const person of currentPeriod().authors) {
          for (const [repo, stats] of Object.entries(person.repos)) {
            counts.set(repo, (counts.get(repo) ?? 0) + stats.code)
          }
        }

        return counts
      },
      repoCountsLabel: t('PR de code ouvertes sur la période'),
      onFilter: () => renderCollaboration(),
    },
    repos: {
      columns: REPO_COLUMNS,
      rows: repoRows,
      rowKey: (row) => row.repo,
      searchTexts: (row) => [row.repo, ...row.technologies.map(([name]) => name)],
    },
    tma: {
      columns: TMA_COLUMNS,
      rows: () => currentPeriod().tma.people.filter((row) => isCurrent(row.login)),
      searchTexts: (row) => [row.login, displayName(row.login), ...row.topRepos.map(([repo]) => repo)],
    },
    deployments: {
      columns: DEPLOYMENT_COLUMNS,
      rows: () => withCategory(currentPeriod().delivery.repositories),
      rowKey: (row) => row.repo,
      searchTexts: (row) => [row.repo],
    },
    workflows: {
      columns: WORKFLOW_COLUMNS,
      rows: () => withCategory(currentCi().workflows),
      rowKey: (row) => `${row.repo}/${row.workflow}`,
      searchTexts: (row) => [row.repo, row.workflow],
    },
    dependencies: {
      columns: DEPENDENCY_COLUMNS,
      rows: () => withCategory(currentPeriod().dependencies.repositories),
      rowKey: (row) => row.repo,
      searchTexts: (row) => [row.repo],
    },
    projects: {
      columns: PROJECT_COLUMNS,
      rows: () => currentProjects().rows,
      rowKey: (row) => row.key,
      searchTexts: projectSearchTexts,
      // The filter of the whole page: the repositories of the projects of the period, whatever those picked.
      repos: () => projectRepoCounts().keys(),
      repoCounts: projectRepoCounts,
      repoCountsLabel: t('PR de code des projets ouvertes sur la période'),
      onFilter: () => renderProjects(),
    },
  })
  Object.assign(REPO_FILTERS, {
    ...Object.fromEntries(Object.entries(TABLES).filter(([, table]) => table.repoCounts)),
    team: {
      source: 'authors',
      repoCounts: () => TABLES.collaboration.repoCounts(),
      repoCountsLabel: t('PR de code ouvertes sur la période'),
      onFilter: () => renderTeam(),
    },
    repositories: {
      source: 'authors',
      repoCounts: () => TABLES.collaboration.repoCounts(),
      repoCountsLabel: t('PR de code ouvertes sur la période'),
      onFilter: () => renderRepositories(),
    },
  })
}

// Under each table, what its columns count: the method page only keeps the rules they share.
export function renderTableLegends() {
  const legend = (items) =>
    items.filter((item) => item.hint).map((item) => el('div', {}, el('dt', { textContent: item.label }), el('dd', { textContent: item.hint })))
  for (const [name, table] of Object.entries(TABLES)) {
    $(`[data-table-legend="${name}"]`).replaceChildren(...legend(table.columns))
  }
  $('[data-table-legend="team"]').replaceChildren(...legend([SENIORITY_LEGEND, BADGES_LEGEND, ...TEAM_STATS, DEPENDENCY_STAT]))
  $('[data-table-legend="repositories"]').replaceChildren(...legend([BUS_FACTOR_LEGEND, ...Object.values(REPOSITORY_FIGURES)]))
}
