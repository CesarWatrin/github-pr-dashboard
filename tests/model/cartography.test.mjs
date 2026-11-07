// Tests of the networks of the map page (site/model/cartography.js). Every person, repository and figure here is made up.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { repositoryMap, reviewMap } from '../../site/model/cartography.js'
import { minutes, record, useStats } from './stats.mjs'

/**
 * @param {string} login
 * @param {string} date
 */
const review = (login, date) => /** @type {Intervention} */ ([login, minutes(date), 'APPROVED', 0])

function stats() {
  useStats({
    people: { ada: 'Ada Lune', ben: 'Ben Kerr', cleo: 'Cleo Mars', dan: 'Dan Ford' },
    pullRequests: [
      // Ben reviews two of Ada's, Ada one of Ben's: one link, three pull requests.
      record('ada', '2026-06-01T09:00:00Z', { repo: 'shop', interventions: [review('ben', '2026-06-01T12:00:00Z')] }),
      record('ada', '2026-06-02T09:00:00Z', { repo: 'shop', interventions: [review('ben', '2026-06-02T12:00:00Z')] }),
      record('ben', '2026-06-03T09:00:00Z', { repo: 'api', interventions: [review('ada', '2026-06-03T12:00:00Z')] }),
      // Cleo reviews one of Ben's.
      record('ben', '2026-06-04T09:00:00Z', { repo: 'api', interventions: [review('cleo', '2026-06-04T12:00:00Z')] }),
      // Dan left months ago: neither his pull request nor his review shows.
      record('dan', '2026-01-04T09:00:00Z', { repo: 'shop', interventions: [review('ada', '2026-01-04T12:00:00Z')] }),
      // A release is no code: it shows nowhere.
      record('cleo', '2026-06-05T09:00:00Z', { repo: 'api', kind: 'release', interventions: [review('ada', '2026-06-05T12:00:00Z')] }),
    ],
  })
}

describe('reviewMap', () => {
  test('one link per pair of people, how many each way, the heaviest first', () => {
    stats()
    const { nodes, links } = reviewMap()
    assert.deepEqual(links, [
      { source: 'person:ada', target: 'person:ben', weight: 3, reviewedBySource: 1, reviewedByTarget: 2 },
      { source: 'person:ben', target: 'person:cleo', weight: 1, reviewedBySource: 0, reviewedByTarget: 1 },
    ])
    assert.deepEqual(
      nodes.map(({ id, value }) => [id, value]),
      [
        ['person:ben', 4],
        ['person:ada', 3],
        ['person:cleo', 1],
      ],
    )
  })
})

describe('repositoryMap', () => {
  test('a link between each person and the repositories of their code pull requests', () => {
    stats()
    const { nodes, links } = repositoryMap()
    assert.deepEqual(links, [
      { source: 'person:ada', target: 'repo:shop', weight: 2 },
      { source: 'person:ben', target: 'repo:api', weight: 2 },
    ])
    assert.deepEqual(
      nodes.map(({ id, kind, name }) => [id, kind, name]),
      [
        ['person:ada', 'person', 'ada'],
        ['person:ben', 'person', 'ben'],
        ['repo:api', 'repository', 'api'],
        ['repo:shop', 'repository', 'shop'],
      ],
    )
  })
})
