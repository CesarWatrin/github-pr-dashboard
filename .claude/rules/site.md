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
  page of the hash (`ROUTES`: overview, unblock, report, analysis, authors, reviewers, cycle, collaboration, team,
  awards, repositories, tma, devops, method). The period selector and the search apply to every page but the method,
  report and awards ones (`filters: false`): the report has a month picker of its own; the unblock page, about what
  stands now, keeps the search only (`period: false`), the analysis page the period only (`search: false`).
- `currentPeriod()` and `currentCi()` compute the stats of `periodRange()` once per data and range. Presets live in
  `PERIODS` (30 and 90 days, 12, 24 and 36 months); a preset the data does not cover yet (`periodAvailable()`, from
  `windowStart`) is disabled while the sync reads the older months back. Picked dates (`CUSTOM_PERIOD`) are clamped to
  the synced data.
- **CI**: the runs only go back to `ciStart` of the stats. `ciRange()` cuts the range of the CI there (`currentCi()`,
  `ciPerRepository()`), so that no chart starts with empty buckets, and `ciCut()` tells the DevOps page that the CI of
  the period starts later; a month of the report that starts before has no CI.
- `site/period.js` is pure and covered by `test/period.test.mjs`, `site/analysis.js` too, by `test/analysis.test.mjs`:
  a change in a computation updates or adds a test, on made-up records.

## Building blocks

- **Tiles**: a `*_TILES` array (`key`, `label`, optional `format` and `route`) drawn by `renderTiles()`.
- **Tables**: an entry in `TABLES` (`columns`, `rows`, `rowKey`, `searchTexts`, optional `repoCounts` for the
  repository filter), a `[data-<name>]` container, a `<dl data-table-legend="<name>">` under it, and entries in
  `state.sort` and `state.previousRows`.
  - Each table needs exactly one `kind: 'bar'` column.
  - A text column needs a `format`: the default one formats numbers.
  - Every column whose meaning is not obvious has a `hint`: the legend under the table is built from these.
- **Charts**: `columnChart()` over time buckets (series side by side, partial buckets lighter, tooltip on hover, an
  optional `format` for durations), `barChart()` for rankings, `heatmapChart()` for a grid of intensities (rows ×
  columns, `color-mix` on `--series-1`), `shareChart()` for bars cut into shares that fill the width,
  `renderLegend(container, series)`. Every chart has an `ariaLabel` and a tooltip.
- **Lists**: `listItem()` and `renderList()`, as in the activity feed; a `.feed` fills its card.
- **Calendar of deployments** (DevOps page): `renderDeploymentCalendar()` draws the `deploymentCalendar` of
  `computePeriod()` (per repository, `[deployments, corrective]` per bucket) in a `heatmapChart()`: the
  `CALENDAR_REPOS` repositories that deploy the most, then the others on a grouped row.
- **Cycle page**: `CYCLE_STAGES` (pickup, review, merge, deploy) cut the time of each code pull request, from the
  `cycles` of `computePeriod()`, one entry per code pull request opened in the range. `cycleSummary()` gives the
  median of each stage over the pull requests that went through it, and the average share of each stage in the time
  of the reviewed ones that reached production, each weighing the same: stage medians never add up, so no chart
  stacks them. The repository filter of its table (`REPO_FILTERS.cycle`) applies to the whole page.
- **Working time**: every delay counts working hours only, through `workHoursBetween()` of `site/period.js` (Monday to
  Friday, 9 to 18, Paris time; `WORK_DAY_HOURS` a day), and `formatDuration()` shows them in hours, then in working
  days. Only the durations of CI runs stay in real time; dates and ages (« il y a 3 jours ») stay on the calendar.
- **Unblock page**: `openPullRequests()` of `site/period.js` tells where each open code pull request stands, after the
  latest decision of each reviewer, as GitHub does, the code owners it still waits for (`codeOwners` of the records),
  and the approvals merging needs (`requiredApprovals` of the stats, from `REQUIRED_APPROVALS`, 1 without it).
  `blockedPullRequests()` lists, for each of `UNBLOCK_STANCES`, those of the people still in the team that have stood
  there for longer than its delay (`afterDays`, in working days), and apart those without any review or comment for
  `FORGOTTEN_AFTER_DAYS`. Drafts stay out, through the `draft` flag of the records. Every list shows, empty or not, two
  by two, the forgotten pull requests beside those merged without approval.
- **Lines added and deleted**: `computePeriod()` adds up, per person and repository, the lines of the code pull
  requests opened in the range and merged (`added`, `deleted`, from `lines` and `deleted` of the records), rounded by
  `formatLines()` everywhere but in the monthly report. Tables show both in one narrow column (`LINES_COLUMN`, added
  over deleted, in the colors of a diff on GitHub: `--diff-added`, `--diff-deleted`), sorted on the lines added. The technologies chart weighs, at the viewer's choice
  (`TECHNOLOGY_MEASURES`), the code pull requests or these lines added.
- **Analysis page**: `analyze()` of `site/analysis.js` runs `RULES`, fixed rules each crossing the figures of the period
  (pull requests, cycles of `computePeriod()`, CI of `computeCi()`) against thresholds exported with them, and says
  for each one: found (with its level, `high`, `watch` or `good`, and its facts), clear, or few (too little to go on:
  `MIN_PRS`, `MIN_REPOSITORY_PRS`, `MIN_RUNS`, `MIN_HALF_PRS`). `currentAnalysis()` works it out once per stats and
  range, only when the page shows (`renderAnalysis()`, also called by `renderRoute()`). `FINDINGS` in `app.js` turns
  each finding into its card: area, title, text, evidence (`findingBars()`, `findingRows()`, `findingStages()`,
  `findingChanges()`), a lead to act on and the page that details it; `RULE_LABELS` names the rules that found
  nothing. A new rule goes into `RULES` with its test, into `FINDINGS` and `RULE_LABELS`, and its threshold into the
  method page. Rules stay at the level of the team and the repositories: a person only shows as the one the reviews of
  a repository wait for, never as a score. The time from the merge to production follows when each repository
  deploys, not the review: no rule judges it.
- **Monthly report**: `REPORT_GROUPS` lists its figures, read from `monthStats()` of a month (`computePeriod()` and
  `computeCi()` over its Paris days, worked out once per stats and month), each with a `kind` (how two months compare)
  and, when one way is better, `better`, which colors the change. Each month is set against the previous one and the
  median of the last `REPORT_YEAR_MONTHS` whole months, whichever month is shown; the months come from
  `reportMonths()`, every whole month of the synced data; the current month, unfinished, shows no change.
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
  - Seniority (`seniority()`, card and dialog) counts from `firstShown()`, whatever the period: the person's first pull
    request in the organization (`firstPullRequests` of the stats, looked up by the sync beyond the window), or their
    first activity of `activityBounds()` over every record when earlier, in years and months (`monthsLabel()`). A first
    activity without a pull request before it, in the first `SENIORITY_START_DAYS` of the data, is not known: more than
    the whole years of the synced data. The arrivals of the monthly report come from `firstShown()` too, known ones
    only.
- **Badges** (team cards and dialog, awards page): `BADGES` names each one after a monthly figure of
  `monthlyActivity()` in `site/period.js`, with its units and, for the lines, a `format`. `badgeStandings()` works
  out, once per stats, the leaders of each month with `monthlyLeaders()` of `site/period.js` over the history the sync
  publishes (`stats.monthly`, since the first sync; without it, the whole months of the window), ties sharing, the
  people who left included in the race; `badgesOf()` gives each person's badges, the tier coming from the longest run
  of calendar months in a row. `badgeMedal()` draws a medal with its own tooltip (`.badge-tip`): the tooltip of the
  charts would sit under the dialog. In the dialog it opens below the medals, clear of the close button. A card and
  the dialog show the `SHOWN_BADGES` best medals, the others under a « +N » (`moreBadges()`) whose tooltip names
  them.
  - The awards page (`renderAwards()`) shows the leaders of the last whole month and of the current one so far, the
    holders of each badge still in the team, and the leaders of every month of the history. Each badge's holders
    scroll past five or so, so that the page does not grow as months go by: there, the medals take the tooltip of the
    charts, which their list would not cut. The table of every month gives each badge a column of the same width. A leader who left shows as
    « une personne partie », but in the leaders of every month, a record of the history, where they show by name.
- **Repository cards** (repositories page): `repositoryRows()` gathers each repository's figures from the period
  stats, its CI from `computeCi()` per repository, the people who write it (those who left included, for the list of
  the repositories that rest on a single person) and those still in the team who review it;
  `repositoryCard()` draws one card with the figures of `REPOSITORY_STATS`, all of `REPOSITORY_FIGURES` making the
  legend (`data-table-legend="repositories"`). Cards come most code pull requests first, filtered by the page's
  repository filter (`REPO_FILTERS.repositories`) and the search. The bus factor comes from `busFactor()` of
  `site/period.js`, over the people still in the team only; the repositories that rest on a single person, or on
  people who left, with at least `FRAGILE_MIN_PRS` code pull requests, are listed above the cards.
  - A click on a card opens `openRepoDialog()`, in the dialog of people (`showCardDialog()`, shared): the figures of
    `REPOSITORY_WRITTEN`, `REPOSITORY_REVIEWED` and `REPOSITORY_DELIVERED`, each with the median of the repositories of
    the same type (or of all of them under `MIN_PEERS`), and who writes and reviews it. `repositoryRows({ all: true })`
    gives a row to every repository with anything over the period, whatever the filter.
- **Names of repositories**: always `repoLink(repo)`, never a GitHub link. Wherever it shows, a table, the repositories
  page or a dialog, it opens the repository's dialog (`openRepoOf()`), which links to GitHub; a repository without
  anything over the period opens on GitHub instead.
- **Names of people**: always `personLink(login)` (with or without the avatar), never a GitHub link. Wherever it
  shows, a table, a feed, the pairs, the former people or the dialog itself, it opens the person's dialog
  (`openPersonOf()`); the dialog links to the GitHub profile. A person without any figure over the period opens their
  GitHub profile instead.
- **Former people**, on every page: a person without any pull request, review, comment or merge for
  `FORMER_AFTER_DAYS` (`isFormer()`, from the last activity of `activityBounds()`) has left the team. Any new list of
  people leaves them out: `authorRows()`, `reviewerRows()`, `teamRows()`, the TMA people, the person picker, the
  unblock page, and the review networks through `withoutFormer()`. They only show in the former people of the
  team page, among the leaders of every month of the awards page, and in the repositories that rest on a single
  person, as the one who wrote the most when its authors left, marked « hors équipe » (`formerMark()`): their code is
  still there. Their dialog says they left the team and when they were last active, in place of their seniority
  (`formerText()`). Totals, charts and repository figures still count their pull requests.
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
- Hiding: the `hidden` attribute, which a rule of `style.css` makes win over any `display`; never a class of its own.
- Motion: pages enter with `.is-entering` and a staggered `--delay`; everything stops under
  `prefers-reduced-motion`.
- Text is French, with French typography: typographic apostrophes (’), « » quotes, a non-breaking space before
  `:` `;` `?` `!` and `%`. People are referred to without gendered pronouns ("la personne").

## Security

- The key derived from the password stays in `localStorage` for 30 days; locking asks for confirmation and forgets
  it. Never log it or print it.
- The sync button uses `DISPATCH_TOKEN` from the decrypted stats; a full sync asks for confirmation first.
