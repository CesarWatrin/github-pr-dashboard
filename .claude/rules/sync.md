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
  `checksFailed`, `dependency`). `site/period.js` documents the shape and is the only consumer.
- `computeCi()`: per repository, workflow and Paris day, `[runs, failed, rerun, durations in seconds]`, for runs on pull
  requests and pushes that reached a verdict (cancelled and skipped ones left out).
- Never publish titles, bodies, branch names or anything not needed by a stat: what is published must stay minimal,
  even encrypted.

## Changing the sync

- A change in the snapshot shape bumps `SNAPSHOT_VERSION` (comment why): the next run reads everything again. Measure
  that run and keep it well under the workflow timeout.
- A change in a computation is checked by comparing the outputs before and after on the same snapshot: copy the old
  and new scripts to a temporary folder, cut the run lines at the end of `sync.mjs`, export the functions, and diff
  the results. The existing stats must stay identical unless the change means them to move.
- The page and `site/period.js` read what the sync publishes: change them together, in the same pull request.
