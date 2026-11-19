// Tests of the pairs and circles of review (site/domain/review-circles.js). Every person and figure here is made up.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { reviewCircles } from '../../site/domain/review-circles.js'

/** @type {(reviewer: string, author: string, prs: number) => { author: string, reviewer: string, prs: number }} */
const pair = (reviewer, author, prs) => ({ author, reviewer, prs })

// Two pairs who review each other a lot (ann and ben, cid and dan), a few reviews across, and eve, whom only ann reviews
// now and then, and only her.
const PAIRS = [
  pair('ann', 'ben', 40),
  pair('ben', 'ann', 30),
  pair('cid', 'dan', 35),
  pair('dan', 'cid', 35),
  pair('ann', 'cid', 3),
  pair('dan', 'ben', 2),
  pair('ann', 'eve', 6),
]
const waits = (hours, count = 12) => Array.from({ length: count }, () => hours)
const WAITS = new Map([
  ['ann', waits(1)],
  ['ben', waits(2)],
  ['cid', waits(1)],
  ['dan', waits(2)],
  ['eve', waits(40)],
])

describe('pairs of review', () => {
  const circles = reviewCircles(PAIRS, WAITS)

  test('each pair of people once, both ways, the busiest first, the one who reviews the other most first', () => {
    assert.deepEqual(circles.pairs.slice(0, 3), [
      { first: 'ann', second: 'ben', firstReviews: 40, secondReviews: 30 },
      { first: 'cid', second: 'dan', firstReviews: 35, secondReviews: 35 },
      { first: 'ann', second: 'eve', firstReviews: 6, secondReviews: 0 },
    ])
  })

  test('the reviews returned, the share of the busiest pairs, the fewest reviewers for most of the reviews', () => {
    assert.equal(circles.total, 151)
    // Returned: 30 of ann and ben, 35 of cid and dan, both ways.
    assert.equal(circles.reciprocity, (2 * 30 + 2 * 35) / 151)
    // Every pair is among the busiest eight.
    assert.equal(circles.topPairsShare, 1)
    // ann 49, dan 37, cid 35, ben 30: three of them for 80 %.
    assert.equal(circles.reviewersForCoverage, 3)
    assert.equal(circles.reviewers, 4)
  })

  test('nothing to count without reviews', () => {
    const empty = reviewCircles([], new Map())
    assert.equal(empty.reciprocity, null)
    assert.equal(empty.topPairsShare, null)
    assert.deepEqual(empty.circles, [])
  })
})

describe('circles of review', () => {
  const { circles, team } = reviewCircles(PAIRS, WAITS)

  /** @param {string} login */
  const circleOf = (login) => /** @type {(typeof circles)[number]} */ (circles.find((circle) => circle.members.includes(login)))

  test('the people who review each other make a circle, alone the one nobody reads much; the biggest first', () => {
    assert.deepEqual(
      circles.map((circle) => circle.members),
      // cid and dan received 73 reviews, ann and ben 72.
      [['cid', 'dan'], ['ann', 'ben'], ['eve']],
    )
  })

  test('the share of the reviews of a circle from inside it', () => {
    // ann and ben: 70 of the 72 reviews of their pull requests come from each other, the 2 others from dan; eve: none
    // of hers from inside, she is alone.
    assert.equal(circleOf('ann').insideShare, 70 / 72)
    assert.equal(circleOf('eve').insideShare, 0)
  })

  test('a circle waits when its first reviews come far later than those of the rest of the team', () => {
    assert.deepEqual(
      circles.map((circle) => circle.waiting),
      [false, false, true],
    )
    assert.equal(circleOf('eve').firstReview.slowest, 40)
    assert.equal(circleOf('eve').rest.slowest, 2)
    assert.equal(team.count, 60)
  })

  test('too few first reviews say nothing', () => {
    const few = reviewCircles(PAIRS, new Map([...WAITS, ['eve', waits(40, 3)]]))
    assert.equal(few.circles.find((circle) => circle.members[0] === 'eve')?.waiting, false)
  })
})
