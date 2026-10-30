# Workflow

## Branches, commits, pull requests

- Never push to `main`: one branch per topic, from an up-to-date `main` (`feature/…`, `fix/…`, `chore/…`, `docs/…`),
  one pull request per topic. The owner merges them, squashed.
- Commits follow Conventional Commits, in English: `type(scope): description` (`feat`, `fix`, `refactor`, `style`,
  `chore`, `perf`, `docs`, `test`; scopes such as `site`, `sync`, `ci`).
- Pull request descriptions are in French: what changes and why, then a test plan. No real data in them (see
  `sensitive-data.md`).
- To work on several topics at once, use a `git worktree` in a temporary folder rather than switching the main
  checkout: a local preview may be serving it.
- Run git commands one at a time: a single command chaining `add`, `commit` and `push` may be refused by the
  permission checks.

## Before shipping

- `node --check` on every changed script.
- A change in a computation: before and after comparison on the same snapshot (see `sync.md`).
- A visible change: a preview with real data, outside the repository.
  - Run the sync with `SNAPSHOT_PATH` and `STATS_PATH` pointing to a temporary folder and a throwaway
    `DASHBOARD_PASSWORD`.
  - Link the `site/` files into that folder and serve it with `PORT=<port> node scripts/serve.mjs`.
  - Check 1920, 1280, 1080 and 390 px, light and dark mode, and an empty console.
- The README and the "Méthode" page follow any change of behavior or definition.

## Shared resources

- The GitHub token's hourly quota is shared: avoid repeated full syncs locally.
- Do not stop processes you did not start, such as a teammate's `npm run dev`.
