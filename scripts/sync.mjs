// Syncs the pull requests of a GitHub organization and writes the aggregated stats read by the dashboard.
//
// The raw pull requests are kept in a local snapshot: the first run fetches the whole rolling window
// repository by repository, the next runs only fetch the pull requests updated since the last sync.
//
// Usage: node scripts/sync.mjs [--full] [--watch]

import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const ORG = process.env.ORG ?? 'PDC-HCSE'
const WINDOW_DAYS = 365
const SNAPSHOT_PATH = process.env.SNAPSHOT_PATH ?? '.cache/snapshot.json'
const STATS_PATH = process.env.STATS_PATH ?? 'site/data/stats.json'
const TIMEZONE = 'Europe/Paris'
const WATCH_INTERVAL_MS = 60_000
const SYNC_OVERLAP_MS = 10 * 60_000
const SEARCH_RESULT_LIMIT = 1000
const CONCURRENCY = 4
const EVENTS_LIMIT = 50
const EVENTS_MAX_AGE_DAYS = 7
const DAY_MS = 86_400_000

const PERIODS = [
  { key: '30d', days: 30, bucket: 'day' },
  { key: '90d', days: 90, bucket: 'week' },
  { key: '365d', days: 365, bucket: 'month' },
]

const BOTS = new Set([
  'dependabot',
  'github-actions',
  'copilot-swe-agent',
  'copilot-pull-request-reviewer',
  'coderabbitai',
  'it-hellocse',
  'ghost',
])

const REVIEW_FIELDS = 'author { login } state submittedAt comments { totalCount }'

const PULL_REQUEST_FIELDS = `
  number title state createdAt mergedAt closedAt additions deletions headRefName baseRefName
  repository { name }
  author { login }
  mergedBy { login }
  reviews(first: 50) { pageInfo { hasNextPage endCursor } nodes { ${REVIEW_FIELDS} } }
`

const REPOSITORIES_QUERY = `
  query($org: String!, $cursor: String) {
    organization(login: $org) {
      repositories(first: 100, after: $cursor, orderBy: { field: PUSHED_AT, direction: DESC }) {
        pageInfo { hasNextPage endCursor }
        nodes { name pushedAt }
      }
    }
  }`

const REPOSITORY_PULL_REQUESTS_QUERY = `
  query($org: String!, $name: String!, $cursor: String) {
    repository(owner: $org, name: $name) {
      pullRequests(first: 25, after: $cursor, orderBy: { field: CREATED_AT, direction: DESC }) {
        pageInfo { hasNextPage endCursor }
        nodes { ${PULL_REQUEST_FIELDS} }
      }
    }
  }`

const SEARCH_PULL_REQUESTS_QUERY = `
  query($query: String!, $cursor: String) {
    search(query: $query, type: ISSUE, first: 50, after: $cursor) {
      issueCount
      pageInfo { hasNextPage endCursor }
      nodes { ... on PullRequest { ${PULL_REQUEST_FIELDS} } }
    }
  }`

const REVIEWS_QUERY = `
  query($org: String!, $name: String!, $number: Int!, $cursor: String) {
    repository(owner: $org, name: $name) {
      pullRequest(number: $number) {
        reviews(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes { ${REVIEW_FIELDS} }
        }
      }
    }
  }`

const parisDayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const token = resolveToken()

function resolveToken() {
  const envToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  if (envToken) {
    return envToken
  }
  if (process.env.CI) {
    throw new Error('No GitHub token: set the ORG_STATS_TOKEN repository secret.')
  }

  return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim()
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function graphql(query, variables, attempt = 1) {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      authorization: `bearer ${token}`,
      'content-type': 'application/json',
      'user-agent': 'github-pr-dashboard',
    },
    body: JSON.stringify({ query, variables }),
  })

  const retryable = response.status >= 500 || response.status === 403 || response.status === 429
  if (retryable && attempt < 6) {
    const retryAfter = Number(response.headers.get('retry-after'))
    await wait(retryAfter > 0 ? retryAfter * 1000 : attempt * 3000)

    return graphql(query, variables, attempt + 1)
  }
  if (!response.ok) {
    throw new Error(`GitHub API responded ${response.status}: ${await response.text()}`)
  }

  const body = await response.json()
  if (body.errors) {
    throw new Error(`GitHub API error: ${JSON.stringify(body.errors)}`)
  }

  return body.data
}

async function mapWithConcurrency(items, limit, callback) {
  const results = []
  let next = 0
  const workers = Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await callback(items[index])
    }
  })
  await Promise.all(workers)

  return results
}

async function toRecord(node) {
  const record = {
    repo: node.repository.name,
    number: node.number,
    title: node.title,
    state: node.state,
    createdAt: node.createdAt,
    mergedAt: node.mergedAt,
    closedAt: node.closedAt,
    additions: node.additions,
    deletions: node.deletions,
    head: node.headRefName,
    base: node.baseRefName,
    author: node.author?.login ?? 'ghost',
    mergedBy: node.mergedBy?.login ?? null,
    reviews: node.reviews.nodes.map(toReview),
  }

  let { hasNextPage, endCursor } = node.reviews.pageInfo
  while (hasNextPage) {
    const data = await graphql(REVIEWS_QUERY, { org: ORG, name: record.repo, number: record.number, cursor: endCursor })
    const reviews = data.repository.pullRequest.reviews
    record.reviews.push(...reviews.nodes.map(toReview))
    ;({ hasNextPage, endCursor } = reviews.pageInfo)
  }

  return record
}

function toReview(node) {
  return {
    author: node.author?.login ?? 'ghost',
    state: node.state,
    submittedAt: node.submittedAt,
    comments: node.comments.totalCount,
  }
}

async function listActiveRepositories(sinceIso) {
  const names = []
  let cursor = null
  for (;;) {
    const data = await graphql(REPOSITORIES_QUERY, { org: ORG, cursor })
    const { nodes, pageInfo } = data.organization.repositories
    for (const repository of nodes) {
      if (repository.pushedAt < sinceIso) {
        return names
      }
      names.push(repository.name)
    }
    if (!pageInfo.hasNextPage) {
      return names
    }
    cursor = pageInfo.endCursor
  }
}

async function fetchRepositoryPullRequests(name, sinceIso) {
  const records = []
  let cursor = null
  for (;;) {
    const data = await graphql(REPOSITORY_PULL_REQUESTS_QUERY, { org: ORG, name, cursor })
    const { nodes, pageInfo } = data.repository.pullRequests
    for (const node of nodes) {
      if (node.createdAt < sinceIso) {
        return records
      }
      records.push(await toRecord(node))
    }
    if (!pageInfo.hasNextPage) {
      return records
    }
    cursor = pageInfo.endCursor
  }
}

async function fetchWindow(sinceIso) {
  const repositories = await listActiveRepositories(sinceIso)
  const perRepository = await mapWithConcurrency(repositories, CONCURRENCY, (name) =>
    fetchRepositoryPullRequests(name, sinceIso),
  )

  return perRepository.flat()
}

// Returns null when too many pull requests changed for the search API, the caller then refetches the window.
async function fetchUpdatedSince(sinceIso) {
  const query = `org:${ORG} is:pr updated:>=${sinceIso.replace(/\.\d+Z$/, '+00:00')} sort:updated-asc`
  const records = []
  let cursor = null
  for (;;) {
    const data = await graphql(SEARCH_PULL_REQUESTS_QUERY, { query, cursor })
    const { issueCount, nodes, pageInfo } = data.search
    if (issueCount > SEARCH_RESULT_LIMIT) {
      return null
    }
    for (const node of nodes) {
      records.push(await toRecord(node))
    }
    if (!pageInfo.hasNextPage) {
      return records
    }
    cursor = pageInfo.endCursor
  }
}

async function readSnapshot() {
  try {
    const snapshot = JSON.parse(await readFile(SNAPSHOT_PATH, 'utf8'))

    return snapshot.org === ORG ? snapshot : null
  } catch {
    return null
  }
}

async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(data))
}

const keyOf = (pr) => `${pr.repo}#${pr.number}`
const isBot = (login) => BOTS.has(login)
const parisDay = (iso) => parisDayFormat.format(new Date(iso))
const hoursBetween = (fromIso, toIso) => (Date.parse(toIso) - Date.parse(fromIso)) / 3_600_000
const round = (value, digits = 0) => (value === null ? null : Number(value.toFixed(digits)))
const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0)

function median(values) {
  if (values.length === 0) {
    return null
  }
  const sorted = values.toSorted((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function getOrCreate(map, key, create) {
  if (!map.has(key)) {
    map.set(key, create())
  }

  return map.get(key)
}

// Release PRs ship develop to production, integration PRs sync long-lived branches: neither is new code.
function classify(pr) {
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
    ['master', 'main', 'develop'].includes(head) ||
    (/^project\/[^/]+\/main/.test(head) && !base.startsWith('project/'))
  ) {
    return 'integration'
  }

  return 'code'
}

function bucketKey(iso, bucket) {
  const day = parisDay(iso)
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

// Steps at noon UTC so that daylight saving changes never skip or repeat a Paris day.
function bucketKeys(start, end, bucket) {
  const keys = []
  const first = Date.parse(`${parisDay(start.toISOString())}T12:00:00Z`)
  for (let time = first; time <= end.getTime() + DAY_MS; time += DAY_MS) {
    const key = bucketKey(new Date(Math.min(time, end.getTime())).toISOString(), bucket)
    if (keys.at(-1) !== key) {
      keys.push(key)
    }
  }

  return keys
}

function computePeriod(pullRequests, period, now) {
  const startIso = new Date(now.getTime() - period.days * DAY_MS).toISOString()
  const keys = bucketKeys(new Date(startIso), now, period.bucket)
  const buckets = new Map(keys.map((key) => [key, { key, opened: 0, merged: 0, reviews: 0 }]))
  const authors = new Map()
  const reviewers = new Map()
  const bots = new Map()
  const reviewedPullRequests = new Set()
  const bump = (iso, field) => {
    const bucket = buckets.get(bucketKey(iso, period.bucket))
    if (bucket) {
      bucket[field]++
    }
  }

  const author = (login) =>
    getOrCreate(authors, login, () => ({
      login,
      opened: 0,
      code: 0,
      release: 0,
      integration: 0,
      merged: 0,
      closedUnmerged: 0,
      open: 0,
      repos: new Set(),
      timesToMerge: [],
      sizes: [],
    }))
  const reviewer = (login) =>
    getOrCreate(reviewers, login, () => ({
      login,
      reviewed: new Set(),
      approvals: 0,
      changesRequested: 0,
      comments: 0,
      merges: 0,
    }))

  for (const pr of pullRequests) {
    if (pr.createdAt >= startIso) {
      if (isBot(pr.author)) {
        bots.set(pr.author, (bots.get(pr.author) ?? 0) + 1)
      } else {
        const kind = classify(pr)
        const stats = author(pr.author)
        stats.opened++
        stats[kind]++
        stats.repos.add(pr.repo)
        bump(pr.createdAt, 'opened')
        if (kind === 'code') {
          if (pr.mergedAt) {
            stats.merged++
            stats.timesToMerge.push(hoursBetween(pr.createdAt, pr.mergedAt))
            stats.sizes.push(pr.additions + pr.deletions)
          } else if (pr.state === 'CLOSED') {
            stats.closedUnmerged++
          } else {
            stats.open++
          }
        }
      }
    }

    if (pr.mergedAt && pr.mergedAt >= startIso) {
      if (!isBot(pr.author) && classify(pr) === 'code') {
        bump(pr.mergedAt, 'merged')
      }
      if (pr.mergedBy && !isBot(pr.mergedBy)) {
        reviewer(pr.mergedBy).merges++
      }
    }

    for (const review of pr.reviews) {
      if (!review.submittedAt || review.submittedAt < startIso) {
        continue
      }
      if (review.author === pr.author || isBot(review.author)) {
        continue
      }
      const stats = reviewer(review.author)
      stats.reviewed.add(keyOf(pr))
      stats.comments += review.comments
      if (review.state === 'APPROVED') {
        stats.approvals++
      } else if (review.state === 'CHANGES_REQUESTED') {
        stats.changesRequested++
      }
      reviewedPullRequests.add(keyOf(pr))
      bump(review.submittedAt, 'reviews')
    }
  }

  const authorRows = [...authors.values()].map((stats) => {
    const decided = stats.merged + stats.closedUnmerged

    return {
      login: stats.login,
      opened: stats.opened,
      code: stats.code,
      release: stats.release,
      integration: stats.integration,
      merged: stats.merged,
      closedUnmerged: stats.closedUnmerged,
      open: stats.open,
      mergeRate: decided ? Math.round((100 * stats.merged) / decided) : null,
      medianTimeToMergeHours: round(median(stats.timesToMerge), 1),
      medianSize: round(median(stats.sizes)),
      repos: stats.repos.size,
    }
  })
  const reviewerRows = [...reviewers.values()]
    .filter((stats) => stats.reviewed.size > 0 || stats.merges > 0)
    .map((stats) => ({
      login: stats.login,
      reviewed: stats.reviewed.size,
      approvals: stats.approvals,
      changesRequested: stats.changesRequested,
      comments: stats.comments,
      merges: stats.merges,
    }))
  const timesToMerge = [...authors.values()].flatMap((stats) => stats.timesToMerge)

  return {
    days: period.days,
    bucket: period.bucket,
    totals: {
      opened: sum(authorRows, 'opened'),
      code: sum(authorRows, 'code'),
      merged: sum(authorRows, 'merged'),
      open: sum(authorRows, 'open'),
      reviewed: reviewedPullRequests.size,
      approvals: sum(reviewerRows, 'approvals'),
      medianTimeToMergeHours: round(median(timesToMerge), 1),
      bots: [...bots.values()].reduce((total, count) => total + count, 0),
      contributors: authorRows.length,
    },
    bots: Object.fromEntries([...bots].sort((a, b) => b[1] - a[1])),
    series: keys.map((key, index) => ({ ...buckets.get(key), partial: index === 0 || index === keys.length - 1 })),
    authors: authorRows.sort((a, b) => b.code - a.code),
    reviewers: reviewerRows.sort((a, b) => b.reviewed - a.reviewed),
  }
}

function computeToday(pullRequests, now) {
  const today = parisDay(now.toISOString())
  const totals = { date: today, opened: 0, merged: 0, reviews: 0 }
  for (const pr of pullRequests) {
    if (isBot(pr.author)) {
      continue
    }
    if (parisDay(pr.createdAt) === today) {
      totals.opened++
    }
    if (pr.mergedAt && parisDay(pr.mergedAt) === today) {
      totals.merged++
    }
    for (const review of pr.reviews) {
      const counted = review.submittedAt && review.author !== pr.author && !isBot(review.author)
      if (counted && parisDay(review.submittedAt) === today) {
        totals.reviews++
      }
    }
  }

  return totals
}

function computeEvents(pullRequests, now) {
  const sinceIso = new Date(now.getTime() - EVENTS_MAX_AGE_DAYS * DAY_MS).toISOString()
  const events = []
  const push = (type, at, actor, pr) => {
    if (at && at >= sinceIso && !isBot(actor)) {
      events.push({ type, at, actor, author: pr.author, repo: pr.repo, number: pr.number })
    }
  }

  for (const pr of pullRequests) {
    if (isBot(pr.author)) {
      continue
    }
    push('opened', pr.createdAt, pr.author, pr)
    push('merged', pr.mergedAt, pr.mergedBy ?? pr.author, pr)
    for (const review of pr.reviews) {
      if (review.author === pr.author) {
        continue
      }
      if (review.state === 'APPROVED') {
        push('approved', review.submittedAt, review.author, pr)
      } else if (review.state === 'CHANGES_REQUESTED') {
        push('changes_requested', review.submittedAt, review.author, pr)
      } else if (review.state === 'COMMENTED' && review.comments > 0) {
        push('commented', review.submittedAt, review.author, pr)
      }
    }
  }

  return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, EVENTS_LIMIT)
}

async function sync({ full }) {
  const now = new Date()
  const windowStartIso = new Date(now.getTime() - WINDOW_DAYS * DAY_MS).toISOString()
  const snapshot = full ? null : await readSnapshot()

  let mode = 'incremental'
  let fetched = snapshot
    ? await fetchUpdatedSince(new Date(Date.parse(snapshot.syncedAt) - SYNC_OVERLAP_MS).toISOString())
    : null
  if (fetched === null) {
    mode = 'full'
    fetched = await fetchWindow(windowStartIso)
  }

  const pullRequests = new Map(mode === 'full' ? [] : snapshot.pullRequests.map((pr) => [keyOf(pr), pr]))
  for (const pr of fetched) {
    pullRequests.set(keyOf(pr), pr)
  }
  const inWindow = [...pullRequests.values()].filter((pr) => pr.createdAt >= windowStartIso)

  await writeJson(SNAPSHOT_PATH, { org: ORG, syncedAt: now.toISOString(), pullRequests: inWindow })
  await writeJson(STATS_PATH, {
    org: ORG,
    generatedAt: now.toISOString(),
    timezone: TIMEZONE,
    today: computeToday(inWindow, now),
    periods: Object.fromEntries(PERIODS.map((period) => [period.key, computePeriod(inWindow, period, now)])),
    events: computeEvents(inWindow, now),
  })

  console.log(`[${now.toISOString()}] ${mode} sync: ${fetched.length} PR fetched, ${inWindow.length} PR in window`)
}

const args = new Set(process.argv.slice(2))
const full = args.has('--full') || process.env.FULL_SYNC === 'true'

await sync({ full })
while (args.has('--watch')) {
  await wait(WATCH_INTERVAL_MS)
  await sync({ full: false }).catch((error) => console.error(error))
}
