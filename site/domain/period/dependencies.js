// Dependabot: the updates opened over the range, and those still waiting whatever the range.

import { getOrCreate, median, round, sum } from '../math.js'
import { MINUTE_MS, workHoursBetween } from '../time.js'

// The Dependabot updates of a repository.
/**
 * @typedef {{ opened: number, merged: number, closed: number, timesToMerge: number[], waiting: number,
 *   oldestWaitingAt: number | null }} DependencyTally
 */

/** @param {import('./series.js').Series} series */
export function dependencyTally(series) {
  /** @type {Map<string, DependencyTally>} */
  const dependencies = new Map()
  /** @type {Map<string, { opened: number, merged: number }>} */
  const ecosystems = new Map()

  return {
    // A Dependabot update.
    /** @param {PullRequestRecord & { dependency: string }} pr */
    add(pr) {
      const stats = getOrCreate(dependencies, pr.repo, () => ({
        opened: 0,
        merged: 0,
        closed: 0,
        timesToMerge: [],
        waiting: 0,
        oldestWaitingAt: null,
      }))
      if (pr.mergedAt === null && !pr.closed) {
        stats.waiting++
        stats.oldestWaitingAt = Math.min(stats.oldestWaitingAt ?? Infinity, pr.createdAt)
      }
      if (!series.inRange(pr.createdAt)) {
        return
      }
      const ecosystem = getOrCreate(ecosystems, pr.dependency, () => ({ opened: 0, merged: 0 }))
      stats.opened++
      ecosystem.opened++
      if (pr.mergedAt !== null) {
        stats.merged++
        ecosystem.merged++
        stats.timesToMerge.push(workHoursBetween(pr.createdAt, pr.mergedAt))
      } else if (pr.closed) {
        stats.closed++
      }
    },
    result: () =>
      dependencyStats(
        [...dependencies].map(([repo, stats]) => ({ repo, ...stats })),
        [...ecosystems].map(([ecosystem, stats]) => ({ ecosystem, ...stats })),
      ),
  }
}

/**
 * @param {({ repo: string } & DependencyTally)[]} repositories
 * @param {{ ecosystem: string, opened: number, merged: number }[]} ecosystems
 */
function dependencyStats(repositories, ecosystems) {
  /** @param {DependencyTally[]} rows */
  const oldest = (rows) => {
    const times = rows.map((row) => row.oldestWaitingAt).filter((time) => time !== null)

    return times.length ? new Date(Math.min(...times) * MINUTE_MS).toISOString() : null
  }
  /** @param {DependencyTally[]} rows */
  const summary = (rows) => ({
    opened: sum(rows, 'opened'),
    merged: sum(rows, 'merged'),
    closed: sum(rows, 'closed'),
    medianTimeToMergeHours: round(median(rows.flatMap((row) => row.timesToMerge)), 1),
    waiting: sum(rows, 'waiting'),
    oldestWaitingAt: oldest(rows),
  })

  return {
    ...summary(repositories),
    repositories: repositories
      .filter((row) => row.opened > 0 || row.waiting > 0)
      .map((row) => ({ repo: row.repo, ...summary([row]) })),
    ecosystems: ecosystems.sort((a, b) => b.opened - a.opened),
  }
}
