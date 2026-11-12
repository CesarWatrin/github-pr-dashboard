// Tests of the year in review the sync publishes apart (scripts/sync/retro.mjs, encryptRetro() of publish.mjs, the key of
// config.mjs): only what its slides show, for the people still in the team, each squad and the team, encrypted with its
// own key. Every repository, person, squad and figure here is made up.

import assert from 'node:assert/strict'
import { createDecipheriv, randomBytes } from 'node:crypto'
import { describe, test } from 'node:test'
import { gunzipSync } from 'node:zlib'

import './environment.mjs'
import { retroKey } from '../../scripts/sync/config.mjs'
import { encryptRetro } from '../../scripts/sync/publish.mjs'
import { retroOf, SHOWN_PROJECTS } from '../../scripts/sync/retro.mjs'
import { at, record } from '../domain/records.mjs'

const GENERATED_AT = '2026-10-20T10:00:00.000Z'

/** @type {PullRequestRecord[]} */
const RECORDS = [
  // Ada: two code pull requests of the paper-kite project, reviewed by Ben, merged; the branch of the project merged.
  record({ repo: 'web', number: 1, author: 'ada', project: 'paper-kite', createdAt: at('2026-03-03T09:00:00Z'), mergedAt: at('2026-03-03T15:00:00Z'), lines: 120, interventions: [['ben', at('2026-03-03T10:00:00Z'), 'APPROVED', 1]] }),
  record({ repo: 'web', number: 2, author: 'ada', project: 'paper-kite', createdAt: at('2026-03-04T09:00:00Z'), mergedAt: at('2026-03-04T12:00:00Z'), lines: 30, interventions: [['ben', at('2026-03-04T10:00:00Z'), 'APPROVED', 0]] }),
  record({ repo: 'web', number: 3, author: 'ada', kind: 'integration', project: 'paper-kite', projectMerge: true, createdAt: at('2026-03-05T09:00:00Z'), mergedAt: at('2026-03-05T10:00:00Z') }),
  // Ben: one, reviewed by Ada, in October.
  record({ repo: 'api', number: 1, author: 'ben', createdAt: at('2026-10-01T09:00:00Z'), mergedAt: at('2026-10-01T11:00:00Z'), lines: 8, interventions: [['ada', at('2026-10-01T10:00:00Z'), 'APPROVED', 2]] }),
  // Cy left the team: nothing since February.
  record({ repo: 'api', number: 2, author: 'cy', createdAt: at('2026-02-02T09:00:00Z'), mergedAt: at('2026-02-02T10:00:00Z'), lines: 5 }),
  // A release deployed to production.
  record({ repo: 'web', number: 4, author: 'ben', kind: 'release', deployment: true, createdAt: at('2026-10-02T09:00:00Z'), mergedAt: at('2026-10-02T10:00:00Z') }),
]

/** @type {Stats} */
const STATS = /** @type {Stats} */ (/** @type {unknown} */ ({
  org: 'example-org',
  generatedAt: GENERATED_AT,
  people: { ada: 'Ada Lovelace', ben: 'ben' },
  squads: [
    { name: 'Blue team', members: ['ada', 'cy'], lead: 'ada' },
    { name: 'Quiet team', members: ['dan'] },
  ],
  windowStart: '2024-11-08T00:00:00.000Z',
  pullRequests: RECORDS,
}))

describe('retroOf', () => {
  const retro = /** @type {Retro} */ (retroOf(STATS, 2026))

  test('nothing before its year starts', () => {
    assert.equal(retroOf(STATS, 2027), null)
  })

  test('only what the slides show: never the records, the squads of the stats, nor anything of the dashboard', () => {
    assert.deepEqual(Object.keys(retro).sort(), ['generatedAt', 'names', 'org', 'people', 'squads', 'team', 'year'])
    assert.equal(JSON.stringify(retro).includes('interventions'), false)
  })

  test('the people of the year still in the team, by name, and the names that differ from the login', () => {
    assert.deepEqual(retro.people.map((person) => person.login), ['ada', 'ben'])
    assert.deepEqual(retro.names, { ada: 'Ada Lovelace' })
  })

  test('a person: figures, the first reviewer of each way, projects and fun facts', () => {
    const ada = /** @type {RetroPerson} */ (retro.people.find((person) => person.login === 'ada'))
    assert.deepEqual([ada.code, ada.merged, ada.reviewed, ada.comments], [2, 2, 1, 2])
    assert.deepEqual(ada.reviewedBy, { login: 'ben', prs: 2 })
    assert.deepEqual(ada.reviewedMost, { login: 'ben', prs: 1 })
    assert.deepEqual([ada.projects, ada.delivered, ada.projectList], [1, 1, [{ name: 'paper-kite', status: 'delivered', delivered: true }]])
    assert.equal(ada.facts.smallest, 30)
    assert.ok(ada.projectList.length <= SHOWN_PROJECTS)
  })

  test('each squad with anything over the year, and the team with its deployments', () => {
    assert.deepEqual(retro.squads.map((squad) => [squad.name, squad.lead, squad.code, squad.people, squad.deployments]), [['Blue team', 'ada', 3, 2, 0]])
    // Its members of the year, whom its story thanks: Cy's pull request counts for the squad, but Cy left the team.
    assert.deepEqual(retro.squads.map((squad) => squad.members), [['ada']])
    assert.deepEqual([retro.team.code, retro.team.people, retro.team.deployments, retro.team.delivered], [4, 3, 1, 1])
  })
})

describe('the year in review, encrypted', () => {
  test('with its own key: 32 bytes in base64url, nothing else', () => {
    assert.equal(retroKey(), null)
    assert.equal(retroKey('  '), null)
    const key = randomBytes(32)
    assert.deepEqual(retroKey(key.toString('base64url')), key)
    for (const wrong of ['short', randomBytes(16).toString('base64url'), `${key.toString('base64url')}x`, key.toString('base64')]) {
      assert.throws(() => retroKey(wrong), /RETRO_KEY/)
    }
  })

  test('gzipped then encrypted with that key, as the page reads it', () => {
    const key = randomBytes(32)
    const retro = /** @type {Retro} */ (retroOf(STATS, 2026))
    const { iv, data } = encryptRetro(retro, key)
    const blob = Buffer.from(data, 'base64')
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
    decipher.setAuthTag(blob.subarray(-16))
    assert.deepEqual(JSON.parse(gunzipSync(Buffer.concat([decipher.update(blob.subarray(0, -16)), decipher.final()])).toString()), retro)
  })
})
