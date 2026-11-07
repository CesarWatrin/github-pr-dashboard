// Calls to GitHub, GraphQL and REST, with the token of the sync: made again when GitHub fails, a limited number at once.

import { execFileSync } from 'node:child_process'

export const CONCURRENCY = 4

// At most this many REST calls at once, across repositories and pages: a page of 100 runs weighs about 1 MB.
const REST_CONCURRENCY = 8
// A call to GitHub is made at most this many times before the sync gives up.
const REQUEST_ATTEMPTS = 6

const token = resolveToken()

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

/** @type {(ms: number) => Promise<void>} */
export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// A call to GitHub, its answer read whole: { ok, status, body }, the body parsed when the call succeeded, else as text.
// Made again on a 5xx, 403 or 429 answer (after its retry-after, if any), on a connection that fails, and on a body that
// comes back empty or cut short, as GitHub sometimes sends: one bad answer must not end a full sync.
/**
 * @param {string} url
 * @param {{ method?: string, headers?: Record<string, string>, body?: string }} init
 * @returns {Promise<GithubResponse>}
 */
export async function request(url, init) {
  for (let attempt = 1; ; attempt++) {
    const last = attempt === REQUEST_ATTEMPTS
    let retryAfter = 0
    try {
      const response = await fetch(url, {
        ...init,
        headers: { authorization: `bearer ${token}`, 'user-agent': 'github-pr-dashboard', ...init.headers },
      })
      const retryable = response.status >= 500 || response.status === 403 || response.status === 429
      if (!retryable || last) {
        return { ok: response.ok, status: response.status, body: await (response.ok ? response.json() : response.text()) }
      }
      retryAfter = Number(response.headers.get('retry-after'))
    } catch (error) {
      if (last) {
        throw error
      }
    }
    await wait(retryAfter > 0 ? retryAfter * 1000 : attempt * 3000)
  }
}

// What GitHub answered, for an error: in CI only its status, since its messages name the organization's repositories
// and the logs of a public repository are public.
/** @param {GithubResponse} response */
function responseDetail(response) {
  return process.env.CI ? '' : `: ${response.body}`
}

/**
 * @template Answer
 * @param {GraphqlQuery<Answer>} query
 * @param {Record<string, string | number | null | undefined>} variables
 * @returns {Promise<Answer>}
 */
export async function graphql(query, variables) {
  const response = await request('https://api.github.com/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  if (!response.ok) {
    throw new Error(`GitHub API responded ${response.status}${responseDetail(response)}`)
  }

  const body = /** @type {{ data: Answer, errors?: { type: string, path?: (string | number)[] }[] }} */ (response.body)
  // A reviewer the token may not read, such as a team when it cannot read the organization's teams, comes back null
  // with an error of its own: the rest of the answer stands.
  const errors = (body.errors ?? []).filter((error) => !error.path?.includes('requestedReviewer'))
  if (errors.length) {
    const detail = process.env.CI ? errors.map((error) => error.type).join(', ') : JSON.stringify(errors)
    throw new Error(`GitHub API error: ${detail}`)
  }

  return body.data
}

/** @type {{ used: number, waiting: (() => void)[] }} */
const restSlots = { used: 0, waiting: [] }

/**
 * @template Result
 * @param {() => Promise<Result>} task
 * @returns {Promise<Result>}
 */
async function withRestSlot(task) {
  if (restSlots.used < REST_CONCURRENCY) {
    restSlots.used++
  } else {
    // A call that ends hands its slot over.
    await /** @type {Promise<void>} */ (new Promise((resolve) => restSlots.waiting.push(resolve)))
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
/**
 * @param {string} path
 * @returns {Promise<unknown>}
 */
export async function rest(path) {
  return withRestSlot(async () => {
    const response = await request(`https://api.github.com${path}`, { headers: { accept: 'application/vnd.github+json' } })
    if (response.status === 404) {
      return null
    }
    if (!response.ok) {
      throw new Error(`GitHub API responded ${response.status}${responseDetail(response)}`)
    }

    return response.body
  })
}

/**
 * @template Item, Result
 * @param {Item[]} items
 * @param {number} limit
 * @param {(item: Item) => Promise<Result>} callback
 * @returns {Promise<Result[]>}
 */
export async function mapWithConcurrency(items, limit, callback) {
  /** @type {Result[]} */
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
