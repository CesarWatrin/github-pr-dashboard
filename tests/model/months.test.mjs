// Tests of how two months compare (site/model/months.js), for the monthly report, the trends and the tiles.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { reportChange } from '../../site/model/months.js'

const count = { kind: 'count' }
const share = { kind: 'share' }
const text = (change) => change.text.replace(/\s/g, ' ')

describe('reportChange', () => {
  test('a count changes by a percentage, a share by points', () => {
    assert.equal(text(reportChange(count, 30, 20)), '+50 %')
    assert.equal(text(reportChange(count, 15, 20)), '−25 %')
    assert.equal(text(reportChange(share, 0.42, 0.4)), '+2 pts')
    assert.equal(text(reportChange(share, 0.39, 0.4)), '−1 pt')
  })

  test('better or worse only for a figure with a better way', () => {
    assert.equal(reportChange(count, 30, 20).tone, 'neutral')
    assert.equal(reportChange({ ...count, better: 'up' }, 30, 20).tone, 'better')
    assert.equal(reportChange({ ...count, better: 'down' }, 30, 20).tone, 'worse')
    assert.equal(reportChange({ ...count, better: 'down' }, 20, 20).tone, 'neutral')
  })

  test('no change without both values, nor from zero', () => {
    assert.equal(reportChange(count, null, 20), null)
    assert.equal(reportChange(count, 20, undefined), null)
    assert.equal(reportChange(count, 20, 0), null)
    assert.deepEqual(reportChange(share, 0.2, 0), { text: '+20 pts', tone: 'neutral' })
  })
})
