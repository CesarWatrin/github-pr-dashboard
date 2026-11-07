# Architecture

## Data flow

1. **Workflow** (`.github/workflows/deploy.yml`): restores the snapshot from the Actions cache, runs
   `node scripts/sync.mjs`, saves the snapshot, stamps the commit into `site/index.html` (`__BUILD__`: the styles, the entry and the import map of every module carry it), deploys `site/`
   to Pages (each attempt its own artifact; refused while the deployment before is still finishing, it waits a
   minute and tries once more). Triggers: a weekday cron every 15 minutes (GitHub drops many scheduled runs: never rely on it), every push
   to `main`, manual runs (`workflow_dispatch`, with a `full` input and, for a full sync once `FULL_SYNC_PASSWORD` is
   set, a `proof` input, masked in the logs before the sync step). One run at a time (`concurrency: pages`, queued,
   never cancelled), 45 minutes at most.
2. **Snapshot** (`.cache/snapshot.json`, never published, kept in the Actions cache): the raw pull requests created
   over the rolling window (`WINDOW_DAYS`, three years), the Actions runs of the window, what it covers of both
   (`pullRequestsSince`, `runsSince`), display names, bot accounts, the languages and frameworks of each repository,
   the first pull request each person opened in the organization (`firstPullRequests`, looked up once per person),
   and the monthly history of each person's figures (`monthly`), which outlasts the window: it goes back to the first
   sync. `SNAPSHOT_VERSION` in the sync: bumping it makes the next run read the last year again, the two before it
   coming back a month per run, and the monthly history read back from the published stats.
3. **Published data** (`site/data/`, written by the sync, never committed):
   - `stats.enc.json`: `{ iterations, salt, iv, data }`. The JSON is gzipped then encrypted with AES-256-GCM; the key
     is derived from `DASHBOARD_PASSWORD` with PBKDF2-SHA256 (600 000 iterations) and a salt made of the first 16
     bytes of `sha256("github-pr-dashboard:" + ORG)`, so it stays the same from one sync to the next.
   - It holds the organization, the generation time, display names, the type and technologies of each repository,
     today's counters, the 7-day activity feed, the squads (`squads`, from `SQUADS`: `[{ name, members, lead? }]`), the sync trigger (with `DISPATCH_TOKEN`; with `FULL_SYNC_PASSWORD`,
     `fullSync`: `{ salt, iterations, verifier }`, what the page checks the full sync password against), and above all
     `pullRequests` (one compact record per pull request, no content; the title and the state of the checks only for
     the pull requests the page opens the timeline of: open, or active over the last 30 days) since `windowStart` (the start of the
     data: the window, or what the snapshot covers while the backfill runs), `ci` (Actions runs per repository,
     workflow and Paris day) since `ciStart` (GitHub forgets runs after about 13 months: they go back to when the
     snapshot started keeping them), `firstPullRequests` (when each person of the records opened their first pull
     request in the organization, for seniority) and `monthly` (each person's monthly figures since the first sync, for
     the badges, with `monthlyRevision`: how they were counted).
   - `version.json`: `{ build, generatedAt }`, written last.
4. **Page**: polls `version.json` every minute (every 10 s while a sync it started is running), downloads the stats
   only when `generatedAt` changes, reloads itself when `build` changes. Once the data is older than 10 minutes, a
   page that shows (or one in the background that notifies the reviews asked on « Mes PR ») starts a quick sync
   itself with `DISPATCH_TOKEN` (`site/domain/auto-sync.js`), unless a run is going or
   started within those 10 minutes: GitHub drops most scheduled runs, so the cron alone leaves the data hours behind.
   It decrypts with Web Crypto and keeps the derived key (not the password) in `localStorage` for 30 days. Every
   period stat is computed in the browser by `site/domain/` from the records: presets (30 days, 90 days, 12, 24 or 36
   months, up to the last sync; a preset the data does not cover yet waits for the backfill) or any whole Paris days
   within the data.

All days, buckets and "today" are Paris days (`Europe/Paris`).

## Configuration

Locally, the variables live in `.env`. In CI they are secrets of the `github-pages` environment, which only `main` can
deploy to: no workflow of another branch can read them.

| Variable | Where | Role |
|---|---|---|
| `ORG` | `.env`, secret `ORG` | Tracked organization (required) |
| `GITHUB_TOKEN` | `.env` (else `gh auth token`), secret `ORG_STATS_TOKEN` | Reads pull requests, checks, Actions runs and repository details |
| `DASHBOARD_PASSWORD` | `.env`, secret | Password of the page, source of the encryption key (required: no password, no publication) |
| `REPO_CATEGORIES` | `.env`, secret | `repo:front\|back\|mobile\|other` overrides when the languages misjudge a repository |
| `REQUIRED_APPROVALS` | `.env`, secret | Approvals a pull request needs before it can be merged, 1 by default: the unblock page tells those ready to merge |
| `BOT_USERS` | `.env`, secret | Organization user accounts acting as bots, logins separated by commas |
| `SQUADS` | `.env`, secret | The squads, `name:*lead,login,login;name:login,…` (a star marks the head of the squad, one at most), a person may be in several: the squads page and the squad filter; none without it |
| `DISPATCH_TOKEN` | `.env`, secret | Fine-grained token, this repository only, Actions read and write: the sync button of the page |
| `DISPATCH_REPOSITORY` | `.env` | `owner/repo` of the dashboard, for `DISPATCH_TOKEN` outside CI |
| `FULL_SYNC_PASSWORD` | `.env`, secret | Password of the full sync started from the page, apart from `DASHBOARD_PASSWORD` (optional: without it, no password asked) |
| `FULL_SYNC` / `--full` | workflow input / CLI | Full sync instead of an incremental one; the input needs a valid `FULL_SYNC_PROOF` once `FULL_SYNC_PASSWORD` is set, `--full` never does |
| `FULL_SYNC_PROOF` | workflow input `proof` | Proof of the full sync password, signed by the page: `at.hex(HMAC-SHA256(key, "full-sync:" + repository + ":" + at))`, good for 2 hours |
| `BUILD_ID` | workflow | Commit of the deployed page, published in `version.json` |
| `SNAPSHOT_PATH`, `STATS_PATH` | anywhere | Where the snapshot and the stats go, to run a sync outside the repository |
| `PUBLISHED_STATS_URL` | anywhere | Where the sync reads back the monthly history when the snapshot has none; by default the GitHub Pages address of `GITHUB_REPOSITORY` in CI |

Changing `DASHBOARD_PASSWORD` locks every open page until the new password is typed. The sync button only shows when
`DISPATCH_TOKEN` is set: that token travels inside the encrypted stats, so anyone with the password can start a
workflow run, and nothing else.

`FULL_SYNC_PASSWORD` gives the full sync a password of its own (`site/domain/full-sync.js`, shared by the page and the sync).
Its key is derived with PBKDF2-SHA256 (600 000 iterations) and a salt made of the first 16 bytes of
`sha256("github-pr-dashboard:full-sync:" + ORG)`; the stats only carry `sha256("verify:" + key)`. The page checks the
password against it, then signs the request with the key, kept nowhere. Since the dispatch token alone can start a run,
the run checks the proof itself: without a valid one for `GITHUB_REPOSITORY`, a full sync asked through the workflow
input is refused, the run syncs incrementally, logs one line without any detail and publishes `fullSyncRefused` (the
page that asked says so), and the deployment goes on.

## Sync durations

- Incremental (the cron, the "quick" button): about 15 seconds, plus about a minute while the backfill runs (one slice
  of 30 days per sync, until the snapshot covers the window: 25 syncs for the two years before the last one).
- Full (the "full" button, `npm run sync:full`): about 15 to 20 minutes, mostly reading the pull requests of the last
  year again; the older ones and the Actions runs already read are kept. The page asks for confirmation and presents it
  as exceptional.
- Everything, Actions runs included: without a snapshot, or with one older than `SNAPSHOT_VERSION` (the first run
  after a bump, a new `SNAPSHOT_PATH`, a stale `.cache/snapshot.json`). It reads the last year, pull requests and runs:
  reading every Actions run of it again is what makes it so long, about 25 minutes in CI, up to about an hour locally.
  Keep it under the 45-minute timeout: never make a sync read the whole window at once.
