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
// deletes, among its lines: the others are added), and for the pull requests the page opens the timeline of only (open,
// or with any activity over the last 30 days), title and checks (the state of the checks of its last commit: SUCCESS,
// FAILURE, ERROR, PENDING or EXPECTED, null without any). The other modules of this folder read the same records.

import { bucketOfDay, bucketsOf } from './buckets.js'
import { getOrCreate, isMissing, median, rate, round, sum } from './math.js'
import { MINUTE_MS, parisDay, workHoursBetween } from './time.js'

// Upper bounds (excluded) of the pull request size buckets, in changed lines.
export const SIZE_BUCKETS = [10, 100, 500, 1000, Infinity]
const TOP_HOTFIX_REPOS = 3

// What happened in a bucket of the series.
/** @typedef {{ key: string, opened: number, merged: number, comments: number, approvals: number, releases: number, hotfixes: number, deployments: number, corrective: number }} BucketCounts */
// What a person opened in a repository over the range.
/** @typedef {{ opened: number, code: number, release: number, integration: number, merged: number, closedUnmerged: number, unreviewed: number, hotfix: number, reviewed: number, timesToMerge: number[], timesToFirstReview: number[], sizes: number[], added: number, deleted: number }} AuthorTally */
// What a person reviewed in a repository over the range, the pull requests by key.
/** @typedef {{ reviewed: Map<string, PullRequestRecord>, approvedPrs: Set<string>, silentApprovedPrs: Set<string>, comments: number, changesRequested: number, merges: number }} ReviewerTally */
// The deployments of a repository, and the delays of its code and of its corrective deployments.
/** @typedef {{ deployments: number, corrective: number, leadTimes: number[], restoreTimes: number[] }} DeliveryTally */
// The Dependabot updates of a repository.
/** @typedef {{ opened: number, merged: number, closed: number, timesToMerge: number[], waiting: number, oldestWaitingAt: number | null }} DependencyTally */

/** @param {PullRequestRecord} pr */
const keyOf = (pr) => `${pr.repo}#${pr.number}`
/** @param {number} lines */
const sizeOf = (lines) => SIZE_BUCKETS.findIndex((max) => lines < max)

// Stats of the range [start, end), in milliseconds. Authors are counted on the pull requests they opened in it,
// whenever these were merged; reviewers on what they did in it.
/**
 * @param {PullRequestRecord[]} records
 * @param {TimeRange} range
 */
export function computePeriod(records, { start, end, bucket }) {
  const startAt = Math.floor(start / MINUTE_MS)
  const endAt = Math.ceil(end / MINUTE_MS)
  /**
   * @param {number | null} at
   * @returns {at is number}
   */
  const inRange = (at) => at !== null && at >= startAt && at < endAt
  /** @param {number} at */
  const bucketKey = (at) => bucketOfDay(parisDay(at * MINUTE_MS), bucket)
  const keys = bucketsOf(start, end, bucket)
  /** @type {Map<string, BucketCounts>} */
  const buckets = new Map(
    keys.map(({ key }) => [
      key,
      { key, opened: 0, merged: 0, comments: 0, approvals: 0, releases: 0, hotfixes: 0, deployments: 0, corrective: 0 },
    ]),
  )
  // Person stats are kept per repository so that the page can add them up over any selection of repositories.
  /** @type {Map<string, Map<string, AuthorTally>>} */
  const authors = new Map()
  /** @type {Map<string, Map<string, ReviewerTally>>} */
  const reviewers = new Map()
  /** @type {Map<string, Map<string, { prs: number, comments: number }>>} */
  const reviewerSeries = new Map()
  /** @type {Map<string, { repo: string, reviewed: Set<string>, comments: number }>} */
  const repositories = new Map()
  /** @type {Set<string>} */
  const reviewedPullRequests = new Set()
  /** @type {({ repo: string, bucket: string, size: number } & ReturnType<typeof cycleOf>)[]} */
  const cycles = []
  /** @type {{ max: number, prs: number, comments: number, timesToMerge: number[] }[]} */
  const sizes = SIZE_BUCKETS.map((max) => ({ max, prs: 0, comments: 0, timesToMerge: [] }))
  let releases = 0
  let mergedWithFailedChecks = 0
  /**
   * @param {number} at
   * @param {Exclude<keyof BucketCounts, 'key'>} field
   * @param {number} [amount]
   */
  const bump = (at, field, amount = 1) => {
    const bucket = buckets.get(bucketKey(at))
    if (bucket) {
      bucket[field] += amount
    }
  }

  /**
   * @param {string} login
   * @param {string} repo
   * @returns {AuthorTally}
   */
  const author = (login, repo) =>
    getOrCreate(getOrCreate(authors, login, () => new Map()), repo, () => ({
      opened: 0,
      code: 0,
      release: 0,
      integration: 0,
      merged: 0,
      closedUnmerged: 0,
      unreviewed: 0,
      hotfix: 0,
      reviewed: 0,
      timesToMerge: [],
      timesToFirstReview: [],
      sizes: [],
      added: 0,
      deleted: 0,
    }))
  /**
   * @param {string} login
   * @param {string} repo
   * @returns {ReviewerTally}
   */
  const reviewer = (login, repo) =>
    getOrCreate(getOrCreate(reviewers, login, () => new Map()), repo, () => ({
      reviewed: new Map(),
      approvedPrs: new Set(),
      silentApprovedPrs: new Set(),
      comments: 0,
      changesRequested: 0,
      merges: 0,
    }))
  /** @param {string} name */
  const repository = (name) => getOrCreate(repositories, name, () => ({ repo: name, reviewed: new Set(), comments: 0 }))
  // Who reviews whom: each distinct reviewer of a code pull request opened in the range counts once for the pair of its
  // author and that reviewer, whenever the review came.
  /** @type {Map<string, { author: string, reviewer: string, repos: Map<string, number> }>} */
  const pairs = new Map()
  /**
   * @param {string} authorLogin
   * @param {string} reviewerLogin
   * @param {string} repo
   */
  const addPair = (authorLogin, reviewerLogin, repo) => {
    const pair = getOrCreate(pairs, `${authorLogin}\n${reviewerLogin}`, () => ({
      author: authorLogin,
      reviewer: reviewerLogin,
      repos: new Map(),
    }))
    pair.repos.set(repo, (pair.repos.get(repo) ?? 0) + 1)
  }

  // DORA: deployments, the delay of code to production, the corrective deployments (hotfixes and reverts, the
  // rework rate) and their own delay (the time to restore).
  /** @type {Map<string, DeliveryTally>} */
  const delivery = new Map()
  /** @param {string} repo */
  const deliveryOf = (repo) => getOrCreate(delivery, repo, () => ({ deployments: 0, corrective: 0, leadTimes: [], restoreTimes: [] }))
  // The deployments of each repository per bucket, as [deployments, corrective ones], for the calendar of deployments.
  /** @type {Map<string, Map<string, [number, number]>>} */
  const calendar = new Map()
  // A deployment merged in the range.
  /** @param {PullRequestRecord & { mergedAt: number }} pr */
  const addDeployment = (pr) => {
    const stats = deliveryOf(pr.repo)
    const cell = getOrCreate(getOrCreate(calendar, pr.repo, () => new Map()), bucketKey(pr.mergedAt), () => [0, 0])
    stats.deployments++
    cell[0]++
    bump(pr.mergedAt, 'deployments')
    if (pr.hotfix || pr.revert) {
      stats.corrective++
      cell[1]++
      stats.restoreTimes.push(workHoursBetween(pr.createdAt, pr.mergedAt))
      bump(pr.mergedAt, 'corrective')
    }
  }

  // Dependabot: the updates opened over the range, and those still waiting whatever the range.
  /** @type {Map<string, DependencyTally>} */
  const dependencies = new Map()
  /** @type {Map<string, { opened: number, merged: number }>} */
  const ecosystems = new Map()
  // A Dependabot update.
  /** @param {PullRequestRecord & { dependency: string }} pr */
  const addDependency = (pr) => {
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
    if (!inRange(pr.createdAt)) {
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
  }

  // TMA: the hotfix pull requests and the people who make them.
  /**
   * @type {{ opened: number, merged: number, timesToMerge: number[], timesToFirstReview: number[],
   *   people: Map<string, { hotfixes: number, timesToMerge: number[], repositories: Map<string, number>, lastAt: number }>,
   *   repositories: Map<string, number> }}
   */
  const hotfixes = { opened: 0, merged: 0, timesToMerge: [], timesToFirstReview: [], people: new Map(), repositories: new Map() }
  /** @param {PullRequestRecord} pr */
  const addHotfix = (pr) => {
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
    bump(pr.createdAt, 'hotfixes')
    if (pr.interventions.length > 0) {
      hotfixes.timesToFirstReview.push(workHoursBetween(pr.createdAt, pr.interventions[0][1]))
    }
    if (pr.mergedAt !== null) {
      const timeToMerge = workHoursBetween(pr.createdAt, pr.mergedAt)
      hotfixes.merged++
      hotfixes.timesToMerge.push(timeToMerge)
      person.timesToMerge.push(timeToMerge)
    }
  }

  for (const pr of records) {
    // Release pull requests count whoever opened them: release-please ones come from a bot.
    if (pr.kind === 'release' && pr.production && inRange(pr.mergedAt)) {
      releases++
      bump(pr.mergedAt, 'releases')
    }

    if (pr.deployment && inRange(pr.mergedAt)) {
      addDeployment(/** @type {PullRequestRecord & { mergedAt: number }} */ (pr))
    }
    if (pr.dependency) {
      addDependency(/** @type {PullRequestRecord & { dependency: string }} */ (pr))
    }

    // Everything else only covers code pull requests written by people.
    if (pr.bot) {
      continue
    }
    const opened = inRange(pr.createdAt)
    if (opened) {
      author(pr.author, pr.repo)[pr.kind]++
      author(pr.author, pr.repo).opened++
      bump(pr.createdAt, 'opened')
    }
    if (pr.kind !== 'code') {
      continue
    }
    if (inRange(pr.deployedAt ?? null)) {
      deliveryOf(pr.repo).leadTimes.push(workHoursBetween(pr.createdAt, /** @type {number} */ (pr.deployedAt)))
    }

    if (opened) {
      cycles.push({ repo: pr.repo, bucket: bucketKey(pr.createdAt), size: sizeOf(pr.lines), ...cycleOf(pr) })
      const stats = author(pr.author, pr.repo)
      if (pr.hotfix) {
        stats.hotfix++
        addHotfix(pr)
      }
      if (pr.interventions.length > 0) {
        stats.timesToFirstReview.push(workHoursBetween(pr.createdAt, pr.interventions[0][1]))
      }
      // The sync already leaves the author out of the interventions: checked again, an author never reviews itself.
      const prReviewers = new Set(pr.interventions.map(([login]) => login).filter((login) => login !== pr.author))
      if (prReviewers.size > 0) {
        stats.reviewed++
      }
      for (const login of prReviewers) {
        addPair(pr.author, login, pr.repo)
      }
      if (pr.mergedAt !== null) {
        const timeToMerge = workHoursBetween(pr.createdAt, pr.mergedAt)
        stats.merged++
        stats.timesToMerge.push(timeToMerge)
        stats.sizes.push(pr.lines)
        stats.added += pr.lines - (pr.deleted ?? 0)
        stats.deleted += pr.deleted ?? 0
        if (pr.interventions.length === 0) {
          stats.unreviewed++
        }
        if (pr.checksFailed) {
          mergedWithFailedChecks++
        }
        const size = sizes[sizeOf(pr.lines)]
        size.prs++
        size.timesToMerge.push(timeToMerge)
        size.comments += pr.interventions.reduce((total, [, , , comments]) => total + comments, 0)
      } else if (pr.closed) {
        stats.closedUnmerged++
      }
    }

    if (inRange(pr.mergedAt)) {
      bump(pr.mergedAt, 'merged')
      if (pr.mergedBy) {
        reviewer(pr.mergedBy, pr.repo).merges++
      }
    }

    const key = keyOf(pr)
    const commenters = new Set(pr.interventions.filter(([, , , comments]) => comments > 0).map(([login]) => login))
    for (const [login, at, state, comments] of pr.interventions) {
      if (!inRange(at)) {
        continue
      }
      const stats = reviewer(login, pr.repo)
      const repo = repository(pr.repo)
      const series = getOrCreate(reviewerSeries, login, () => new Map())
      const point = getOrCreate(series, bucketKey(at), () => ({ prs: 0, comments: 0 }))
      if (!stats.reviewed.has(key)) {
        stats.reviewed.set(key, pr)
        point.prs++
      }
      reviewedPullRequests.add(key)
      repo.reviewed.add(key)

      stats.comments += comments
      point.comments += comments
      repo.comments += comments
      bump(at, 'comments', comments)
      if (state === 'APPROVED') {
        bump(at, 'approvals')
        stats.approvedPrs.add(key)
        if (!commenters.has(login)) {
          stats.silentApprovedPrs.add(key)
        }
      } else if (state === 'CHANGES_REQUESTED') {
        stats.changesRequested++
      }
    }
  }

  const authorStats = [...authors.values()].flatMap((perRepository) => [...perRepository.values()])
  const reviewerStats = [...reviewers.values()].flatMap((perRepository) => [...perRepository.values()])
  const reviewerPrs = reviewerStats.reduce((total, stats) => total + stats.reviewed.size, 0)
  const approvedPairs = reviewerStats.reduce((total, stats) => total + stats.approvedPrs.size, 0)
  const silentPairs = reviewerStats.reduce((total, stats) => total + stats.silentApprovedPrs.size, 0)
  const merged = sum(authorStats, 'merged')
  const code = sum(authorStats, 'code')

  return {
    bucket,
    totals: {
      opened: sum(authorStats, 'opened'),
      merged,
      medianTimeToMergeHours: round(median(authorStats.flatMap((stats) => stats.timesToMerge)), 1),
      medianSize: round(median(authorStats.flatMap((stats) => stats.sizes))),
      added: sum(authorStats, 'added'),
      deleted: sum(authorStats, 'deleted'),
      releases,
      hotfixShare: code ? round(sum(authorStats, 'hotfix') / code, 3) : null,
      unreviewedShare: merged ? round(sum(authorStats, 'unreviewed') / merged, 3) : null,
      reviewed: reviewedPullRequests.size,
      commentsPerPr: reviewerPrs ? round(sum(reviewerStats, 'comments') / reviewerPrs, 2) : null,
      silentApprovalRate: approvedPairs ? round(silentPairs / approvedPairs, 3) : null,
      checksFailedShare: rate(mergedWithFailedChecks, merged),
    },
    series: keys.map(({ key, partial }) => ({ .../** @type {BucketCounts} */ (buckets.get(key)), partial })),
    // Durations and sizes stay as lists: medians cannot be added up across repositories.
    authors: [...authors].map(([login, perRepository]) => ({
      login,
      repos: Object.fromEntries(
        [...perRepository].map(([repo, stats]) => [
          repo,
          {
            code: stats.code,
            release: stats.release,
            integration: stats.integration,
            merged: stats.merged,
            closedUnmerged: stats.closedUnmerged,
            unreviewed: stats.unreviewed,
            reviewed: stats.reviewed,
            timesToFirstReviewHours: stats.timesToFirstReview.map((hours) => round(hours, 1)),
            timesToMergeHours: stats.timesToMerge.map((hours) => round(hours, 1)),
            sizes: stats.sizes,
            added: stats.added,
            deleted: stats.deleted,
          },
        ]),
      ),
    })),
    reviewers: [...reviewers].map(([login, perRepository]) => ({
      login,
      repos: Object.fromEntries(
        [...perRepository].map(([repo, stats]) => [
          repo,
          {
            prs: stats.reviewed.size,
            comments: stats.comments,
            approved: stats.approvedPrs.size,
            silentApproved: stats.silentApprovedPrs.size,
            changesRequested: stats.changesRequested,
            merges: stats.merges,
            sizes: [...stats.reviewed.values()].map((pr) => pr.lines),
          },
        ]),
      ),
    })),
    reviewPairs: [...pairs.values()].map(({ author: authorLogin, reviewer: reviewerLogin, repos }) => ({
      author: authorLogin,
      reviewer: reviewerLogin,
      repos: Object.fromEntries(repos),
    })),
    reviewerSeries: Object.fromEntries(
      [...reviewerSeries].map(([login, series]) => [
        login,
        keys.map(({ key }) => {
          const point = series.get(key)

          return point ? [point.prs, point.comments] : [0, 0]
        }),
      ]),
    ),
    sizes: sizes.map((bucket) => ({
      max: Number.isFinite(bucket.max) ? bucket.max : null,
      prs: bucket.prs,
      medianTimeToMergeHours: round(median(bucket.timesToMerge), 1),
      commentsPerPr: bucket.prs ? round(bucket.comments / bucket.prs, 2) : null,
    })),
    tma: {
      opened: hotfixes.opened,
      merged: hotfixes.merged,
      medianTimeToMergeHours: round(median(hotfixes.timesToMerge), 1),
      medianTimeToFirstReviewHours: round(median(hotfixes.timesToFirstReview), 1),
      people: [...hotfixes.people]
        .map(([login, person]) => {
          const code = [.../** @type {Map<string, AuthorTally>} */ (authors.get(login)).values()].reduce((total, stats) => total + stats.code, 0)

          return {
            login,
            hotfixes: person.hotfixes,
            share: round(person.hotfixes / code, 3),
            medianTimeToMergeHours: round(median(person.timesToMerge), 1),
            topRepos: [...person.repositories].sort((a, b) => b[1] - a[1]).slice(0, TOP_HOTFIX_REPOS),
            lastAt: new Date(person.lastAt * MINUTE_MS).toISOString(),
          }
        })
        .sort((a, b) => b.hotfixes - a.hotfixes),
      repositories: [...hotfixes.repositories]
        .map(([repo, count]) => ({ repo, hotfixes: count }))
        .sort((a, b) => b.hotfixes - a.hotfixes),
    },
    repositories: [...repositories.values()]
      .map((stats) => ({ repo: stats.repo, prs: stats.reviewed.size, comments: stats.comments }))
      .sort((a, b) => b.prs - a.prs),
    // One entry per code pull request opened in the range, for the cycle page to add up over any repositories.
    cycles,
    delivery: deliveryStats([...delivery].map(([repo, stats]) => ({ repo, ...stats }))),
    // Per repository with deployments, one [deployments, corrective ones] per bucket of the series.
    deploymentCalendar: [...calendar].map(([repo, perBucket]) => ({ repo, buckets: keys.map(({ key }) => perBucket.get(key) ?? [0, 0]) })),
    dependencies: dependencyStats(
      [...dependencies].map(([repo, stats]) => ({ repo, ...stats })),
      [...ecosystems].map(([ecosystem, stats]) => ({ ecosystem, ...stats })),
    ),
  }
}

// Where the time of a code pull request goes, in hours, each stage null when it did not go through it: waiting for a
// first look (pickup), from that first review or comment to the last approval before the merge, or to the merge
// without any (review), from that approval to the merge (merge), from the merge to production (deploy), and from the
// opening to the merge and to production. What comes after the merge does not count: the pull request was already in.
/** @param {PullRequestRecord} pr */
function cycleOf(pr) {
  const merged = pr.mergedAt !== null
  // Read only once merged, as deployedAt once deployed.
  const mergedAt = /** @type {number} */ (pr.mergedAt)
  const before = merged ? pr.interventions.filter(([, at]) => at <= mergedAt) : pr.interventions
  const firstAt = before[0]?.[1] ?? null
  const approvedAt = before.findLast(([, , state]) => state === 'APPROVED')?.[1] ?? null
  const deployed = merged && !isMissing(pr.deployedAt)
  const deployedAt = /** @type {number} */ (pr.deployedAt)
  /**
   * @param {number} from
   * @param {number} to
   */
  const hours = (from, to) => round(workHoursBetween(from, to), 1)

  return {
    pickup: firstAt === null ? null : hours(pr.createdAt, firstAt),
    review: merged && firstAt !== null ? hours(firstAt, approvedAt ?? mergedAt) : null,
    merge: merged && approvedAt !== null ? hours(approvedAt, mergedAt) : null,
    deploy: deployed ? hours(mergedAt, deployedAt) : null,
    toMerge: merged ? hours(pr.createdAt, mergedAt) : null,
    toProduction: deployed ? hours(pr.createdAt, deployedAt) : null,
  }
}

/** @param {({ repo: string } & DeliveryTally)[]} repositories */
function deliveryStats(repositories) {
  /** @param {DeliveryTally[]} rows */
  const summary = (rows) => ({
    deployments: sum(rows, 'deployments'),
    corrective: sum(rows, 'corrective'),
    medianLeadTimeHours: round(median(rows.flatMap((row) => row.leadTimes)), 1),
    reworkRate: rate(sum(rows, 'corrective'), sum(rows, 'deployments')),
    medianRestoreHours: round(median(rows.flatMap((row) => row.restoreTimes)), 1),
  })

  return {
    ...summary(repositories),
    repositories: repositories
      .filter((row) => row.deployments > 0 || row.leadTimes.length > 0)
      .map((row) => ({ repo: row.repo, ...summary([row]) })),
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
