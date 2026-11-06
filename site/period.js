// Aggregates the pull requests of a time range into the stats the dashboard shows. Shared by the sync script, which
// prepares the records, and by the page, which computes the range picked by the user: both count the same way.
//
// A record is one pull request of the rolling window, times in minutes since the epoch:
// { repo, number, author, bot, kind, hotfix, production, createdAt, mergedAt, closed, lines, mergedBy, interventions }
// with interventions as [login, at, state, comments], oldest first, bots and the author left out. Optional fields:
// deployment (merged into master or main), revert (of a deployment), deployedAt (of a code pull request),
// checksFailed (at its last commit), dependency (the ecosystem of a Dependabot update), draft (still open as one),
// codeOwners (the code owners still asked to review it while GitHub does not let it merge: logins, teams as @slug, null
// for one the sync could not read) and deleted (the lines a merged code pull request deletes, among its lines: the
// others are added).

export const TIMEZONE = 'Europe/Paris'
export const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
const MINUTE_MS = 60_000
// Upper bounds (excluded) of the pull request size buckets, in changed lines.
export const SIZE_BUCKETS = [10, 100, 500, 1000, Infinity]
const TOP_HOTFIX_REPOS = 3

const parisDayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
// Paris is always a whole number of hours away from UTC: the day only depends on the UTC hour.
const parisDays = new Map()

export function parisDay(value) {
  const hour = Math.floor(new Date(value).getTime() / HOUR_MS)
  if (!parisDays.has(hour)) {
    parisDays.set(hour, parisDayFormat.format(hour * HOUR_MS))
  }

  return parisDays.get(hour)
}

export function addDays(day, days) {
  return new Date(Date.parse(`${day}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

// The instant a Paris day starts: the first UTC hour that already falls on that day.
export function parisMidnight(day) {
  let time = Date.parse(`${day}T00:00:00Z`) - 3 * HOUR_MS
  while (parisDay(time) < day) {
    time += HOUR_MS
  }

  return time
}

// Working time, the only time every delay of the dashboard counts: Monday to Friday, from 9 to 18, Paris time. A pull
// request opened on Friday evening and reviewed on Monday morning has not waited the weekend.
export const WORK_DAY_HOURS = 9
const WORK_START_HOUR = 9
const WORK_DAYS_A_WEEK = 5

const isWorkDay = (day) => ![0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay())
const dayNumber = (day) => Date.parse(`${day}T00:00:00Z`) / DAY_MS

// The working minutes of a Paris day between two instants, in minutes since the epoch. Clocks only change on Sundays:
// a working day always starts nine hours after its midnight.
function workMinutesOf(day, from, to) {
  if (!isWorkDay(day)) {
    return 0
  }
  const start = parisMidnight(day) / MINUTE_MS + WORK_START_HOUR * 60

  return Math.max(0, Math.min(to, start + WORK_DAY_HOURS * 60) - Math.max(from, start))
}

// The working hours between two instants, in minutes since the epoch.
export function workHoursBetween(from, to) {
  if (to <= from) {
    return 0
  }
  const first = parisDay(from * MINUTE_MS)
  const last = parisDay(to * MINUTE_MS)
  if (first === last) {
    return workMinutesOf(first, from, to) / 60
  }
  let minutes = workMinutesOf(first, from, to) + workMinutesOf(last, from, to)
  // The days in between are whole: seven of them in a row always hold five working days.
  const weeks = Math.floor((dayNumber(last) - dayNumber(first) - 1) / 7)
  minutes += weeks * WORK_DAYS_A_WEEK * WORK_DAY_HOURS * 60
  for (let day = addDays(first, 1 + weeks * 7); day < last; day = addDays(day, 1)) {
    minutes += isWorkDay(day) ? WORK_DAY_HOURS * 60 : 0
  }

  return minutes / 60
}

export const round = (value, digits = 0) => (value === null ? null : Number(value.toFixed(digits)))
const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0)
const keyOf = (pr) => `${pr.repo}#${pr.number}`
const sizeOf = (lines) => SIZE_BUCKETS.findIndex((max) => lines < max)

function median(values) {
  if (values.length === 0) {
    return null
  }
  const sorted = values.toSorted((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

// The value that this share of the values does not exceed.
function percentile(values, share) {
  if (values.length === 0) {
    return null
  }
  const sorted = values.toSorted((a, b) => a - b)

  return sorted[Math.max(0, Math.ceil(share * sorted.length) - 1)]
}

const isMissing = (value) => value === null || value === undefined
const rate = (part, total) => (total ? round(part / total, 3) : null)

function getOrCreate(map, key, create) {
  if (!map.has(key)) {
    map.set(key, create())
  }

  return map.get(key)
}

function bucketOfDay(day, bucket) {
  if (bucket === 'day') {
    return day
  }
  if (bucket === 'month') {
    return day.slice(0, 7)
  }
  const monday = new Date(`${day}T00:00:00Z`)
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))

  return monday.toISOString().slice(0, 10)
}

// First and last day of a bucket.
function bucketDays(key, bucket) {
  if (bucket === 'day') {
    return [key, key]
  }
  if (bucket === 'week') {
    return [key, addDays(key, 6)]
  }
  const [year, month] = key.split('-').map(Number)

  return [`${key}-01`, new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)]
}

// Buckets of the range [start, end), each flagged partial when the range does not cover all of its days.
function bucketsOf(start, end, bucket) {
  const firstDay = parisDay(start)
  const lastDay = parisDay(end - 1)
  const firstFullDay = parisMidnight(firstDay) === start ? firstDay : addDays(firstDay, 1)
  const lastFullDay = parisMidnight(addDays(lastDay, 1)) === end ? lastDay : addDays(lastDay, -1)
  const keys = []
  for (let day = firstDay; day <= lastDay; day = addDays(day, 1)) {
    const key = bucketOfDay(day, bucket)
    if (keys.at(-1) !== key) {
      keys.push(key)
    }
  }

  return keys.map((key) => {
    const [from, to] = bucketDays(key, bucket)

    return { key, partial: from < firstFullDay || to > lastFullDay }
  })
}

// Stats of the range [start, end), in milliseconds. Authors are counted on the pull requests they opened in it,
// whenever these were merged; reviewers on what they did in it.
export function computePeriod(records, { start, end, bucket }) {
  const startAt = Math.floor(start / MINUTE_MS)
  const endAt = Math.ceil(end / MINUTE_MS)
  const inRange = (at) => at !== null && at >= startAt && at < endAt
  const bucketKey = (at) => bucketOfDay(parisDay(at * MINUTE_MS), bucket)
  const keys = bucketsOf(start, end, bucket)
  const buckets = new Map(
    keys.map(({ key }) => [
      key,
      { key, opened: 0, merged: 0, comments: 0, approvals: 0, releases: 0, hotfixes: 0, deployments: 0, corrective: 0 },
    ]),
  )
  // Person stats are kept per repository so that the page can add them up over any selection of repositories.
  const authors = new Map()
  const reviewers = new Map()
  const reviewerSeries = new Map()
  const repositories = new Map()
  const reviewedPullRequests = new Set()
  const cycles = []
  const sizes = SIZE_BUCKETS.map((max) => ({ max, prs: 0, comments: 0, timesToMerge: [] }))
  let releases = 0
  let mergedWithFailedChecks = 0
  const bump = (at, field, amount = 1) => {
    const bucket = buckets.get(bucketKey(at))
    if (bucket) {
      bucket[field] += amount
    }
  }

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
  const reviewer = (login, repo) =>
    getOrCreate(getOrCreate(reviewers, login, () => new Map()), repo, () => ({
      reviewed: new Map(),
      approvedPrs: new Set(),
      silentApprovedPrs: new Set(),
      comments: 0,
      changesRequested: 0,
      merges: 0,
    }))
  const repository = (name) => getOrCreate(repositories, name, () => ({ repo: name, reviewed: new Set(), comments: 0 }))
  // Who reviews whom: each distinct reviewer of a code pull request opened in the range counts once for the pair of its
  // author and that reviewer, whenever the review came.
  const pairs = new Map()
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
  const delivery = new Map()
  const deliveryOf = (repo) => getOrCreate(delivery, repo, () => ({ deployments: 0, corrective: 0, leadTimes: [], restoreTimes: [] }))
  // The deployments of each repository per bucket, as [deployments, corrective ones], for the calendar of deployments.
  const calendar = new Map()
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
  const dependencies = new Map()
  const ecosystems = new Map()
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
  const hotfixes = { opened: 0, merged: 0, timesToMerge: [], timesToFirstReview: [], people: new Map(), repositories: new Map() }
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
      addDeployment(pr)
    }
    if (pr.dependency) {
      addDependency(pr)
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
      deliveryOf(pr.repo).leadTimes.push(workHoursBetween(pr.createdAt, pr.deployedAt))
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
    series: keys.map(({ key, partial }) => ({ ...buckets.get(key), partial })),
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
          const code = [...authors.get(login).values()].reduce((total, stats) => total + stats.code, 0)

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
function cycleOf(pr) {
  const merged = pr.mergedAt !== null
  const before = merged ? pr.interventions.filter(([, at]) => at <= pr.mergedAt) : pr.interventions
  const firstAt = before[0]?.[1] ?? null
  const approvedAt = before.findLast(([, , state]) => state === 'APPROVED')?.[1] ?? null
  const deployed = merged && !isMissing(pr.deployedAt)
  const hours = (from, to) => round(workHoursBetween(from, to), 1)

  return {
    pickup: firstAt === null ? null : hours(pr.createdAt, firstAt),
    review: merged && firstAt !== null ? hours(firstAt, approvedAt ?? pr.mergedAt) : null,
    merge: merged && approvedAt !== null ? hours(approvedAt, pr.mergedAt) : null,
    deploy: deployed ? hours(pr.mergedAt, pr.deployedAt) : null,
    toMerge: merged ? hours(pr.createdAt, pr.mergedAt) : null,
    toProduction: deployed ? hours(pr.createdAt, pr.deployedAt) : null,
  }
}

// Who reviews whom over a selection of repositories (a Set, or null for all of them), from the stats of a period.
// pairs: how many pull requests of an author each reviewer intervened on, busiest first. authors: for each author of
// code pull requests, how many were reviewed, by how many distinct reviewers, and the share of them the main reviewer
// intervened on (the dependency on the main reviewer).
export function reviewNetwork({ authors, reviewPairs }, selection = null) {
  const selected = (perRepository) =>
    Object.entries(perRepository).reduce((total, [repo, count]) => (selection && !selection.has(repo) ? total : total + count), 0)
  const pairs = reviewPairs
    .map(({ author, reviewer, repos }) => ({ author, reviewer, prs: selected(repos) }))
    .filter((pair) => pair.prs > 0)
    .sort((a, b) => b.prs - a.prs || a.author.localeCompare(b.author) || a.reviewer.localeCompare(b.reviewer))
  const pairsByAuthor = new Map()
  for (const pair of pairs) {
    getOrCreate(pairsByAuthor, pair.author, () => []).push(pair)
  }
  const pick = (repos, key) => Object.fromEntries(Object.entries(repos).map(([repo, stats]) => [repo, stats[key]]))

  return {
    pairs,
    authors: authors.flatMap(({ login, repos }) => {
      const code = selected(pick(repos, 'code'))
      if (code === 0) {
        return []
      }
      const reviewed = selected(pick(repos, 'reviewed'))
      // Pairs are sorted: the first one of an author is its main reviewer, alphabetical order breaking ties.
      const own = pairsByAuthor.get(login) ?? []

      return [
        {
          login,
          code,
          reviewed,
          reviewers: own.length,
          topReviewer: own[0]?.reviewer ?? null,
          topReviewerShare: reviewed ? round(own[0].prs / reviewed, 3) : null,
        },
      ]
    }),
  }
}

function deliveryStats(repositories) {
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

function dependencyStats(repositories, ecosystems) {
  const oldest = (rows) => {
    const times = rows.map((row) => row.oldestWaitingAt).filter((time) => time !== null)

    return times.length ? new Date(Math.min(...times) * MINUTE_MS).toISOString() : null
  }
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

// The bus factor of a repository: the fewest people who together wrote at least half of its code pull requests. counts
// holds the pull requests of each person still in the team, total those of everyone, people who left included: 0 when
// those still in the team wrote less than half of them, null without any pull request.
export function busFactor(counts, total) {
  if (total === 0) {
    return null
  }
  let written = 0
  for (const [index, count] of counts.toSorted((a, b) => b - a).entries()) {
    written += count
    if (2 * written >= total) {
      return index + 1
    }
  }

  return 0
}

// When each person first and last shows in the records, whatever the range: a pull request opened, a review or a
// comment, or a merge, as { first, last } in minutes since the epoch. Bot pull requests do not count for their author,
// but the people who review or merge them do. The records only cover the rolling window: a person already active at its
// start has been around for longer.
export function activityBounds(records) {
  const bounds = new Map()
  const seen = (login, at) => {
    const known = bounds.get(login)
    if (!known) {
      bounds.set(login, { first: at, last: at })
    } else {
      known.first = Math.min(known.first, at)
      known.last = Math.max(known.last, at)
    }
  }
  for (const pr of records) {
    if (!pr.bot) {
      seen(pr.author, pr.createdAt)
    }
    for (const [login, at] of pr.interventions) {
      seen(login, at)
    }
    if (pr.mergedBy && pr.mergedAt !== null) {
      seen(pr.mergedBy, pr.mergedAt)
    }
  }

  return bounds
}

// The figures of each person's month, those of monthlyActivity().
export const MONTHLY_FIGURES = ['code', 'hotfixes', 'reviewed', 'comments', 'added', 'deleted', 'opened']

// What each person did per Paris month ('YYYY-MM'), whatever the range, for the badges of the team page: code pull
// requests opened and hotfixes among them, pull requests of others reviewed (once a month however many reviews),
// comments left, and the lines added and deleted by their code pull requests merged that month. The month of the merge
// rather than of the opening: the sync keeps a month for good a week after its end, and a pull request merged later
// would miss it. Like the stats of a range, only code pull requests written by people count, but for the pull
// requests opened (opened), which also count those that merge a branch into another: opening them is work too. Releases
// stay out of it all.
export function monthlyActivity(records) {
  const people = new Map()
  const monthOf = (at) => parisDay(at * MINUTE_MS).slice(0, 7)
  const entry = (login, month) =>
    getOrCreate(getOrCreate(people, login, () => new Map()), month, () =>
      Object.fromEntries(MONTHLY_FIGURES.map((key) => [key, 0])),
    )
  for (const pr of records) {
    if (pr.bot || !['code', 'integration'].includes(pr.kind)) {
      continue
    }
    const opened = entry(pr.author, monthOf(pr.createdAt))
    opened.opened++
    if (pr.kind !== 'code') {
      continue
    }
    opened.code++
    if (pr.hotfix) {
      opened.hotfixes++
    }
    if (pr.mergedAt !== null) {
      const merged = entry(pr.author, monthOf(pr.mergedAt))
      merged.added += pr.lines - (pr.deleted ?? 0)
      merged.deleted += pr.deleted ?? 0
    }
    const reviewed = new Set()
    for (const [login, at, , comments] of pr.interventions) {
      const month = monthOf(at)
      const stats = entry(login, month)
      if (!reviewed.has(`${login}\n${month}`)) {
        reviewed.add(`${login}\n${month}`)
        stats.reviewed++
      }
      stats.comments += comments
    }
  }

  return people
}

// The top of the team for one figure of a monthly history ({ 'YYYY-MM': { login: figures } }), month by month, oldest
// first: how much, and who did that much, ties sharing it. A month nobody did any of it has no leader.
export function monthlyLeaders(history, key) {
  return Object.keys(history)
    .sort()
    .flatMap((month) => {
      const values = Object.entries(history[month]).map(([login, figures]) => [login, figures[key] ?? 0])
      const best = Math.max(0, ...values.map(([, value]) => value))

      return best > 0
        ? [{ month, value: best, people: values.filter(([, value]) => value === best).map(([login]) => login).sort() }]
        : []
    })
}

// The same month a year earlier ('YYYY-MM').
export const monthYearBefore = (month) => `${Number(month.slice(0, 4)) - 1}${month.slice(4)}`

// The median of each value and of the ones just before it, `size` values in all: none until that many follow each
// other, a missing value (null) breaking the run. Smooths the ups and downs of a monthly series without hiding a turn.
export function rollingMedian(values, size) {
  return values.map((_, index) => {
    const run = values.slice(Math.max(0, index - size + 1), index + 1)

    return run.length === size && run.every(Number.isFinite) ? median(run) : null
  })
}

// What a series of whole months, oldest first ([{ month, value }], null for a month without the figure), tells of its
// last month: its value, that of the same month a year earlier (null when the series does not have it), and the median
// of its last `yearMonths` months, the last one included, over the months that have the figure.
export function lastMonthSummary(points, yearMonths = 12) {
  const last = points.at(-1)
  if (!last) {
    return null
  }
  const yearAgo = points.find((point) => point.month === monthYearBefore(last.month))
  const recent = points
    .slice(-yearMonths)
    .map((point) => point.value)
    .filter(Number.isFinite)

  return {
    month: last.month,
    value: Number.isFinite(last.value) ? last.value : null,
    yearAgo: Number.isFinite(yearAgo?.value) ? yearAgo.value : null,
    yearMedian: median(recent),
  }
}

// The open code pull requests of people, drafts aside, and where each one stands after the latest decision of each
// reviewer, as GitHub reckons it: changes requested by someone (changes), else blocked by code owners who have not
// reviewed it yet (owners), else approved by as many people as merging needs (approved), else approved by fewer
// (approving), else reviewed or commented without a decision (discussed), else waiting for a first look (waiting).
// since: when it got there, in minutes since the epoch (the latest of these decisions, the opening for the code owners,
// the latest intervention, or the opening); by: who decided, or the code owners it waits for; lastAt: its latest review
// or comment, else its opening.
export function openPullRequests(records, { requiredApprovals = 1 } = {}) {
  return records
    .filter((pr) => !pr.bot && pr.kind === 'code' && pr.mergedAt === null && !pr.closed && !pr.draft)
    .map((pr) => {
      const decisions = new Map()
      for (const [login, at, state] of pr.interventions) {
        if (state === 'APPROVED' || state === 'CHANGES_REQUESTED') {
          decisions.set(login, { state, at })
        }
      }
      const decided = (state) => [...decisions].filter(([, decision]) => decision.state === state)
      const requested = decided('CHANGES_REQUESTED')
      const approved = decided('APPROVED')
      const owners = !requested.length && pr.codeOwners?.length > 0
      const deciders = requested.length ? requested : owners ? [] : approved
      const stance = requested.length
        ? 'changes'
        : owners
          ? 'owners'
          : approved.length >= requiredApprovals
          ? 'approved'
          : approved.length
            ? 'approving'
            : pr.interventions.length
              ? 'discussed'
              : 'waiting'

      return {
        repo: pr.repo,
        number: pr.number,
        author: pr.author,
        createdAt: pr.createdAt,
        lines: pr.lines,
        stance,
        since: owners
          ? pr.createdAt
          : deciders.length
            ? Math.max(...deciders.map(([, decision]) => decision.at))
            : (pr.interventions.at(-1)?.[1] ?? pr.createdAt),
        by: owners ? pr.codeOwners : deciders.map(([login]) => login).sort(),
        lastAt: pr.interventions.at(-1)?.[1] ?? pr.createdAt,
      }
    })
}

// CI stats of the range [start, end), from the runs per workflow and Paris day of the sync: a day counts whole.
export function computeCi(workflows, { start, end, bucket }) {
  const firstDay = parisDay(start)
  const lastDay = parisDay(end - 1)
  const keys = bucketsOf(start, end, bucket)
  const empty = () => ({ runs: 0, failed: 0, rerun: 0, durations: [] })
  const buckets = new Map(keys.map(({ key }) => [key, empty()]))
  const add = (stats, [runs, failed, rerun, durations]) => {
    stats.runs += runs
    stats.failed += failed
    stats.rerun += rerun
    // One by one: a busy workflow has more durations than a spread call takes arguments.
    for (const duration of durations) {
      stats.durations.push(duration)
    }
  }
  const summary = (stats) => ({
    runs: stats.runs,
    failureRate: rate(stats.failed, stats.runs),
    rerunRate: rate(stats.rerun, stats.runs),
    medianSeconds: median(stats.durations),
    p90Seconds: percentile(stats.durations, 0.9),
  })

  const total = empty()
  const rows = []
  for (const { repo, workflow, days } of workflows) {
    const stats = empty()
    for (const [day, values] of Object.entries(days)) {
      if (day >= firstDay && day <= lastDay) {
        add(stats, values)
        add(buckets.get(bucketOfDay(day, bucket)), values)
      }
    }
    if (stats.runs > 0) {
      add(total, [stats.runs, stats.failed, stats.rerun, stats.durations])
      rows.push({ repo, workflow, ...summary(stats) })
    }
  }

  return {
    totals: summary(total),
    series: keys.map(({ key, partial }) => ({ key, partial, ...summary(buckets.get(key)) })),
    workflows: rows,
  }
}
