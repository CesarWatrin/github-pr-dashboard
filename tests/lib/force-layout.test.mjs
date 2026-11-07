// Tests of the force-directed layout of the map page (site/lib/force-layout.js), on made-up networks.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { ALPHA_MIN, forceLayout, settle } from '../../site/lib/force-layout.js'

const BOX = { width: 600, height: 400, margin: 10, bottom: 20 }
// Two groups of four nodes, each linked within itself, and one link between them.
const items = Array.from({ length: 8 }, () => ({ radius: 10 }))
/** @type {import('../../site/lib/force-layout.js').ForceLink[]} */
const links = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
].map(([source, target]) => ({ source, target, weight: 1 }))
/**
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 */
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

describe('forceLayout', () => {
  const nodes = settle(forceLayout(items, links, BOX))

  test('settles: the heat falls under its floor', () => {
    const layout = forceLayout(items, links, BOX)
    settle(layout)
    assert.ok(layout.alpha < ALPHA_MIN)
  })

  test('keeps linked nodes closer than unlinked ones', () => {
    const within = [distance(nodes[0], nodes[1]), distance(nodes[5], nodes[6])]
    const across = [distance(nodes[2], nodes[6]), distance(nodes[1], nodes[7])]
    assert.ok(Math.max(...within) < Math.min(...across), `${within} against ${across}`)
  })

  test('never lets two nodes overlap, nor a node leave its box', () => {
    for (const [index, a] of nodes.entries()) {
      for (const b of nodes.slice(index + 1)) {
        assert.ok(distance(a, b) >= a.radius + b.radius - 0.5)
      }
      assert.ok(a.x >= BOX.margin + a.radius - 1e-9 && a.x <= BOX.width - BOX.margin - a.radius + 1e-9)
      assert.ok(a.y >= BOX.margin + a.radius - 1e-9 && a.y <= BOX.height - BOX.bottom - a.radius + 1e-9)
    }
  })

  test('lays the same network out the same way each time, from where its nodes start', () => {
    assert.deepEqual(settle(forceLayout(items, links, BOX)), nodes)
    const moved = settle(forceLayout(items.map((item, index) => ({ ...item, x: 100 + index * 50, y: 200 })), links, BOX))
    assert.notDeepEqual(moved, nodes)
  })

  test('holds a dragged node where it is put', () => {
    const layout = forceLayout(items, links, BOX)
    Object.assign(layout.nodes[0], { fx: 50, fy: 60 })
    settle(layout)
    assert.deepEqual([layout.nodes[0].x, layout.nodes[0].y], [50, 60])
    layout.reheat()
    assert.ok(layout.alpha >= 0.3)
  })
})
