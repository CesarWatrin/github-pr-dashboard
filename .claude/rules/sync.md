---
paths:
  - "scripts/**"
  - ".github/**"
---

# Sync (`scripts/sync.mjs`)

## Fetching

- **Full sync**: lists the repositories pushed to over the window, then reads their pull requests through GraphQL,
  newest first, four repositories at a time. Reviews and comments are paginated beyond the first 50.
- **Incremental sync**: GraphQL search `org:… is:pr updated:>=…` from 10 minutes before the last sync. The search
  answers at most 1000 results: beyond that, the sync falls back to a full one.
- **Actions runs**: REST `GET /repos/{org}/{repo}/actions/runs?created=from..to`, for the repositories pushed to since
  one day before the last sync (the whole window the first time). A filtered query answers at most 1000 runs, so a
  range with more is split in halves; a page of 100 runs weighs about 1 MB, so pages are fetched in parallel, at most
  `REST_CONCURRENCY` calls at once across repositories. A repository without Actions answers 404: no runs. A full
  sync keeps the runs already read: a finished run does not change.
- `request()` retries 5xx, 403 and 429 answers, honouring `retry-after`. The token has 5000 GraphQL points and 5000
  REST calls an hour, shared with anyone using it (a local `npm run dev` included).

## Classification

- `classify()`: **release** (`release*` heads, release titles, `develop`/`staging` into `master`/`main`),
  **integration** (`merge*` heads, back-merges, `project/<name>/main` into a non-project base), else **code**. Only
  code pull requests count for merges, delays, sizes and reviews.
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
  merge while code owners are still asked to review it). The snapshot keeps for each pull request GitHub's
  `reviewDecision` and its pending `codeOwnerRequests`: optional fields, no `SNAPSHOT_VERSION` bump, filled for the
  pull requests the sync reads again (a full sync reads them all). `graphql()` lets through the errors on a
  `requestedReviewer` the token may not read, such as a team: that reviewer comes back null. `site/period.js` documents the shape and is the only consumer.
- `computeCi()`: per repository, workflow and Paris day, `[runs, failed, rerun, durations in seconds]`, for runs on pull
  requests and pushes that reached a verdict (cancelled and skipped ones left out).
- `mergeMonthlyHistory()`: each person's monthly figures (`monthlyActivity()` of `site/period.js`) since the first
  sync, published as `monthly` for the badges. A whole month of the window is worked out until a week after its end
  (`MONTH_FINAL_AFTER_MS`), then it is final: worked out again, it would lose the reviews of pull requests created
  before the window as the window moves on. The history lives in the snapshot; without one (a lost Actions cache, a
  `SNAPSHOT_VERSION` bump), `readPublishedHistory()` reads it back from the stats last published, the local file or
  the deployed page, with the same password. Changing `DASHBOARD_PASSWORD` while the cache is lost loses it.
- Never publish titles, bodies, branch names or anything not needed by a stat: what is published must stay minimal,
  even encrypted.

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
