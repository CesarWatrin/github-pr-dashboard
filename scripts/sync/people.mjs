// The people of the pull requests: display names and bots seen in the answers of GitHub, and when each one opened
// their first pull request in the organization.

import { BOT_USERS, ORG } from './config.mjs'
import { CONCURRENCY, graphql, mapWithConcurrency } from './github.mjs'
import { FIRST_PULL_REQUEST_QUERY } from './queries.mjs'

// Display names and bot accounts seen in the API answers, kept in the snapshot between syncs.
export const people = { names: new Map(), bots: new Set() }

export function actorLogin(actor) {
  if (!actor) {
    return 'ghost'
  }
  if (actor.__typename !== 'User') {
    people.bots.add(actor.login)
  }
  if (actor.name) {
    people.names.set(actor.login, actor.name)
  }

  return actor.login
}

// The people of the published records, bots aside: authors, reviewers and commenters, and those who merged.
export function peopleOf(records) {
  const logins = new Set()
  for (const pr of records) {
    if (!pr.bot) {
      logins.add(pr.author)
    }
    for (const [login] of pr.interventions) {
      logins.add(login)
    }
    if (pr.mergedBy) {
      logins.add(pr.mergedBy)
    }
  }

  return [...logins].sort()
}

// The people whose first pull request in the organization is not known yet: each is looked up once, the snapshot
// keeps the answer, null for someone who never opened one.
export const peopleToLookUp = (records, known) => peopleOf(records).filter((login) => !(login in known))

// The first pull request each person opened in the organization, ever, for their seniority beyond the window: one
// search of a single result each, a point of the quota, a few at once.
export async function fetchFirstPullRequests(logins) {
  const found = await mapWithConcurrency(logins, CONCURRENCY, async (login) => {
    const query = `org:${ORG} is:pr author:${login} sort:created-asc`
    const data = await graphql(FIRST_PULL_REQUEST_QUERY, { query })

    return [login, data.search.nodes[0]?.createdAt ?? null]
  })

  return Object.fromEntries(found)
}

export const isBot = (login) => BOT_USERS.has(login) || people.bots.has(login)
