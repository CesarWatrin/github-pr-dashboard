// Tests of when the page starts a sync on its own. Every run here is made up.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { ACTIVE_RUN_STATUSES, AUTO_SYNC_AFTER_MS, autoSyncAction, dataStale } from '../site/auto-sync.js'

const NOW = Date.parse('2030-03-12T10:00:00Z')
const MINUTE = 60_000
const ago = (minutes) => new Date(NOW - minutes * MINUTE).toISOString()
const run = (status, minutesAgo) => ({ status, created_at: ago(minutesAgo) })

describe('dataStale', () => {
  test('data gets old for a sync past ten minutes', () => {
    assert.equal(AUTO_SYNC_AFTER_MS, 10 * MINUTE)
    assert.equal(dataStale(ago(3), NOW), false)
    assert.equal(dataStale(ago(10), NOW), false)
    assert.equal(dataStale(ago(11), NOW), true)
    assert.equal(dataStale(ago(24 * 60), NOW), true)
  })
})

describe('autoSyncAction', () => {
  test('a run queued or going is waited for, however old', () => {
    for (const status of ACTIVE_RUN_STATUSES) {
      assert.equal(autoSyncAction([run(status, 30), run('completed', 60)], NOW), 'wait', status)
    }
    assert.equal(autoSyncAction([run('completed', 2), run('in_progress', 40)], NOW), 'wait')
  })

  test('a run started within ten minutes is left to publish, even failed or cancelled', () => {
    assert.equal(autoSyncAction([run('completed', 2), run('completed', 30)], NOW), 'skip')
    assert.equal(autoSyncAction([run('completed', 9)], NOW), 'skip')
  })

  test('a sync starts when every recent run is done and older than ten minutes', () => {
    assert.equal(autoSyncAction([run('completed', 10), run('completed', 25)], NOW), 'start')
    assert.equal(autoSyncAction([run('completed', 3 * 60)], NOW), 'start')
  })

  test('a sync starts when the workflow never ran', () => {
    assert.equal(autoSyncAction([], NOW), 'start')
  })
})
