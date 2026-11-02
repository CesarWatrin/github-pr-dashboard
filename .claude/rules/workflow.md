# Workflow

## Branches, commits, pull requests

- Never push to `main`: one branch per topic, from an up-to-date `main` (`feature/…`, `fix/…`, `chore/…`, `docs/…`),
  one pull request per topic. The owner merges them, squashed. The "Protect main" ruleset enforces it: only the owner
  may push to `main`, and every other pull request needs the approval of the owner, the only code owner
  (`.github/CODEOWNERS`).
- Before adding a commit to a pull request, check that it is still open: a commit pushed to a merged branch goes
  nowhere, it then needs a new branch from `main` and a new pull request.
- Commits follow Conventional Commits, in English: `type(scope): description` (`feat`, `fix`, `refactor`, `style`,
  `chore`, `perf`, `docs`, `test`; scopes such as `site`, `sync`, `ci`).
- Pull request descriptions are in French: what changes and why, then a test plan. No real data in them (see
  `sensitive-data.md`).
- To work on several topics at once, use a `git worktree` in a temporary folder rather than switching the main
  checkout: a local preview may be serving it.
- Run git commands one at a time: a single command chaining `add`, `commit` and `push` may be refused by the
  permission checks.

## Before shipping

- `npm run check` and `npm test`. The "Checks" workflow runs them on every pull request, and the "Protect main"
  ruleset requires it to pass.
- A change in a computation or a sync rule comes with tests in `test/`, on made-up data only: invented repositories,
  people and figures, never anything taken from the snapshot.
- A change in a computation: before and after comparison on the same snapshot (see `sync.md`).
- A visible change: a preview with real data, outside the repository.
  - Data, without a full sync (see below): copy `.cache/snapshot.json` to a temporary folder and, only if its
    `version` matches `SNAPSHOT_VERSION`, run the sync with `SNAPSHOT_PATH` and `STATS_PATH` pointing there, a
    throwaway `DASHBOARD_PASSWORD` and a fake `DISPATCH_TOKEN` (the preview's sync button must not start real runs).
  - Otherwise, reuse the published `data/stats.enc.json`: a script decrypts it with the `DASHBOARD_PASSWORD` it reads
    from `.env` (never written in a command nor printed), swaps `syncTrigger` for a fake one and encrypts it again with
    a throwaway password.
  - Link the `site/` files into that folder and serve it with `PORT=<port> node scripts/serve.mjs`.
  - Check 1920, 1280, 1080 and 390 px, light and dark mode, and an empty console.
- The README and the "Méthode" page follow any change of behavior or definition.

## Shared resources

- **Long syncs are a last resort locally** (durations in `architecture.md`). A full sync (`npm run sync:full`,
  `--full`, `FULL_SYNC`) takes 15 to 20 minutes; a sync without an up-to-date snapshot reads every Actions run again
  and takes far longer, up to about an hour. Both eat most of the GitHub token's hourly quota, shared with the CI and
  the team. Never start one locally unless nothing else will do, and ask the owner first: an incremental sync on an
  up-to-date snapshot, or the published data, answer almost every need.
- Any sync, incremental or not, reads everything when the snapshot is missing or older than `SNAPSHOT_VERSION`: a new
  `SNAPSHOT_PATH`, a stale `.cache/snapshot.json`, `npm run dev` on an old checkout. Check the snapshot's `version`
  before any local sync.
- Do not stop processes you did not start, such as a teammate's `npm run dev`.
