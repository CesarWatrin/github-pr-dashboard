// The state of the page (site/model/state.js), and the stats it works out from the published ones. Global, for the JSDoc
// of every file.

type PeriodStats = ReturnType<typeof import('../site/domain/period.js').computePeriod>
type CiStats = ReturnType<typeof import('../site/domain/ci.js').computeCi>
type ReviewNetwork = ReturnType<typeof import('../site/domain/team.js').reviewNetwork>
type ActivityBounds = ReturnType<typeof import('../site/domain/team.js').activityBounds>
type Analysis = ReturnType<typeof import('../site/domain/analysis.js').analyze>

// What the page shows over a whole month: its stats, and its CI when the runs cover it.
interface MonthStats {
  period: PeriodStats
  ci: CiStats | null
}

// Picked days, 'YYYY-MM-DD', both included.
interface DayRange {
  from: string
  to: string
}

interface TableSort {
  key: string
  direction: number
}

// A value worked out once per stats and key (a range, a selection…).
interface Cached<Value> {
  stats: Stats
  key: string
  value: Value
}

interface State {
  key: CryptoKey | null
  keyExpiresAt: number
  stats: Stats | null
  period: string
  range: DayRange | null
  compare: string
  comparisonCache: { stats: Stats; key: string; period: PeriodStats } | null
  comparisonCiCache: { stats: Stats; key: string; ci: CiStats } | null
  periodCache: { stats: Stats; key: string; period: PeriodStats } | null
  ciCache: { stats: Stats; key: string; ci: CiStats } | null
  networkCache: { period: PeriodStats; selection: Set<string> | null; network: ReviewNetwork } | null
  analysisCache: { stats: Stats; key: string; analysis: Analysis } | null
  query: string
  person: string | null
  technologyMeasure: string
  repos: Record<string, Set<string> | null>
  sort: Record<string, TableSort>
  previousRows: Record<string, Map<string, unknown>>
  syncStarting: string | null
  syncRequest: { kind: string; since: number; until: number; generatedAt: string | null } | null
  fullSyncAsked: boolean
  autoSyncTriedAt: number
  autoSyncing: boolean
  activity: { stats: Stats; bounds: ActivityBounds } | null
  badges: { stats: Stats; standings: unknown } | null
  reportMonth: string | null
  reportCache: { stats: Stats; months: Map<string, MonthStats> } | null
  trendsPreparing: Stats | null
  trendsCards: { stats: Stats; key: string; cards: HTMLElement[] } | null
  seenEvents: Set<string> | null
  seenUnapproved: Set<string> | null
  squad: string
  squadRecordsCache: { stats: Stats; records: Map<string, PullRequestRecord[]> } | null
  squadPeriodsCache: { stats: Stats; periods: Map<string, PeriodStats> } | null
  squadSort: { key: string; reversed: boolean }
  squadPerMember: boolean
  me: string | null
  notify: boolean
  reviewsAsked: number | null
  fetchFailed: boolean
}
