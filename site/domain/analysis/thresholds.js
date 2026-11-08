// The thresholds of the rules of the analysis, which the method page states: how many pull requests or runs a rule
// needs, and from when what it measures stands out.

import { SIZE_BUCKETS } from '../period/sizes.js'
import { WORK_DAY_HOURS } from '../time.js'

export const MINUTE_MS = 60_000
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
export const TOP_ROWS = 5

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
// The projects whose life meets the range, for those that stalled; the projects delivered within it, for their
// integration. Stalled projects call for priority from half of them; the integration of the delivered ones is slow
// from a week of work in median, from the last code pull request merged to the merge of the project branch.
export const MIN_PROJECTS = 3
export const STALLED_PROJECTS_HIGH_SHARE = 0.5
export const MIN_DELIVERED_PROJECTS = 2
export const SLOW_INTEGRATION_HOURS = 5 * WORK_DAY_HOURS
