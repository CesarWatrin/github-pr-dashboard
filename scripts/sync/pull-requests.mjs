// Reading the pull requests: those of the repositories pushed to lately (full sync), those updated since the last sync
// (incremental), those created over a range (backfill), and the checks of the open ones.

import { addDays, DAY_MS } from '../../site/domain/time.js'
import { ORG } from './config.mjs'
import { CONCURRENCY, graphql, mapWithConcurrency } from './github.mjs'
import { actorLogin } from './people.mjs'
import {
  OPEN_CHECKS_QUERY,
  REMAINING_ITEMS_QUERIES,
  REPOSITORIES_QUERY,
  REPOSITORY_PULL_REQUESTS_QUERY,
  SEARCH_PULL_REQUESTS_QUERY,
} from './queries.mjs'

const SEARCH_RESULT_LIMIT = 1000

/**
 * Every review or comment of a pull request: its first page, then the others.
 * @template {'reviews' | 'comments'} Name
 * @template Item
 * @param {GithubPullRequest} node
 * @param {Name} connection
 * @param {(node: GithubPullRequest[Name]['nodes'][number]) => Item} toItem
 * @returns {Promise<Item[]>}
 */
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

/** @type {(node: GithubCommits) => CheckState | null} */
const checksOf = (node) => node.commits.nodes[0]?.commit.statusCheckRollup?.state ?? null

/**
 * @param {GithubPullRequest} node
 * @returns {Promise<SnapshotPullRequest>}
 */
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
    checks: checksOf(node),
    // GitHub's verdict on the reviews the base branch requires (APPROVED, CHANGES_REQUESTED, REVIEW_REQUIRED, null
    // without such rules), the code owners still asked to review, and the people still asked to review, code owners
    // or not.
    reviewDecision: node.reviewDecision ?? null,
    codeOwnerRequests: (node.reviewRequests?.nodes ?? [])
      .filter((request) => request.asCodeOwner)
      .map((request) => codeOwnerOf(request.requestedReviewer)),
    reviewRequests: requestedPeople(node.reviewRequests?.nodes),
  }
}

// The people still asked to review a pull request, code owners or not: logins only. A team, an app or a reviewer the
// token cannot read is left out: none is someone a review waits for.
/**
 * @param {Pick<GithubReviewRequest, 'requestedReviewer'>[] | null | undefined} requests
 * @returns {string[]}
 */
export function requestedPeople(requests) {
  return (requests ?? [])
    .filter((request) => request.requestedReviewer?.__typename === 'User')
    .map((request) => /** @type {string} */ (request.requestedReviewer?.login))
}

// A code owner asked to review: a login, a team as @slug, null when the token cannot read it.
/** @param {GithubReviewRequest['requestedReviewer']} reviewer */
function codeOwnerOf(reviewer) {
  if (reviewer?.__typename === 'Team') {
    return `@${reviewer.slug}`
  }

  return reviewer?.login ?? null
}

/**
 * @param {GithubReview} node
 * @returns {SnapshotReview}
 */
function toReview(node) {
  return {
    author: actorLogin(node.author),
    state: node.state,
    submittedAt: node.submittedAt,
    comments: node.comments.totalCount,
  }
}

/**
 * @param {GithubComment} node
 * @returns {SnapshotComment}
 */
function toComment(node) {
  return { author: actorLogin(node.author), createdAt: node.createdAt }
}

/** @param {string} sinceIso */
export async function listActiveRepositories(sinceIso) {
  /** @type {string[]} */
  const names = []
  /** @type {string | null} */
  let cursor = null
  for (;;) {
    /** @type {GraphqlAnswer<typeof REPOSITORIES_QUERY>} */
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

/**
 * @param {string} name
 * @param {string} sinceIso
 */
async function fetchRepositoryPullRequests(name, sinceIso) {
  /** @type {SnapshotPullRequest[]} */
  const records = []
  /** @type {string | null} */
  let cursor = null
  for (;;) {
    /** @type {GraphqlAnswer<typeof REPOSITORY_PULL_REQUESTS_QUERY>} */
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

/** @param {string} sinceIso */
export async function fetchWindow(sinceIso) {
  const repositories = await listActiveRepositories(sinceIso)
  const perRepository = await mapWithConcurrency(repositories, CONCURRENCY, (name) =>
    fetchRepositoryPullRequests(name, sinceIso),
  )

  return perRepository.flat()
}

/** @param {string} sinceIso */
export async function fetchUpdatedSince(sinceIso) {
  const query = `org:${ORG} is:pr updated:>=${sinceIso.replace(/\.\d+Z$/, '+00:00')} sort:updated-asc`
  /** @type {SnapshotPullRequest[]} */
  const records = []
  /** @type {string | null} */
  let cursor = null
  for (;;) {
    /** @type {GraphqlAnswer<typeof SEARCH_PULL_REQUESTS_QUERY>} */
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

// The state of the checks of the open pull requests, by repo#number. A check that ends does not move the updatedAt of
// its pull request: the incremental sync, which reads the pull requests updated since the last one, would keep it
// PENDING. One search of a few pages of 100, about a point each; past SEARCH_RESULT_LIMIT open pull requests, the most
// recently updated only, the others keeping the state last read.
export async function fetchOpenChecks() {
  const query = `org:${ORG} is:pr is:open sort:updated-desc`
  /** @type {Map<string, CheckState | null>} */
  const checks = new Map()
  /** @type {string | null} */
  let cursor = null
  for (;;) {
    /** @type {GraphqlAnswer<typeof OPEN_CHECKS_QUERY>} */
    const data = await graphql(OPEN_CHECKS_QUERY, { query, cursor })
    for (const node of data.search.nodes) {
      // The search may answer what is not a pull request, as an empty node.
      if (node?.repository) {
        checks.set(keyOf({ repo: node.repository.name, number: node.number }), checksOf(node))
      }
    }
    const { hasNextPage, endCursor } = data.search.pageInfo
    if (!hasNextPage) {
      return checks
    }
    cursor = endCursor
  }
}

// The checks of the open pull requests, or none when GitHub does not answer: they then keep the state last read, and
// the rest of the sync goes on.
export async function readOpenChecks() {
  try {
    return await fetchOpenChecks()
  } catch (error) {
    console.warn(`Checks of the open pull requests not read again${process.env.CI ? '' : `: ${/** @type {Error} */ (error).message}`}`)

    return new Map()
  }
}

// The pull requests, those still open with the state of their checks just read when the search had them.
/**
 * @param {SnapshotPullRequest[]} pullRequests
 * @param {Map<string, CheckState | null>} checks
 * @returns {SnapshotPullRequest[]}
 */
export function withOpenChecks(pullRequests, checks) {
  return pullRequests.map((pr) =>
    pr.state === 'OPEN' && checks.has(keyOf(pr))
      ? { ...pr, checks: /** @type {CheckState | null} */ (checks.get(keyOf(pr))) }
      : pr,
  )
}

// The pull requests created between two days (UTC, included), for the backfill. The search answers at most 1000
// results: a range with more is read in halves.
/**
 * @param {string} from
 * @param {string} to
 * @returns {Promise<SnapshotPullRequest[]>}
 */
export async function fetchCreatedBetween(from, to) {
  const query = `org:${ORG} is:pr created:${from}..${to} sort:created-asc`
  /** @type {SnapshotPullRequest[]} */
  const records = []
  /** @type {string | null} */
  let cursor = null
  for (;;) {
    /** @type {GraphqlAnswer<typeof SEARCH_PULL_REQUESTS_QUERY>} */
    const data = await graphql(SEARCH_PULL_REQUESTS_QUERY, { query, cursor })
    const { issueCount, nodes, pageInfo } = data.search
    if (cursor === null && issueCount > SEARCH_RESULT_LIMIT && from < to) {
      const middle = addDays(from, Math.floor((Date.parse(to) - Date.parse(from)) / DAY_MS / 2))

      return [...(await fetchCreatedBetween(from, middle)), ...(await fetchCreatedBetween(addDays(middle, 1), to))]
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

/** @type {(pr: { repo: string, number: number }) => string} */
export const keyOf = (pr) => `${pr.repo}#${pr.number}`
