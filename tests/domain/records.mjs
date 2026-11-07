// Made-up records for the tests of site/domain/: a record() builder and a few weeks of pull requests (RECORDS).

import { parisMidnight } from '../../site/domain/time.js'

export const at = (iso) => Date.parse(iso) / 60_000
export const iso = (time) => new Date(time * 60_000).toISOString()

// A week of Paris days, Monday 2 to Sunday 8 March 2026.
export const WEEK = { start: parisMidnight('2026-03-02'), end: parisMidnight('2026-03-09'), bucket: 'day' }

export function record(fields) {
  return {
    bot: false,
    kind: 'code',
    hotfix: false,
    production: false,
    mergedAt: null,
    closed: false,
    lines: 10,
    mergedBy: null,
    interventions: [],
    ...fields,
  }
}

export const RECORDS = [
  // Reviewed then merged by someone else, shipped with the release of the 4th.
  record({
    repo: 'web',
    number: 1,
    author: 'alice',
    createdAt: at('2026-03-02T09:00:00Z'),
    mergedAt: at('2026-03-02T15:00:00Z'),
    lines: 50,
    deleted: 20,
    mergedBy: 'bob',
    interventions: [['bob', at('2026-03-02T10:00:00Z'), 'APPROVED', 0]],
    deployedAt: at('2026-03-04T12:00:00Z'),
  }),
  // Merged by its author without any review, with a failed check: it only deletes.
  record({
    repo: 'web',
    number: 2,
    author: 'alice',
    createdAt: at('2026-03-03T09:00:00Z'),
    mergedAt: at('2026-03-04T09:00:00Z'),
    lines: 200,
    deleted: 200,
    mergedBy: 'alice',
    deployedAt: at('2026-03-04T12:00:00Z'),
    checksFailed: true,
  }),
  // Commented, then closed without a merge.
  record({
    repo: 'api',
    number: 3,
    author: 'carol',
    createdAt: at('2026-03-05T08:00:00Z'),
    closed: true,
    interventions: [['alice', at('2026-03-05T09:00:00Z'), 'COMMENTED', 2]],
  }),
  // A hotfix merged into production: a corrective deployment.
  record({
    repo: 'api',
    number: 4,
    author: 'carol',
    hotfix: true,
    createdAt: at('2026-03-06T10:00:00Z'),
    mergedAt: at('2026-03-06T12:00:00Z'),
    lines: 5,
    deleted: 1,
    mergedBy: 'carol',
    interventions: [['bob', at('2026-03-06T11:00:00Z'), 'CHANGES_REQUESTED', 1]],
    deployment: true,
    deployedAt: at('2026-03-06T12:00:00Z'),
  }),
  // A release opened by a bot: a deployment and a release, no author stat.
  record({
    repo: 'web',
    number: 5,
    author: 'robot',
    bot: true,
    kind: 'release',
    production: true,
    createdAt: at('2026-03-04T11:00:00Z'),
    mergedAt: at('2026-03-04T12:00:00Z'),
    deployment: true,
  }),
  // Opened before the range: only its review in the range counts.
  record({
    repo: 'web',
    number: 6,
    author: 'alice',
    createdAt: at('2026-02-20T09:00:00Z'),
    mergedAt: at('2026-02-21T09:00:00Z'),
    deleted: 3,
    mergedBy: 'alice',
    interventions: [['bob', at('2026-03-02T08:00:00Z'), 'COMMENTED', 1]],
  }),
  // Dependabot: one merged, one closed, one still waiting since January.
  record({
    repo: 'web',
    number: 7,
    author: 'dependabot',
    bot: true,
    createdAt: at('2026-03-03T06:00:00Z'),
    mergedAt: at('2026-03-05T06:00:00Z'),
    dependency: 'npm_and_yarn',
  }),
  record({
    repo: 'api',
    number: 8,
    author: 'dependabot',
    bot: true,
    createdAt: at('2026-01-10T06:00:00Z'),
    dependency: 'github_actions',
  }),
  record({
    repo: 'api',
    number: 9,
    author: 'dependabot',
    bot: true,
    createdAt: at('2026-03-07T06:00:00Z'),
    closed: true,
    dependency: 'npm_and_yarn',
  }),
  // A revert merged into production: another corrective deployment.
  record({
    repo: 'api',
    number: 10,
    author: 'bob',
    createdAt: at('2026-03-07T10:00:00Z'),
    mergedAt: at('2026-03-07T11:00:00Z'),
    deleted: 10,
    mergedBy: 'bob',
    deployment: true,
    revert: true,
    deployedAt: at('2026-03-07T11:00:00Z'),
  }),
]
