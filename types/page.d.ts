// The state of the page (site/model/state.js), and the stats it works out from the published ones. Global, for the JSDoc
// of every file.

type PeriodStats = ReturnType<typeof import('../site/domain/period.js').computePeriod>
type CiStats = ReturnType<typeof import('../site/domain/ci.js').computeCi>
type ReviewNetwork = ReturnType<typeof import('../site/domain/team.js').reviewNetwork>
type ActivityBounds = ReturnType<typeof import('../site/domain/team.js').activityBounds>
type Analysis = ReturnType<typeof import('../site/domain/analysis.js').analyze>
type PersonalQueue = ReturnType<typeof import('../site/domain/open-pull-requests.js').personalQueue>

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
  // Per table, each row as last drawn (JSON), by its key: the rows that changed are highlighted.
  previousRows: Record<string, Map<string, string>>
  syncStarting: string | null
  syncRequest: { kind: string; at: number } | null
  fullSyncAsked: boolean
  autoSyncTriedAt: number
  autoSyncing: boolean
  activity: { stats: Stats; bounds: ActivityBounds } | null
  badges: import('../site/model/badges.js').BadgeStandings | null
  reportMonth: string | null
  reportCache: { stats: Stats; months: Map<string, MonthStats> } | null
  trendsPreparing: { stats: Stats; squad: string } | null
  trendsCards: { stats: Stats; key: string; cards: { card: HTMLElement; draw: () => void }[] } | null
  seenEvents: Set<string> | null
  seenUnapproved: Set<string> | null
  squad: string
  // The squad of the last render(): going to or from a page without filters may change it.
  renderedSquad?: string
  squadRecordsCache: { stats: Stats; records: Map<string, PullRequestRecord[]> } | null
  squadPeriodsCache: { stats: Stats | null; periods: Map<string, PeriodStats> } | null
  squadSort: { key: string; reversed: boolean }
  squadPerMember: boolean
  me: string | null
  notify: boolean
  // The pull requests of every list of « Mes PR » for the person picked there, as of the last sync.
  forMe: { list: string; pr: PersonalQueue['toReview'][number] }[] | null
  fetchFailed: boolean
}
