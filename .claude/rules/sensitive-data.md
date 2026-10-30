# No sensitive data in clear text

This repository is **public**, and so is everything pushed to it: code, comments, commit messages, branch names, pull
request descriptions and comments, issues, workflow logs. GitHub also keeps the history of edited pull request
descriptions, visible to everyone: data published by mistake stays readable after it is fixed.

The tracked organization is private. **Nothing of it may appear in clear text**, ever:

- **Secrets**: tokens, passwords, keys. They only live in `.env` (not versioned) and in the repository secrets.
- **Names**: of the organization, its repositories, its accounts (machine accounts included) and its members.
- **Real figures** taken from its data: numbers of pull requests, deployments, hotfixes or runs, rates, delays,
  rankings, number of repositories or technologies, screenshots of the filled dashboard.
- **Internal practices**: pace of hotfixes, team organization, internal tools.

## In practice

- A value specific to the organization goes through an environment variable: `.env` locally, a secret of the
  `github-pages` environment in CI (`ORG`, `REPO_CATEGORIES`, `BOT_USERS`…). Never a list of repositories or accounts in the code: select by
  criterion (repository type, account type) and put the exceptions in one of these variables.
- In the workflow these values are **secrets**, kept in the `github-pages` environment (only `main` can use it), so
  that the public logs mask them and no workflow of another branch can read them.
- Workflow logs are public: in CI, the sync prints no figure, name or GitHub response body. Counts, error details
  and invalid configuration entries are only printed locally (`process.env.CI` unset). Keep it so for any new log.
- The stats are only published encrypted (`site/data/stats.enc.json`): the sync refuses to run without
  `DASHBOARD_PASSWORD`. Never publish a clear version, never commit `site/data/`, `.cache/` or `.env`.
- Commit messages and pull request descriptions describe the change and how it was checked, **without results
  obtained on the real data**. To illustrate, use made-up examples presented as such.
- Tests and local previews run outside the repository (a temporary folder), with a throwaway test password: the real
  password must appear in no command and no output.
- Never print a secret, even partly: no `cat .env`, no dump of the page's local storage (it holds the decryption key).
- Before pushing: read the diff and the pull request text again, looking for real names or figures.

If sensitive data has already been published, say so at once: removing it is not always enough (git history, pull
request description history, caches).
