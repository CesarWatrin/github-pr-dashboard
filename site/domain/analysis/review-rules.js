// The rules of the analysis about the pull requests and their reviews: size, huge ones unreviewed, the stage that
// holds them up, a main reviewer, repositories without review, work dropped.

import { SIZE_BUCKETS } from '../period/sizes.js'
import { WORK_DAY_HOURS } from '../time.js'
import { CLEAR, countBy, FEW, found, groupBy, median, round, share, sizeSummary, STAGES, top } from './measures.js'
import {
  ABANDONED_SHARE,
  BIG_PR_LINES,
  BOTTLENECK_SHARE,
  HUGE_PR_LINES,
  HUGE_UNREVIEWED_RATIO,
  HUGE_UNREVIEWED_SHARE,
  MAIN_REVIEWER_SHARE,
  MIN_PRS,
  MIN_REPOSITORY_PRS,
  SIZE_RATIO,
  SMALL_PR_LINES,
  UNREVIEWED_REPOSITORY_SHARE,
} from './thresholds.js'
/** @import { Context, Cycle } from './measures.js' */

// Reviewed big pull requests take longer to merge than small ones, and get fewer comments for their size.
/** @param {Context} context */
export function sizeRule({ merged, cycles }) {
  const reviewed = merged.filter((pr) => pr.interventions.length > 0)
  const small = reviewed.filter((pr) => pr.lines < SMALL_PR_LINES)
  const big = reviewed.filter((pr) => pr.lines >= BIG_PR_LINES)
  if (small.length < MIN_PRS || big.length < MIN_PRS) {
    return FEW
  }
  const smallSummary = sizeSummary(small)
  const bigSummary = sizeSummary(big)
  // Medians of MIN_PRS pull requests at least.
  const [smallHours, bigHours] = /** @type {[number, number]} */ ([smallSummary.timeToMergeHours, bigSummary.timeToMergeHours])
  const ratio = smallHours > 0 ? bigHours / smallHours : null
  if (ratio === null || ratio < SIZE_RATIO) {
    return CLEAR
  }
  // The reviewed pull requests of each size bucket: those of the cycle page someone looked at before their merge.
  const buckets = SIZE_BUCKETS.map((max, index) => {
    const hours = cycles
      .filter((cycle) => cycle.size === index && cycle.pickup !== null && cycle.toMerge !== null)
      .map((cycle) => /** @type {number} */ (cycle.toMerge))

    return { max: Number.isFinite(max) ? max : null, prs: hours.length, timeToMergeHours: round(median(hours)) }
  })

  return found(ratio >= 2 * SIZE_RATIO ? 'high' : 'watch', {
    small: smallSummary,
    big: bigSummary,
    ratio: round(ratio),
    bigShare: share(merged.filter((pr) => pr.lines >= BIG_PR_LINES).length, merged.length),
    buckets,
  })
}

// Huge pull requests merged without anyone looking at them more often than the others: the riskiest ones get the
// least review.
/** @param {Context} context */
export function hugeUnreviewedRule({ merged }) {
  const huge = merged.filter((pr) => pr.lines >= HUGE_PR_LINES)
  const others = merged.filter((pr) => pr.lines < HUGE_PR_LINES)
  if (huge.length < MIN_PRS || others.length < MIN_PRS) {
    return FEW
  }
  const unreviewed = huge.filter((pr) => pr.interventions.length === 0)
  const hugeShare = unreviewed.length / huge.length
  const othersShare = others.filter((pr) => pr.interventions.length === 0).length / others.length
  if (hugeShare < HUGE_UNREVIEWED_SHARE || hugeShare < HUGE_UNREVIEWED_RATIO * othersShare) {
    return CLEAR
  }

  return found(hugeShare >= 1.5 * HUGE_UNREVIEWED_RATIO * othersShare ? 'high' : 'watch', {
    prs: unreviewed.length,
    share: round(hugeShare, 3),
    othersShare: round(othersShare, 3),
    // Null when every other pull request was reviewed.
    ratio: othersShare > 0 ? round(hugeShare / othersShare) : null,
    lines: unreviewed.reduce((total, pr) => total + pr.lines, 0),
    authors: new Set(unreviewed.map((pr) => pr.author)).size,
    repositories: top([...countBy(unreviewed.map((pr) => pr.repo))].map(([repo, prs]) => ({ repo, prs })), 'prs', 3),
  })
}

// The stage that takes the largest share of the time of the reviewed pull requests up to their merge, when they take
// half a working day or more to get merged: each pull request weighs the same, as in cycleSummary() on the cycle page.
/** @param {Context} context */
export function bottleneckRule({ cycles }) {
  const timed = cycles.flatMap((cycle) => {
    const total = STAGES.reduce((sum, stage) => sum + (cycle[stage] ?? 0), 0)

    return cycle.pickup !== null && cycle.toMerge !== null && total > 0 ? [{ cycle, total }] : []
  })
  if (timed.length < MIN_PRS) {
    return FEW
  }
  const shares = STAGES.map((stage) => ({
    stage,
    share: timed.reduce((sum, { cycle, total }) => sum + (cycle[stage] ?? 0) / total, 0) / timed.length,
  }))
  const main = shares.toSorted((a, b) => b.share - a.share)[0]
  // Of MIN_PRS cycles at least, each merged.
  const toMergeHours = /** @type {number} */ (median(timed.map(({ cycle }) => /** @type {number} */ (cycle.toMerge))))
  if (main.share < BOTTLENECK_SHARE || toMergeHours < WORK_DAY_HOURS / 2) {
    return CLEAR
  }
  /** @param {Cycle[]} rows */
  const stageHours = (rows) => median(rows.map((cycle) => cycle[main.stage]).filter((hours) => hours !== null))
  const byRepository = groupBy(
    cycles.filter((cycle) => cycle[main.stage] !== null),
    (cycle) => cycle.repo,
  )

  return found(main.share >= 0.65 ? 'high' : 'watch', {
    stage: main.stage,
    share: round(main.share, 3),
    shares: Object.fromEntries(shares.map(({ stage, share: value }) => [stage, round(value, 3)])),
    stageHours: round(stageHours(cycles)),
    toMergeHours: round(toMergeHours),
    repositories: top(
      [...byRepository]
        .filter(([, rows]) => rows.length >= MIN_REPOSITORY_PRS)
        .map(([repo, rows]) => ({ repo, hours: round(stageHours(rows)) })),
      'hours',
      3,
    ),
  })
}

// Repositories where one person, still in the team, takes part in most reviews: the reviews wait for them.
/** @param {Context} context */
export function mainReviewerRule({ code, isCurrent }) {
  /** @type {{ repo: string, reviewer: string | undefined, reviewed: number, share: number }[]} */
  const rows = []
  for (const [repo, prs] of groupBy(
    code.filter((pr) => pr.interventions.length > 0),
    (pr) => pr.repo,
  )) {
    if (prs.length < MIN_PRS) {
      continue
    }
    const counts = countBy(prs.flatMap((pr) => [...new Set(pr.interventions.map(([login]) => login))]))
    const [reviewer, count] = [...counts].filter(([login]) => isCurrent(login)).sort((a, b) => b[1] - a[1])[0] ?? []
    rows.push({ repo, reviewer, reviewed: prs.length, share: reviewer ? /** @type {number} */ (count) / prs.length : 0 })
  }
  if (rows.length === 0) {
    return FEW
  }
  const concentrated = rows
    .filter((row) => row.share >= MAIN_REVIEWER_SHARE)
    .map((row) => ({ ...row, share: round(row.share, 3) }))
  if (concentrated.length === 0) {
    return CLEAR
  }
  // The people the reviews of these repositories wait for, those of the most repositories first.
  const people = [...countBy(concentrated.map((row) => row.reviewer))].map(([reviewer, repositories]) => ({
    reviewer,
    repositories,
  }))

  return found(concentrated.some((row) => row.share >= 0.75) ? 'high' : 'watch', {
    repositories: top(concentrated, 'share'),
    people: top(people, 'repositories', Infinity),
    count: concentrated.length,
  })
}

// Repositories that merge most of their pull requests without any review.
/** @param {Context} context */
export function unreviewedRepositoriesRule({ merged }) {
  const rows = [...groupBy(merged, (pr) => pr.repo)]
    .filter(([, prs]) => prs.length >= MIN_REPOSITORY_PRS)
    .map(([repo, prs]) => {
      const unreviewed = prs.filter((pr) => pr.interventions.length === 0).length

      return {
        repo,
        merged: prs.length,
        unreviewed,
        share: unreviewed / prs.length,
        authors: new Set(prs.map((pr) => pr.author)).size,
      }
    })
  if (rows.length === 0) {
    return FEW
  }
  const flagged = rows
    .filter((row) => row.share >= UNREVIEWED_REPOSITORY_SHARE)
    .map((row) => ({ ...row, share: round(row.share, 3) }))
  if (flagged.length === 0) {
    return CLEAR
  }

  return found('watch', { repositories: top(flagged, 'unreviewed'), count: flagged.length })
}

// Work dropped: code pull requests closed without being merged.
/** @param {Context} context */
export function abandonedRule({ code, merged }) {
  if (code.length < MIN_PRS) {
    return FEW
  }
  const closed = code.filter((pr) => pr.closed && pr.mergedAt === null)
  const closedShare = closed.length / code.length
  if (closed.length < MIN_PRS || closedShare < ABANDONED_SHARE) {
    return CLEAR
  }

  return found('watch', {
    prs: closed.length,
    share: round(closedShare, 3),
    medianLines: median(closed.map((pr) => pr.lines)),
    mergedMedianLines: median(merged.map((pr) => pr.lines)),
  })
}
