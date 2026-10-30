# github-pr-dashboard

Dashboard of the pull requests, reviews, deployments and CI of a **private** GitHub organization, published from this
**public** repository to GitHub Pages. The stats are only ever published encrypted: the page asks for a password and
decrypts them in the browser.

Static site, no build step, no npm dependency, Node 24 (`.nvmrc`). The interface is in French; code and comments are in
English.

## Map

| File | Role |
|---|---|
| `scripts/sync.mjs` | Sync: reads GitHub (GraphQL for pull requests, REST for Actions runs), keeps the snapshot, publishes the encrypted data |
| `site/period.js` | Module shared by the sync and the page: computes the stats of a date range |
| `site/app.js` | The whole page: unlocking, routes, tiles, charts, tables, starting a sync from the page |
| `site/index.html`, `site/style.css` | Markup of the pages and styles (light and dark themes) |
| `site/technology-icons.svg` | Technology logos (Simple Icons, CC0) |
| `scripts/serve.mjs` | Local static server (port 4173, `PORT` to change it) |
| `.github/workflows/deploy.yml` | Sync then deploy to Pages: weekday cron, every push to `main`, manual runs |
| `.github/workflows/checks.yml` | Syntax and tests of every pull request, without any secret |
| `test/` | Tests of `site/period.js` and of the sync rules, on made-up data (`node --test`) |

## Commands

- `npm run sync`: incremental sync (needs `.env`); `npm run sync:full`: full sync.
- `npm run serve`: serves `site/` on http://localhost:4173.
- `npm run dev`: a sync every minute, plus the server.
- `npm run check`: syntax of every script; `npm test`: the tests. Both run on every pull request.

## Rules

The detailed rules live in `.claude/rules/` and load automatically:

- `sensitive-data.md`: **no data of the organization in clear text**, anywhere. Read it first.
- `architecture.md`: data flow, encryption, configuration.
- `sync.md`: the sync (loaded when working on `scripts/` or the workflow).
- `site.md`: conventions of the page (loaded when working on `site/`).
- `workflow.md`: branches, commits, pull requests and checks before shipping.

The README describes the product and its setup (in French); the "Méthode" page of the dashboard defines each metric.
