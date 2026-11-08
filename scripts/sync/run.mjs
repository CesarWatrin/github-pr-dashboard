// One sync, from the snapshot to the published stats.

import { DAY_MS, TIMEZONE } from '../../site/domain/time.js'
import { backfill, BACKFILL_LOGS, RECENT_DAYS, snapshotCoverage, WINDOW_DAYS } from './backfill.mjs'
import { ORG, REQUIRED_APPROVALS, SNAPSHOT_PATH, SQUADS, STATS_PATH, SYNC_TRIGGER, VERSION_PATH } from './config.mjs'
import { publishedSyncTrigger } from './full-sync.mjs'
import { HISTORY_LEAD_DAYS, mergeMonthlyHistory, MONTHLY_REVISION, readPublishedHistory } from './history.mjs'
import { fetchFirstPullRequests, isBot, people, peopleOf, peopleToLookUp } from './people.mjs'
import { computeEvents, computeToday, encrypt, readSnapshot, SNAPSHOT_VERSION, writeJson } from './publish.mjs'
import { projectIndex } from './projects.mjs'
import { fetchUpdatedSince, fetchWindow, keyOf, readOpenChecks, withOpenChecks } from './pull-requests.mjs'
import { deliveryIndex, DETAILS_DAYS, minutes, toPeriodRecord } from './records.mjs'
import { fetchRepositoryDetails, repositoryCategory, technologyShares } from './repositories.mjs'
import { computeCi, fetchRuns, RUNS_OVERLAP_MS } from './runs.mjs'

export const WATCH_INTERVAL_MS = 60_000
const SYNC_OVERLAP_MS = 10 * 60_000

/** @param {{ full: boolean, fullSync?: FullSyncCheck | null, refused?: boolean }} options */
export async function sync({ full, fullSync = null, refused = false }) {
  const now = new Date()
  /** @type {(days: number) => string} */
  const before = (days) => new Date(now.getTime() - days * DAY_MS).toISOString()
  const windowStartIso = before(WINDOW_DAYS)
  const recentStartIso = before(RECENT_DAYS)
  const previous = await readSnapshot()
  // Kept through a full sync too: the older pull requests it keeps still name these people, and still need the bots.
  for (const [login, name] of Object.entries(previous?.names ?? {})) {
    people.names.set(login, name)
  }
  for (const login of previous?.bots ?? []) {
    people.bots.add(login)
  }
  const coverage = snapshotCoverage(previous, recentStartIso)

  let mode = 'incremental'
  let fetched =
    previous && !full
      ? await fetchUpdatedSince(new Date(Date.parse(previous.syncedAt) - SYNC_OVERLAP_MS).toISOString())
      : null
  if (fetched === null) {
    mode = 'full'
    fetched = await fetchWindow(recentStartIso)
  }
  const backfilled = await backfill(coverage.pullRequests, windowStartIso)

  // A full sync has read the last year again: it keeps the older pull requests of the snapshot as they were read.
  const keptPullRequests = (previous?.pullRequests ?? []).filter(
    (pr) => mode === 'incremental' || pr.createdAt < recentStartIso,
  )
  const pullRequests = new Map(keptPullRequests.map((pr) => [keyOf(pr), pr]))
  for (const pr of [...backfilled.pullRequests, ...fetched]) {
    pullRequests.set(keyOf(pr), pr)
  }
  // The data starts with the window once the backfill has reached it, until then with what the snapshot covers: an
  // older pull request updated since, read on its own, waits for its slice.
  const dataStartIso = backfilled.since > windowStartIso ? backfilled.since : windowStartIso
  const inWindow = withOpenChecks(
    [...pullRequests.values()].filter((pr) => pr.createdAt >= dataStartIso),
    await readOpenChecks(),
  )

  // Actions runs: the last year the first time, then those created since shortly before the last sync. A full sync
  // keeps them too: a finished run does not change. GitHub forgets them after about 13 months: the snapshot keeps them
  // for the whole window, so the CI goes back further as time goes by, from what the snapshot covers.
  const previousRuns = previous?.runs
  const fetchedRuns = await fetchRuns(
    previousRuns ? new Date(Date.parse(previous.syncedAt) - RUNS_OVERLAP_MS).toISOString() : recentStartIso,
    now,
  )
  const runs = new Map((previousRuns ?? []).map((run) => [run.id, run]))
  for (const run of fetchedRuns) {
    runs.set(run.id, run)
  }
  const runsInWindow = [...runs.values()].filter((run) => run.createdAt >= windowStartIso)
  const ciStartIso = coverage.runs > windowStartIso ? coverage.runs : windowStartIso

  // Languages and frameworks are only looked up for repositories not seen yet: a full sync refreshes them all.
  const repositories = [...new Set(inWindow.map((pr) => pr.repo))]
  // An incremental sync has a snapshot.
  const snapshot = /** @type {Snapshot} */ (previous)
  /** @type {Record<string, RepositoryLanguages>} */
  let languages = mode === 'full' ? {} : (snapshot.languages ?? {})
  /** @type {Record<string, string[]>} */
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

  const index = deliveryIndex(inWindow)
  const projects = projectIndex(inWindow)
  const records = /** @type {PullRequestRecord[]} */ (
    inWindow.map((pr) => toPeriodRecord(pr, index, before(DETAILS_DAYS), projects)).filter(Boolean)
  )
  // Kept by the snapshot, even through a full sync, and read back from the published stats when it has none. Without
  // any, the history starts from the data, counted the current way.
  const kept = previous?.monthly
    ? { history: previous.monthly, revision: previous.monthlyRevision ?? 1 }
    : ((await readPublishedHistory()) ?? { history: {}, revision: MONTHLY_REVISION })
  const knownFirstPullRequests = previous?.firstPullRequests ?? {}
  const firstPullRequests = {
    ...knownFirstPullRequests,
    ...(await fetchFirstPullRequests(peopleToLookUp(records, knownFirstPullRequests))),
  }
  const history = mergeMonthlyHistory(kept.history, records, {
    windowStart: Date.parse(dataStartIso) + HISTORY_LEAD_DAYS * DAY_MS,
    now: now.getTime(),
    revision: kept.revision,
  })

  await writeJson(SNAPSHOT_PATH, {
    version: SNAPSHOT_VERSION,
    org: ORG,
    syncedAt: now.toISOString(),
    names: Object.fromEntries(people.names),
    bots: [...people.bots],
    languages,
    frameworks,
    pullRequests: inWindow,
    pullRequestsSince: backfilled.since,
    runs: runsInWindow,
    runsSince: coverage.runs,
    firstPullRequests,
    monthly: history,
    monthlyRevision: MONTHLY_REVISION,
  })
  const version = { build: process.env.BUILD_ID || null, generatedAt: now.toISOString() }
  await writeJson(
    STATS_PATH,
    encrypt({
      org: ORG,
      ...version,
      timezone: TIMEZONE,
      syncTrigger: publishedSyncTrigger(SYNC_TRIGGER, fullSync),
      // A full sync asked without a valid proof, synced incrementally instead: the page that asked tells so.
      ...(refused && { fullSyncRefused: true }),
      requiredApprovals: REQUIRED_APPROVALS,
      ...(SQUADS.length && { squads: SQUADS }),
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
      // The page computes the stats of the range it shows from these, since the start of the data.
      windowStart: dataStartIso,
      pullRequests: records,
      // When each person opened their first pull request in the organization, in minutes: seniority goes back further
      // than the data.
      firstPullRequests: Object.fromEntries(
        peopleOf(records)
          .filter((login) => firstPullRequests[login])
          .map((login) => [login, minutes(/** @type {string} */ (firstPullRequests[login]))]),
      ),
      // The badges are won over this history, since the first sync.
      monthly: history,
      monthlyRevision: MONTHLY_REVISION,
      ci: computeCi(runsInWindow),
      // The runs only go back to there: GitHub had forgotten the older ones when the snapshot started keeping them.
      ciStart: ciStartIso,
      events: computeEvents(inWindow, now),
    }),
  )
  // Written last: the page polls this small file and only downloads the stats once it changes.
  await writeJson(VERSION_PATH, version)

  // The logs of a public repository are public: in CI they tell nothing of the organization's volumes.
  const counts = process.env.CI
    ? ''
    : `: ${fetched.length} PR fetched, ${inWindow.length} PR in window, ` +
      `${fetchedRuns.length} runs fetched, ${runsInWindow.length} runs in window, ` +
      `${Object.keys(history).length} months of history, data since ${dataStartIso.slice(0, 10)}`
  console.log(`[${now.toISOString()}] ${mode} sync${BACKFILL_LOGS[backfilled.status]}${counts}`)
}
