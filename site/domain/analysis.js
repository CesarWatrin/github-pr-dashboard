// What stands out of a range, and where to act, for the analysis page: a fixed list of rules (analysis/), each crossing
// the figures of the pull requests or of the CI runs against the thresholds the method page describes. A rule only
// speaks over enough pull requests or runs: otherwise it says it has too little to go on, and when nothing stands out
// it says so too. Pure, like the rest of domain/.

import { acsOf } from './acs.js'
import { bigAcsRule, slowAcsRule } from './analysis/ac-rules.js'
import { failingWorkflowsRule, slowWorkflowsRule } from './analysis/ci-rules.js'
import { driftRule, halves, progressRule } from './analysis/drift-rules.js'
import { integrationRule, stalledProjectsRule } from './analysis/project-rules.js'
import {
  abandonedRule,
  bottleneckRule,
  hugeUnreviewedRule,
  mainReviewerRule,
  sizeRule,
  unreviewedRepositoriesRule,
} from './analysis/review-rules.js'
import { MINUTE_MS } from './analysis/thresholds.js'
import { computeCi } from './ci.js'
import { computePeriod } from './period.js'
import { projectRows } from './projects.js'
/** @import { Context, Halves, Level, MergedRecord, ProjectRow } from './analysis/measures.js' */

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
  { key: 'stalledProjects', check: stalledProjectsRule },
  { key: 'integration', check: integrationRule },
  { key: 'slowAcs', check: slowAcsRule },
  { key: 'bigAcs', check: bigAcsRule },
  { key: 'progress', check: progressRule },
]
/** @type {Level[]} */
const LEVELS = ['high', 'watch', 'good']
// What a rule says: too little to go on, nothing, or a finding with its facts.
/** @typedef {ReturnType<(typeof RULES)[number]['check']>} RuleResult */

// The findings of the range [start, end), in milliseconds, most urgent first, and the rules that found nothing (clear)
// or had too little to go on (few). records: the pull requests counted (a squad's, say); workflows: their CI runs;
// isCurrent: whether a person is still in the team, for the reviewers a finding names; all: every pull request of the
// stats, which the life of a project comes from whatever the squad; now: the last sync, in milliseconds, which the status
// of a project stands at.
/**
 * @param {PullRequestRecord[]} records
 * @param {WorkflowRuns[]} workflows
 * @param {{ start: number, end: number, isCurrent?: (login: string) => boolean, all?: PullRequestRecord[], now?: number }} range
 */
export function analyze(records, workflows, { start, end, isCurrent = () => true, all = records, now = end }) {
  const startAt = Math.floor(start / MINUTE_MS)
  const endAt = Math.ceil(end / MINUTE_MS)
  const code = records.filter((pr) => !pr.bot && pr.kind === 'code' && pr.createdAt >= startAt && pr.createdAt < endAt)
  // Both halves of the range, worked out once for the rules that compare them.
  /** @type {Halves | null | undefined} */
  let split
  // The projects, worked out once for the rules that read them.
  /** @type {{ rows: ProjectRow[], delivered: ProjectRow[] } | undefined} */
  let projects
  // The AC delivered within the range, likewise.
  /** @type {{ delivered: import('./acs.js').Ac[] } | undefined} */
  let acs
  /** @type {Context} */
  const context = {
    code,
    merged: /** @type {MergedRecord[]} */ (code.filter((pr) => pr.mergedAt !== null)),
    cycles: computePeriod(records, { start, end, bucket: 'month' }).cycles,
    ci: computeCi(workflows, { start, end, bucket: 'month' }),
    isCurrent,
    halves: () => (split === undefined ? (split = halves({ records, start, end })) : split),
    acs: () => {
      if (!acs) {
        acs = { delivered: acsOf(records).filter((ac) => ac.deliveredAt !== null && ac.deliveredAt >= startAt && ac.deliveredAt < endAt) }
      }

      return acs
    },
    projects: () => {
      if (!projects) {
        const rows = projectRows(records, { start, end, bucket: 'month' }, { all, now })
        const delivered = rows.filter((row) => row.status === 'delivered' && row.deliveredAt !== null && row.deliveredAt >= startAt && row.deliveredAt < endAt)
        projects = { rows, delivered }
      }

      return projects
    },
  }
  const results = RULES.map(({ key, check }) => ({ key, ...check(context) }))
  /**
   * @template {RuleResult['status']} Status
   * @param {Status} status
   */
  const of = (status) =>
    /** @type {({ key: string } & Extract<RuleResult, { status: Status }>)[]} */ (results.filter((result) => result.status === status))

  return {
    findings: of('found')
      .toSorted((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level))
      .map(({ status, ...finding }) => finding),
    clear: of('clear').map((result) => result.key),
    few: of('few').map((result) => result.key),
  }
}
