// Tests of the replay of the map page (site/model/replay.js). Every person, repository and figure here is made up.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { createReplay, replayEvents } from '../../site/model/replay.js'
import { minutes, record } from './stats.mjs'

const range = { start: Date.parse('2026-03-01T00:00:00Z'), end: Date.parse('2026-06-01T00:00:00Z'), bucket: /** @type {Bucket} */ ('week') }
const records = [
  // Opened and reviewed in March, merged in April with 30 lines added and 10 deleted.
  record('ada', '2026-03-02T09:00:00Z', {
    repo: 'shop',
    lines: 40,
    deleted: 10,
    mergedAt: minutes('2026-04-01T09:00:00Z'),
    interventions: [
      ['ben', minutes('2026-03-03T09:00:00Z'), 'COMMENTED', 1],
      ['ben', minutes('2026-03-04T09:00:00Z'), 'APPROVED', 0],
      ['ada', minutes('2026-03-04T10:00:00Z'), null, 1],
    ],
  }),
  // Opened before the range, merged within it.
  record('ben', '2026-02-20T09:00:00Z', { repo: 'api', lines: 5, mergedAt: minutes('2026-03-05T09:00:00Z') }),
  // A bot and a release show nowhere.
  record('bot', '2026-03-10T09:00:00Z', { bot: true }),
  record('ada', '2026-03-11T09:00:00Z', { kind: 'release' }),
]

describe('replayEvents', () => {
  test('each pull request opened, reviewed once per reviewer, and merged, within the range, in time order', () => {
    assert.deepEqual(
      replayEvents(records, range).map(({ kind, login, repo, added }) => [kind, login, repo, added]),
      [
        ['opened', 'ada', 'shop', 0],
        ['reviewed', 'ben', 'shop', 0],
        ['merged', 'ben', 'api', 5],
        ['merged', 'ada', 'shop', 30],
      ],
    )
  })
})

describe('createReplay', () => {
  const events = replayEvents(records, range)

  test('a frame adds up the repositories and totals so far', () => {
    const frame = createReplay(events).frame(minutes('2026-04-02T00:00:00Z'))
    assert.deepEqual(Object.fromEntries(frame.repos), { shop: { opened: 1, added: 30 }, api: { opened: 0, added: 5 } })
    assert.deepEqual(frame.totals, { opened: 1, merged: 2, added: 35 })
    assert.equal(frame.played, 4)
  })

  test('people and links stay on screen for 30 days after they last acted', () => {
    const replay = createReplay(events)
    assert.deepEqual([...replay.frame(minutes('2026-03-20T00:00:00Z')).people.keys()].sort(), ['ada', 'ben'])
    // Ben last acted on the 5th of March, Ada merged on the 1st of April.
    const frame = replay.frame(minutes('2026-04-10T00:00:00Z'))
    assert.deepEqual([...frame.people.keys()], ['ada'])
    assert.deepEqual([...frame.links.keys()], ['ada\nshop'])
  })

  test('going back starts again: the same frame as from the start', () => {
    const replay = createReplay(events)
    replay.frame(minutes('2026-05-01T00:00:00Z'))
    const back = replay.frame(minutes('2026-03-03T12:00:00Z'))
    assert.deepEqual(back.totals, { opened: 1, merged: 0, added: 0 })
    assert.deepEqual([...back.links.keys()], ['ada\nshop', 'ben\nshop'])
  })
})
