// What stands out of a range, and where to act, for the analysis page: a fixed list of rules, each crossing the figures
// of the pull requests or of the CI runs against the thresholds stated here, which the method page describes. A rule
// only speaks over enough pull requests or runs: otherwise it says it has too little to go on, and when nothing stands
// out it says so too. Pure, like the rest of domain/.

import { computeCi } from './ci.js'
import { computePeriod, SIZE_BUCKETS } from './period.js'
import { DAY_MS, WORK_DAY_HOURS, workHoursBetween } from './time.js'

const MINUTE_MS = 60_000
// Small under SMALL_PR_LINES changed lines, big from BIG_PR_LINES, huge from HUGE_PR_LINES: the size buckets of the
// dashboard.
export const [, SMALL_PR_LINES, BIG_PR_LINES, HUGE_PR_LINES] = SIZE_BUCKETS
// The fewest pull requests a rule needs on each side of what it compares, and a repository to count.
export const MIN_PRS = 20
export const MIN_REPOSITORY_PRS = 10
// Each half of the range, for what drifts from one to the other.
export const MIN_HALF_PRS = 50
// The fewest runs of a workflow.
export const MIN_RUNS = 30
// How many repositories or workflows a finding names at most.
const TOP_ROWS = 5

// Thresholds of the rules.
export const SIZE_RATIO = 2
// Huge pull requests merged without review: twice as often as the others at least, and one in ten at least.
export const HUGE_UNREVIEWED_RATIO = 2
export const HUGE_UNREVIEWED_SHARE = 0.1
export const BOTTLENECK_SHARE = 0.5
export const MAIN_REVIEWER_SHARE = 0.6
export const UNREVIEWED_REPOSITORY_SHARE = 0.5
export const FAILURE_RATE = 0.2
export const SLOW_MEDIAN_SECONDS = 10 * 60
export const ABANDONED_SHARE = 0.1
// A median drifts when it grows by half and by at least its minimum; a share when it gains five points and a third. The
// last SETTLE_DAYS of the range stay out of both halves: their pull requests are not all reviewed or merged yet, and
// those that are went fast.
export const SETTLE_DAYS = 7
export const DRIFT_RATIO = 1.5
export const DRIFT_POINTS = 0.05
export const DRIFT_SHARE_RATIO = 4 / 3

// The stages up to the merge: what follows depends on when each repository deploys, not on the review.
const STAGES = ['pickup', 'review', 'merge']
// The figures of each half that can drift, all better lower: medians with their smallest change worth telling.
export const DRIFT_METRICS = [
  { key: 'medianSize', kind: 'median', minimum: 20 },
  { key: 'pickupHours', kind: 'median', minimum: 0.5 },
  { key: 'timeToMergeHours', kind: 'median', minimum: 1 },
  { key: 'unreviewedShare', kind: 'share' },
  { key: 'hotfixShare', kind: 'share' },
  { key: 'checksFailedShare', kind: 'share' },
]

function median(values) {
  if (values.length === 0) {
    return null
  }
  const sorted = values.toSorted((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

const round = (value, digits = 1) => (value === null ? null : Number(value.toFixed(digits)))
const share = (part, total) => (total ? round(part / total, 3) : null)
const comments = (pr) => pr.interventions.reduce((total, [, , , count]) => total + count, 0)
const timeToMerge = (pr) => workHoursBetween(pr.createdAt, pr.mergedAt)
const pickup = (pr) => workHoursBetween(pr.createdAt, pr.interventions[0][1])
const top = (rows, by, count = TOP_ROWS) => rows.toSorted((a, b) => b[by] - a[by]).slice(0, count)

function groupBy(values, keyOf) {
  const groups = new Map()
  for (const value of values) {
    const key = keyOf(value)
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key).push(value)
  }

  return groups
}

function countBy(values) {
  const counts = new Map()
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }

  return counts
}

function sizeSummary(prs) {
  const lines = prs.reduce((total, pr) => total + pr.lines, 0)

  return {
    prs: prs.length,
    timeToMergeHours: round(median(prs.map(timeToMerge))),
    pickupHours: round(median(prs.map(pickup))),
    commentsPer100Lines: lines ? round((100 * prs.reduce((total, pr) => total + comments(pr), 0)) / lines, 2) : null,
  }
}

const FEW = { status: 'few' }
const CLEAR = { status: 'clear' }
const found = (level, facts) => ({ status: 'found', level, ...facts })

// Reviewed big pull requests take longer to merge than small ones, and get fewer comments for their size.
function sizeRule({ merged, cycles }) {
  const reviewed = merged.filter((pr) => pr.interventions.length > 0)
  const small = reviewed.filter((pr) => pr.lines < SMALL_PR_LINES)
  const big = reviewed.filter((pr) => pr.lines >= BIG_PR_LINES)
  if (small.length < MIN_PRS || big.length < MIN_PRS) {
    return FEW
  }
  const smallSummary = sizeSummary(small)
  const bigSummary = sizeSummary(big)
  const ratio = smallSummary.timeToMergeHours > 0 ? bigSummary.timeToMergeHours / smallSummary.timeToMergeHours : null
  if (ratio === null || ratio < SIZE_RATIO) {
    return CLEAR
  }
  // The reviewed pull requests of each size bucket: those of the cycle page someone looked at before their merge.
  const buckets = SIZE_BUCKETS.map((max, index) => {
    const hours = cycles
      .filter((cycle) => cycle.size === index && cycle.pickup !== null && cycle.toMerge !== null)
      .map((cycle) => cycle.toMerge)

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
function hugeUnreviewedRule({ merged }) {
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
function bottleneckRule({ cycles }) {
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
  const toMergeHours = median(timed.map(({ cycle }) => cycle.toMerge))
  if (main.share < BOTTLENECK_SHARE || toMergeHours < WORK_DAY_HOURS / 2) {
    return CLEAR
  }
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
function mainReviewerRule({ code, isCurrent }) {
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
    rows.push({ repo, reviewer, reviewed: prs.length, share: reviewer ? count / prs.length : 0 })
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
function unreviewedRepositoriesRule({ merged }) {
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

// Workflows that fail often: a broken job or flaky tests, a run in five or more.
function failingWorkflowsRule({ ci }) {
  const busy = ci.workflows.filter((workflow) => workflow.runs >= MIN_RUNS)
  if (busy.length === 0) {
    return FEW
  }
  const failing = busy
    .filter((workflow) => workflow.failureRate >= FAILURE_RATE)
    .map(({ repo, workflow, runs, failureRate }) => ({
      repo,
      workflow,
      runs,
      failureRate,
      failed: Math.round(runs * failureRate),
    }))
  if (failing.length === 0) {
    return CLEAR
  }

  return found(failing.some((workflow) => workflow.failureRate >= 0.4) ? 'high' : 'watch', {
    workflows: top(failing, 'failed'),
    count: failing.length,
    checked: busy.length,
  })
}

// Workflows whose median run takes SLOW_MEDIAN_SECONDS or more: the median, as a run waiting for an approval or a
// runner would stretch the slowest ones.
function slowWorkflowsRule({ ci }) {
  const busy = ci.workflows.filter((workflow) => workflow.runs >= MIN_RUNS)
  if (busy.length === 0) {
    return FEW
  }
  const slow = busy
    .filter((workflow) => workflow.medianSeconds >= SLOW_MEDIAN_SECONDS)
    .map(({ repo, workflow, runs, medianSeconds }) => ({ repo, workflow, runs, medianSeconds }))
  if (slow.length === 0) {
    return CLEAR
  }

  return found(slow.some((workflow) => workflow.medianSeconds >= 2 * SLOW_MEDIAN_SECONDS) ? 'high' : 'watch', {
    workflows: top(slow, 'medianSeconds'),
    count: slow.length,
    checked: busy.length,
  })
}

// Work dropped: code pull requests closed without being merged.
function abandonedRule({ code, merged }) {
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

// The figures of DRIFT_METRICS over one half of the range.
function halfFigures(records, range) {
  const period = computePeriod(records, { ...range, bucket: 'month' })

  return {
    merged: period.totals.merged,
    medianSize: period.totals.medianSize,
    pickupHours: round(median(period.cycles.map((cycle) => cycle.pickup).filter((hours) => hours !== null))),
    timeToMergeHours: period.totals.medianTimeToMergeHours,
    unreviewedShare: period.totals.unreviewedShare,
    hotfixShare: period.totals.hotfixShare,
    checksFailedShare: period.totals.checksFailedShare,
  }
}

// How one figure moved from the first half to the second: 1 worse, -1 better, 0 not enough to tell.
function driftOf(metric, before, after) {
  if (before === null || after === null) {
    return 0
  }
  const [low, high] = before <= after ? [before, after] : [after, before]
  const moved =
    metric.kind === 'median'
      ? high - low >= metric.minimum && (low === 0 || high / low >= DRIFT_RATIO)
      : high - low >= DRIFT_POINTS && (low === 0 || high / low >= DRIFT_SHARE_RATIO)

  return moved ? Math.sign(after - before) : 0
}

// The second half of the range against the first, its last SETTLE_DAYS aside: what got worse (drift), and apart what
// got better (progress).
function halves({ records, start, end }) {
  const settled = end - SETTLE_DAYS * DAY_MS
  if (settled <= start) {
    return null
  }
  const middle = start + Math.round((settled - start) / 2 / MINUTE_MS) * MINUTE_MS
  const first = halfFigures(records, { start, end: middle })
  const second = halfFigures(records, { start: middle, end: settled })
  if (first.merged < MIN_HALF_PRS || second.merged < MIN_HALF_PRS) {
    return null
  }
  const moves = DRIFT_METRICS.map((metric) => ({
    key: metric.key,
    before: first[metric.key],
    after: second[metric.key],
    way: driftOf(metric, first[metric.key], second[metric.key]),
  }))

  return { middle, moves }
}

// The figures that moved one way: 1 worse, -1 better.
const movesOf = (split, way) =>
  split.moves.filter((move) => move.way === way).map(({ key, before, after }) => ({ key, before, after }))

function driftRule(context) {
  const split = context.halves()
  if (!split) {
    return FEW
  }
  const worse = movesOf(split, 1)
  if (worse.length === 0) {
    return CLEAR
  }

  return found(worse.length >= 2 ? 'high' : 'watch', { middle: split.middle, metrics: worse })
}

function progressRule(context) {
  const split = context.halves()
  if (!split) {
    return FEW
  }
  const better = movesOf(split, -1)
  if (better.length === 0) {
    return CLEAR
  }

  return found('good', { middle: split.middle, metrics: better })
}

// In the order findings of the same level show.
export const RULES = [
  { key: 'size', check: sizeRule },
  { key: 'bottleneck', check: bottleneckRule },
  { key: 'drift', check: driftRule },
  { key: 'hugeUnreviewed', check: hugeUnreviewedRule },
  { key: 'mainReviewer', check: mainReviewerRule },
  { key: 'unreviewedRepositories', check: unreviewedRepositoriesRule },
  { key: 'failingWorkflows', check: failingWorkflowsRule },
  { key: 'slowWorkflows', check: slowWorkflowsRule },
  { key: 'abandoned', check: abandonedRule },
  { key: 'progress', check: progressRule },
]
const LEVELS = ['high', 'watch', 'good']

// The findings of the range [start, end), in milliseconds, most urgent first, and the rules that found nothing (clear)
// or had too little to go on (few). records: the pull requests of the stats; workflows: their CI runs; isCurrent:
// whether a person is still in the team, for the reviewers a finding names.
/**
 * @param {any[]} records
 * @param {any[]} workflows
 * @param {{ start: number, end: number, isCurrent?: (login: string) => boolean }} range
 */
export function analyze(records, workflows, { start, end, isCurrent = () => true }) {
  const startAt = Math.floor(start / MINUTE_MS)
  const endAt = Math.ceil(end / MINUTE_MS)
  const code = records.filter((pr) => !pr.bot && pr.kind === 'code' && pr.createdAt >= startAt && pr.createdAt < endAt)
  // Both halves of the range, worked out once for the rules that compare them.
  let split
  const context = {
    code,
    merged: code.filter((pr) => pr.mergedAt !== null),
    cycles: computePeriod(records, { start, end, bucket: 'month' }).cycles,
    ci: computeCi(workflows, { start, end, bucket: 'month' }),
    isCurrent,
    halves: () => (split === undefined ? (split = halves({ records, start, end })) : split),
  }
  const results = RULES.map(({ key, check }) => ({ key, ...check(context) }))
  const of = (status) => results.filter((result) => result.status === status)

  return {
    findings: of('found')
      .toSorted((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level))
      .map(({ status, ...finding }) => finding),
    clear: of('clear').map((result) => result.key),
    few: of('few').map((result) => result.key),
  }
}
