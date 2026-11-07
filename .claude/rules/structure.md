# Code structure

Small modules, one responsibility each, in layers whose dependencies only point down. `tests/architecture.test.mjs`
enforces what can be checked; the rest is for review.

## The page (`site/`)

| Layer | Holds | May import |
|---|---|---|
| `domain/` | The rules shared with the sync: stats of a range, CI, open pull requests, timeline, months, comparisons, analysis, full sync password, auto sync. Pure, no DOM: Node runs it | `domain/` |
| `lib/` | Formats (French numbers, working time, dates), small arithmetic. No DOM | `domain/` |
| `model/` | The state of the page (`state`) and what it reads of the stats for the filters picked: period, comparison, squad, people, repositories, badges, months. No DOM: unit tested in Node | `domain/`, `lib/` |
| `services/` | The outside world: published stats and their key, the build, the GitHub API, notifications | the layers above |
| `ui/` | Shared building blocks of the view: `dom.js` (`$`, `el`, `svg`), tiles, charts, tables, links, lists, dialogs | the layers above |
| `pages/` | One module per page (a folder when it needs several: `analysis/`, `squads/`), with its tiles, columns and charts | the layers above, never another page |
| `shell/` | The frame around the pages: router and drawer, filters, global `render()`, session (unlock, lock, polling), sync menu, theme, the registry of the tables | the layers above |
| `app.js` | The composition root: registers the tables, calls every `setup…()`, draws the frame, unlocks | everything |

- Only `app.js` runs anything when loaded. A module declares; its listeners go in an exported `setup…()` that
  `app.js` calls. No import cycle.
- Inversions where a lower layer needs what a higher one owns: the tables (`TABLES`, `REPO_FILTERS`) are registries of
  `ui/` filled by `registerTables()` of `shell/tables.js`; a link (`ui/links.js`) asks for its dialog with a DOM event
  (`OPEN_PERSON`, `OPEN_REPOSITORY`, `OPEN_PULL_REQUEST`) that the dialog listens to; `setupFilters({ render })` gets
  `render()` from `app.js`.
- What two pages share goes down to `ui/` (view) or `model/` (data), never from one page to the other.
- Every file starts with a comment that says what it is for. Aim for files under about 300 lines, cut by feature: a
  module that outgrows it becomes a folder of the same name, the module keeping its entry point (`domain/period.js` and
  its tallies in `domain/period/`, `domain/analysis.js` and its rules in `domain/analysis/`, `pages/squads/`).
- Imports are plain relative paths (`'../model/state.js'`). `index.html` gives every module the version of the deploy
  through an import map, and preloads them all at once so that the page loads fast: `npm run modules` writes that
  block after adding, moving or removing a module, and the tests fail until it is done.
- Styles live in `site/styles/` (`base.css`, `shell/`, `ui/`, `pages/`, `motion.css`, `touch.css`), linked one by one
  by `index.html` in the order of the cascade: a later file wins at the same specificity, `touch.css` stays last. A new
  file goes into that list at its place.
- Types are JSDoc, checked by `npm run typecheck` (TypeScript, no emit): the browser and Node run the very files of
  the repository, without build. The rules (`site/domain/`, `site/lib/`, `site/model/`, `scripts/`) are strict
  (`tsconfig.strict.json`: every parameter typed, nulls handled); the view is checked without strict mode for now.
  **Never `any`**, explicit or in a `.d.ts` (`tests/architecture.test.mjs` refuses it): `unknown`, narrowed where read,
  for a value really unknown; a generic (`@template`) for what a function passes through.
- The shapes everyone shares are global types of `types/`: `stats.d.ts` (the published stats, the records),
  `page.d.ts` (the state of the page), `sync.d.ts` (the snapshot and the answers of GitHub), `globals.d.ts` (what the
  DOM types lack). A shape one module uses stays a `@typedef` of that module.
- Every text the page shows is French, through `t()` of `lib/i18n.js`, its English in `lib/english/` (`site.md`,
  Languages). A module the page loads on demand (`import('./…')`, the English) is in the import map, not preloaded.
- `$(selector, Kind)` finds an element of a kind (`HTMLDialogElement`, `HTMLInputElement`…), typed so and checked when
  found; `$(selector)` alone gives an `HTMLElement`. `$$()` likewise, for all of them.

## The sync (`scripts/`)

`scripts/sync.mjs` runs a sync; its parts live in `scripts/sync/`, one per responsibility: `config.mjs` (the
environment, read when loaded: the only module that does), `github.mjs` (calls, retries, concurrency), `queries.mjs`
(GraphQL), `pull-requests.mjs`, `runs.mjs`, `people.mjs`, `repositories.mjs`, `records.mjs` (classification, published
records), `backfill.mjs`, `history.mjs` (monthly history), `publish.mjs` (snapshot, encryption, feed), `full-sync.mjs`,
`run.mjs` (one sync, end to end). The sync imports the rules it shares with the page from `site/domain/`.
`scripts/serve.mjs` serves `site/` locally; `scripts/module-map.mjs` writes the module block of `index.html`.

## Tests (`tests/`)

`npm test` runs every `*.test.mjs` of `tests/` (`npm run test:unit` the rules and the architecture, `npm run test:browser`
the page in Chrome, each a step of the "Checks" workflow); the other files there are helpers. A test that waits on the
page polls for what it needs (`page.waitFor()`), never for a fixed time, and the browser always closes: the tests
never hang. One test file per module of
rules, next to the layer it covers:

- `tests/domain/`, `tests/lib/`, `tests/model/`: the rules of the page, on made-up records (`tests/domain/records.mjs`,
  `tests/model/stats.mjs`).
- `tests/sync/`: the rules of the sync, each file importing `./environment.mjs` first (a made-up configuration).
- `tests/browser/pages.test.mjs`: the page in Chrome on made-up stats (`tests/fixtures/stats.mjs`): every page shows
  without error and fills every container its script draws into, the dialogs open, the filters apply. Skipped without
  Chrome (`CHROME_PATH`), never in CI. A container that stays empty on purpose goes into `EMPTY_ON_PURPOSE`, with why.
- `tests/architecture.test.mjs`: layers, cycles, the module block and the styles of `index.html`, file headers.

A new rule comes with its unit test; a new feature of a page with what fills it in the made-up stats, so that the
browser test sees it. No test of what another test already covers.
