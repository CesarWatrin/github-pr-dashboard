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
  page of the hash (`ROUTES`: overview, authors, reviewers, collaboration, team, repositories, tma, devops, method). The period
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
  - A click on a card opens `openPersonDialog()`: the figures of `PERSON_WRITTEN`, `PERSON_REVIEWED` and
    `PERSON_CIRCULATION`, read from `personDetails()`, which reuses `authorRows('team')`, `reviewerRows('team')` and
    `reviewNetwork()`. The card leans towards a mouse (`tiltPersonCard()`, measured on its scene, which does not turn)
    and catches the light (`--glare`, `--sheen-*`); never for touch, nor under `prefers-reduced-motion`. No chart or
    tooltip in the dialog: the tooltip would sit under it.
  - Seniority (`seniority()`, card and dialog) comes from `activityBounds()` of `site/period.js` over every record,
    whatever the period: more than a year when the first activity falls in the first `SENIORITY_START_DAYS` of the
    synced year, which only covers a year, else the months since then.
- **Badges** (team cards and dialog): `BADGES` names each one after a monthly figure of `monthlyActivity()` in
  `site/period.js`. `badgesOf()` gives them to the top of the whole team for each month of the history the sync
  publishes (`stats.monthly`, since the first sync; without it, the whole months of the window), ties sharing, the
  people who left included in the race; the tier comes from the longest run of calendar months in a row. `badgeMedal()` draws a medal with its own tooltip (`.badge-tip`): the tooltip of the charts would
  sit under the dialog. In the dialog it opens below the medals, clear of the close button.
- **Repository cards** (repositories page): `repositoryRows()` gathers each repository's figures from the period
  stats, its CI from `computeCi()` per repository, and the people still in the team who wrote it; `repositoryCard()`
  draws one card, `REPOSITORY_STATS` lists its figures, their hints making the legend
  (`data-table-legend="repositories"`). Cards come most code pull requests first, filtered by the page's repository
  filter (`REPO_FILTERS.repositories`) and the search. The bus factor comes from `busFactor()` of `site/period.js`;
  the repositories that rest on a single person, or on people who left, with at least `FRAGILE_MIN_PRS` code pull
  requests, are listed above the cards. Not clickable, the cards do not move on hover.
- **Names of people**: always `personLink(login)` (with or without the avatar), never a GitHub link. Wherever it
  shows, a table, a feed, the pairs, the former people or the dialog itself, it opens the person's dialog
  (`openPersonOf()`); the dialog links to the GitHub profile. A person without any figure over the period opens their
  GitHub profile instead.
- **Former people**, on every page: a person without any pull request, review, comment or merge for
  `FORMER_AFTER_DAYS` (`isFormer()`, from the last activity of `activityBounds()`) has left the team. Any new list of
  people leaves them out: `authorRows()`, `reviewerRows()`, `teamRows()`, the TMA people, the person picker, the
  waiting pull requests, and the review networks through `withoutFormer()`. They only show in the former people of the
  team page. Totals, charts and repository figures still count their pull requests.
  - In the dialog, the head comes forward as the card leans: anything clickable at its level, such as the close
    button, must come further forward still, or the head takes its clicks.
  - Each figure of the dialog shows the median of the person's peers (`statList()` given their details): the people
    of the same stack, or the whole team under `MIN_PEERS`; writing figures among those who wrote code, review figures
    among those who reviewed. A comparison with people doing the same work, never a score or a ranking.
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
