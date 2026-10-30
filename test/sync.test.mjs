// Tests of the rules of the sync, on pull requests shaped like the snapshot's. Every repository, person and figure
// here is made up.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

// The sync reads its configuration when loaded: a made-up one, set before importing it.
process.env.ORG = 'example-org'
process.env.DASHBOARD_PASSWORD = 'test-password'
process.env.GITHUB_TOKEN = 'test-token'
process.env.BOT_USERS = 'robot, dependabot'
process.env.REPO_CATEGORIES = 'docs-site:other'
delete process.env.DISPATCH_TOKEN

const { classify, computeCi, deliveryIndex, isBot, repositoryCategory, technologyShares, toPeriodRecord } =
  await import('../scripts/sync.mjs')

const minutes = (iso) => Date.parse(iso) / 60_000

function pullRequest(fields) {
  return {
    repo: 'web',
    title: 'Some change',
    state: fields.mergedAt ? 'MERGED' : 'OPEN',
    draft: false,
    createdAt: '2026-03-01T09:00:00Z',
    mergedAt: null,
    closedAt: null,
    additions: 10,
    deletions: 5,
    head: 'feature/change',
    base: 'develop',
    author: 'alice',
    mergedBy: null,
    reviews: [],
    comments: [],
    checks: 'SUCCESS',
    ...fields,
  }
}

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

  test('everything else is code, hotfixes and project work included', () => {
    assert.equal(kind('feature/search', 'develop'), 'code')
    assert.equal(kind('hotfix/login', 'master'), 'code')
    assert.equal(kind('project/search/main', 'project/search/step-2'), 'code')
  })
})

describe('bots and repositories', () => {
  test('bots: ghost and the accounts of BOT_USERS', () => {
    assert.equal(isBot('ghost'), true)
    assert.equal(isBot('robot'), true)
    assert.equal(isBot('alice'), false)
  })

  test('the type of a repository follows its main languages', () => {
    assert.equal(repositoryCategory('web', [['Vue', 100], ['TypeScript', 300]]), 'front')
    assert.equal(repositoryCategory('api', [['TypeScript', 300]]), 'back')
    assert.equal(repositoryCategory('app', [['Dart', 10], ['Swift', 5]]), 'mobile')
    assert.equal(repositoryCategory('infra', [['HCL', 10]]), 'other')
    assert.equal(repositoryCategory('empty', []), 'other')
  })

  test('REPO_CATEGORIES overrides the languages', () => {
    assert.equal(repositoryCategory('docs-site', [['Vue', 100]]), 'other')
  })

  test('technologies are grouped under their framework, marginal ones dropped', () => {
    assert.deepEqual(technologyShares([['PHP', 900], ['Blade', 80], ['Shell', 20]], ['Laravel']), [
      ['Laravel', 0.98],
      ['Shell', 0.02],
    ])
    assert.deepEqual(technologyShares([['Vue', 50], ['TypeScript', 940], ['CSS', 10]], ['Nuxt', 'Vue']), [['Nuxt', 1]])
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

  test('nothing but what the stats need: no title, no branch', () => {
    const record = recordOf('feature')
    assert.equal('title' in record, false)
    assert.equal('head' in record, false)
    assert.equal('base' in record, false)
  })
})

describe('computeCi', () => {
  const run = (fields) => ({
    repo: 'web',
    workflow: 'Tests',
    conclusion: 'success',
    attempt: 1,
    createdAt: '2026-03-02T09:00:00Z',
    startedAt: '2026-03-02T09:00:00Z',
    updatedAt: '2026-03-02T09:02:00Z',
    ...fields,
  })

  test('runs with a verdict, per Paris day: count, failures, reruns, durations', () => {
    const ci = computeCi([
      run({ createdAt: '2026-03-02T22:30:00Z', startedAt: '2026-03-02T22:30:00Z', updatedAt: '2026-03-02T22:32:00Z' }),
      // Paris is an hour ahead: 23:30 UTC is already the 3rd.
      run({
        conclusion: 'failure',
        attempt: 2,
        createdAt: '2026-03-02T23:30:00Z',
        startedAt: '2026-03-02T23:30:00Z',
        updatedAt: '2026-03-02T23:35:00Z',
      }),
      run({
        conclusion: 'timed_out',
        createdAt: '2026-03-03T08:00:00Z',
        startedAt: '2026-03-03T08:00:00Z',
        updatedAt: '2026-03-03T08:10:00Z',
      }),
      run({ conclusion: 'cancelled' }),
      run({ conclusion: 'skipped' }),
      run({ conclusion: null }),
    ])
    assert.deepEqual(ci, [
      {
        repo: 'web',
        workflow: 'Tests',
        days: { '2026-03-02': [1, 0, 0, [120]], '2026-03-03': [2, 2, 1, [300, 600]] },
      },
    ])
  })
})
