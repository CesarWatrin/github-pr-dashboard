# Architecture

## Data flow

1. **Workflow** (`.github/workflows/deploy.yml`): restores the snapshot from the Actions cache, runs
   `node scripts/sync.mjs`, saves the snapshot, stamps the commit into `site/index.html` (`__BUILD__`), deploys `site/`
   to Pages. Triggers: a weekday cron every 15 minutes (GitHub drops many scheduled runs: never rely on it), every push
   to `main`, manual runs (`workflow_dispatch`, with a `full` input). One run at a time (`concurrency: pages`, queued,
   never cancelled), 45 minutes at most.
2. **Snapshot** (`.cache/snapshot.json`, never published, kept in the Actions cache): the raw pull requests created
   over the rolling window (365 days), the Actions runs of the window, display names, bot accounts, the languages and
   frameworks of each repository. `SNAPSHOT_VERSION` in the sync: bumping it makes the next run read everything again.
3. **Published data** (`site/data/`, written by the sync, never committed):
   - `stats.enc.json`: `{ iterations, salt, iv, data }`. The JSON is gzipped then encrypted with AES-256-GCM; the key
     is derived from `DASHBOARD_PASSWORD` with PBKDF2-SHA256 (600 000 iterations) and a salt made of the first 16
     bytes of `sha256("github-pr-dashboard:" + ORG)`, so it stays the same from one sync to the next.
   - It holds the organization, the generation time, display names, the type and technologies of each repository,
     today's counters, the 7-day activity feed, the pull requests waiting for a review, the sync trigger (with
     `DISPATCH_TOKEN`), and above all `pullRequests` (one compact record per pull request, no title or content) and
     `ci` (Actions runs per repository, workflow and Paris day).
   - `version.json`: `{ build, generatedAt }`, written last.
4. **Page**: polls `version.json` every minute (every 10 s while a sync it started is running), downloads the stats
   only when `generatedAt` changes, reloads itself when `build` changes. It decrypts with Web Crypto and keeps the
   derived key (not the password) in `localStorage` for 24 hours. Every period stat is computed in the browser by
   `site/period.js` from the records: presets (30 days, 90 days, 12 months, up to the last sync) or any whole Paris days
   within the window.

All days, buckets and "today" are Paris days (`Europe/Paris`).

## Configuration

| Variable | Where | Role |
|---|---|---|
| `ORG` | `.env`, secret `ORG` | Tracked organization (required) |
| `GITHUB_TOKEN` | `.env` (else `gh auth token`), secret `ORG_STATS_TOKEN` | Reads pull requests, checks, Actions runs and repository details |
| `DASHBOARD_PASSWORD` | `.env`, secret | Password of the page, source of the encryption key (required: no password, no publication) |
| `REPO_CATEGORIES` | `.env`, secret | `repo:front\|back\|mobile\|other` overrides when the languages misjudge a repository |
| `BOT_USERS` | `.env`, secret | Organization user accounts acting as bots, logins separated by commas |
| `DISPATCH_TOKEN` | `.env`, secret | Fine-grained token, this repository only, Actions read and write: the sync button of the page |
| `DISPATCH_REPOSITORY` | `.env` | `owner/repo` of the dashboard, for `DISPATCH_TOKEN` outside CI |
| `FULL_SYNC` / `--full` | workflow input / CLI | Full sync instead of an incremental one |
| `BUILD_ID` | workflow | Commit of the deployed page, published in `version.json` |
| `SNAPSHOT_PATH`, `STATS_PATH` | anywhere | Where the snapshot and the stats go, to run a sync outside the repository |

Changing `DASHBOARD_PASSWORD` locks every open page until the new password is typed. The sync button only shows when
`DISPATCH_TOKEN` is set: that token travels inside the encrypted stats, so anyone with the password can start a
workflow run, and nothing else.

## Sync durations

- Incremental (the cron, the "quick" button): about 15 seconds.
- Full (the "full" button, `npm run sync:full`): about 15 to 20 minutes, mostly reading the pull requests again; the
  Actions runs already read are kept. The page asks for confirmation and presents it as exceptional.
- First run after a `SNAPSHOT_VERSION` bump: everything, about 25 minutes. Keep it under the 45-minute timeout.
