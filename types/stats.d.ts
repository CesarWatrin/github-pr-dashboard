// What the sync publishes (scripts/sync/publish.mjs) and the page reads, encrypted in site/data/stats.enc.json: the
// stats, and the record of each pull request (site/domain/period.js documents it). Global, for the JSDoc of every file.

type Bucket = 'day' | 'week' | 'month'
type Category = 'front' | 'back' | 'mobile' | 'other'
type PullRequestKind = 'code' | 'release' | 'integration'
type ReviewState = 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING'
type CheckState = 'SUCCESS' | 'FAILURE' | 'ERROR' | 'PENDING' | 'EXPECTED'

// A range of time, in milliseconds since the epoch, [start, end), and the buckets of its charts.
interface TimeRange {
  start: number
  end: number
  bucket: Bucket
}

// A review or a comment of someone else than the author: who, when (minutes since the epoch), the state of a review
// (null for a comment), how many comments.
type Intervention = [login: string, at: number, state: ReviewState | null, comments: number]

// One pull request of the rolling window, times in minutes since the epoch.
interface PullRequestRecord {
  repo: string
  number: number
  author: string
  bot: boolean
  kind: PullRequestKind
  hotfix: boolean
  production: boolean
  createdAt: number
  mergedAt: number | null
  closed: boolean
  lines: number
  mergedBy: string | null
  interventions: Intervention[]
  deployment?: boolean
  revert?: boolean
  deployedAt?: number | null
  deleted?: number
  checksFailed?: boolean
  dependency?: string
  draft?: boolean
  codeOwners?: (string | null)[] | null
  requestedReviewers?: string[]
  project?: string
  // The stage of its project, when it goes in stages: 2.1, 3, pilot…
  stage?: string
  projectMerge?: boolean
  // When a pull request of a project was closed without being merged.
  closedAt?: number
  // The branch of the AC (amélioration continue) of a code pull request: feature/<name> or feat/<name>, cut from develop.
  ac?: string
  title?: string
  checks?: CheckState | null
}

// The Actions runs of a workflow per Paris day: [runs, failed, rerun, durations in seconds].
type CiDay = [runs: number, failed: number, rerun: number, durations: number[]]
interface WorkflowRuns {
  repo: string
  workflow: string
  days: Record<string, CiDay>
}

// What a person did in a month, for the badges.
interface MonthlyFigures {
  code: number
  hotfixes: number
  reviewed: number
  comments: number
  added: number
  deleted: number
  opened: number
  // Code pull requests of a project.
  projects: number
  // Code pull requests of an AC.
  acs: number
}
// Per month ('YYYY-MM'), each person's figures.
type MonthlyHistory = Record<string, Record<string, Partial<MonthlyFigures>>>

interface Squad {
  name: string
  members: string[]
  lead?: string
}

interface FullSyncCheck {
  salt: string
  iterations: number
  verifier: string
}

interface SyncTrigger {
  repository: string
  workflow: string
  ref: string
  token: string
  fullSync?: FullSyncCheck
}

interface RepositoryInfo {
  category: Category
  technologies: [name: string, share: number][]
}

type FeedEventType = 'opened' | 'merged' | 'approved' | 'changes_requested' | 'commented'
interface FeedEvent {
  type: FeedEventType
  at: string
  actor: string
  author: string
  repo: string
  number: number
}

interface Stats {
  org: string
  build: string | null
  generatedAt: string
  timezone: string
  syncTrigger: SyncTrigger | null
  fullSyncRefused?: boolean
  // The key of the year in review (RETRO_KEY), for the link of the sidebar: whoever sees the dashboard may share it.
  retroKey?: string
  requiredApprovals: number
  squads?: Squad[]
  people: Record<string, string>
  repos: Record<string, RepositoryInfo>
  today: { date: string; opened: number; merged: number; reviews: number }
  windowStart: string
  pullRequests: PullRequestRecord[]
  firstPullRequests?: Record<string, number>
  monthly?: MonthlyHistory
  monthlyRevision?: number
  ci?: WorkflowRuns[]
  ciStart?: string
  events: FeedEvent[]
}

// The stats as published: gzipped, then encrypted with the key derived from the dashboard password.
interface EncryptedStats {
  iterations: number
  salt: string
  iv: string
  data: string
}

// The year in review (« Rétrospective », site/retro.html) as the sync publishes it apart from the stats
// (scripts/sync/retro.mjs): only what its slides show, for the people of its year still in the team and for the team,
// in retro.enc.json, encrypted with the key of RETRO_KEY. Times of day in minutes since midnight, Paris time; durations
// in minutes on the calendar.
interface RetroProject {
  name: string
  status: 'ongoing' | 'delivered' | 'stalled' | 'abandoned'
  delivered: boolean
}
interface RetroFunFacts {
  smallest: number | null
  fastest: number | null
  slowest: number | null
  discussed: number | null
  earliest: number | null
  latest: number | null
  fridays: number
}
interface RetroYear {
  code: number
  merged: number
  added: number
  deleted: number
  hotfixes: number
  months: { month: string; code: number }[]
  busiestMonth: string | null
  // The busiest repositories, the most first.
  repos: [repo: string, prs: number][]
  reviewed: number
  comments: number
  // The projects worked on within the year, those delivered in it, and the first few, delivered first.
  projects: number
  delivered: number
  projectList: RetroProject[]
  acs: number
  facts: RetroFunFacts
}
interface RetroPerson extends RetroYear {
  login: string
  days: number
  streak: number
  busiestWeekday: number | null
  biggest: { repo: string; number: number; lines: number; title: string | null } | null
  reviewedBy: { login: string; prs: number } | null
  reviewedMost: { login: string; prs: number } | null
}
interface RetroTeam extends RetroYear {
  people: number
  reviewers: number
  deployments: number
  deploymentDays: number
}
interface Retro {
  org: string
  year: number
  generatedAt: string
  // The names of the people it names, when they differ from their login.
  names: Record<string, string>
  people: RetroPerson[]
  team: RetroTeam
}
// Encrypted with a key of its own, which the link carries: nothing to derive.
interface EncryptedRetro {
  iv: string
  data: string
}
