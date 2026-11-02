---
paths:
  - "site/**"
---

# Page (`site/`)

## Structure

- Vanilla ES module, no framework, no bundler, no external script: logos come from the local sprite through
  `<use href>`.
- `index.html` loads `app.js?v=__BUILD__` (stamped at deploy); `app.js` imports `period.js` with the same query string
  (`import.meta.url`). Any new module follows that pattern, so that the Pages cache (10 minutes) never mixes versions.
- Helpers: `$()`, `el()`, `svg()`. One `state` object; `render(animate)` redraws everything, `renderRoute()` shows the
  page of the hash (`ROUTES`: overview, authors, reviewers, collaboration, team, tma, devops, method). The period
  selector and the search apply to every page but the method one.
- `currentPeriod()` and `currentCi()` compute the stats of `periodRange()` once per data and range. Presets live in
  `PERIODS`; picked dates (`CUSTOM_PERIOD`) are clamped to the synced year.
- `site/period.js` is pure and covered by `test/period.test.mjs`: a change in a computation updates or adds a test,
  on made-up records.

## Building blocks

- **Tiles**: a `*_TILES` array (`key`, `label`, optional `format` and `route`) drawn by `renderTiles()`.
- **Tables**: an entry in `TABLES` (`columns`, `rows`, `rowKey`, `searchTexts`, optional `repoCounts` for the
  repository filter), a `[data-<name>]` container, a `<dl data-table-legend="<name>">` under it, and entries in
  `state.sort` and `state.previousRows`.
  - Each table needs exactly one `kind: 'bar'` column.
  - A text column needs a `format`: the default one formats numbers.
  - Every column whose meaning is not obvious has a `hint`: the legend under the table is built from these.
- **Charts**: `columnChart()` over time buckets (series side by side, partial buckets lighter, tooltip on hover),
  `barChart()` for rankings, `heatmapChart()` for a grid of intensities (rows × columns, `color-mix` on `--series-1`),
  `renderLegend(container, series)`. Every chart has an `ariaLabel` and a tooltip.
- **Lists**: `listItem()` and `renderList()`, as in the activity feed; a `.feed` fills its card.
- **Person cards** (team page): `teamRows()` gathers each person's figures, `personCard()` draws one card, and
  `TEAM_STATS` lists its figures, their hints making the legend (`data-table-legend="team"`). Cards come most code
  pull requests first. The page's repository filter (`REPO_FILTERS.team`, no table behind it) narrows the figures, not
  the stack: that one is the person's own, over every repository. `stackType()` and `topTechnologies()` are shared
  with the stack column of the tables.
- The "Méthode" page keeps the rules shared by the whole dashboard; what a single column counts goes in its `hint`.

## Look and feel

- Colors are tokens on `:root`, redefined for dark mode (system preference and `data-theme`). Data series use
  `--series-1` (blue), `--series-2` (orange), `--series-3` (green), a palette checked for color blindness; text never
  takes a series color. Repository types are labelled front, back, mobile or full-stack.
- Layout: a sidebar from 1280 px, a top bar below. Tables fit at 1080 px without horizontal scrolling. Check 1920,
  1280, 1080 and 390 px (phone), light and dark.
- Motion: pages enter with `.is-entering` and a staggered `--delay`; everything stops under
  `prefers-reduced-motion`.
- Text is French, with French typography: typographic apostrophes (’), « » quotes, a non-breaking space before
  `:` `;` `?` `!` and `%`. People are referred to without gendered pronouns ("la personne").

## Security

- The key derived from the password stays in `localStorage` for 30 days; locking asks for confirmation and forgets
  it. Never log it or print it.
- The sync button uses `DISPATCH_TOKEN` from the decrypted stats; a full sync asks for confirmation first.
