// Tests of the records the sync publishes: kinds, deployments, details (scripts/sync/records.mjs). Every repository, person and figure here is made up.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import './environment.mjs'
import { projectIndex } from '../../scripts/sync/projects.mjs'
import { fetchOpenChecks, withOpenChecks } from '../../scripts/sync/pull-requests.mjs'
import { classify, deliveryIndex, toPeriodRecord } from '../../scripts/sync/records.mjs'
import { minutes, pullRequest } from './pull-request.mjs'

describe('classify', () => {
  const kind = (head, base, title = 'Some change') => classify({ head, base, title })

  test('releases ship to production', () => {
    assert.equal(kind('release/1.2.0', 'master'), 'release')
    assert.equal(kind('develop', 'main'), 'release')
    assert.equal(kind('feature/notes', 'develop', 'chore(main): release 2.0.0'), 'release')
  })

  test('integrations sync long-lived branches', () => {
    assert.equal(kind('master', 'develop'), 'integration')
    assert.equal(kind('merge/master-into-develop', 'develop'), 'integration')
    assert.equal(kind('project/search/main', 'develop'), 'integration')
  })

  test('a project branch named after a merge brings another branch into its project', () => {
    assert.equal(kind('project/search/merge-develop', 'project/search/main'), 'integration')
    assert.equal(kind('project/search/main-into-merge-develop', 'project/search/main'), 'integration')
    assert.equal(kind('project/search-merge-main', 'project/search/main-v2'), 'integration')
  })

  test('so does a project branch named after the long-lived branch it brings in', () => {
    assert.equal(kind('project/search/develop-into-main', 'project/search/main'), 'integration')
    assert.equal(kind('project/search-into-main', 'project/search/main'), 'integration')
    assert.equal(kind('project/search/sync-develop', 'project/search/main'), 'integration')
  })

  test('everything else is code, hotfixes and project work included', () => {
    assert.equal(kind('feature/search', 'develop'), 'code')
    assert.equal(kind('hotfix/login', 'master'), 'code')
    assert.equal(kind('project/search/main', 'project/search/step-2'), 'code')
    assert.equal(kind('project/search/merger-screen', 'project/search/main'), 'code')
    // The sync of some data is a feature, and so is a change into anything but a long-lived branch.
    assert.equal(kind('project/search/sync-contacts', 'project/search/main'), 'code')
    assert.equal(kind('project/search/split-results-into-pages', 'project/search/main'), 'code')
    // Away from project branches, a merge in the name may be what the feature is about.
    assert.equal(kind('feature/merge-accounts', 'develop'), 'code')
  })
})

describe('toPeriodRecord', () => {
  const PULL_REQUESTS = {
    // Merged into develop: ships with the release of the 4th.
    feature: pullRequest({
      number: 1,
      createdAt: '2026-03-02T09:00:00Z',
      mergedAt: '2026-03-02T15:00:00Z',
      mergedBy: 'bob',
      reviews: [
        { author: 'bob', state: 'COMMENTED', submittedAt: '2026-03-02T10:00:00Z', comments: 0 },
        { author: 'alice', state: 'COMMENTED', submittedAt: '2026-03-02T11:00:00Z', comments: 3 },
      ],
      comments: [{ author: 'robot', createdAt: '2026-03-02T12:00:00Z' }],
    }),
    release: pullRequest({
      number: 2,
      author: 'robot',
      head: 'develop',
      base: 'master',
      createdAt: '2026-03-04T11:00:00Z',
      mergedAt: '2026-03-04T12:00:00Z',
    }),
    // Merged into a project branch: ships once that branch reaches develop, then production.
    project: pullRequest({
      number: 3,
      base: 'project/search/main',
      createdAt: '2026-03-03T09:00:00Z',
      mergedAt: '2026-03-03T10:00:00Z',
    }),
    projectIntegration: pullRequest({
      number: 4,
      head: 'project/search/main',
      base: 'develop',
      createdAt: '2026-03-05T09:00:00Z',
      mergedAt: '2026-03-05T10:00:00Z',
    }),
    nextRelease: pullRequest({
      number: 5,
      head: 'develop',
      base: 'master',
      createdAt: '2026-03-06T09:00:00Z',
      mergedAt: '2026-03-06T10:00:00Z',
    }),
    revert: pullRequest({
      number: 6,
      title: 'Revert "Some change"',
      head: 'revert-1-feature/change',
      base: 'master',
      author: 'bob',
      createdAt: '2026-03-07T09:00:00Z',
      mergedAt: '2026-03-07T10:00:00Z',
    }),
    dependency: pullRequest({ number: 7, author: 'dependabot', head: 'dependabot/npm_and_yarn/vite-6.0.0' }),
    botChore: pullRequest({ number: 8, author: 'robot', head: 'chore/update', mergedAt: '2026-03-08T10:00:00Z' }),
    failedChecks: pullRequest({ number: 9, checks: 'FAILURE' }),
    draft: pullRequest({ number: 10, draft: true }),
    ownersWaited: pullRequest({ number: 12, reviewDecision: 'REVIEW_REQUIRED', codeOwnerRequests: ['carol', '@backend', null] }),
    ownersApproved: pullRequest({ number: 13, reviewDecision: 'APPROVED', codeOwnerRequests: ['carol'] }),
    ownersMerged: pullRequest({ number: 14, mergedAt: '2026-03-02T15:00:00Z', reviewDecision: 'REVIEW_REQUIRED', codeOwnerRequests: ['carol'] }),
    closedDraft: pullRequest({ number: 11, draft: true, state: 'CLOSED', closedAt: '2026-03-02T09:00:00Z' }),
    asked: pullRequest({ number: 15, reviewRequests: ['bob', 'robot', 'carol'] }),
    askedDraft: pullRequest({ number: 16, draft: true, reviewRequests: ['bob'] }),
    askedClosed: pullRequest({ number: 17, state: 'CLOSED', closedAt: '2026-03-02T09:00:00Z', reviewRequests: ['bob'] }),
  }
  const index = deliveryIndex(Object.values(PULL_REQUESTS))
  const recordOf = (name) => toPeriodRecord(PULL_REQUESTS[name], index)

  test('a code pull request: times in minutes, reviews of others only', () => {
    const record = recordOf('feature')
    assert.equal(record.kind, 'code')
    assert.equal(record.createdAt, minutes('2026-03-02T09:00:00Z'))
    assert.equal(record.lines, 15)
    assert.deepEqual(record.interventions, [['bob', minutes('2026-03-02T10:00:00Z'), 'COMMENTED', 1]])
  })

  test('a merged code pull request of a person tells the lines it deletes, among its lines', () => {
    assert.equal(recordOf('feature').deleted, 5)
    // Still open, or a release: nothing the stats add up.
    assert.equal(recordOf('failedChecks').deleted, undefined)
    assert.equal(recordOf('release').deleted, undefined)
  })

  test('merged into develop, it reaches production with the next deployment', () => {
    assert.equal(recordOf('feature').deployedAt, minutes('2026-03-04T12:00:00Z'))
  })

  test('merged into a project branch, it waits for that branch, then for a deployment', () => {
    assert.equal(recordOf('project').deployedAt, minutes('2026-03-06T10:00:00Z'))
  })

  test('a release by a bot is kept as a deployment', () => {
    const record = recordOf('release')
    assert.equal(record.bot, true)
    assert.equal(record.kind, 'release')
    assert.equal(record.production, true)
    assert.equal(record.deployment, true)
    assert.equal(record.deployedAt, undefined)
  })

  test('a revert merged into production is a corrective deployment', () => {
    const record = recordOf('revert')
    assert.equal(record.deployment, true)
    assert.equal(record.revert, true)
    assert.equal(record.deployedAt, record.mergedAt)
  })

  test('Dependabot updates are kept, other bot pull requests are not', () => {
    assert.equal(recordOf('dependency').dependency, 'npm_and_yarn')
    assert.equal(recordOf('botChore'), null)
  })

  test('failed checks are flagged, passing ones are not', () => {
    assert.equal(recordOf('failedChecks').checksFailed, true)
    assert.equal(recordOf('feature').checksFailed, undefined)
  })

  test('open drafts are flagged, closed ones and ready pull requests are not', () => {
    assert.equal(recordOf('draft').draft, true)
    assert.equal(recordOf('closedDraft').draft, undefined)
    assert.equal(recordOf('feature').draft, undefined)
  })

  test('code owners still asked to review an open pull request GitHub does not let merge yet', () => {
    assert.deepEqual(recordOf('ownersWaited').codeOwners, ['carol', '@backend', null])
    assert.equal(recordOf('ownersApproved').codeOwners, undefined)
    assert.equal(recordOf('ownersMerged').codeOwners, undefined)
    assert.equal(recordOf('feature').codeOwners, undefined)
  })

  test('the people still asked to review an open pull request ready for review, bots aside', () => {
    assert.deepEqual(recordOf('asked').requestedReviewers, ['bob', 'carol'])
    assert.equal(recordOf('askedDraft').requestedReviewers, undefined)
    assert.equal(recordOf('askedClosed').requestedReviewers, undefined)
    // A pull request of an older snapshot, read before the requests were kept, has none.
    assert.equal(recordOf('feature').requestedReviewers, undefined)
  })

  test('nothing but what the stats need: no title, no branch', () => {
    const record = recordOf('feature')
    assert.equal('title' in record, false)
    assert.equal('head' in record, false)
    assert.equal('base' in record, false)
  })
})

describe('the project of a record', () => {
  const PULL_REQUESTS = {
    feature: pullRequest({ number: 40, head: 'feature/cart', base: 'project/paper-kite/main', mergedAt: '2026-03-03T10:00:00Z' }),
    stacked: pullRequest({ number: 41, head: 'feature/cart-total', base: 'feature/cart' }),
    merge: pullRequest({ number: 42, head: 'project/paper-kite/main', base: 'develop', mergedAt: '2026-03-09T10:00:00Z' }),
    syncDevelop: pullRequest({ number: 43, head: 'project/paper-kite/sync-develop', base: 'project/paper-kite/main' }),
    dependency: pullRequest({ number: 44, author: 'dependabot', head: 'dependabot/npm_and_yarn/vite-6.0.0', base: 'project/paper-kite/main' }),
    outside: pullRequest({ number: 45, head: 'feature/menu', base: 'develop' }),
    abandoned: pullRequest({ number: 46, head: 'project/paper-kite/old-idea', base: 'project/paper-kite/main', state: 'CLOSED', closedAt: '2026-03-06T17:00:00Z' }),
    closedOutside: pullRequest({ number: 47, head: 'feature/old-menu', base: 'develop', state: 'CLOSED', closedAt: '2026-03-06T17:00:00Z' }),
  }
  const index = deliveryIndex(Object.values(PULL_REQUESTS))
  const projects = projectIndex(Object.values(PULL_REQUESTS))
  const recordOf = (name) => toPeriodRecord(PULL_REQUESTS[name], index, null, projects)

  test('a code pull request of a project carries its name, stacked or not', () => {
    assert.equal(recordOf('feature').project, 'paper-kite')
    assert.equal(recordOf('stacked').project, 'paper-kite')
    assert.equal(recordOf('feature').projectMerge, undefined)
  })

  test('the merge of the project branch into a long-lived branch says so', () => {
    const record = recordOf('merge')
    assert.equal(record.kind, 'integration')
    assert.deepEqual([record.project, record.projectMerge], ['paper-kite', true])
  })

  test('other integrations, bots and pull requests outside any project carry none', () => {
    assert.equal(recordOf('syncDevelop').kind, 'integration')
    assert.equal('project' in recordOf('syncDevelop'), false)
    assert.equal('project' in recordOf('dependency'), false)
    assert.equal('project' in recordOf('outside'), false)
    // Without the index of the projects, none at all.
    assert.equal('project' in toPeriodRecord(PULL_REQUESTS.feature, index), false)
  })

  test('a pull request of a project closed without a merge says when, the others do not', () => {
    const abandoned = recordOf('abandoned')
    assert.deepEqual([abandoned.project, abandoned.closed, abandoned.closedAt], ['paper-kite', true, Date.parse('2026-03-06T17:00:00Z') / 60_000])
    assert.equal('closedAt' in recordOf('merge'), false)
    assert.equal('closedAt' in recordOf('feature'), false)
    assert.equal('closedAt' in recordOf('closedOutside'), false)
  })
})

describe('timeline details', () => {
  const since = '2026-03-10T00:00:00Z'
  const PULL_REQUESTS = {
    open: pullRequest({ number: 30, title: 'Add the search page', checks: 'PENDING', createdAt: '2026-01-05T09:00:00Z' }),
    mergedLately: pullRequest({
      number: 31,
      title: 'Fix the login form',
      createdAt: '2026-03-02T09:00:00Z',
      mergedAt: '2026-03-12T10:00:00Z',
    }),
    reviewedLately: pullRequest({
      number: 32,
      state: 'CLOSED',
      closedAt: '2026-03-03T09:00:00Z',
      comments: [{ author: 'bob', createdAt: '2026-03-11T09:00:00Z' }],
    }),
    mergedLongAgo: pullRequest({
      number: 33,
      title: 'Old change',
      createdAt: '2026-01-02T09:00:00Z',
      mergedAt: '2026-01-03T10:00:00Z',
      reviews: [{ author: 'bob', state: 'APPROVED', submittedAt: '2026-01-03T09:00:00Z', comments: 0 }],
    }),
    withoutChecks: pullRequest({ number: 34, checks: null }),
  }
  const index = deliveryIndex(Object.values(PULL_REQUESTS))
  const recordOf = (name, detailsSince = since) => toPeriodRecord(PULL_REQUESTS[name], index, detailsSince)

  test('the open pull requests and those with any activity since carry their title and checks', () => {
    assert.deepEqual([recordOf('open').title, recordOf('open').checks], ['Add the search page', 'PENDING'])
    assert.deepEqual([recordOf('mergedLately').title, recordOf('mergedLately').checks], ['Fix the login form', 'SUCCESS'])
    // A comment since, on a pull request closed before.
    assert.equal(recordOf('reviewedLately').title, 'Some change')
  })

  test('the others carry neither, and without a date only the open ones do', () => {
    assert.equal('title' in recordOf('mergedLongAgo'), false)
    assert.equal('checks' in recordOf('mergedLongAgo'), false)
    assert.equal('title' in recordOf('mergedLately', null), false)
    assert.equal(recordOf('open', null).title, 'Add the search page')
  })

  test('a pull request without checks says so', () => {
    assert.equal(recordOf('withoutChecks').checks, null)
  })

  test('the checks just read replace those of the open pull requests only', () => {
    const pullRequests = [
      PULL_REQUESTS.open,
      PULL_REQUESTS.mergedLately,
      pullRequest({ number: 35, checks: 'PENDING' }),
    ]
    /** @type {Map<string, CheckState>} */
    const checks = new Map([
      ['web#30', 'FAILURE'],
      // Merged since the search indexed it: kept as the snapshot read it.
      ['web#31', 'PENDING'],
    ])
    assert.deepEqual(
      withOpenChecks(pullRequests, checks).map((pr) => pr.checks),
      ['FAILURE', 'SUCCESS', 'PENDING'],
    )
    // A failed check of an open pull request now shows on its record.
    assert.equal(toPeriodRecord(withOpenChecks(pullRequests, checks)[0], index).checksFailed, true)
  })

  test('the checks of the open pull requests are read page after page', async (t) => {
    const page = (nodes, hasNextPage) =>
      Response.json({ data: { search: { pageInfo: { hasNextPage, endCursor: hasNextPage ? 'next' : null }, nodes } } })
    const node = (repo, number, state) => ({
      number,
      repository: { name: repo },
      commits: { nodes: [{ commit: { statusCheckRollup: state === null ? null : { state } } }] },
    })
    const answers = [page([node('web', 30, 'SUCCESS'), {}], true), page([node('api', 7, null)], false)]
    const fetch = t.mock.method(globalThis, 'fetch', async () => answers.shift())
    assert.deepEqual(
      [...(await fetchOpenChecks())],
      [
        ['web#30', 'SUCCESS'],
        ['api#7', null],
      ],
    )
    assert.equal(fetch.mock.callCount(), 2)
    const [, second] = fetch.mock.calls.map((call) => JSON.parse(String(call.arguments[1].body)))
    assert.equal(second.variables.cursor, 'next')
    assert.equal(second.variables.query, 'org:example-org is:pr is:open sort:updated-desc')
  })
})
