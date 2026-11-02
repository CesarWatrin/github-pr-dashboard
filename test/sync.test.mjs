// Tests of the rules of the sync, on pull requests shaped like the snapshot's. Every repository, person and figure
// here is made up.
import assert from 'node:assert/strict'
import { createCipheriv, createHash, pbkdf2Sync, randomBytes } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { gzipSync } from 'node:zlib'

// The sync reads its configuration when loaded: a made-up one, set before importing it. Its published stats go to a
// temporary folder, and no address of a deployed page is known: the tests never reach the network.
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
after(() => rm(statsFolder, { recursive: true, force: true }))

const {
  classify,
  computeCi,
  deliveryIndex,
  isBot,
  mergeMonthlyHistory,
  readPublishedHistory,
  repositoryCategory,
  requiredApprovals,
  technologyShares,
  toPeriodRecord,
  wholeMonthsWithin,
} = await import('../scripts/sync.mjs')

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
    closedDraft: pullRequest({ number: 11, draft: true, state: 'CLOSED', closedAt: '2026-03-02T09:00:00Z' }),
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

  test('open drafts are flagged, closed ones and ready pull requests are not', () => {
    assert.equal(recordOf('draft').draft, true)
    assert.equal(recordOf('closedDraft').draft, undefined)
    assert.equal(recordOf('feature').draft, undefined)
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

describe('monthly history', () => {
  // A period record of the sync, reduced to what the monthly figures read.
  const record = (fields) => ({ bot: false, kind: 'code', hotfix: false, interventions: [], ...fields })

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
      '2025-06': { ana: { code: 9, hotfixes: 0, reviewed: 0, comments: 0 } },
      // Cut by the start of the window now: its records are only partial, the history keeps the whole month.
      '2026-01': { ben: { code: 4, hotfixes: 1, reviewed: 2, comments: 3 } },
      // Whole within the window but over for long: final, even if its records have moved since.
      '2026-02': { ana: { code: 5, hotfixes: 0, reviewed: 0, comments: 0 } },
      // Over for 4 days only: worked out again, for the data synced late.
      '2026-03': { ana: { code: 1, hotfixes: 0, reviewed: 0, comments: 0 } },
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
      ana: { code: 2, hotfixes: 0, reviewed: 0, comments: 0 },
      ben: { code: 0, hotfixes: 0, reviewed: 1, comments: 2 },
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
    assert.deepEqual(merged, { '2026-02': { ana: { code: 1, hotfixes: 0, reviewed: 0, comments: 0 } } })
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

  test('the history of the stats last published comes back when the snapshot has none', async () => {
    await writeFile(process.env.STATS_PATH, encrypted({ monthly }, 'test-password'))
    assert.deepEqual(await readPublishedHistory(), monthly)
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
