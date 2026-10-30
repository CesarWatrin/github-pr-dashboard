// Aggregates the pull requests of a time range into the stats the dashboard shows. Shared by the sync script, which
// prepares the records, and by the page, which computes the range picked by the user: both count the same way.
//
// A record is one pull request of the rolling window, times in minutes since the epoch:
// { repo, number, author, bot, kind, hotfix, production, createdAt, mergedAt, closed, lines, mergedBy, interventions }
// with interventions as [login, at, state, comments], oldest first, bots and the author left out. Optional fields:
// deployment (merged into master or main), revert (of a deployment), deployedAt (of a code pull request),
// checksFailed (at its last commit) and dependency (the ecosystem of a Dependabot update).

export const TIMEZONE = 'Europe/Paris'
export const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
const MINUTE_MS = 60_000
// Upper bounds (excluded) of the pull request size buckets, in changed lines.
const SIZE_BUCKETS = [10, 100, 500, 1000, Infinity]
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

export const round = (value, digits = 0) => (value === null ? null : Number(value.toFixed(digits)))
const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0)
const hoursBetween = (from, to) => (to - from) / 60
const keyOf = (pr) => `${pr.repo}#${pr.number}`

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
      timesToMerge: [],
      timesToFirstReview: [],
      sizes: [],
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

  // DORA: deployments, the delay of code to production, the corrective deployments (hotfixes and reverts, the
  // rework rate) and their own delay (the time to restore).
  const delivery = new Map()
  const deliveryOf = (repo) => getOrCreate(delivery, repo, () => ({ deployments: 0, corrective: 0, leadTimes: [], restoreTimes: [] }))
  const addDeployment = (pr) => {
    const stats = deliveryOf(pr.repo)
    stats.deployments++
    bump(pr.mergedAt, 'deployments')
    if (pr.hotfix || pr.revert) {
      stats.corrective++
      stats.restoreTimes.push(hoursBetween(pr.createdAt, pr.mergedAt))
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
      stats.timesToMerge.push(hoursBetween(pr.createdAt, pr.mergedAt))
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
      hotfixes.timesToFirstReview.push(hoursBetween(pr.createdAt, pr.interventions[0][1]))
    }
    if (pr.mergedAt !== null) {
      const timeToMerge = hoursBetween(pr.createdAt, pr.mergedAt)
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
      deliveryOf(pr.repo).leadTimes.push(hoursBetween(pr.createdAt, pr.deployedAt))
    }

    if (opened) {
      const stats = author(pr.author, pr.repo)
      if (pr.hotfix) {
        stats.hotfix++
        addHotfix(pr)
      }
      if (pr.interventions.length > 0) {
        stats.timesToFirstReview.push(hoursBetween(pr.createdAt, pr.interventions[0][1]))
      }
      if (pr.mergedAt !== null) {
        const timeToMerge = hoursBetween(pr.createdAt, pr.mergedAt)
        stats.merged++
        stats.timesToMerge.push(timeToMerge)
        stats.sizes.push(pr.lines)
        if (pr.interventions.length === 0) {
          stats.unreviewed++
        }
        if (pr.checksFailed) {
          mergedWithFailedChecks++
        }
        const size = sizes.find((bucket) => pr.lines < bucket.max)
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
  const reviewPairs = reviewerStats.reduce((total, stats) => total + stats.reviewed.size, 0)
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
      releases,
      hotfixShare: code ? round(sum(authorStats, 'hotfix') / code, 3) : null,
      unreviewedShare: merged ? round(sum(authorStats, 'unreviewed') / merged, 3) : null,
      reviewed: reviewedPullRequests.size,
      commentsPerPr: reviewPairs ? round(sum(reviewerStats, 'comments') / reviewPairs, 2) : null,
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
            timesToFirstReviewHours: stats.timesToFirstReview.map((hours) => round(hours, 1)),
            timesToMergeHours: stats.timesToMerge.map((hours) => round(hours, 1)),
            sizes: stats.sizes,
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
    delivery: deliveryStats([...delivery].map(([repo, stats]) => ({ repo, ...stats }))),
    dependencies: dependencyStats(
      [...dependencies].map(([repo, stats]) => ({ repo, ...stats })),
      [...ecosystems].map(([ecosystem, stats]) => ({ ecosystem, ...stats })),
    ),
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
