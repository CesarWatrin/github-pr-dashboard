---
paths:
  - "site/**"
---

# Page (`site/`)

## Structure

- Vanilla ES module, no framework, no bundler, no external script: logos come from the local sprite through
  `<use href>`.
- `index.html` loads `app.js?v=__BUILD__` (stamped at deploy); `app.js` imports `period.js`, `analysis.js`,
  `full-sync.js` and `auto-sync.js` with the same query string (`import.meta.url`). Any new module follows that
  pattern, so that the Pages cache (10 minutes) never mixes versions.
- Helpers: `$()`, `el()`, `svg()`. One `state` object; `render(animate)` redraws everything, `renderRoute()` shows the
  page of the hash (`ROUTES`: overview, unblock, me, report, trends, analysis, authors, reviewers, cycle, collaboration,
  team, squads, awards, repositories, tma, devops, method). The period selector and the search apply to every page but the
  method, report, awards and « Pour moi » ones (`filters: false`): the report has a month picker of its own, « Pour
  moi » a person picker; the unblock page, about what stands now, keeps the search only (`period: false`), the
  analysis, trends and squads pages the period only (`search: false`). The Méthode page has no link among the pages: a
  button beside the actions of the sidebar (`data-route-link="method"`), tinted while it shows. In the column of wide
  screens, only the periods of the filters stack (`.filters .segmented`), the other segmented pickers keep their row.
- `currentPeriod()` and `currentCi()` compute the stats of `periodRange()` once per data and range. Presets live in
  `PERIODS` (30 and 90 days, 12, 24 and 36 months); a preset the data does not cover yet (`periodAvailable()`, from
  `windowStart`) is disabled while the sync reads the older months back. Picked dates (`CUSTOM_PERIOD`) are clamped to
  the synced data.
- **Comparison**: `state.compare` (`COMPARISONS`, or `NO_COMPARISON`; remembered with the period by `storePeriod()`)
  sets the period against `comparisonRange()` of `site/period.js`: the range of the same length right before, or the
  same Paris days a year earlier, null when the synced data does not cover it (the option is then marked « hors
  données » and disabled; `renderComparePicker()` goes back to `NO_COMPARISON`, stored, when a new period leaves the
  comparison picked uncovered). When the year before is the period before (`sameDays()`, as for 12 months), the year
  option is left out and a year picked becomes the period before. It is left out too, and a year picked goes back to
  no comparison, when it takes back part of the period (`overlapsPeriod()`, for a period longer than a year). The days compared to show under the picker
  (`[data-compare-note]`). `comparedPeriod()` and `comparedCi()` work out its stats once per range and data, the CI only when the
  runs cover it whole. `renderTiles()` takes those values as its last argument and `renderTileChange()` shows each
  change with `reportChange()`, colored after the `better` of the tile definition; `compare: false` keeps a tile about
  today out of it. The picker only shows on `COMPARED_ROUTES`, the pages whose tiles are about the period.
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
  columns, `color-mix` on `--series-1`; on cells too narrow for its tilted column labels side by side, one in two or
  three keeps its label, the last one always: `TILTED_LABEL_SPACING`), `shareChart()` for bars cut into shares that fill the width, `lineChart()`
  for lines over months (trends page: broken where a month has no value, the unfinished month lighter, a crosshair on
  hover), `renderLegend(container, series)`. Every chart has an `ariaLabel` and a tooltip.
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
- **Squads** (`squads` of the stats, from `SQUADS`; nothing of them shows without any). The squad picker of the
  filters (`[data-squad-filter]`, `renderSquadFilter()`, `state.squad` kept in `localStorage` by `SQUAD_STORAGE_KEY`,
  tinted while active) scopes the pages with filters to the pull requests its members opened: `activeSquad()` is null
  on the pages without filters, `scopedRecords()` feeds `currentPeriod()`, `comparedPeriod()`, `monthStats()` (so the
  trends), `currentAnalysis()`, the unblock page and the unapproved merges, each cache keyed by `squadKey()` too;
  `inSquad()` keeps the feed to the events of its pull requests and the team cards to its members. The CI stays that
  of the organization (a note says so on DevOps), and the card of today hides (`[data-today-card]`): the sync counts it
  for everyone. `render()` notes the squad it drew with (`state.renderedSquad`); `renderRoute()` draws everything again
  when going to or from a page without filters changes it. The squads page (`renderSquads()`, drawn when it shows):
  `squadRow()` for each squad and the whole organization over the period (`squadPeriod()`, cached per squad and range;
  `squadRecords()` per squad): `SQUAD_FIGURES`, the volumes `perMember`, the reviews and comments its members gave
  anywhere, « Relu en interne » the share of the reviews of its pull requests by its members. A card per squad
  (`squadCard()`, the repository card's style) opens `openSquadDialog()`, the card dialog with its tilt, each figure
  over the median of the squads. The ranking (`renderSquadRanking()`): sorted on the column clicked
  (`state.squadSort`, best first by `better`, again to reverse), medals for the first three, the best of each column
  marked, « Total / Par personne » (`state.squadPerMember`), the organization in a last row out of the ranking.
- **« Pour moi » page** (`renderMe()`): the same open pull requests, releases and integrations included (`ME_KINDS`,
  the `kinds` of `openPullRequests()`, tagged by `kindTag()`: they wait for reviews too), those of people still in the team, for one person
  picked among them (`mePeople()`), kept in `localStorage` (`ME_STORAGE_KEY`), a per-viewer convenience.
  `personalQueue()` of `site/period.js` gives the lists of `ME_LISTS`, in the order of the page: the pull requests of
  others still asking for the person's review (`requestedReviewers` of the records, people only: the sync does not know
  who is in a team), then theirs, each in one list only, named and defined as on the unblock page but without its
  delays: forgotten first (`FORGOTTEN_AFTER_DAYS`, whatever it stands), else approved (ready), changes requested, blocked
  by code owners, and the others last (open), each with who it waits for (`waitedFor()`) and, where its list does not
  say, where it stands (the tags of `UNBLOCK_STANCES`). No score, no ranking. Its lists, like those of the unblock
  page (`.unblock-lists`), keep to what they hold, up to the height of a feed, so that an empty or short one leaves a
  short card, and no blank on a phone where they stack. `meQueue()` works the lists out for `renderMe()`,
  which keeps the reviews asked (`state.reviewsAsked`): `renderTitle()` counts them in the tab title of every page,
  « (3) Stats PR ». The bell (`[data-notify-toggle]`, hidden without the Notification API, disabled when the browser
  blocks it) turns notifications on in this browser (`NOTIFY_STORAGE_KEY`, asking the permission first);
  `notifyNewReviews()` then shows one for the reviews asked since the tab last looked (`KNOWN_REVIEWS_STORAGE_KEY`,
  in `sessionStorage`: a reload for a new build misses none, a new tab or another person notifies none of those
  already there), one for several, none while « Pour moi » is on screen. A browser with the API but without the
  constructor (phones) shows none: the title still counts.
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
  `reportMonths()`, every whole month of the synced data; the current month, unfinished, shows no change. The page
  opens on the current month (`state.reportMonth` null, which follows it into the next one), else on the month
  picked. `reportContent()` works out what the report says, once for the page (`renderReport()`) and for « Copier le
  bilan » (`reportText()`): the same figures as text, `*bold*` titles and bullets as Google Chat and Slack read them,
  🟢 or 🟠 after a change with a better way, the figures without a value left out, then the link of the page. On a
  phone the names of the figures wrap, so that the month shown fits beside them and the other months scroll.
- **Trends page**: `TREND_FIGURES`, figures of `REPORT_GROUPS` (their `kind` and `better` too), from `monthStats()`,
  over the months of `reportMonths()` that `periodRange()` touches (`monthsTouched()` of `site/period.js`: each month
  whole, the first month of the data, cut by its start, left out); the period selector applies, not the search. 30 or
  90 days give two to four months: the page says that a trend reads better over 12 months or more (under
  `TREND_FEW_MONTHS`). `renderTrends()` only runs when the page shows, from `renderCharts()`: a first visit works out
  every month of the data one at a time (`prepareTrendMonths()`, a second or so for 36 months) so that the page stays
  responsive, then builds the cards once per stats and range (`trendCard()`) and draws their charts again as the page
  resizes. Each card shows the latest whole month of the period against the same month a year earlier and the median
  of the `REPORT_YEAR_MONTHS` whole months up to it (`lastMonthSummary()`, the change from `reportChange()`), then a
  `lineChart()`: the months and their median over `TREND_ROLLING_MONTHS` (`rollingMedian()`, none until that many
  whole months follow each other, the current month left out), the current month joining its line lighter. The
  rolling median and the comparisons read the months before the period when they need them. The axis comes from
  `trendAxis()`: shares in percents, long durations in working days. The CI has no month before `ciStart`: when the
  period starts earlier, its card says why (`ciTrendNote()`: GitHub forgets the runs after about 13 months, the
  dashboard keeps them itself since `ciStart`).
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
- **Pull requests named in a list**: always `pullRequestLink(repo, number)`. It stays a link to GitHub, but a plain
  click opens the pull request's timeline (`openPullRequestDialog()`, its own `data-pr-dialog`, styled like the
  confirmations) when the records have it (`pullRequestOf()`, a map per stats); a click with a modifier key, the middle
  button or the link's menu still open GitHub, as the « Voir sur GitHub » pill of the dialog does. The steps, the
  working hours waited before each, unrounded (one pull request reads to the minute), what it still waits for at the
  last sync, and the people who intervened come from `pullRequestTimeline()` of `site/period.js`. The head shows the
  title (`title` of the record, else the repository and number) and the state of the checks of the last commit
  (`checksTag()`, `CHECK_STATES`; from `checksFailed` alone on an older record), both published for the pull requests
  the page opens the timeline of only. The state shows an icon like GitHub's checks, drawn in the page's 16×16 stroke
  style (`CHECK_ICONS`, never Octicons' paths) next to its words: green check mark (`--diff-added`), red cross
  (`--diff-deleted`), gold dot ringed with `--gold-ring` while the checks run or wait, pulsing but still under
  `prefers-reduced-motion`, slashed grey circle without any (`--text-muted`). The dialog closes
  from its button, with Escape or on the backdrop, and gives the focus back to the link; a name in it opens the
  person's dialog over it. Taller than the window, only its body scrolls (`.pr-dialog-body`, a column under the head):
  the head, with the close button, stays in place.
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
- Layout: a sidebar from 1280 px. Below, a bar on top (`[data-topbar]`: the menu button, the brand, a second sync
  status, which `renderSyncStatus()` keeps like the first) opens the same sidebar as a drawer over the page
  (`setNavOpen()`: `is-nav-open` on `.app`, the page and the bar `inert` meanwhile, the page not scrolling). It closes
  with its button, the backdrop, Escape, any change of page (a link, the back button, a notification), or the screen
  growing past 1280 px; opened from the keyboard, the focus goes to the current page, else to the drawer itself. In
  the drawer the sync menu spans the width of the buttons. Beside the page as in the drawer, a window too short for
  the whole sidebar scrolls the list of pages only (`.nav`), the brand and the actions staying in place.
  From 1536 px the filters (`[data-filters]`) move from the top of
  the page to a sticky column on its right, under the name « Filtres », the period shown tinted like the current page
  of the sidebar; the column stays on the pages without filters so that the content keeps its width;
  beside it the content is as wide as beside the sidebar at 1280 px, so whatever fits there fits there too. From 1280
  to 1535 px they stick to the top of the window instead, on a band of the page's background, underlined once stuck
  (`is-stuck`, set by an `IntersectionObserver`: their top sits one pixel above the window). Tables
  fit at 1080 px without horizontal scrolling. Check 1920, 1536, 1280, 1080 and 390 px (phone), light and dark.
- Touch screens: the fields (inputs, selects) take 16 px under `(pointer: coarse)`, a rule last in `style.css`, since
  Safari zooms into the page on a field under 16 px and leaves it zoomed; a new field needs nothing more. A double
  tap does not zoom either (`touch-action: manipulation`); pinching still does, never blocked (no `maximum-scale`). On
  a phone the search takes the whole line of the filters.
- Hiding: the `hidden` attribute, which a rule of `style.css` makes win over any `display`; never a class of its own.
- Motion: pages enter with `.is-entering` and a staggered `--delay`; everything stops under
  `prefers-reduced-motion`.
- Text is French, with French typography: typographic apostrophes (’), « » quotes, a non-breaking space before
  `:` `;` `?` `!` and `%`. People are referred to without gendered pronouns ("la personne").

## Security

- The key derived from the password stays in `localStorage` for 30 days; locking asks for confirmation and forgets
  it. Never log it or print it.
- The sync button uses `DISPATCH_TOKEN` from the decrypted stats; a full sync asks for confirmation first.
- `autoSync()`, after each `refresh()` and the unlocking, starts a quick sync with the same token once the data is
  older than `AUTO_SYNC_AFTER_MS` (10 minutes), from a page that shows only (`visibilityState`), or one in the
  background that notifies the reviews asked (`notificationsOn()`: they would come late otherwise), never while a sync of
  the page is starting or awaited, and one try per `AUTO_SYNC_AFTER_MS` at most. The age is checked again with
  `serverNow()`, a browser clock running ahead finding every run old. `autoSyncAction()` of `site/auto-sync.js` reads
  the last runs: one queued or going is waited for (`running`), one started within `AUTO_SYNC_AFTER_MS` is left to
  publish, otherwise a quick sync starts (`auto`). Failures stay silent: the sync button tells them.
- When the stats carry `syncTrigger.fullSync` (`FULL_SYNC_PASSWORD`), the confirmation asks for the full sync password
  too, `autocomplete="new-password"` so that password managers do not fill the dashboard password in (they ignore
  `off`). `confirmFullSync()` derives its key with `site/full-sync.js` (loaded like `period.js`), compares the
  verifier, and only then dispatches with the `proof` input, dated by `serverNow()` (the `Date` header of the page's
  server, the browser's clock only without it); a wrong password keeps the dialog open and dispatches nothing. The key and the password are kept
  nowhere, never logged: each full sync asks again, and closing the dialog clears the field. The check in the page only
  spares a run: the workflow run checks the proof itself, the dispatch token alone being readable from the stats. A run
  that refuses it publishes `fullSyncRefused`: `checkFullSyncRefused()` reads it in the first new stats after a full
  sync the page started, and says so in the sync menu.
