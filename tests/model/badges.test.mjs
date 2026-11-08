// Tests of the badges (site/model/badges.js): the monthly history they are won over, completed from the pull requests
// for a figure it did not count yet. Every person and figure here is made up.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { badgeStandings } from '../../site/model/badges.js'
import { record, useStats } from './stats.mjs'

const figures = (fields) => ({ code: 0, hotfixes: 0, reviewed: 0, comments: 0, added: 0, deleted: 0, opened: 0, ...fields })

describe('badgeStandings', () => {
  test('a month the history kept before a figure existed gets it from the pull requests, the others stay as kept', () => {
    useStats({
      pullRequests: [
        record('ada', '2026-05-04T09:00:00Z', { project: 'paper-kite' }),
        record('ben', '2026-05-20T09:00:00Z', { project: 'paper-kite' }),
        record('ben', '2026-05-21T09:00:00Z', { project: 'paper-kite' }),
      ],
      monthly: {
        // Kept before the code pull requests of projects were counted: Ada's code stays, Ben joins with his projects.
        '2026-05': { ada: figures({ code: 9, opened: 9 }) },
        // Counted with them: kept as it is, though the pull requests say otherwise.
        '2026-04': { cleo: figures({ projects: 4 }) },
      },
    })
    const { history, leaders } = badgeStandings()
    assert.deepEqual(history['2026-05'], { ada: figures({ code: 9, opened: 9, projects: 1 }), ben: figures({ code: 2, opened: 2, projects: 2 }) })
    assert.deepEqual(
      leaders.get('projects').map(({ month, people, value }) => [month, people, value]),
      [
        ['2026-04', ['cleo'], 4],
        ['2026-05', ['ben'], 2],
      ],
    )
    assert.deepEqual(leaders.get('opened').find((leader) => leader.month === '2026-05').people, ['ada'])
  })
})
