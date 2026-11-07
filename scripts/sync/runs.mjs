// The Actions runs of the repositories, and their CI stats per workflow and Paris day.

import { addDays, DAY_MS, parisDay } from '../../site/domain/time.js'
import { ORG } from './config.mjs'
import { rest } from './github.mjs'
import { listActiveRepositories } from './pull-requests.mjs'

// The Actions runs API answers at most 1000 runs per filtered query: longer ranges are fetched in halves.
const RUNS_QUERY_LIMIT = 1000
const RUNS_PAGE_SIZE = 100

// Runs created this long before the last sync are fetched again, to get the outcome of those still running.
export const RUNS_OVERLAP_MS = DAY_MS
// Runs that check code, on pull requests and pushes: scheduled, manual and Dependabot runs are left out.
const CI_EVENTS = ['pull_request', 'pull_request_target', 'push', 'merge_group']
// Cancelled and skipped runs reach no verdict: they are left out too.
/** @type {(string | null)[]} */
const VERDICT_CONCLUSIONS = ['success', 'failure', 'timed_out', 'startup_failure']
/** @type {(string | null)[]} */
const FAILED_CONCLUSIONS = ['failure', 'timed_out', 'startup_failure']

// Returns null when too many pull requests changed for the search API, the caller then refetches the window.
// The Actions runs of a repository created between two days (UTC, included), the ones that check code.
/**
 * @param {string} name
 * @param {string} from
 * @param {string} to
 * @returns {Promise<SnapshotRun[]>}
 */
async function fetchRepositoryRuns(name, from, to) {
  /** @type {(page: number) => string} */
  const path = (page) => `/repos/${ORG}/${name}/actions/runs?created=${from}..${to}&per_page=${RUNS_PAGE_SIZE}&page=${page}`
  const first = /** @type {GithubRunsPage | null} */ (await rest(path(1)))
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
  const others = /** @type {GithubRunsPage[]} */ (
    await Promise.all(Array.from({ length: pages - 1 }, (_, index) => rest(path(index + 2))))
  )

  return [first, ...others]
    .flatMap((body) => body.workflow_runs)
    .filter((run) => CI_EVENTS.includes(run.event))
    .map((run) => toRun(name, run))
}

/**
 * @param {string} repo
 * @param {GithubRun} run
 * @returns {SnapshotRun}
 */
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
/**
 * @param {string} sinceIso
 * @param {Date} now
 */
export async function fetchRuns(sinceIso, now) {
  const repositories = await listActiveRepositories(sinceIso)
  const perRepository = await Promise.all(
    repositories.map((name) => fetchRepositoryRuns(name, sinceIso.slice(0, 10), now.toISOString().slice(0, 10))),
  )

  return perRepository.flat()
}

// Actions runs per repository, workflow and Paris day, as [runs, failed, rerun, durations in seconds]: the page adds
// up the days of the range it shows.
/**
 * @param {Omit<SnapshotRun, 'id'>[]} runs
 * @returns {WorkflowRuns[]}
 */
export function computeCi(runs) {
  /** @type {Map<string, WorkflowRuns>} */
  const workflows = new Map()
  for (const run of runs) {
    if (!VERDICT_CONCLUSIONS.includes(run.conclusion)) {
      continue
    }
    const key = `${run.repo}/${run.workflow}`
    if (!workflows.has(key)) {
      workflows.set(key, { repo: run.repo, workflow: run.workflow, days: {} })
    }
    const day = (/** @type {WorkflowRuns} */ (workflows.get(key)).days[parisDay(run.createdAt)] ??= [0, 0, 0, []])
    day[0]++
    day[1] += FAILED_CONCLUSIONS.includes(run.conclusion) ? 1 : 0
    day[2] += run.attempt > 1 ? 1 : 0
    day[3].push(Math.max(0, Math.round((Date.parse(run.updatedAt) - Date.parse(run.startedAt)) / 1000)))
  }

  return [...workflows.values()]
}
