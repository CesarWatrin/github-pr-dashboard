// The GraphQL queries of the sync, and the fields they read of a pull request.

const ACTOR_FIELDS = '__typename login ... on User { name }'
const REVIEW_FIELDS = `author { ${ACTOR_FIELDS} } state submittedAt comments { totalCount }`
const COMMENT_FIELDS = `author { ${ACTOR_FIELDS} } createdAt`
const CHECKS_FIELDS = 'commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }'

const PULL_REQUEST_FIELDS = `
  number title state isDraft createdAt mergedAt closedAt additions deletions headRefName baseRefName
  repository { name }
  author { ${ACTOR_FIELDS} }
  mergedBy { ${ACTOR_FIELDS} }
  reviews(first: 50) { pageInfo { hasNextPage endCursor } nodes { ${REVIEW_FIELDS} } }
  comments(first: 50) { pageInfo { hasNextPage endCursor } nodes { ${COMMENT_FIELDS} } }
  ${CHECKS_FIELDS}
  reviewDecision
  reviewRequests(first: 10) { nodes { asCodeOwner requestedReviewer { __typename ... on User { login } ... on Team { slug } } } }
`

export const REPOSITORIES_QUERY = `
  query($org: String!, $cursor: String) {
    organization(login: $org) {
      repositories(first: 100, after: $cursor, orderBy: { field: PUSHED_AT, direction: DESC }) {
        pageInfo { hasNextPage endCursor }
        nodes { name pushedAt }
      }
    }
  }`

export const REPOSITORY_DETAILS_QUERY = `
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

export const REPOSITORY_PULL_REQUESTS_QUERY = `
  query($org: String!, $name: String!, $cursor: String) {
    repository(owner: $org, name: $name) {
      pullRequests(first: 20, after: $cursor, orderBy: { field: CREATED_AT, direction: DESC }) {
        pageInfo { hasNextPage endCursor }
        nodes { ${PULL_REQUEST_FIELDS} }
      }
    }
  }`

export const SEARCH_PULL_REQUESTS_QUERY = `
  query($query: String!, $cursor: String) {
    search(query: $query, type: ISSUE, first: 25, after: $cursor) {
      issueCount
      pageInfo { hasNextPage endCursor }
      nodes { ... on PullRequest { ${PULL_REQUEST_FIELDS} } }
    }
  }`

// The state of the checks of open pull requests, read again at each sync (fetchOpenChecks()).
export const OPEN_CHECKS_QUERY = `
  query($query: String!, $cursor: String) {
    search(query: $query, type: ISSUE, first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { ... on PullRequest { number repository { name } ${CHECKS_FIELDS} } }
    }
  }`

// The oldest pull request a person opened in the organization, whatever the window.
export const FIRST_PULL_REQUEST_QUERY = `
  query($query: String!) {
    search(query: $query, type: ISSUE, first: 1) {
      nodes { ... on PullRequest { createdAt } }
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

export const REMAINING_ITEMS_QUERIES = {
  reviews: remainingItemsQuery('reviews', REVIEW_FIELDS),
  comments: remainingItemsQuery('comments', COMMENT_FIELDS),
}
