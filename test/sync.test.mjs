// Tests of the rules of the sync, on pull requests shaped like the snapshot's. Every repository, person and figure
// here is made up.
import assert from 'node:assert/strict'
import { createCipheriv, createHash, pbkdf2Sync, randomBytes } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, afterEach, describe, mock, test } from 'node:test'
import { gzipSync } from 'node:zlib'

// The sync reads its configuration when loaded: a made-up one, set before importing it. Its published stats go to a
// temporary folder, no address of a deployed page is known, and the calls to GitHub get made-up answers: the tests never
// reach the network.
const statsFolder = await mkdtemp(join(tmpdir(), 'sync-test-'))
process.env.ORG = 'example-org'
process.env.DASHBOARD_PASSWORD = 'test-password'
process.env.GITHUB_TOKEN = 'test-token'
process.env.BOT_USERS = 'robot, dependabot'
process.env.REPO_CATEGORIES = 'docs-site:other'
process.env.STATS_PATH = join(statsFolder, 'stats.enc.json')
delete process.env.DISPATCH_TOKEN
delete process.env.GITHUB_REPOSITORY
delete process.env.PUBLISHED_STATS_URL
delete process.env.FULL_SYNC_PASSWORD
delete process.env.FULL_SYNC_PROOF
after(() => rm(statsFolder, { recursive: true, force: true }))

const {
  backfillSlice,
  chooseFullSync,
  classify,
  computeCi,
  deliveryIndex,
  fetchOpenChecks,
  fullSyncSettings,
  isBot,
  mergeMonthlyHistory,
  publishedSyncTrigger,
  readPublishedHistory,
  repositoryCategory,
  request,
  requestedPeople,
  requiredApprovals,
  peopleToLookUp,
  snapshotCoverage,
  splitDays,
  technologyShares,
  toPeriodRecord,
  wholeMonthsWithin,
  withOpenChecks,
} = await import('../scripts/sync.mjs')
const { checkFullSyncProof, deriveFullSyncKey, fullSyncProof, fullSyncVerifier } = await import('../site/full-sync.js')

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

describe('requiredApprovals', () => {
  test('1 by default, else the number given', () => {
    assert.equal(requiredApprovals(), 1)
    assert.equal(requiredApprovals(' '), 1)
    assert.equal(requiredApprovals('2'), 2)
  })

  test('anything but a whole number of 1 or more is refused', () => {
    for (const value of ['0', '-1', '1.5', 'two']) {
      assert.throws(() => requiredApprovals(value), /REQUIRED_APPROVALS/)
    }
  })
})

describe('full sync password', async () => {
  // Few iterations, to keep the tests fast.
  const ITERATIONS = 1000
  const REPOSITORY = 'example-owner/example-dashboard'
  const NOW = 1_800_000_000
  const settings = await fullSyncSettings('made-up full sync password', 'example-org', ITERATIONS)
  const { key } = settings
  const ask = (fields) =>
    chooseFullSync({ commandLine: false, requested: true, key, proof: undefined, repository: REPOSITORY, now: NOW, ...fields })

  test('without a password, nothing is published nor asked for', async () => {
    assert.equal(await fullSyncSettings(undefined, 'example-org', ITERATIONS), null)
    assert.equal(await fullSyncSettings('', 'example-org', ITERATIONS), null)
    assert.deepEqual(await ask({ key: undefined }), { full: true, refused: false })
    assert.deepEqual(await ask({ key: undefined, requested: false }), { full: false, refused: false })
  })

  test('the stats carry the salt, the iterations and the verifier, never the key', async () => {
    const { published } = settings
    assert.deepEqual(Object.keys(published).sort(), ['iterations', 'salt', 'verifier'])
    assert.equal(published.iterations, ITERATIONS)
    const salt = createHash('sha256').update('github-pr-dashboard:full-sync:example-org').digest().subarray(0, 16)
    assert.equal(published.salt, salt.toString('base64'))
    // What the page derives from the password and the published salt matches the verifier.
    const derived = await deriveFullSyncKey('made-up full sync password', salt, published.iterations)
    assert.equal(await fullSyncVerifier(derived), published.verifier)
    assert.ok(!JSON.stringify(published).includes(Buffer.from(key).toString('base64')))
  })

  test('the trigger carries the verifier when there is one, and stays as it was without', () => {
    const trigger = { repository: REPOSITORY, workflow: 'deploy.yml', ref: 'main', token: 'made-up-token' }
    assert.deepEqual(publishedSyncTrigger(trigger, settings.published), { ...trigger, fullSync: settings.published })
    assert.deepEqual(publishedSyncTrigger(trigger, null), trigger)
    assert.deepEqual(publishedSyncTrigger(trigger, undefined), trigger)
    assert.equal(publishedSyncTrigger(null, settings.published), null)
    assert.equal(publishedSyncTrigger({ ...trigger, repository: undefined }, settings.published), null)
  })

  test('the proof of the page, checked by the run, lets the full sync through', async () => {
    const proof = await fullSyncProof(key, REPOSITORY, NOW - 30 * 60)
    assert.equal(await checkFullSyncProof(proof, key, REPOSITORY, NOW), true)
    assert.deepEqual(await ask({ proof }), { full: true, refused: false })
  })

  test('a full sync asked without a valid proof is refused: an incremental one instead', async () => {
    const other = await deriveFullSyncKey('another made-up password', new Uint8Array(16), ITERATIONS)
    for (const proof of [
      undefined,
      '',
      await fullSyncProof(other, REPOSITORY, NOW),
      await fullSyncProof(key, 'example-owner/another-dashboard', NOW),
      await fullSyncProof(key, REPOSITORY, NOW - 3 * 60 * 60),
      await fullSyncProof(key, REPOSITORY, NOW + 10 * 60),
    ]) {
      assert.deepEqual(await ask({ proof }), { full: false, refused: true })
    }
    // Without the repository of the dashboard, no proof can be checked.
    const proof = await fullSyncProof(key, REPOSITORY, NOW)
    assert.deepEqual(await ask({ proof, repository: undefined }), { full: false, refused: true })
  })

  test('the command line needs no proof, nor does a sync that does not ask for a full one', async () => {
    assert.deepEqual(await ask({ commandLine: true, requested: false }), { full: true, refused: false })
    assert.deepEqual(await ask({ commandLine: true }), { full: true, refused: false })
    assert.deepEqual(await ask({ requested: false }), { full: false, refused: false })
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

describe('requestedPeople', () => {
  test('the people asked to review, code owners or not; teams, apps and unreadable reviewers aside', () => {
    const requests = [
      { asCodeOwner: false, requestedReviewer: { __typename: 'User', login: 'bob' } },
      { asCodeOwner: true, requestedReviewer: { __typename: 'User', login: 'carol' } },
      { asCodeOwner: true, requestedReviewer: { __typename: 'Team', slug: 'backend' } },
      { asCodeOwner: false, requestedReviewer: { __typename: 'Bot' } },
      { asCodeOwner: true, requestedReviewer: null },
    ]
    assert.deepEqual(requestedPeople(requests), ['bob', 'carol'])
  })

  test('none asked, or an answer without the requests', () => {
    assert.deepEqual(requestedPeople([]), [])
    assert.deepEqual(requestedPeople(undefined), [])
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

describe('monthly history', () => {
  // A period record of the sync, reduced to what the monthly figures read.
  const record = (fields) => ({ bot: false, kind: 'code', hotfix: false, mergedAt: null, interventions: [], ...fields })
  // A person's figures of a month, those not given at zero.
  const figures = (fields) => ({ code: 0, hotfixes: 0, reviewed: 0, comments: 0, added: 0, deleted: 0, opened: 0, ...fields })

  test('only the Paris months lying whole within the window count', () => {
    // From the 10th of January to the 15th of April: February and March only.
    assert.deepEqual(wholeMonthsWithin(Date.parse('2026-01-10T12:00:00Z'), Date.parse('2026-04-15T12:00:00Z')), [
      '2026-02',
      '2026-03',
    ])
    // Paris midnight on the 1st of February is 23:00 UTC on the 31st of January: February is whole.
    assert.deepEqual(wholeMonthsWithin(Date.parse('2026-01-31T23:00:00Z'), Date.parse('2026-03-01T00:00:00Z')), [
      '2026-02',
    ])
  })

  test('a month is worked out until a week after its end, then stays as kept', () => {
    const history = {
      // Long gone from the window: kept as it is.
      '2025-06': { ana: figures({ code: 9 }) },
      // Cut by the start of the window now: its records are only partial, the history keeps the whole month.
      '2026-01': { ben: figures({ code: 4, hotfixes: 1, reviewed: 2, comments: 3 }) },
      // Whole within the window but over for long: final, even if its records have moved since.
      '2026-02': { ana: figures({ code: 5 }) },
      // Over for 4 days only: worked out again, for the data synced late.
      '2026-03': { ana: figures({ code: 1 }) },
    }
    const records = [
      record({ author: 'ben', createdAt: minutes('2026-01-20T09:00:00Z') }),
      record({ author: 'ana', createdAt: minutes('2026-02-10T09:00:00Z') }),
      record({
        author: 'ana',
        createdAt: minutes('2026-03-02T09:00:00Z'),
        interventions: [['ben', minutes('2026-03-03T09:00:00Z'), 'COMMENTED', 2]],
      }),
      record({ author: 'ana', createdAt: minutes('2026-03-30T09:00:00Z') }),
      // The current month is not over: it is left out.
      record({ author: 'ana', createdAt: minutes('2026-04-02T09:00:00Z') }),
    ]
    const merged = mergeMonthlyHistory(history, records, {
      windowStart: Date.parse('2026-01-10T12:00:00Z'),
      now: Date.parse('2026-04-05T12:00:00Z'),
    })

    assert.deepEqual(Object.keys(merged), ['2025-06', '2026-01', '2026-02', '2026-03'])
    assert.deepEqual(merged['2025-06'], history['2025-06'])
    assert.deepEqual(merged['2026-01'], history['2026-01'])
    assert.deepEqual(merged['2026-02'], history['2026-02'])
    assert.deepEqual(merged['2026-03'], {
      ana: figures({ code: 2, opened: 2 }),
      ben: figures({ reviewed: 1, comments: 2 }),
    })
  })

  test('a final month kept before the lines were counted gets them once from its records, the rest as kept', () => {
    const history = {
      // Kept before the lines were counted.
      '2026-02': { ana: { code: 5, hotfixes: 0, reviewed: 1, comments: 2 } },
      // Kept with every figure: it stays as it is.
      '2026-03': { ana: figures({ code: 3, added: 7 }) },
    }
    const records = [
      // Ana's figures of February have moved since it was kept: those kept stay, the lines join them.
      record({
        author: 'ana',
        createdAt: minutes('2026-02-02T09:00:00Z'),
        mergedAt: minutes('2026-02-03T09:00:00Z'),
        lines: 30,
        deleted: 10,
      }),
      // Ben only merged in February, a pull request opened in January: the lines bring him in.
      record({
        author: 'ben',
        createdAt: minutes('2026-01-20T09:00:00Z'),
        mergedAt: minutes('2026-02-05T09:00:00Z'),
        lines: 8,
        deleted: 8,
      }),
      record({
        author: 'ana',
        createdAt: minutes('2026-03-02T09:00:00Z'),
        mergedAt: minutes('2026-03-03T09:00:00Z'),
        lines: 50,
        deleted: 0,
      }),
    ]
    const range = { windowStart: Date.parse('2026-01-10T12:00:00Z'), now: Date.parse('2026-05-05T12:00:00Z') }
    const merged = mergeMonthlyHistory(history, records, range)

    assert.deepEqual(merged['2026-02'], {
      ana: { code: 5, hotfixes: 0, reviewed: 1, comments: 2, added: 20, deleted: 10, opened: 1 },
      ben: figures({ deleted: 8 }),
    })
    assert.deepEqual(merged['2026-03'], history['2026-03'])
    // Once filled, February is final again.
    assert.deepEqual(mergeMonthlyHistory(merged, [], range), merged)
  })

  test('a history counted an older way has its months of the window worked out again once, final or not', () => {
    const history = {
      // Gone from the window: kept as it is.
      '2025-06': { ana: figures({ code: 9 }) },
      // Final, but counted before a fix: ben's merge of a branch was taken for code.
      '2026-02': { ana: figures({ code: 1 }), ben: figures({ code: 1, added: 4000 }) },
    }
    const records = [
      record({
        author: 'ana',
        createdAt: minutes('2026-02-02T09:00:00Z'),
        mergedAt: minutes('2026-02-03T09:00:00Z'),
        lines: 30,
        deleted: 10,
      }),
      record({
        author: 'ben',
        kind: 'integration',
        createdAt: minutes('2026-02-04T09:00:00Z'),
        mergedAt: minutes('2026-02-04T10:00:00Z'),
        lines: 4000,
      }),
    ]
    const range = { windowStart: Date.parse('2026-01-10T12:00:00Z'), now: Date.parse('2026-05-05T12:00:00Z') }
    const merged = mergeMonthlyHistory(history, records, { ...range, revision: 1 })

    assert.deepEqual(merged['2025-06'], history['2025-06'])
    // Ben's merge of a branch still counts among the pull requests he opened.
    assert.deepEqual(merged['2026-02'], {
      ana: figures({ code: 1, added: 20, deleted: 10, opened: 1 }),
      ben: figures({ opened: 1 }),
    })
    // March and April, without any activity, join the history as they would have.
    assert.deepEqual(merged['2026-03'], {})
    // Counted the current way, February is final again: the same history, kept as it is.
    assert.deepEqual(mergeMonthlyHistory(history, records, range), {
      ...history,
      '2026-03': {},
      '2026-04': {},
    })
  })

  test('a whole month the history lacks is worked out, even an empty one', () => {
    const merged = mergeMonthlyHistory({}, [], {
      windowStart: Date.parse('2026-01-10T12:00:00Z'),
      now: Date.parse('2026-04-15T12:00:00Z'),
    })
    // Runs of months go through the months without any activity.
    assert.deepEqual(merged, { '2026-02': {}, '2026-03': {} })
  })

  test('the first sync starts the history from the whole months of its window', () => {
    const merged = mergeMonthlyHistory({}, [record({ author: 'ana', createdAt: minutes('2026-02-02T09:00:00Z') })], {
      windowStart: Date.parse('2026-01-10T12:00:00Z'),
      now: Date.parse('2026-03-05T12:00:00Z'),
    })
    assert.deepEqual(merged, { '2026-02': { ana: figures({ code: 1, opened: 1 }) } })
  })
})

describe('backfill', () => {
  const recentStart = '2026-03-10T08:30:00.000Z'

  test('without a snapshot, the sync starts from the last year, pull requests and runs alike', () => {
    assert.deepEqual(snapshotCoverage(null, recentStart), { pullRequests: recentStart, runs: recentStart })
  })

  test('a snapshot kept before it told what it covers covers the year before its sync', () => {
    const snapshot = { syncedAt: '2026-03-01T12:00:00.000Z', pullRequests: [], runs: [] }
    assert.deepEqual(snapshotCoverage(snapshot, recentStart), {
      pullRequests: '2025-03-01T12:00:00.000Z',
      runs: '2025-03-01T12:00:00.000Z',
    })
  })

  test('a snapshot covers what it tells, its runs from the last year when it has none', () => {
    const snapshot = {
      syncedAt: '2026-03-01T12:00:00.000Z',
      pullRequests: [],
      pullRequestsSince: '2024-06-01T00:00:00.000Z',
      runs: [],
      runsSince: '2025-02-01T00:00:00.000Z',
    }
    assert.deepEqual(snapshotCoverage(snapshot, recentStart), {
      pullRequests: '2024-06-01T00:00:00.000Z',
      runs: '2025-02-01T00:00:00.000Z',
    })
    assert.equal(snapshotCoverage({ ...snapshot, runs: undefined }, recentStart).runs, recentStart)
  })

  test('a slice reads the 30 days before what the snapshot covers, by whole days', () => {
    assert.deepEqual(backfillSlice('2025-03-01T12:00:00.000Z', '2023-03-02T12:00:00.000Z'), {
      from: '2025-01-30',
      to: '2025-03-01',
      since: '2025-01-30T00:00:00.000Z',
    })
  })

  test('the last slice stops at the start of the window, then the snapshot covers it', () => {
    const windowStart = '2025-01-15T12:00:00.000Z'
    const last = backfillSlice('2025-02-01T00:00:00.000Z', windowStart)
    assert.deepEqual(last, { from: '2025-01-15', to: '2025-02-01', since: '2025-01-15T00:00:00.000Z' })
    assert.equal(backfillSlice(last.since, windowStart), null)
  })

  test('a slice is read in ranges of whole days that follow each other, about the same length', () => {
    // The 31 days of a slice, its last day included.
    assert.deepEqual(splitDays('2025-01-30', '2025-03-01', 4), [
      ['2025-01-30', '2025-02-06'],
      ['2025-02-07', '2025-02-14'],
      ['2025-02-15', '2025-02-22'],
      ['2025-02-23', '2025-03-01'],
    ])
    // Fewer days than ranges: a day each.
    assert.deepEqual(splitDays('2025-01-15', '2025-01-16', 4), [
      ['2025-01-15', '2025-01-15'],
      ['2025-01-16', '2025-01-16'],
    ])
    assert.deepEqual(splitDays('2025-01-15', '2025-01-15', 4), [['2025-01-15', '2025-01-15']])
  })

  test('slice after slice, the two years before the last one come back in 25 syncs', () => {
    const windowStart = '2023-03-02T12:00:00.000Z'
    let since = '2025-03-01T12:00:00.000Z'
    let syncs = 0
    for (let slice = backfillSlice(since, windowStart); slice; slice = backfillSlice(since, windowStart)) {
      // Each slice starts where the previous one ended.
      assert.equal(slice.to, since.slice(0, 10))
      since = slice.since
      syncs++
    }
    assert.equal(syncs, 25)
    assert.ok(since <= windowStart)
  })
})

describe('first pull requests', () => {
  const record = (fields) => ({ bot: false, mergedBy: null, interventions: [], ...fields })

  test('the people of the records are looked up once, bots aside, whatever their part', () => {
    const records = [
      record({ author: 'alice', interventions: [['bob', 1, 'APPROVED', 0]], mergedBy: 'carol' }),
      // A Dependabot update: its author is a bot, the reviewer is not.
      record({ author: 'dependabot', bot: true, interventions: [['dan', 2, 'COMMENTED', 1]] }),
      record({ author: 'alice' }),
    ]
    assert.deepEqual(peopleToLookUp(records, {}), ['alice', 'bob', 'carol', 'dan'])
    // Known already, even as someone who never opened a pull request: not looked up again.
    assert.deepEqual(peopleToLookUp(records, { alice: '2021-04-02T09:00:00Z', dan: null }), ['bob', 'carol'])
  })
})

describe('readPublishedHistory', () => {
  // Stats as the sync publishes them, encrypted with the given password.
  function encrypted(data, password) {
    const salt = createHash('sha256').update('github-pr-dashboard:example-org').digest().subarray(0, 16)
    const key = pbkdf2Sync(password, salt, 600_000, 32, 'sha256')
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const blob = Buffer.concat([cipher.update(gzipSync(JSON.stringify(data))), cipher.final(), cipher.getAuthTag()])

    return JSON.stringify({ iterations: 600_000, salt: salt.toString('base64'), iv: iv.toString('base64'), data: blob.toString('base64') })
  }
  const monthly = { '2026-02': { ana: { code: 2, hotfixes: 0, reviewed: 1, comments: 3 } } }

  test('the history of the stats last published comes back when the snapshot has none, with its revision', async () => {
    await writeFile(process.env.STATS_PATH, encrypted({ monthly, monthlyRevision: 2 }, 'test-password'))
    assert.deepEqual(await readPublishedHistory(), { history: monthly, revision: 2 })
    // Published before the revisions: counted the first way.
    await writeFile(process.env.STATS_PATH, encrypted({ monthly }, 'test-password'))
    assert.deepEqual(await readPublishedHistory(), { history: monthly, revision: 1 })
  })

  test('stats without a history, or encrypted with another password, give none', async () => {
    await writeFile(process.env.STATS_PATH, encrypted({ pullRequests: [] }, 'test-password'))
    assert.equal(await readPublishedHistory(), null)
    await writeFile(process.env.STATS_PATH, encrypted({ monthly }, 'another-password'))
    assert.equal(await readPublishedHistory(), null)
    await rm(process.env.STATS_PATH)
    assert.equal(await readPublishedHistory(), null)
  })
})

describe('request', () => {
  const url = 'https://api.github.com/graphql'
  afterEach(() => {
    mock.restoreAll()
    mock.timers.reset()
  })

  // GitHub answers these, one call after the other: a response, or an error for a connection that fails.
  function answers(...list) {
    return mock.method(globalThis, 'fetch', async () => {
      const answer = list.shift()
      if (answer instanceof Error) {
        throw answer
      }

      return answer
    })
  }

  // Makes the call without waiting between its attempts: the clock moves on until it ends.
  async function withoutWaiting(call) {
    mock.timers.enable({ apis: ['setTimeout'] })
    let outcome
    call().then(
      (value) => (outcome = { value }),
      (error) => (outcome = { error }),
    )
    while (!outcome) {
      await new Promise((resolve) => setImmediate(resolve))
      mock.timers.tick(60_000)
    }
    if (outcome.error) {
      throw outcome.error
    }

    return outcome.value
  }

  test('a body that comes back empty or cut short is asked for again', async () => {
    const fetch = answers(new Response(''), new Response('{"data":'), Response.json({ data: { viewer: 'ana' } }))
    assert.deepEqual(await withoutWaiting(() => request(url, {})), { ok: true, status: 200, body: { data: { viewer: 'ana' } } })
    assert.equal(fetch.mock.callCount(), 3)
  })

  test('a connection that fails, a 5xx, a 403 or a 429 are tried again', async () => {
    const fetch = answers(
      new TypeError('fetch failed'),
      new Response('', { status: 502 }),
      new Response('', { status: 403 }),
      new Response('', { status: 429, headers: { 'retry-after': '30' } }),
      Response.json([]),
    )
    assert.deepEqual(await withoutWaiting(() => request(url, {})), { ok: true, status: 200, body: [] })
    assert.equal(fetch.mock.callCount(), 5)
  })

  test('an answer that will not change is given at once, its body as text', async () => {
    const fetch = answers(new Response('Not Found', { status: 404 }))
    assert.deepEqual(await withoutWaiting(() => request(url, {})), { ok: false, status: 404, body: 'Not Found' })
    assert.equal(fetch.mock.callCount(), 1)
  })

  test('a body that never comes whole ends the sync after six attempts', async () => {
    const fetch = answers(...Array.from({ length: 7 }, () => new Response('')))
    await assert.rejects(withoutWaiting(() => request(url, {})), SyntaxError)
    assert.equal(fetch.mock.callCount(), 6)
  })

  test('a 5xx at the sixth attempt is given as it is', async () => {
    const fetch = answers(...Array.from({ length: 7 }, () => new Response('Bad Gateway', { status: 502 })))
    assert.deepEqual(await withoutWaiting(() => request(url, {})), { ok: false, status: 502, body: 'Bad Gateway' })
    assert.equal(fetch.mock.callCount(), 6)
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
    const [, second] = fetch.mock.calls.map((call) => JSON.parse(call.arguments[1].body))
    assert.equal(second.variables.cursor, 'next')
    assert.equal(second.variables.query, 'org:example-org is:pr is:open sort:updated-desc')
  })
})
