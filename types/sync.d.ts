// The shapes of the sync (scripts/sync/): what it reads of GitHub, and what its snapshot keeps. Global, for the JSDoc of
// every file; what it publishes is in stats.d.ts.

// A GraphQL query: a string that carries the shape of its answer, which graphql() returns.
type GraphqlQuery<Answer> = string & { readonly answer?: Answer }

interface PageInfo {
  hasNextPage: boolean
  endCursor: string | null
}

interface Connection<Node> {
  pageInfo: PageInfo
  nodes: Node[]
}

// An author, a reviewer or whoever merged: a person (User), else an app or a bot; null once the account is deleted.
interface GithubActor {
  __typename: string
  login: string
  name?: string | null
}

interface GithubReview {
  author: GithubActor | null
  state: ReviewState
  submittedAt: string | null
  comments: { totalCount: number }
}

interface GithubComment {
  author: GithubActor | null
  createdAt: string
}

// The state of the checks of the last commit.
interface GithubCommits {
  commits: { nodes: { commit: { statusCheckRollup: { state: CheckState } | null } }[] }
}

// Someone asked to review: a person, a team, or a reviewer the token cannot read (null).
interface GithubReviewRequest {
  asCodeOwner: boolean
  requestedReviewer: { __typename: string; login?: string; slug?: string } | null
}

// A node of the search of the open pull requests: an empty one for what is not a pull request.
type GithubOpenChecks = (GithubCommits & { number: number; repository?: { name: string } }) | null

type PullRequestState = 'OPEN' | 'CLOSED' | 'MERGED'
type ReviewDecision = 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED'

interface GithubPullRequest extends GithubCommits {
  number: number
  title: string
  state: PullRequestState
  isDraft: boolean
  createdAt: string
  mergedAt: string | null
  closedAt: string | null
  additions: number
  deletions: number
  headRefName: string
  baseRefName: string
  repository: { name: string }
  author: GithubActor | null
  mergedBy: GithubActor | null
  reviews: Connection<GithubReview>
  comments: Connection<GithubComment>
  reviewDecision: ReviewDecision | null
  reviewRequests: { nodes: GithubReviewRequest[] } | null
}

// A blob of a manifest at the head of a repository: null when the file does not exist.
type GithubBlob = { text?: string } | null

interface GithubRepositoryDetails {
  name: string
  languages: { edges: { size: number; node: { name: string } }[] }
  composer: GithubBlob
  packageJson: GithubBlob
  pubspec: GithubBlob
}

interface GithubSearch<Node> extends Connection<Node> {
  issueCount: number
}

// What the REST API of Actions answers: a page of runs.
interface GithubRun {
  id: number
  name: string
  event: string
  conclusion: string | null
  run_attempt: number
  created_at: string
  run_started_at: string
  updated_at: string
}

interface GithubRunsPage {
  total_count: number
  workflow_runs: GithubRun[]
}

// What is left of the hourly quota of the token (/rate_limit).
interface GithubRateLimit {
  resources?: { graphql?: { remaining?: number } }
}

// A review and a comment of a pull request, as the snapshot keeps them.
interface SnapshotReview {
  author: string
  state: ReviewState
  submittedAt: string | null
  comments: number
}

interface SnapshotComment {
  author: string
  createdAt: string
}

// A pull request as the snapshot keeps it (toRecord()), times in ISO. The review requests came later: a pull request
// not read since has none.
interface SnapshotPullRequest {
  repo: string
  number: number
  title: string
  state: PullRequestState
  draft: boolean
  createdAt: string
  mergedAt: string | null
  closedAt: string | null
  additions: number
  deletions: number
  head: string
  base: string
  author: string
  mergedBy: string | null
  reviews: SnapshotReview[]
  comments: SnapshotComment[]
  checks: CheckState | null
  reviewDecision?: ReviewDecision | null
  codeOwnerRequests?: (string | null)[]
  reviewRequests?: string[]
}

// An Actions run, as the snapshot keeps it.
interface SnapshotRun {
  id: number
  repo: string
  workflow: string
  conclusion: string | null
  attempt: number
  createdAt: string
  startedAt: string
  updatedAt: string
}

// Languages of a repository as [name, bytes], largest first.
type RepositoryLanguages = [name: string, bytes: number][]

interface Snapshot {
  version: number
  org: string
  syncedAt: string
  names?: Record<string, string>
  bots?: string[]
  languages?: Record<string, RepositoryLanguages>
  frameworks?: Record<string, string[]>
  pullRequests?: SnapshotPullRequest[]
  pullRequestsSince?: string
  runs?: SnapshotRun[]
  runsSince?: string
  firstPullRequests?: Record<string, string | null>
  monthly?: MonthlyHistory
  monthlyRevision?: number
}

// An answer of GitHub, read whole: the body parsed when the call succeeded, else as text.
interface GithubResponse {
  ok: boolean
  status: number
  body: unknown
}

// The answer of a query: what a loop reading its pages declares, its cursor coming from the previous answer.
type GraphqlAnswer<Query> = Query extends { readonly answer?: infer Answer } ? Answer : never

// Per repository, the times of its deployments, and per repository:branch the times it was merged, sorted (ISO).
interface DeliveryIndex {
  deployments: Map<string, string[]>
  branchMerges: Map<string, string[]>
}

// A project, and the stage of it (null for none): of a branch, a name of the project branches, a pull request.
interface ProjectStage {
  project: string
  stage: string | null
}

// Per repository:branch, the pull requests opened from it, newest first; the project and stage of each name of the
// project branches; and the project and stage of each branch once worked out (null for none).
interface ProjectIndex {
  fromBranch: Map<string, Pick<SnapshotPullRequest, 'repo' | 'head' | 'base' | 'createdAt'>[]>
  names: Map<string, ProjectStage>
  branches: Map<string, ProjectStage | null>
}
