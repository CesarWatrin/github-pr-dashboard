// Aggregates the pull requests of a time range into the stats the dashboard shows. Shared by the sync script, which
// prepares the records, and by the page, which computes the range picked by the user: both count the same way.
//
// A record is one pull request of the rolling window, times in minutes since the epoch:
// { repo, number, author, bot, kind, hotfix, production, createdAt, mergedAt, closed, lines, mergedBy, interventions }
// with interventions as [login, at, state, comments], oldest first, bots and the author left out. Optional fields:
// deployment (merged into master or main), revert (of a deployment), deployedAt (of a code pull request),
// checksFailed (at its last commit), dependency (the ecosystem of a Dependabot update), draft (still open as one),
// codeOwners (the code owners still asked to review it while GitHub does not let it merge: logins, teams as @slug, null
// for one the sync could not read), requestedReviewers (the people still asked to review an open pull request that is
// not a draft, code owners or not: logins only, teams and bots aside), deleted (the lines a merged code pull request
// deletes, among its lines: the others are added), project (the name of the project of a code pull request of a person,
// and of the merge of a project branch into a long-lived branch, which projectMerge flags: see projects.js), and for the
// pull requests the page opens the timeline of only (open,
// or with any activity over the last 30 days), title and checks (the state of the checks of its last commit: SUCCESS,
// FAILURE, ERROR, PENDING or EXPECTED, null without any). The other modules of this folder read the same records; the
// parts of the stats of a range are counted in period/.

import { authorTally } from './period/authors.js'
import { deliveryTally } from './period/delivery.js'
import { dependencyTally } from './period/dependencies.js'
import { hotfixTally } from './period/hotfixes.js'
import { reviewerTally } from './period/reviewers.js'
import { rangeSeries } from './period/series.js'
import { sizeTally } from './period/sizes.js'

// Stats of the range [start, end), in milliseconds. Authors are counted on the pull requests they opened in it,
// whenever these were merged; reviewers on what they did in it. One pass over the records feeds each tally of period/.
/**
 * @param {PullRequestRecord[]} records
 * @param {TimeRange} range
 */
export function computePeriod(records, range) {
  const series = rangeSeries(range)
  const sizes = sizeTally()
  const hotfixes = hotfixTally(series)
  const authors = authorTally(series, { sizes, hotfixes })
  const reviewers = reviewerTally(series)
  const delivery = deliveryTally(series)
  const dependencies = dependencyTally(series)
  let releases = 0

  for (const pr of records) {
    // Release pull requests count whoever opened them: release-please ones come from a bot.
    if (pr.kind === 'release' && pr.production && series.inRange(pr.mergedAt)) {
      releases++
      series.bump(pr.mergedAt, 'releases')
    }
    if (pr.deployment && series.inRange(pr.mergedAt)) {
      delivery.addDeployment(/** @type {PullRequestRecord & { mergedAt: number }} */ (pr))
    }
    if (pr.dependency) {
      dependencies.add(/** @type {PullRequestRecord & { dependency: string }} */ (pr))
    }

    // Everything else only covers code pull requests written by people.
    if (pr.bot) {
      continue
    }
    const opened = series.inRange(pr.createdAt)
    if (opened) {
      authors.addOpened(pr)
    }
    if (pr.kind !== 'code') {
      continue
    }
    delivery.addLeadTime(pr)
    if (opened) {
      authors.addCode(pr)
    }
    reviewers.add(pr)
  }

  const written = authors.totals()
  const read = reviewers.totals()
  const { delivery: deliveryStats, deploymentCalendar } = delivery.result()

  return {
    bucket: series.bucket,
    totals: {
      opened: written.opened,
      merged: written.merged,
      medianTimeToMergeHours: written.medianTimeToMergeHours,
      medianSize: written.medianSize,
      added: written.added,
      deleted: written.deleted,
      releases,
      hotfixShare: written.hotfixShare,
      unreviewedShare: written.unreviewedShare,
      reviewed: read.reviewed,
      commentsPerPr: read.commentsPerPr,
      silentApprovalRate: read.silentApprovalRate,
      checksFailedShare: written.checksFailedShare,
    },
    series: series.points(),
    authors: authors.authors(),
    reviewers: reviewers.reviewers(),
    reviewPairs: authors.reviewPairs(),
    reviewerSeries: reviewers.reviewerSeries(),
    sizes: sizes.result(),
    tma: hotfixes.result(authors.codeOf),
    repositories: reviewers.repositories(),
    cycles: authors.cycles(),
    delivery: deliveryStats,
    deploymentCalendar,
    dependencies: dependencies.result(),
  }
}
