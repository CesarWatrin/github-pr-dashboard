// TMA: the hotfix pull requests and the people who make them.

import { getOrCreate, median, round } from '../math.js'
import { MINUTE_MS, workHoursBetween } from '../time.js'

const TOP_HOTFIX_REPOS = 3

/** @param {import('./series.js').Series} series */
export function hotfixTally(series) {
  /**
   * @type {{ opened: number, merged: number, timesToMerge: number[], timesToFirstReview: number[],
   *   people: Map<string, { hotfixes: number, timesToMerge: number[], repositories: Map<string, number>, lastAt: number }>,
   *   repositories: Map<string, number> }}
   */
  const hotfixes = { opened: 0, merged: 0, timesToMerge: [], timesToFirstReview: [], people: new Map(), repositories: new Map() }

  return {
    // A hotfix opened in the range.
    /** @param {PullRequestRecord} pr */
    add(pr) {
      const person = getOrCreate(hotfixes.people, pr.author, () => ({
        hotfixes: 0,
        timesToMerge: [],
        repositories: new Map(),
        lastAt: 0,
      }))
      hotfixes.opened++
      person.hotfixes++
      person.repositories.set(pr.repo, (person.repositories.get(pr.repo) ?? 0) + 1)
      person.lastAt = Math.max(person.lastAt, pr.createdAt)
      hotfixes.repositories.set(pr.repo, (hotfixes.repositories.get(pr.repo) ?? 0) + 1)
      series.bump(pr.createdAt, 'hotfixes')
      if (pr.interventions.length > 0) {
        hotfixes.timesToFirstReview.push(workHoursBetween(pr.createdAt, pr.interventions[0][1]))
      }
      if (pr.mergedAt !== null) {
        const timeToMerge = workHoursBetween(pr.createdAt, pr.mergedAt)
        hotfixes.merged++
        hotfixes.timesToMerge.push(timeToMerge)
        person.timesToMerge.push(timeToMerge)
      }
    },
    // The share of each person's code pull requests that are hotfixes comes from codeOf(login).
    /** @param {(login: string) => number} codeOf */
    result: (codeOf) => ({
      opened: hotfixes.opened,
      merged: hotfixes.merged,
      medianTimeToMergeHours: round(median(hotfixes.timesToMerge), 1),
      medianTimeToFirstReviewHours: round(median(hotfixes.timesToFirstReview), 1),
      people: [...hotfixes.people]
        .map(([login, person]) => ({
          login,
          hotfixes: person.hotfixes,
          share: round(person.hotfixes / codeOf(login), 3),
          medianTimeToMergeHours: round(median(person.timesToMerge), 1),
          topRepos: [...person.repositories].sort((a, b) => b[1] - a[1]).slice(0, TOP_HOTFIX_REPOS),
          lastAt: new Date(person.lastAt * MINUTE_MS).toISOString(),
        }))
        .sort((a, b) => b.hotfixes - a.hotfixes),
      repositories: [...hotfixes.repositories]
        .map(([repo, count]) => ({ repo, hotfixes: count }))
        .sort((a, b) => b.hotfixes - a.hotfixes),
    }),
  }
}
