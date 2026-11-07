// From a pull request of the snapshot to the record the page computes its stats from (site/domain/period.js): its
// kind, its deployment, when it reached production.

import { isBot } from './people.mjs'

// The pull requests the page opens the timeline of carry their title and the state of their checks: the open ones, and
// those with any activity over the last DETAILS_DAYS, which covers the 7-day feed and the merges without approval of
// the last 30 days (UNAPPROVED_DAYS of the page). The title of every pull request of the window would make the stats
// about half as heavy again, for timelines the page never opens.
export const DETAILS_DAYS = 30
const RELEASE_BASES = ['master', 'main']
// Branches that production releases are cut from: a pull request merged into one ships with the next release.
const INTEGRATION_BASES = ['develop', 'staging']

// Release PRs ship develop to production, integration PRs sync long-lived branches: neither is new code. A project
// branch named after a merge (project/<name>/merge-develop, project/<name>-merge-main…), or after a long-lived branch
// it brings in (project/<name>/develop-into-main, project/<name>-into-main, project/<name>/sync-develop…), brings another
// branch into its project. A sync alone may be a feature, such as the sync of some data; and elsewhere than on project
// branches, a branch with merge in its name may well be a feature too.
const LONG_LIVED = '(develop|main|master|staging)'
const PROJECT_MERGE = new RegExp(
  `^project/(.*[/_-])?(merge|${LONG_LIVED}-into|into-${LONG_LIVED}|sync-${LONG_LIVED})([/_-]|$)`,
  'i',
)

/**
 * @param {Pick<SnapshotPullRequest, 'head' | 'base' | 'title'>} pr
 * @returns {PullRequestKind}
 */
export function classify(pr) {
  const { head, base, title } = pr
  if (
    head.startsWith('release') ||
    /^(chore\(.*\): )?release/i.test(title) ||
    (['develop', 'staging'].includes(head) && ['master', 'main'].includes(base))
  ) {
    return 'release'
  }
  if (
    head.startsWith('merge') ||
    PROJECT_MERGE.test(head) ||
    ['master', 'main', 'develop'].includes(head) ||
    (/^project\/[^/]+\/main/.test(head) && !base.startsWith('project/'))
  ) {
    return 'integration'
  }

  return 'code'
}

// Every action of someone other than the author on a pull request, oldest first. A review without inline
// comments counts as one comment when it is a plain comment, not when it only approves or requests changes.
/** @param {SnapshotPullRequest} pr */
function reviewInterventions(pr) {
  const fromReviews = pr.reviews
    .filter((review) => review.submittedAt && review.author !== pr.author && !isBot(review.author))
    .map((review) => ({
      login: review.author,
      at: /** @type {string} */ (review.submittedAt),
      state: review.state,
      comments: review.comments + (review.state === 'COMMENTED' && review.comments === 0 ? 1 : 0),
    }))
  const fromComments = pr.comments
    .filter((comment) => comment.author !== pr.author && !isBot(comment.author))
    .map((comment) => ({ login: comment.author, at: comment.createdAt, state: /** @type {ReviewState | null} */ (null), comments: 1 }))

  return [...fromReviews, ...fromComments].sort((a, b) => a.at.localeCompare(b.at))
}

/**
 * @overload
 * @param {string} iso
 * @returns {number}
 */
/**
 * @overload
 * @param {string | null | undefined} iso
 * @returns {number | null}
 */
/** @param {string | null | undefined} iso */
export function minutes(iso) {
  return iso ? Math.round(Date.parse(iso) / 60_000) : null
}

// Production deployments: pull requests merged into master or main, back-merges between them aside.
/** @type {(pr: Pick<SnapshotPullRequest, 'mergedAt' | 'base' | 'head'>) => boolean} */
const isDeployment = (pr) => pr.mergedAt !== null && RELEASE_BASES.includes(pr.base) && !RELEASE_BASES.includes(pr.head)

// Per repository, the times of its deployments, and per branch the times it was merged, sorted.
/** @param {SnapshotPullRequest[]} pullRequests */
export function deliveryIndex(pullRequests) {
  /** @type {DeliveryIndex} */
  const index = { deployments: new Map(), branchMerges: new Map() }
  /** @type {(map: Map<string, string[]>, key: string, value: string) => unknown} */
  const add = (map, key, value) => (map.has(key) ? /** @type {string[]} */ (map.get(key)).push(value) : map.set(key, [value]))
  for (const pr of pullRequests) {
    if (isDeployment(pr)) {
      add(index.deployments, pr.repo, /** @type {string} */ (pr.mergedAt))
    }
    if (pr.mergedAt) {
      add(index.branchMerges, `${pr.repo}:${pr.head}`, pr.mergedAt)
    }
  }
  for (const map of Object.values(index)) {
    for (const times of map.values()) {
      times.sort()
    }
  }

  return index
}

// When a pull request reached production: merged into master or main, at once; into develop, with the next
// deployment of its repository; into another branch, a project one, with the next deployment once that branch is
// merged in turn. Null while it waits.
/**
 * @param {SnapshotPullRequest} pr
 * @param {DeliveryIndex} index
 * @returns {string | null}
 */
function deployedAt(pr, index) {
  if (!pr.mergedAt) {
    return null
  }
  if (RELEASE_BASES.includes(pr.base)) {
    return pr.mergedAt
  }
  /** @type {string | undefined} */
  let at = pr.mergedAt
  if (!INTEGRATION_BASES.includes(pr.base)) {
    at = index.branchMerges.get(`${pr.repo}:${pr.base}`)?.find((time) => time >= /** @type {string} */ (at))
    if (!at) {
      return null
    }
  }

  return index.deployments.get(pr.repo)?.find((time) => time >= at) ?? null
}

// Whether a pull request is one the page opens the timeline of (DETAILS_DAYS): open, or with an opening, a merge, a
// closing, a review or a comment since detailsSince (ISO, null for the open ones only).
/**
 * @param {SnapshotPullRequest} pr
 * @param {string | null} detailsSince
 */
function hasDetails(pr, detailsSince) {
  if (pr.state === 'OPEN') {
    return true
  }
  const times = [
    pr.createdAt,
    pr.mergedAt,
    pr.closedAt,
    ...pr.reviews.map((review) => review.submittedAt),
    ...pr.comments.map((comment) => comment.createdAt),
  ]

  return detailsSince !== null && times.some((at) => at && at >= detailsSince)
}

// What the page needs of a pull request to compute the stats of any range, see site/domain/period.js, and to show its
// timeline (detailsSince, see hasDetails()). Bot pull requests are only kept when they deploy or update a dependency
// (Dependabot).
/**
 * @param {SnapshotPullRequest} pr
 * @param {DeliveryIndex} index
 * @param {string | null} [detailsSince]
 * @returns {PullRequestRecord | null}
 */
export function toPeriodRecord(pr, index, detailsSince = null) {
  const kind = classify(pr)
  const production = kind === 'release' && RELEASE_BASES.includes(pr.base)
  const bot = isBot(pr.author)
  const deployment = isDeployment(pr)
  const hotfix = pr.head.startsWith('hotfix')
  // Dependabot branches read dependabot/<ecosystem>/<dependency>.
  const dependency = pr.head.startsWith('dependabot/') ? pr.head.split('/')[1] : null
  if (bot && !deployment && !dependency) {
    return null
  }
  // Only an open pull request ready for review waits for the people asked to review it.
  const requestedReviewers = pr.state === 'OPEN' && !pr.draft ? (pr.reviewRequests ?? []).filter((login) => !isBot(login)) : []

  return {
    repo: pr.repo,
    number: pr.number,
    author: pr.author,
    bot,
    kind,
    hotfix,
    production,
    createdAt: minutes(pr.createdAt),
    mergedAt: minutes(pr.mergedAt),
    closed: pr.state === 'CLOSED',
    lines: pr.additions + pr.deletions,
    mergedBy: pr.mergedBy && !isBot(pr.mergedBy) ? pr.mergedBy : null,
    interventions: reviewInterventions(pr).map(
      ({ login, at, state, comments }) => /** @type {Intervention} */ ([login, minutes(at), state, comments]),
    ),
    ...(deployment && { deployment: true }),
    // A revert merged into production undoes a deployment, as a hotfix repairs one: the title says it.
    ...(deployment && /^revert\b/i.test(pr.title) && { revert: true }),
    ...(kind === 'code' && !bot && { deployedAt: minutes(deployedAt(pr, index)) }),
    // The lines a merged code pull request deletes, among its lines: the others are added.
    ...(kind === 'code' && !bot && pr.mergedAt && { deleted: pr.deletions }),
    ...(/** @type {(CheckState | null)[]} */ (['FAILURE', 'ERROR']).includes(pr.checks) && { checksFailed: true }),
    ...(dependency && { dependency }),
    // An open draft is not waiting for anyone yet.
    ...(pr.state === 'OPEN' && pr.draft && { draft: true }),
    // An open pull request GitHub does not let merge yet, while code owners are still asked to review it.
    ...(pr.state === 'OPEN' && pr.reviewDecision !== 'APPROVED' && (pr.codeOwnerRequests?.length ?? 0) > 0 && { codeOwners: pr.codeOwnerRequests }),
    ...(requestedReviewers.length > 0 && { requestedReviewers }),
    // Only for the timelines the page opens: the title, and the state of the checks of the last commit (null without
    // any), read again at each sync for an open pull request.
    ...(hasDetails(pr, detailsSince) && { title: pr.title, checks: pr.checks ?? null }),
  }
}
