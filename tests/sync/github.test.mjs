// Tests of the calls to GitHub (scripts/sync/github.mjs). Every repository, person and figure here is made up.

import assert from 'node:assert/strict'
import { afterEach, describe, mock, test } from 'node:test'

import './environment.mjs'
import { request } from '../../scripts/sync/github.mjs'

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
