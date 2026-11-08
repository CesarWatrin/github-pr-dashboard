// Each repository's figures over the period: its pull requests, its CI, who writes and reviews it.

import { deliveredBy } from '../domain/acs.js'
import { computeCi } from '../domain/ci.js'
import { median } from '../domain/math.js'
import { busFactor } from '../domain/team.js'
import { roundedMedian } from '../lib/math.js'
import { currentAcs } from './acs.js'
import { inSelection } from './contributors.js'
import { inTeam } from './people.js'
import { repoInfo } from './repositories.js'
import { ciRange, currentPeriod, periodRange } from './selection.js'
import { loadedStats, state } from './state.js'

// The CI of the period per repository: its runs, the share of them that failed or were run again.
/** @returns {Map<string, CiStats['totals']>} */
function ciPerRepository() {
  const range = ciRange(periodRange())
  /** @type {Map<string, WorkflowRuns[]>} */
  const workflows = new Map()
  for (const workflow of loadedStats().ci ?? []) {
    if (!workflows.has(workflow.repo)) {
      workflows.set(workflow.repo, [])
    }
    /** @type {WorkflowRuns[]} */ (workflows.get(workflow.repo)).push(workflow)
  }

  return new Map([...workflows].map(([repo, list]) => [repo, computeCi(list, range).totals]))
}

// The repositories of the period with their figures, the people who wrote them, the most first, people who left
// included for the repositories that rest on them, those still in the team who reviewed them, and their bus factor, over
// the people still in the team. The figures count everyone, people who left included, as the other figures of
// repositories do. By default, those with code pull requests on the repositories selected on their page, for the cards;
// with all, every repository with anything over the period, for their dialogs.
/**
 * What the repository of a row added up over its people, before its figures.
 * @typedef {{ repo: string, code: number, merged: number, unreviewed: number, added: number, deleted: number, timesToFirstReview: number[], timesToMerge: number[], sizes: number[], authors: [login: string, code: number][], readers: [login: string, prs: number][] }} RepositoryTotals
 */

/** @param {{ all?: boolean }} [options] */
export function repositoryRows({ all = false } = {}) {
  const period = currentPeriod()
  const selection = all ? null : state.repos.repositories
  /** @type {Map<string, RepositoryTotals>} */
  const rows = new Map()
  /** @param {string} repo */
  const row = (repo) => {
    if (!rows.has(repo)) {
      rows.set(repo, {
        repo,
        code: 0,
        merged: 0,
        unreviewed: 0,
        added: 0,
        deleted: 0,
        timesToFirstReview: [],
        timesToMerge: [],
        sizes: [],
        authors: [],
        readers: [],
      })
    }

    return /** @type {RepositoryTotals} */ (rows.get(repo))
  }
  for (const person of period.authors) {
    for (const [repo, stats] of Object.entries(person.repos)) {
      if (stats.code > 0 && inSelection(selection, repo)) {
        const totals = row(repo)
        totals.code += stats.code
        totals.merged += stats.merged
        totals.unreviewed += stats.unreviewed
        totals.added += stats.added
        totals.deleted += stats.deleted
        totals.timesToFirstReview.push(...stats.timesToFirstReviewHours)
        totals.timesToMerge.push(...stats.timesToMergeHours)
        totals.sizes.push(...stats.sizes)
        totals.authors.push([person.login, stats.code])
      }
    }
  }
  /** @type {Map<string, [approved: number, silent: number]>} */
  const approvals = new Map()
  for (const person of period.reviewers) {
    for (const [repo, stats] of Object.entries(person.repos)) {
      if (stats.prs > 0 && (rows.has(repo) || all)) {
        row(repo).readers.push([person.login, stats.prs])
        const [approved, silent] = approvals.get(repo) ?? [0, 0]
        approvals.set(repo, [approved + stats.approved, silent + stats.silentApproved])
      }
    }
  }
  const delivery = new Map(period.delivery.repositories.map((stats) => [stats.repo, stats]))
  const ci = ciPerRepository()
  if (all) {
    for (const repo of [...delivery.keys(), ...[...ci].filter(([, stats]) => stats.runs > 0).map(([repo]) => repo)]) {
      row(repo)
    }
  }
  const reviewed = new Map(period.repositories.map((stats) => [stats.repo, stats]))
  const hotfixes = new Map(period.tma.repositories.map((stats) => [stats.repo, stats.hotfixes]))
  const acs = new Map(deliveredBy(currentAcs(), periodRange(), (ac) => ac.repos))
  /** @param {[login: string, count: number][]} people */
  const busiest = (people) => people.toSorted((a, b) => b[1] - a[1])

  return [...rows.values()]
    .map((totals) => {
      const writers = busiest(totals.authors)
      const [approved, silent] = approvals.get(totals.repo) ?? [0, 0]
      const review = reviewed.get(totals.repo)
      const deliveries = delivery.get(totals.repo)
      const runs = ci.get(totals.repo)

      return {
        repo: totals.repo,
        category: repoInfo(totals.repo).category,
        technologies: repoInfo(totals.repo).technologies,
        code: totals.code,
        merged: totals.merged,
        authors: totals.authors.length,
        medianSize: roundedMedian(totals.sizes),
        added: totals.added,
        deleted: totals.deleted,
        unreviewedRate: totals.merged ? totals.unreviewed / totals.merged : null,
        hotfixes: hotfixes.get(totals.repo) ?? 0,
        acs: acs.get(totals.repo) ?? 0,
        reviewers: totals.readers.length,
        reviewed: review?.prs ?? 0,
        medianTimeToFirstReviewHours: median(totals.timesToFirstReview),
        medianTimeToMergeHours: median(totals.timesToMerge),
        commentsPerPr: review?.prs ? review.comments / review.prs : null,
        silentApprovalRate: approved ? silent / approved : null,
        deployments: deliveries?.deployments ?? 0,
        medianLeadTimeHours: deliveries?.medianLeadTimeHours ?? null,
        reworkRate: deliveries?.reworkRate ?? null,
        ciRuns: runs?.runs ?? 0,
        ciFailureRate: runs?.failureRate ?? null,
        ciRerunRate: runs?.rerunRate ?? null,
        writers,
        readers: busiest(totals.readers).filter(inTeam),
        busFactor: busFactor(writers.filter(inTeam).map(([, code]) => code), totals.code),
      }
    })
    .sort((a, b) => b.code - a.code || a.repo.localeCompare(b.repo))
}
