// The one state of the page, and the choices of the viewer it remembers in this browser (period, comparison, squad,
// person of « Mes PR », notifications).

import { COMPARISONS, DEFAULT_PERIOD, NO_COMPARISON } from './periods.js'

const PERIOD_STORAGE_KEY = 'github-pr-dashboard:period'
const RANGE_STORAGE_KEY = 'github-pr-dashboard:range'
const COMPARE_STORAGE_KEY = 'github-pr-dashboard:compare'

// Who the « Mes PR » page is for, in this browser.
const ME_STORAGE_KEY = 'github-pr-dashboard:me'
// Whether this browser notifies the reviews newly asked of that person.
const NOTIFY_STORAGE_KEY = 'github-pr-dashboard:notify'
// The squad picked in the filters, in this browser: none for the whole organization.
const SQUAD_STORAGE_KEY = 'github-pr-dashboard:squad'

/** @type {State} */
export const state = {
  key: null,
  keyExpiresAt: 0,
  stats: null,
  period: readStoredPeriod(),
  // Picked days, inclusive, used when the period is custom.
  range: readStoredRange(),
  // What the tiles of the period are compared to: a key of COMPARISONS, or NO_COMPARISON.
  compare: readStoredCompare(),
  // The stats of the range compared to, computed once per range and data, like those of the period.
  comparisonCache: null,
  comparisonCiCache: null,
  // The stats of the period shown, computed once per period and data.
  periodCache: null,
  ciCache: null,
  networkCache: null,
  // The findings of the analysis page, worked out once per period and data, when that page shows.
  analysisCache: null,
  query: '',
  person: null,
  // What the technologies chart weighs: a key of TECHNOLOGY_MEASURES.
  technologyMeasure: 'prs',
  // Repositories selected for each table, null for all of them.
  repos: { authors: null, reviewers: null, cycle: null, collaboration: null, team: null, repositories: null, projects: null },
  sort: {
    authors: { key: 'code', direction: -1 },
    reviewers: { key: 'prs', direction: -1 },
    cycle: { key: 'prs', direction: -1 },
    // Sorted on the pairs rather than on the people: the most frozen pairs first.
    collaboration: { key: 'topReviewerShare', direction: -1 },
    tma: { key: 'hotfixes', direction: -1 },
    repos: { key: 'code', direction: -1 },
    deployments: { key: 'deployments', direction: -1 },
    workflows: { key: 'runs', direction: -1 },
    dependencies: { key: 'opened', direction: -1 },
    // As on their timeline: the earliest started first.
    projects: { key: 'start', direction: 1 },
  },
  previousRows: Object.fromEntries(
    ['authors', 'reviewers', 'cycle', 'collaboration', 'tma', 'repos', 'deployments', 'workflows', 'dependencies', 'projects'].map((name) => [
      name,
      new Map(),
    ]),
  ),
  // The kind of sync the page is starting, until GitHub answers.
  syncStarting: null,
  // The sync started from the page, until new data arrives.
  syncRequest: null,
  // A full sync started with the proof of its password, until new stats tell whether the run took it.
  fullSyncAsked: false,
  // When the page last looked at the runs to start a sync on its own (browser clock), and whether it is doing so.
  autoSyncTriedAt: 0,
  autoSyncing: false,
  // When each person first and last shows in the stats, worked out once per stats: seniority, and who left the team.
  activity: null,
  // The badges of each person, worked out once per stats.
  badges: null,
  // The month of the report, null for the current one, and the stats of each month, worked out once per stats.
  reportMonth: null,
  reportCache: null,
  // The trends page: the stats its months are being worked out for, and its cards, built once per stats.
  trendsPreparing: null,
  trendsCards: null,
  seenEvents: null,
  seenUnapproved: null,
  // The squad the pages are scoped to (its name), '' for the whole organization; the pull requests of each squad, and
  // the stats of each squad and range, worked out once per stats; how the squads page ranks them.
  squad: readStoredSquad(),
  squadRecordsCache: null,
  squadPeriodsCache: null,
  squadSort: { key: 'merged', reversed: false },
  squadPerMember: false,
  // The statuses of the projects the projects page shows, all of them while null.
  projectStatuses: null,
  // The projects of the period for the squad picked, worked out once per stats, range and squad.
  projectsCache: null,
  // Who the « Mes PR » page is for, null until picked.
  me: readStoredMe(),
  notify: readStoredNotify(),
  // What that person has to act on, as of the last sync, and how many open pull requests of their own, drafts included.
  forMe: null,
  meOwn: 0,
  fetchFailed: false,
}

/** @returns {string} */
function readStoredPeriod() {
  try {
    return localStorage.getItem(PERIOD_STORAGE_KEY) ?? DEFAULT_PERIOD
  } catch {
    return DEFAULT_PERIOD
  }
}

/** @returns {DayRange | null} */
function readStoredRange() {
  try {
    /** @type {Partial<DayRange> | null} */
    const range = JSON.parse(String(localStorage.getItem(RANGE_STORAGE_KEY)))

    return typeof range?.from === 'string' && typeof range?.to === 'string' ? /** @type {DayRange} */ (range) : null
  } catch {
    return null
  }
}

/** @returns {string} */
function readStoredCompare() {
  try {
    const compare = localStorage.getItem(COMPARE_STORAGE_KEY)

    return Object.hasOwn(COMPARISONS, compare ?? '') ? /** @type {string} */ (compare) : NO_COMPARISON
  } catch {
    return NO_COMPARISON
  }
}

export function storePeriod() {
  try {
    localStorage.setItem(PERIOD_STORAGE_KEY, state.period)
    localStorage.setItem(COMPARE_STORAGE_KEY, state.compare)
    if (state.range) {
      localStorage.setItem(RANGE_STORAGE_KEY, JSON.stringify(state.range))
    }
  } catch {
    // Storage can be unavailable (private browsing): the period is simply not remembered.
  }
}

/** @returns {string} */
function readStoredSquad() {
  try {
    return localStorage.getItem(SQUAD_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function storeSquad() {
  try {
    if (state.squad) {
      localStorage.setItem(SQUAD_STORAGE_KEY, state.squad)
    } else {
      localStorage.removeItem(SQUAD_STORAGE_KEY)
    }
  } catch {
    // Without storage, the squad is picked again on the next visit.
  }
}

/** @returns {string | null} */
function readStoredMe() {
  try {
    return localStorage.getItem(ME_STORAGE_KEY)
  } catch {
    return null
  }
}

export function storeMe() {
  try {
    localStorage.setItem(ME_STORAGE_KEY, String(state.me))
  } catch {
    // Without storage, the person is picked again on the next visit.
  }
}

/** @returns {boolean} */
function readStoredNotify() {
  try {
    return localStorage.getItem(NOTIFY_STORAGE_KEY) === 'on'
  } catch {
    return false
  }
}

export function storeNotify() {
  try {
    if (state.notify) {
      localStorage.setItem(NOTIFY_STORAGE_KEY, 'on')
    } else {
      localStorage.removeItem(NOTIFY_STORAGE_KEY)
    }
  } catch {
    // Without storage, notifications are turned on again on the next visit.
  }
}

// The stats, for what only runs once they are unlocked.
/** @returns {Stats} */
export function loadedStats() {
  if (!state.stats) {
    throw new Error('The stats are read before they are loaded')
  }

  return state.stats
}
