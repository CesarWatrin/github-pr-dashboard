// Syncs the pull requests of a GitHub organization and writes the aggregated stats read by the dashboard.
//
// The raw pull requests are kept in a local snapshot: the first run fetches the whole rolling window
// repository by repository, the next runs only fetch the pull requests updated since the last sync.
//
// Usage: node scripts/sync.mjs [--full] [--watch]

import { execFileSync } from 'node:child_process'
import { createCipheriv, createHash, pbkdf2Sync, randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { gzipSync } from 'node:zlib'

const ORG = process.env.ORG
const SNAPSHOT_VERSION = 3
const WINDOW_DAYS = 365
const SNAPSHOT_PATH = process.env.SNAPSHOT_PATH ?? '.cache/snapshot.json'
const STATS_PATH = process.env.STATS_PATH ?? 'site/data/stats.enc.json'
const VERSION_PATH = join(dirname(STATS_PATH), 'version.json')
const TIMEZONE = 'Europe/Paris'
const WATCH_INTERVAL_MS = 60_000
const SYNC_OVERLAP_MS = 10 * 60_000
const SEARCH_RESULT_LIMIT = 1000
const CONCURRENCY = 4
const EVENTS_LIMIT = 50
const EVENTS_MAX_AGE_DAYS = 7
// Upper bounds (excluded) of the pull request size buckets, in changed lines.
const SIZE_BUCKETS = [10, 100, 500, 1000, Infinity]
const TOP_HOTFIX_REPOS = 3
const RELEASE_BASES = ['master', 'main']
const DAY_MS = 86_400_000
// PBKDF2-SHA256 iterations deriving the encryption key from the password, also read from the file by the page.
const KEY_ITERATIONS = 600_000

const PERIODS = [
  { key: '30d', days: 30, bucket: 'day' },
  { key: '90d', days: 90, bucket: 'week' },
  { key: '365d', days: 365, bucket: 'month' },
]

// Repository types, from the languages GitHub detects in them. TypeScript and JavaScript go with Vue: front-end code
// next to it, back-end services without it. Docs, infrastructure and tooling fall under "other".
const CATEGORIES = ['front', 'back', 'mobile', 'other']
const LANGUAGE_CATEGORIES = new Map(
  Object.entries({
    front: ['Vue', 'Svelte', 'SCSS', 'CSS', 'Less', 'HTML'],
    back: ['PHP', 'Blade', 'Go', 'Rust', 'Python', 'Java', 'Ruby', 'C#', 'PLpgSQL'],
    mobile: ['Dart', 'Swift', 'Kotlin', 'Objective-C'],
    other: ['HCL', 'Dockerfile', 'Makefile', 'Shell', 'Jinja', 'Go Template', 'Batchfile', 'CMake'],
  }).flatMap(([category, languages]) => languages.map((language) => [language, category])),
)
const SCRIPT_LANGUAGES = ['TypeScript', 'JavaScript']
const FRAMEWORK_LANGUAGES = ['Vue', 'Svelte']

// Technologies: the languages of a repository grouped under the framework they serve, read from its root manifests
// (composer.json, package.json, pubspec.yaml). PHP and Blade make Laravel, Vue and TypeScript make Nuxt, and so on.
const FRAMEWORK_DEPENDENCIES = new Map(
  Object.entries({
    'laravel/framework': 'Laravel',
    'symfony/framework-bundle': 'Symfony',
    nuxt: 'Nuxt',
    next: 'Next.js',
    vitepress: 'VitePress',
    '@nestjs/core': 'NestJS',
    vue: 'Vue',
    react: 'React',
    svelte: 'Svelte',
  }),
)
const PHP_FRAMEWORKS = ['Laravel', 'Symfony']
// The first one found wins: a Nuxt project depends on Vue too.
const WEB_FRAMEWORKS = ['Nuxt', 'Next.js', 'VitePress', 'NestJS', 'Vue', 'React', 'Svelte']
const WEB_LANGUAGES = ['Vue', 'Svelte', 'TypeScript', 'JavaScript', 'HTML', 'CSS', 'SCSS', 'Less']
// Native code of the iOS and Android shells around a Flutter application.
const FLUTTER_LANGUAGES = ['Dart', 'Swift', 'Kotlin', 'Objective-C', 'C++', 'C', 'CMake', 'Ruby']
const TECHNOLOGY_NAMES = { HCL: 'Terraform', Dockerfile: 'Docker', PLpgSQL: 'PostgreSQL', 'Go Template': 'Go', Makefile: 'Make' }
const MIN_TECHNOLOGY_SHARE = 0.02

// Corrections for the repositories their languages misjudge, as "repo:category,repo:category". They come from the
// environment rather than the code because the repository names of the organization are private.
const CATEGORY_OVERRIDES = new Map(
  (process.env.REPO_CATEGORIES ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [repo, category] = entry.split(':').map((part) => part.trim())
      if (!CATEGORIES.includes(category)) {
        throw new Error(`REPO_CATEGORIES: "${entry}" should be repo:${CATEGORIES.join('|')}`)
      }

      return [repo, category]
    }),
)

// GitHub Apps are detected from their actor type: these are user accounts acting as bots.
const BOT_USERS = new Set(['it-hellocse', 'ghost'])

const ACTOR_FIELDS = '__typename login ... on User { name }'
const REVIEW_FIELDS = `author { ${ACTOR_FIELDS} } state submittedAt comments { totalCount }`
const COMMENT_FIELDS = `author { ${ACTOR_FIELDS} } createdAt`

const PULL_REQUEST_FIELDS = `
  number title state isDraft createdAt mergedAt closedAt additions deletions headRefName baseRefName
  repository { name }
  author { ${ACTOR_FIELDS} }
  mergedBy { ${ACTOR_FIELDS} }
  reviews(first: 50) { pageInfo { hasNextPage endCursor } nodes { ${REVIEW_FIELDS} } }
  comments(first: 50) { pageInfo { hasNextPage endCursor } nodes { ${COMMENT_FIELDS} } }
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

const REPOSITORY_DETAILS_QUERY = `
  query($org: String!, $cursor: String) {
    organization(login: $org) {
      repositories(first: 25, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          name
          languages(first: 10, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name } } }
          composer: object(expression: "HEAD:composer.json") { ... on Blob { text } }
          packageJson: object(expression: "HEAD:package.json") { ... on Blob { text } }
          pubspec: object(expression: "HEAD:pubspec.yaml") { ... on Blob { text } }
        }
      }
    }
  }`

const REPOSITORY_PULL_REQUESTS_QUERY = `
  query($org: String!, $name: String!, $cursor: String) {
    repository(owner: $org, name: $name) {
      pullRequests(first: 20, after: $cursor, orderBy: { field: CREATED_AT, direction: DESC }) {
        pageInfo { hasNextPage endCursor }
        nodes { ${PULL_REQUEST_FIELDS} }
      }
    }
  }`

const SEARCH_PULL_REQUESTS_QUERY = `
  query($query: String!, $cursor: String) {
    search(query: $query, type: ISSUE, first: 25, after: $cursor) {
      issueCount
      pageInfo { hasNextPage endCursor }
      nodes { ... on PullRequest { ${PULL_REQUEST_FIELDS} } }
    }
  }`

const remainingItemsQuery = (connection, fields) => `
  query($org: String!, $name: String!, $number: Int!, $cursor: String) {
    repository(owner: $org, name: $name) {
      pullRequest(number: $number) {
        ${connection}(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes { ${fields} }
        }
      }
    }
  }`

const REMAINING_ITEMS_QUERIES = {
  reviews: remainingItemsQuery('reviews', REVIEW_FIELDS),
  comments: remainingItemsQuery('comments', COMMENT_FIELDS),
}

const parisDayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

if (!ORG) {
  throw new Error('No organization: set the ORG environment variable (in .env locally, as a repository variable in CI).')
}
// The stats are only ever written encrypted: without a password, nothing is published.
if (!process.env.DASHBOARD_PASSWORD) {
  throw new Error('No password: set DASHBOARD_PASSWORD (in .env locally, as a repository secret in CI).')
}

const token = resolveToken()

// Display names and bot accounts seen in the API answers, kept in the snapshot between syncs.
const people = { names: new Map(), bots: new Set() }

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

function actorLogin(actor) {
  if (!actor) {
    return 'ghost'
  }
  if (actor.__typename !== 'User') {
    people.bots.add(actor.login)
  }
  if (actor.name) {
    people.names.set(actor.login, actor.name)
  }

  return actor.login
}

async function fetchAllItems(node, connection, toItem) {
  const items = node[connection].nodes.map(toItem)
  let { hasNextPage, endCursor } = node[connection].pageInfo
  while (hasNextPage) {
    const variables = { org: ORG, name: node.repository.name, number: node.number, cursor: endCursor }
    const data = await graphql(REMAINING_ITEMS_QUERIES[connection], variables)
    const page = data.repository.pullRequest[connection]
    items.push(...page.nodes.map(toItem))
    ;({ hasNextPage, endCursor } = page.pageInfo)
  }

  return items
}

async function toRecord(node) {
  return {
    repo: node.repository.name,
    number: node.number,
    title: node.title,
    state: node.state,
    draft: node.isDraft,
    createdAt: node.createdAt,
    mergedAt: node.mergedAt,
    closedAt: node.closedAt,
    additions: node.additions,
    deletions: node.deletions,
    head: node.headRefName,
    base: node.baseRefName,
    author: actorLogin(node.author),
    mergedBy: node.mergedBy ? actorLogin(node.mergedBy) : null,
    reviews: await fetchAllItems(node, 'reviews', toReview),
    comments: await fetchAllItems(node, 'comments', toComment),
  }
}

function toReview(node) {
  return {
    author: actorLogin(node.author),
    state: node.state,
    submittedAt: node.submittedAt,
    comments: node.comments.totalCount,
  }
}

function toComment(node) {
  return { author: actorLogin(node.author), createdAt: node.createdAt }
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

function parseManifest(blob) {
  try {
    return JSON.parse(blob?.text ?? '{}')
  } catch {
    return {}
  }
}

function frameworksOf(node) {
  const composer = parseManifest(node.composer)
  const npm = parseManifest(node.packageJson)
  const dependencies = [composer.require, npm.dependencies, npm.devDependencies].flatMap((list) => Object.keys(list ?? {}))
  const frameworks = dependencies.map((dependency) => FRAMEWORK_DEPENDENCIES.get(dependency)).filter(Boolean)
  if (node.pubspec?.text?.includes('flutter')) {
    frameworks.push('Flutter')
  }

  return [...new Set(frameworks)]
}

// Languages of every repository of the organization, as [name, bytes] pairs largest first, and the frameworks its
// manifests declare.
async function fetchRepositoryDetails() {
  const details = { languages: {}, frameworks: {} }
  let cursor = null
  do {
    const data = await graphql(REPOSITORY_DETAILS_QUERY, { org: ORG, cursor })
    const { nodes, pageInfo } = data.organization.repositories
    for (const node of nodes) {
      details.languages[node.name] = node.languages.edges.map((edge) => [edge.node.name, edge.size])
      details.frameworks[node.name] = frameworksOf(node)
    }
    cursor = pageInfo.hasNextPage ? pageInfo.endCursor : null
  } while (cursor)

  return details
}

function technologyOf(language, frameworks) {
  if (language === 'PHP' || language === 'Blade') {
    return PHP_FRAMEWORKS.find((framework) => frameworks.includes(framework)) ?? 'PHP'
  }
  if (WEB_LANGUAGES.includes(language)) {
    return WEB_FRAMEWORKS.find((framework) => frameworks.includes(framework)) ?? language
  }
  if (FLUTTER_LANGUAGES.includes(language) && frameworks.includes('Flutter')) {
    return 'Flutter'
  }

  return TECHNOLOGY_NAMES[language] ?? language
}

function repositoryCategory(repo, languages) {
  if (CATEGORY_OVERRIDES.has(repo)) {
    return CATEGORY_OVERRIDES.get(repo)
  }
  const withVue = languages.some(([name]) => FRAMEWORK_LANGUAGES.includes(name))
  const sizes = new Map()
  for (const [name, size] of languages) {
    const category = SCRIPT_LANGUAGES.includes(name) ? (withVue ? 'front' : 'back') : LANGUAGE_CATEGORIES.get(name)
    if (category) {
      sizes.set(category, (sizes.get(category) ?? 0) + size)
    }
  }

  return [...sizes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'other'
}

// Share of each technology in the code of a repository, without the marginal ones.
function technologyShares(languages, frameworks) {
  const total = languages.reduce((sum, [, size]) => sum + size, 0)
  const shares = new Map()
  for (const [language, size] of languages) {
    const technology = technologyOf(language, frameworks)
    shares.set(technology, (shares.get(technology) ?? 0) + size / total)
  }

  return [...shares]
    .map(([name, share]) => [name, round(share, 3)])
    .filter(([, share]) => share >= MIN_TECHNOLOGY_SHARE)
    .sort((a, b) => b[1] - a[1])
}

async function readSnapshot() {
  try {
    const snapshot = JSON.parse(await readFile(SNAPSHOT_PATH, 'utf8'))

    return snapshot.org === ORG && snapshot.version === SNAPSHOT_VERSION ? snapshot : null
  } catch {
    return null
  }
}

// The salt only depends on the organization so that the key stays the same from one sync to the next: the page
// derives it once from the password and keeps it.
const encryptionSalt = createHash('sha256').update(`github-pr-dashboard:${ORG}`).digest().subarray(0, 16)
const encryptionKey = pbkdf2Sync(process.env.DASHBOARD_PASSWORD, encryptionSalt, KEY_ITERATIONS, 32, 'sha256')

// Gzipped then encrypted with AES-256-GCM, the authentication tag appended as the Web Crypto API expects it.
function encrypt(data) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv)
  const encrypted = Buffer.concat([cipher.update(gzipSync(JSON.stringify(data))), cipher.final(), cipher.getAuthTag()])

  return {
    iterations: KEY_ITERATIONS,
    salt: encryptionSalt.toString('base64'),
    iv: iv.toString('base64'),
    data: encrypted.toString('base64'),
  }
}

async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(data))
}

const keyOf = (pr) => `${pr.repo}#${pr.number}`
const isBot = (login) => BOT_USERS.has(login) || people.bots.has(login)
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

// Every action of someone other than the author on a pull request, oldest first. A review without inline
// comments counts as one comment when it is a plain comment, not when it only approves or requests changes.
function reviewInterventions(pr) {
  const fromReviews = pr.reviews
    .filter((review) => review.submittedAt && review.author !== pr.author && !isBot(review.author))
    .map((review) => ({
      login: review.author,
      at: review.submittedAt,
      state: review.state,
      comments: review.comments + (review.state === 'COMMENTED' && review.comments === 0 ? 1 : 0),
    }))
  const fromComments = pr.comments
    .filter((comment) => comment.author !== pr.author && !isBot(comment.author))
    .map((comment) => ({ login: comment.author, at: comment.createdAt, state: null, comments: 1 }))

  return [...fromReviews, ...fromComments].sort((a, b) => a.at.localeCompare(b.at))
}

function computePeriod(pullRequests, period, now) {
  const startIso = new Date(now.getTime() - period.days * DAY_MS).toISOString()
  const keys = bucketKeys(new Date(startIso), now, period.bucket)
  const buckets = new Map(
    keys.map((key) => [key, { key, opened: 0, merged: 0, comments: 0, approvals: 0, releases: 0, hotfixes: 0 }]),
  )
  // Person stats are kept per repository so that the page can add them up over any selection of repositories.
  const authors = new Map()
  const reviewers = new Map()
  const reviewerSeries = new Map()
  const repositories = new Map()
  const reviewedPullRequests = new Set()
  const sizes = SIZE_BUCKETS.map((max) => ({ max, prs: 0, comments: 0, timesToMerge: [] }))
  let releases = 0
  const bump = (iso, field, amount = 1) => {
    const bucket = buckets.get(bucketKey(iso, period.bucket))
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

  // TMA: the hotfix pull requests and the people who make them.
  const hotfixes = { opened: 0, merged: 0, timesToMerge: [], timesToFirstReview: [], people: new Map(), repositories: new Map() }
  const addHotfix = (pr, interventions) => {
    const person = getOrCreate(hotfixes.people, pr.author, () => ({
      hotfixes: 0,
      timesToMerge: [],
      repositories: new Map(),
      lastAt: '',
    }))
    hotfixes.opened++
    person.hotfixes++
    person.repositories.set(pr.repo, (person.repositories.get(pr.repo) ?? 0) + 1)
    person.lastAt = pr.createdAt > person.lastAt ? pr.createdAt : person.lastAt
    hotfixes.repositories.set(pr.repo, (hotfixes.repositories.get(pr.repo) ?? 0) + 1)
    bump(pr.createdAt, 'hotfixes')
    if (interventions.length > 0) {
      hotfixes.timesToFirstReview.push(hoursBetween(pr.createdAt, interventions[0].at))
    }
    if (pr.mergedAt) {
      const timeToMerge = hoursBetween(pr.createdAt, pr.mergedAt)
      hotfixes.merged++
      hotfixes.timesToMerge.push(timeToMerge)
      person.timesToMerge.push(timeToMerge)
    }
  }

  for (const pr of pullRequests) {
    const kind = classify(pr)
    // Release pull requests count whoever opened them: release-please ones come from a bot.
    if (kind === 'release' && pr.mergedAt && pr.mergedAt >= startIso && RELEASE_BASES.includes(pr.base)) {
      releases++
      bump(pr.mergedAt, 'releases')
    }

    // Everything else only covers code pull requests written by people.
    if (isBot(pr.author)) {
      continue
    }
    if (pr.createdAt >= startIso) {
      author(pr.author, pr.repo)[kind]++
      author(pr.author, pr.repo).opened++
      bump(pr.createdAt, 'opened')
    }
    if (kind !== 'code') {
      continue
    }

    const interventions = reviewInterventions(pr)
    if (pr.createdAt >= startIso) {
      const stats = author(pr.author, pr.repo)
      if (pr.head.startsWith('hotfix')) {
        stats.hotfix++
        addHotfix(pr, interventions)
      }
      if (interventions.length > 0) {
        stats.timesToFirstReview.push(hoursBetween(pr.createdAt, interventions[0].at))
      }
      if (pr.mergedAt) {
        const lines = pr.additions + pr.deletions
        const timeToMerge = hoursBetween(pr.createdAt, pr.mergedAt)
        stats.merged++
        stats.timesToMerge.push(timeToMerge)
        stats.sizes.push(lines)
        if (interventions.length === 0) {
          stats.unreviewed++
        }
        const size = sizes.find((bucket) => lines < bucket.max)
        size.prs++
        size.timesToMerge.push(timeToMerge)
        size.comments += interventions.reduce((total, intervention) => total + intervention.comments, 0)
      } else if (pr.state === 'CLOSED') {
        stats.closedUnmerged++
      }
    }

    if (pr.mergedAt && pr.mergedAt >= startIso) {
      bump(pr.mergedAt, 'merged')
      if (pr.mergedBy && !isBot(pr.mergedBy)) {
        reviewer(pr.mergedBy, pr.repo).merges++
      }
    }

    const key = keyOf(pr)
    const commenters = new Set(interventions.filter((item) => item.comments > 0).map((item) => item.login))
    for (const intervention of interventions) {
      if (intervention.at < startIso) {
        continue
      }
      const stats = reviewer(intervention.login, pr.repo)
      const repo = repository(pr.repo)
      const series = getOrCreate(reviewerSeries, intervention.login, () => new Map())
      const point = getOrCreate(series, bucketKey(intervention.at, period.bucket), () => ({ prs: 0, comments: 0 }))
      if (!stats.reviewed.has(key)) {
        stats.reviewed.set(key, pr)
        point.prs++
      }
      reviewedPullRequests.add(key)
      repo.reviewed.add(key)

      stats.comments += intervention.comments
      point.comments += intervention.comments
      repo.comments += intervention.comments
      bump(intervention.at, 'comments', intervention.comments)
      if (intervention.state === 'APPROVED') {
        bump(intervention.at, 'approvals')
        stats.approvedPrs.add(key)
        if (!commenters.has(intervention.login)) {
          stats.silentApprovedPrs.add(key)
        }
      } else if (intervention.state === 'CHANGES_REQUESTED') {
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
    days: period.days,
    bucket: period.bucket,
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
    },
    series: keys.map((key, index) => ({ ...buckets.get(key), partial: index === 0 || index === keys.length - 1 })),
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
            sizes: [...stats.reviewed.values()].map((pr) => pr.additions + pr.deletions),
          },
        ]),
      ),
    })),
    reviewerSeries: Object.fromEntries(
      [...reviewerSeries].map(([login, series]) => [
        login,
        keys.map((key) => {
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
            lastAt: person.lastAt,
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
  }
}

// Open code pull requests nobody has looked at yet, oldest first.
function computeWaiting(pullRequests) {
  return pullRequests
    .filter((pr) => pr.state === 'OPEN' && !pr.draft && !isBot(pr.author) && classify(pr) === 'code')
    .filter((pr) => reviewInterventions(pr).length === 0)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((pr) => ({ repo: pr.repo, number: pr.number, author: pr.author, createdAt: pr.createdAt }))
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
      } else if (review.state === 'COMMENTED') {
        push('commented', review.submittedAt, review.author, pr)
      }
    }
    for (const comment of pr.comments) {
      if (comment.author !== pr.author) {
        push('commented', comment.createdAt, comment.author, pr)
      }
    }
  }

  return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, EVENTS_LIMIT)
}

async function sync({ full }) {
  const now = new Date()
  const windowStartIso = new Date(now.getTime() - WINDOW_DAYS * DAY_MS).toISOString()
  const snapshot = full ? null : await readSnapshot()
  for (const [login, name] of Object.entries(snapshot?.names ?? {})) {
    people.names.set(login, name)
  }
  for (const login of snapshot?.bots ?? []) {
    people.bots.add(login)
  }

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

  // Languages and frameworks are only looked up for repositories not seen yet: a full sync refreshes them all.
  const repositories = [...new Set(inWindow.map((pr) => pr.repo))]
  let languages = mode === 'full' ? {} : (snapshot.languages ?? {})
  let frameworks = mode === 'full' ? {} : (snapshot.frameworks ?? {})
  if (repositories.some((repo) => !languages[repo] || !frameworks[repo])) {
    const details = await fetchRepositoryDetails()
    languages = details.languages
    frameworks = details.frameworks
    for (const repo of repositories) {
      // Gone from the organization: kept empty so that it is not looked up again.
      languages[repo] ??= []
      frameworks[repo] ??= []
    }
  }

  await writeJson(SNAPSHOT_PATH, {
    version: SNAPSHOT_VERSION,
    org: ORG,
    syncedAt: now.toISOString(),
    names: Object.fromEntries(people.names),
    bots: [...people.bots],
    languages,
    frameworks,
    pullRequests: inWindow,
  })
  const version = { build: process.env.BUILD_ID || null, generatedAt: now.toISOString() }
  await writeJson(
    STATS_PATH,
    encrypt({
      org: ORG,
      ...version,
      timezone: TIMEZONE,
      people: Object.fromEntries([...people.names].filter(([login]) => !isBot(login))),
      repos: Object.fromEntries(
        repositories.map((repo) => [
          repo,
          {
            category: repositoryCategory(repo, languages[repo]),
            technologies: technologyShares(languages[repo], frameworks[repo]),
          },
        ]),
      ),
      today: computeToday(inWindow, now),
      periods: Object.fromEntries(PERIODS.map((period) => [period.key, computePeriod(inWindow, period, now)])),
      events: computeEvents(inWindow, now),
      waiting: computeWaiting(inWindow),
    }),
  )
  // Written last: the page polls this small file and only downloads the stats once it changes.
  await writeJson(VERSION_PATH, version)

  console.log(`[${now.toISOString()}] ${mode} sync: ${fetched.length} PR fetched, ${inWindow.length} PR in window`)
}

const args = new Set(process.argv.slice(2))
const full = args.has('--full') || process.env.FULL_SYNC === 'true'

await sync({ full })
while (args.has('--watch')) {
  await wait(WATCH_INTERVAL_MS)
  await sync({ full: false }).catch((error) => console.error(error))
}
