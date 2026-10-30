// Syncs the pull requests of a GitHub organization and writes, encrypted, what the dashboard computes its stats from.
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

import { DAY_MS, TIMEZONE, addDays, parisDay, round } from '../site/period.js'

const ORG = process.env.ORG
// 4: the checks of each pull request and the Actions runs.
const SNAPSHOT_VERSION = 4
const WINDOW_DAYS = 365
const SNAPSHOT_PATH = process.env.SNAPSHOT_PATH ?? '.cache/snapshot.json'
const STATS_PATH = process.env.STATS_PATH ?? 'site/data/stats.enc.json'
const VERSION_PATH = join(dirname(STATS_PATH), 'version.json')
const WATCH_INTERVAL_MS = 60_000
const SYNC_OVERLAP_MS = 10 * 60_000
const SEARCH_RESULT_LIMIT = 1000
const CONCURRENCY = 4
const EVENTS_LIMIT = 50
const EVENTS_MAX_AGE_DAYS = 7
const RELEASE_BASES = ['master', 'main']
// Branches that production releases are cut from: a pull request merged into one ships with the next release.
const INTEGRATION_BASES = ['develop', 'staging']
// The Actions runs API answers at most 1000 runs per filtered query: longer ranges are fetched in halves.
const RUNS_QUERY_LIMIT = 1000
const RUNS_PAGE_SIZE = 100
// At most this many REST calls at once, across repositories and pages: a page of 100 runs weighs about 1 MB.
const REST_CONCURRENCY = 8
// Runs created this long before the last sync are fetched again, to get the outcome of those still running.
const RUNS_OVERLAP_MS = DAY_MS
// Runs that check code, on pull requests and pushes: scheduled, manual and Dependabot runs are left out.
const CI_EVENTS = ['pull_request', 'pull_request_target', 'push', 'merge_group']
// Cancelled and skipped runs reach no verdict: they are left out too.
const VERDICT_CONCLUSIONS = ['success', 'failure', 'timed_out', 'startup_failure']
const FAILED_CONCLUSIONS = ['failure', 'timed_out', 'startup_failure']
// PBKDF2-SHA256 iterations deriving the encryption key from the password, also read from the file by the page.
const KEY_ITERATIONS = 600_000

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
        // The entry holds a repository name: the public CI logs do not show it.
        throw new Error(`REPO_CATEGORIES: ${process.env.CI ? 'an entry' : `"${entry}"`} should be repo:${CATEGORIES.join('|')}`)
      }

      return [repo, category]
    }),
)

// Optional fine-grained token, restricted to starting the workflow of this repository, that lets the page start a
// sync. It only travels inside the encrypted stats: only the people with the password can use it.
const WORKFLOW_FILE = 'deploy.yml'
const SYNC_TRIGGER = process.env.DISPATCH_TOKEN
  ? {
      repository: process.env.GITHUB_REPOSITORY ?? process.env.DISPATCH_REPOSITORY,
      workflow: WORKFLOW_FILE,
      ref: process.env.GITHUB_REF_NAME || 'main',
      token: process.env.DISPATCH_TOKEN,
    }
  : null

// GitHub Apps are detected from their actor type: these are user accounts acting as bots. The organization's own
// come from BOT_USERS (logins separated by commas), so that its account names stay out of this public code.
const BOT_USERS = new Set([
  'ghost',
  ...(process.env.BOT_USERS ?? '')
    .split(',')
    .map((login) => login.trim())
    .filter(Boolean),
])

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
  commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
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

if (!ORG) {
  throw new Error('No organization: set ORG (in .env locally, as a secret of the github-pages environment in CI).')
}
// The stats are only ever written encrypted: without a password, nothing is published.
if (!process.env.DASHBOARD_PASSWORD) {
  throw new Error('No password: set DASHBOARD_PASSWORD (in .env locally, as a secret of the github-pages environment in CI).')
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
    throw new Error('No GitHub token: set ORG_STATS_TOKEN in the secrets of the github-pages environment.')
  }

  return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim()
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function request(url, init, attempt = 1) {
  const response = await fetch(url, {
    ...init,
    headers: { authorization: `bearer ${token}`, 'user-agent': 'github-pr-dashboard', ...init.headers },
  })

  const retryable = response.status >= 500 || response.status === 403 || response.status === 429
  if (retryable && attempt < 6) {
    const retryAfter = Number(response.headers.get('retry-after'))
    await wait(retryAfter > 0 ? retryAfter * 1000 : attempt * 3000)

    return request(url, init, attempt + 1)
  }

  return response
}

// What GitHub answered, for an error: in CI only its status, since its messages name the organization's repositories
// and the logs of a public repository are public.
async function responseDetail(response) {
  return process.env.CI ? '' : `: ${await response.text()}`
}

async function graphql(query, variables) {
  const response = await request('https://api.github.com/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  if (!response.ok) {
    throw new Error(`GitHub API responded ${response.status}${await responseDetail(response)}`)
  }

  const body = await response.json()
  if (body.errors) {
    const detail = process.env.CI ? body.errors.map((error) => error.type).join(', ') : JSON.stringify(body.errors)
    throw new Error(`GitHub API error: ${detail}`)
  }

  return body.data
}

const restSlots = { used: 0, waiting: [] }

async function withRestSlot(task) {
  if (restSlots.used < REST_CONCURRENCY) {
    restSlots.used++
  } else {
    // A call that ends hands its slot over.
    await new Promise((resolve) => restSlots.waiting.push(resolve))
  }
  try {
    return await task()
  } finally {
    const next = restSlots.waiting.shift()
    if (next) {
      next()
    } else {
      restSlots.used--
    }
  }
}

// REST call, null when the resource does not exist: a repository without Actions has no runs.
async function rest(path) {
  return withRestSlot(async () => {
    const response = await request(`https://api.github.com${path}`, { headers: { accept: 'application/vnd.github+json' } })
    if (response.status === 404) {
      return null
    }
    if (!response.ok) {
      throw new Error(`GitHub API responded ${response.status}${await responseDetail(response)}`)
    }

    return response.json()
  })
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
    // State of the checks of the last commit: SUCCESS, FAILURE, ERROR, PENDING or EXPECTED, null without checks.
    checks: node.commits.nodes[0]?.commit.statusCheckRollup?.state ?? null,
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
// The Actions runs of a repository created between two days (UTC, included), the ones that check code.
async function fetchRepositoryRuns(name, from, to) {
  const path = (page) => `/repos/${ORG}/${name}/actions/runs?created=${from}..${to}&per_page=${RUNS_PAGE_SIZE}&page=${page}`
  const first = await rest(path(1))
  if (first === null) {
    return []
  }
  if (first.total_count > RUNS_QUERY_LIMIT && from < to) {
    const middle = addDays(from, Math.floor((Date.parse(to) - Date.parse(from)) / DAY_MS / 2))
    const halves = await Promise.all([fetchRepositoryRuns(name, from, middle), fetchRepositoryRuns(name, addDays(middle, 1), to)])

    return halves.flat()
  }
  // The other pages at once: REST_CONCURRENCY bounds the calls.
  const pages = Math.ceil(Math.min(first.total_count, RUNS_QUERY_LIMIT) / RUNS_PAGE_SIZE)
  const others = await Promise.all(Array.from({ length: pages - 1 }, (_, index) => rest(path(index + 2))))

  return [first, ...others]
    .flatMap((body) => body.workflow_runs)
    .filter((run) => CI_EVENTS.includes(run.event))
    .map((run) => toRun(name, run))
}

function toRun(repo, run) {
  return {
    id: run.id,
    repo,
    workflow: run.name,
    conclusion: run.conclusion,
    attempt: run.run_attempt,
    createdAt: run.created_at,
    startedAt: run.run_started_at,
    updatedAt: run.updated_at,
  }
}

// Runs of the repositories pushed to since then: pull requests and pushes both push commits.
async function fetchRuns(sinceIso, now) {
  const repositories = await listActiveRepositories(sinceIso)
  const perRepository = await Promise.all(
    repositories.map((name) => fetchRepositoryRuns(name, sinceIso.slice(0, 10), now.toISOString().slice(0, 10))),
  )

  return perRepository.flat()
}

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

const minutes = (iso) => (iso ? Math.round(Date.parse(iso) / 60_000) : null)

// Production deployments: pull requests merged into master or main, back-merges between them aside.
const isDeployment = (pr) => pr.mergedAt !== null && RELEASE_BASES.includes(pr.base) && !RELEASE_BASES.includes(pr.head)

// Per repository, the times of its deployments, and per branch the times it was merged, sorted.
function deliveryIndex(pullRequests) {
  const index = { deployments: new Map(), branchMerges: new Map() }
  const add = (map, key, value) => (map.has(key) ? map.get(key).push(value) : map.set(key, [value]))
  for (const pr of pullRequests) {
    if (isDeployment(pr)) {
      add(index.deployments, pr.repo, pr.mergedAt)
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
function deployedAt(pr, index) {
  if (!pr.mergedAt) {
    return null
  }
  if (RELEASE_BASES.includes(pr.base)) {
    return pr.mergedAt
  }
  let at = pr.mergedAt
  if (!INTEGRATION_BASES.includes(pr.base)) {
    at = index.branchMerges.get(`${pr.repo}:${pr.base}`)?.find((time) => time >= at)
    if (!at) {
      return null
    }
  }

  return index.deployments.get(pr.repo)?.find((time) => time >= at) ?? null
}


// What the page needs of a pull request to compute the stats of any range, see site/period.js. Bot pull requests
// are only kept when they deploy or update a dependency (Dependabot).
function toPeriodRecord(pr, index) {
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
    interventions: reviewInterventions(pr).map(({ login, at, state, comments }) => [login, minutes(at), state, comments]),
    ...(deployment && { deployment: true }),
    // A revert merged into production undoes a deployment, as a hotfix repairs one: the title says it.
    ...(deployment && /^revert\b/i.test(pr.title) && { revert: true }),
    ...(kind === 'code' && !bot && { deployedAt: minutes(deployedAt(pr, index)) }),
    ...(['FAILURE', 'ERROR'].includes(pr.checks) && { checksFailed: true }),
    ...(dependency && { dependency }),
  }
}

// Actions runs per repository, workflow and Paris day, as [runs, failed, rerun, durations in seconds]: the page adds
// up the days of the range it shows.
function computeCi(runs) {
  const workflows = new Map()
  for (const run of runs) {
    if (!VERDICT_CONCLUSIONS.includes(run.conclusion)) {
      continue
    }
    const key = `${run.repo}/${run.workflow}`
    if (!workflows.has(key)) {
      workflows.set(key, { repo: run.repo, workflow: run.workflow, days: {} })
    }
    const day = (workflows.get(key).days[parisDay(run.createdAt)] ??= [0, 0, 0, []])
    day[0]++
    day[1] += FAILED_CONCLUSIONS.includes(run.conclusion) ? 1 : 0
    day[2] += run.attempt > 1 ? 1 : 0
    day[3].push(Math.max(0, Math.round((Date.parse(run.updatedAt) - Date.parse(run.startedAt)) / 1000)))
  }

  return [...workflows.values()]
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
  const previous = await readSnapshot()
  const snapshot = full ? null : previous
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

  // Actions runs: the whole window the first time, then those created since shortly before the last sync. A full
  // sync keeps them too: a finished run does not change.
  const previousRuns = previous?.runs
  const fetchedRuns = await fetchRuns(
    previousRuns ? new Date(Date.parse(previous.syncedAt) - RUNS_OVERLAP_MS).toISOString() : windowStartIso,
    now,
  )
  const runs = new Map((previousRuns ?? []).map((run) => [run.id, run]))
  for (const run of fetchedRuns) {
    runs.set(run.id, run)
  }
  const runsInWindow = [...runs.values()].filter((run) => run.createdAt >= windowStartIso)

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
    runs: runsInWindow,
  })
  const index = deliveryIndex(inWindow)
  const version = { build: process.env.BUILD_ID || null, generatedAt: now.toISOString() }
  await writeJson(
    STATS_PATH,
    encrypt({
      org: ORG,
      ...version,
      timezone: TIMEZONE,
      syncTrigger: SYNC_TRIGGER?.repository ? SYNC_TRIGGER : null,
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
      // The page computes the stats of the range it shows from these.
      windowStart: windowStartIso,
      pullRequests: inWindow.map((pr) => toPeriodRecord(pr, index)).filter(Boolean),
      ci: computeCi(runsInWindow),
      events: computeEvents(inWindow, now),
      waiting: computeWaiting(inWindow),
    }),
  )
  // Written last: the page polls this small file and only downloads the stats once it changes.
  await writeJson(VERSION_PATH, version)

  // The logs of a public repository are public: in CI they tell nothing of the organization's volumes.
  const counts = process.env.CI
    ? ''
    : `: ${fetched.length} PR fetched, ${inWindow.length} PR in window, ` +
      `${fetchedRuns.length} runs fetched, ${runsInWindow.length} runs in window`
  console.log(`[${now.toISOString()}] ${mode} sync${counts}`)
}

const args = new Set(process.argv.slice(2))
const full = args.has('--full') || process.env.FULL_SYNC === 'true'

await sync({ full })
while (args.has('--watch')) {
  await wait(WATCH_INTERVAL_MS)
  await sync({ full: false }).catch((error) => console.error(error))
}
