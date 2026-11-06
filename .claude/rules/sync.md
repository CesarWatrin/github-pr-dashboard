---
paths:
  - "scripts/**"
  - ".github/**"
---

# Sync (`scripts/sync.mjs`)

## Fetching

- **Full sync**: lists the repositories pushed to over the last year (`RECENT_DAYS`), then reads their pull requests
  through GraphQL, newest first, four repositories at a time. Reviews and comments are paginated beyond the first 50.
  The older pull requests of the snapshot are kept as read: closed for the most part, and the incremental sync still
  reads one again when it changes. Names and bots come from the snapshot whatever the sync: they still serve them.
- **Incremental sync**: GraphQL search `org:… is:pr updated:>=…` from 10 minutes before the last sync. The search
  answers at most 1000 results: beyond that, the sync falls back to a full one.
- **Checks of the open pull requests**, at every sync, full or not (`fetchOpenChecks()`): a check that ends does not
  move the `updatedAt` of its pull request, so the incremental search would keep it `PENDING`. One search
  `org:… is:pr is:open sort:updated-desc`, 100 a page, asking only the state of the checks of the last commit (about a
  point a page); past 1000 open pull requests, the most recently updated only. `withOpenChecks()` sets it on the open
  pull requests of the snapshot (one merged or closed since keeps what the sync read). When GitHub does not answer,
  `readOpenChecks()` keeps the states last read and the sync goes on; in CI the warning says nothing more.
- **Backfill**: the window (`WINDOW_DAYS`) is three years, too long to read at once (timeout, hourly quota). The
  snapshot keeps what it covers (`pullRequestsSince`; a snapshot without it covers the year before its sync). Each
  sync reads one slice (`backfillSlice()`): the pull requests created in the `BACKFILL_DAYS` before it, by whole UTC
  days, through the search `org:… is:pr created:from..to` (read in halves beyond 1000 results), cut by `splitDays()`
  into `CONCURRENCY` ranges read at once (a page of 25 pull requests takes several seconds, for 1 point), until it
  covers the window; it waits while fewer than `BACKFILL_MIN_POINTS` GraphQL points are left for the hour (`/rate_limit`, free).
  The published `windowStart` is the start of the data: the window, or what the snapshot covers until then. An older
  pull request updated before its slice comes back is left out until then.
- **Actions runs**: REST `GET /repos/{org}/{repo}/actions/runs?created=from..to`, for the repositories pushed to since
  one day before the last sync (the last year the first time). GitHub forgets runs after about 13 months: the snapshot
  keeps them for the whole window, from `runsSince` (a snapshot without it covers the year before its sync), published
  as `ciStart`. A filtered query answers at most 1000 runs, so a
  range with more is split in halves; a page of 100 runs weighs about 1 MB, so pages are fetched in parallel, at most
  `REST_CONCURRENCY` calls at once across repositories. A repository without Actions answers 404: no runs. A full
  sync keeps the runs already read: a finished run does not change.
- `request()` makes a call at most six times: again on a 5xx, 403 or 429 answer (honouring `retry-after`), on a
  connection that fails, and on a body that comes back empty or cut short, as GitHub sometimes sends. It reads the
  answer whole, so that one bad answer does not end a full sync of twenty minutes. The token has 5000 GraphQL points
  and 5000 REST calls an hour, shared with anyone using it (a local `npm run dev` included).

## Classification

- `classify()`: **release** (`release*` heads, release titles, `develop`/`staging` into `master`/`main`),
  **integration** (`merge*` heads, back-merges, `project/<name>/main` into a non-project base, project branches named
  after a merge or after the long-lived branch they bring in, `PROJECT_MERGE`: `project/<name>/merge-develop`,
  `project/<name>/develop-into-main`, `project/<name>/sync-develop`…), else **code**. Only code pull requests count for
  merges, delays, sizes, lines and reviews. A sync alone may be a feature (the sync of some data), and elsewhere than
  on project branches a merge in the name may be what a feature is about: both stay code.
- **Hotfix**: a head starting with `hotfix`. **Revert**: a title starting with "Revert".
- **Bots**: GitHub Apps (actor type other than `User`), `ghost`, and the logins of `BOT_USERS`. Bot pull requests are
  only kept when they deploy or are Dependabot updates; bot reviews and comments never count.
- **Deployment**: a pull request merged into `master` or `main`, back-merges between them aside. A code pull request
  reaches production at once when merged into `master`/`main`, with the next deployment of its repository when merged
  into `develop`/`staging`, and once its branch is merged in turn when merged into another (project) branch.
- **Repository type**: from the bytes of each language (Vue: front; PHP, Go, Rust: back; Dart: mobile; docs,
  infrastructure, tooling: other), corrected by `REPO_CATEGORIES`. **Technologies**: languages grouped under the
  framework their manifests declare (`composer.json`, `package.json`, `pubspec.yaml`), shares under 2 % dropped.

## What is published

- `toPeriodRecord()`: one compact record per pull request, times in **minutes since the epoch**, interventions of
  other people as `[login, at, state, comments]`, plus optional fields (`deployment`, `revert`, `deployedAt`,
  `checksFailed`, `dependency`, `draft` for an open draft, `codeOwners` for an open pull request GitHub does not let
  merge while code owners are still asked to review it, `deleted` for a merged code pull request: the lines it
  deletes among its `lines`, the others are added; the snapshot already kept both, no `SNAPSHOT_VERSION` bump). The
  snapshot keeps for each pull request GitHub's `reviewDecision`, its pending `codeOwnerRequests` and its pending
  `reviewRequests` (the people still asked to review it, code owners or not, through `requestedPeople()`: logins only,
  teams, apps and unreadable reviewers left out): optional fields, no `SNAPSHOT_VERSION` bump, filled for the
  pull requests the sync reads again (a full sync reads them all). A review request moves a pull request's
  `updatedAt`, so the incremental sync reads it again; until then, one read before these fields were kept has none.
  `toPeriodRecord()` publishes the `reviewRequests` of an open pull request that is not a draft as
  `requestedReviewers`, bots aside. `graphql()` lets through the errors on a
  `requestedReviewer` the token may not read, such as a team: that reviewer comes back null. `site/period.js` documents the shape and is the only consumer.
- `squads`: `parseSquads()` of `SQUADS` (`name:*lead,login,login;name:login,…`, refused when an entry has no name, no
  member, a name already given or two leads, the entry shown only outside CI), published as `[{ name, members, lead? }]`
  when any: a star before a login marks the head of the squad, who stays a member.
- `firstPullRequests`: for each person of the records (`peopleOf()`, bots aside), the first pull request they opened
  in the organization, whatever the window: a search `org:… is:pr author:<login> sort:created-asc` of one result, a
  point each, `CONCURRENCY` at once, only for the people not known yet (`peopleToLookUp()`). The snapshot keeps the
  answers, null for someone who never opened one; the stats publish the known ones, in minutes, for the people of the
  records only.
- `computeCi()`: per repository, workflow and Paris day, `[runs, failed, rerun, durations in seconds]`, for runs on pull
  requests and pushes that reached a verdict (cancelled and skipped ones left out).
- `mergeMonthlyHistory()`: each person's monthly figures (`monthlyActivity()` of `site/period.js`) since the first
  sync, published as `monthly` for the badges. The sync works out the months from `HISTORY_LEAD_DAYS` after the start
  of the data: a month needs the month before it, whose pull requests its reviews and merges are mostly about. So the
  backfill adds the older months to the history as it reaches them. A whole month of the window is worked out until a week after its end
  (`MONTH_FINAL_AFTER_MS`), then it is final: worked out again, it would lose the reviews of pull requests created
  before the window as the window moves on. A final month kept before some figure of `MONTHLY_FIGURES` existed (the
  lines added and deleted came later) gets the missing figures once, from its records still within the window: what
  it kept stays. A new monthly figure goes into `MONTHLY_FIGURES`, and the history fills itself. A fix that changes
  how a month counts (a classification, a figure) bumps `MONTHLY_REVISION`, kept with the history as `monthlyRevision`
  in the snapshot and the stats: the next sync works out again, once, every whole month of the history still in the
  window, final or not; the older months stay as kept. The history lives in
  the snapshot; without one (a lost Actions cache, a
  `SNAPSHOT_VERSION` bump), `readPublishedHistory()` reads it back from the stats last published, the local file or
  the deployed page, with the same password. Changing `DASHBOARD_PASSWORD` while the cache is lost loses it.
- Never publish bodies, branch names or anything not needed by a stat or a view: what is published must stay minimal,
  even encrypted. Titles are the one exception, with the state of the checks (`checks`), and only for the pull
  requests the page opens the timeline of (`hasDetails()`: open, or with an opening, a merge, a closing, a review or a
  comment over the last `DETAILS_DAYS`, which covers the 7-day feed and the merges without approval of the last 30
  days): the title of every pull request of the window would make the stats about half as heavy again.

## Full sync password

- With `FULL_SYNC_PASSWORD` and a sync trigger, `publishedSyncTrigger()` adds `fullSync: { salt, iterations, verifier }`
  to `syncTrigger` (`fullSyncSettings()`, from `site/full-sync.js`, which the page shares): never the key, which signs
  the proofs. Without it, `syncTrigger` stays as before and nothing is asked.
- `chooseFullSync()` decides, before the sync, whether it is a full one: `--full` on the command line always (whoever
  runs it holds the `.env`); `FULL_SYNC=true` from the workflow only with a `FULL_SYNC_PROOF` that
  `checkFullSyncProof()` takes for `GITHUB_REPOSITORY` (or `DISPATCH_REPOSITORY`), signed less than
  `FULL_SYNC_PROOF_MAX_AGE` ago (2 hours: a run waits for the ones before it, 45 minutes each at most), `CLOCK_SKEW`
  (5 minutes) allowed ahead. Otherwise the sync is incremental, logs one line, `full sync refused: …`, never the proof
  nor why it failed, and publishes `fullSyncRefused` for the page. The run never fails over it: the deployment goes on.
- The workflow masks the `proof` input (read from `GITHUB_EVENT_PATH`) before the sync step: the logs show the env of
  each step, and inputs are not secrets.

## Changing the sync

- A change in the snapshot shape bumps `SNAPSHOT_VERSION` (comment why): the next run reads everything again. Measure
  that run and keep it well under the workflow timeout. An optional field an older snapshot can do without, like
  `monthly`, needs no bump.
- The pure parts of the sync are exported for the tests; the sync itself only runs when the file is executed
  (`import.meta.main`). Keep new rules pure and exported, with their tests in `test/sync.test.mjs`.
- A change in a computation is also checked against real data, outside the repository: run the old and new code on
  the same snapshot (both importable) and diff the results. The existing stats must stay identical unless the change
  means them to move. Never copy anything of that data into a test.
- The page and `site/period.js` read what the sync publishes: change them together, in the same pull request.
