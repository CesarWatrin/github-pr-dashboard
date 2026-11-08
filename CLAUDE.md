# github-pr-dashboard

Dashboard of the pull requests, reviews, deployments and CI of a **private** GitHub organization, published from this
**public** repository to GitHub Pages. The stats are only ever published encrypted: the page asks for a password and
decrypts them in the browser.

Static site, no build step, no runtime dependency (TypeScript is the only dev dependency, to check the JSDoc types),
Node 24 (`.nvmrc`). The interface is written in French and switches to English (`site/lib/i18n.js`); code and comments
are in English.

## Map

| Path | Role |
|---|---|
| `site/index.html` | Markup of every page, its styles in order, and the module block (`npm run modules`) |
| `site/app.js` | Composition root of the page: registers, wires and starts everything |
| `site/domain/` | Rules shared by the sync and the page, pure: stats of a range (`period.js`, its tallies in `period/`), CI, open pull requests, timeline, months, comparisons, analysis (`analysis.js`, its rules in `analysis/`), projects, full sync password, auto sync |
| `site/lib/`, `site/model/` | Formats and the language (`i18n.js`, the English in `english/`); the state of the page and what it reads of the stats for the filters picked. No DOM |
| `site/services/` | Published stats and their key, build, GitHub API, notifications |
| `site/ui/`, `site/pages/`, `site/shell/` | Building blocks of the view; one module per page; the frame (router, filters, render, session, sync, theme) |
| `site/styles/`, `site/assets/` | Styles by part (light and dark themes); technology logos (Simple Icons, CC0) |
| `scripts/sync.mjs`, `scripts/sync/` | The sync: reads GitHub (GraphQL for pull requests, REST for Actions runs), keeps the snapshot, publishes the encrypted data |
| `scripts/serve.mjs`, `scripts/module-map.mjs` | Local static server (port 4173, `PORT` to change it); the module block of `index.html` |
| `.github/workflows/deploy.yml` | Sync then deploy to Pages: weekday cron, every push to `main`, manual runs |
| `.github/workflows/checks.yml` | Syntax, types and tests of every pull request, without any secret |
| `tests/` | One test file per module of rules, the page in Chrome, the architecture; made-up data only (`node --test`) |

## Commands

- `npm run sync`: incremental sync (needs `.env`); `npm run sync:full`: full sync.
- `npm run serve`: serves `site/` on http://localhost:4173; `npm run dev`: a sync every minute, plus the server.
- `npm test`: every test (`npm run test:unit`: the rules and the architecture; `npm run test:browser`: the page in
  Chrome); `npm run check`: syntax; `npm run typecheck`: types, strict on the
  rules, never `any` (after `npm install`). All three run on every pull request.
- `npm run modules`: writes the module block of `site/index.html`, after adding, moving or removing a module.

## Rules

The detailed rules live in `.claude/rules/` and load automatically:

- `sensitive-data.md`: **no data of the organization in clear text**, anywhere. Read it first.
- `structure.md`: the layers of the code, where each thing goes, and the tests.
- `architecture.md`: data flow, encryption, configuration.
- `sync.md`: the sync (loaded when working on `scripts/` or the workflow).
- `site.md`: conventions of the page (loaded when working on `site/`).
- `workflow.md`: branches, commits, pull requests and checks before shipping.

The README describes the product and its setup (in French); the "Méthode" page of the dashboard defines each metric.
