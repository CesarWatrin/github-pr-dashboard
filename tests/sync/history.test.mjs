// Tests of the monthly history (scripts/sync/history.mjs). Every repository, person and figure here is made up.

import assert from 'node:assert/strict'
import { createCipheriv, createHash, pbkdf2Sync, randomBytes } from 'node:crypto'
import { rm, writeFile } from 'node:fs/promises'
import { describe, test } from 'node:test'
import { gzipSync } from 'node:zlib'

import './environment.mjs'
import { mergeMonthlyHistory, readPublishedHistory, wholeMonthsWithin } from '../../scripts/sync/history.mjs'
import { minutes } from './pull-request.mjs'

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
