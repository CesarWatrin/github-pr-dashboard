// Tests of the pairs and circles of review (site/domain/review-circles.js). Every person and figure here is made up.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { chanceOfAtMost, missingReviews, reviewCircles, reviewExpectations, reviewSpread, suggestReviewers } from '../../site/domain/review-circles.js'

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

describe('one-sided pairs', () => {
  test('one reviews the other a lot and gets little back', () => {
    const { oneSided } = reviewCircles([pair('ann', 'ben', 30), pair('ben', 'ann', 3), pair('cid', 'dan', 25), pair('dan', 'cid', 20), pair('eve', 'fay', 10)], new Map())
    // cid and dan give back; eve reviews fay too little to say.
    assert.deepEqual(oneSided, [{ first: 'ann', second: 'ben', firstReviews: 30, secondReviews: 3 }])
  })
})

describe('missing reviews', () => {
  /** @type {(reviewer: string, author: string, repos: Record<string, number>) => { author: string, reviewer: string, repos: Record<string, number> }} */
  const perRepo = (reviewer, author, repos) => ({ author, reviewer, repos })
  // In web, ann only reviews ben, while ben and cid review everyone; in api, dan and eve review each other only.
  const PER_REPO = [
    perRepo('ann', 'ben', { web: 60 }),
    perRepo('ben', 'ann', { web: 30 }),
    perRepo('ben', 'cid', { web: 30 }),
    perRepo('cid', 'ann', { web: 30 }),
    perRepo('cid', 'ben', { web: 30 }),
    perRepo('dan', 'eve', { api: 30 }),
    perRepo('eve', 'dan', { api: 30 }),
  ]

  test('a reviewer who never reads someone they would read as often as the others', () => {
    // ann gives 60 of the 120 reviews of web on others’ pull requests, cid’s pull requests get 30 of those 120: 15
    // expected, none done.
    assert.deepEqual(missingReviews(reviewExpectations(PER_REPO)), [{ reviewer: 'ann', author: 'cid', actual: 0, expected: 15 }])
  })

  test('who could review someone more: those who review their repositories, but them far less', () => {
    const expectations = reviewExpectations(PER_REPO)
    assert.deepEqual(suggestReviewers(expectations, ['cid']).map(({ reviewer, actual, expected }) => ({ reviewer, actual, expected })), [{ reviewer: 'ann', actual: 0, expected: 15 }])
    // ben and cid already review each other: nobody to suggest for ben; dan and eve never review web.
    assert.deepEqual(suggestReviewers(expectations, ['ben']), [])
  })

  test('a gap only counts when chance makes it unlikely: it follows how much is expected', () => {
    // None out of 7 expected happens by chance less than once in a thousand; none out of 2, one time in seven.
    assert.ok(chanceOfAtMost(0, 7) < 0.001)
    assert.ok(Math.abs(chanceOfAtMost(0, 2) - Math.exp(-2)) < 1e-12)
    assert.ok(Math.abs(chanceOfAtMost(1, 2) - 3 * Math.exp(-2)) < 1e-12)
    // A month of the same team, ten times fewer reviews: ann reviews none of the 1.5 of cid’s expected, too few to say.
    const month = PER_REPO.map((entry) => ({ ...entry, repos: Object.fromEntries(Object.entries(entry.repos).map(([repo, count]) => [repo, count / 10])) }))
    assert.deepEqual(missingReviews(reviewExpectations(month)), [])
  })

  test('nobody is said to miss the pull requests of a repository they never review', () => {
    assert.ok(missingReviews(reviewExpectations(PER_REPO)).every(({ reviewer, author }) => !(reviewer === 'dan' && ['ann', 'ben', 'cid'].includes(author))))
  })
})

describe('how widely each author is reviewed', () => {
  const SPREAD = [
    // ann: two reviewers, one does nine tenths.
    pair('ben', 'ann', 27),
    pair('cid', 'ann', 3),
    // ben: four reviewers, evenly.
    pair('ann', 'ben', 10),
    pair('cid', 'ben', 10),
    pair('dan', 'ben', 10),
    pair('eve', 'ben', 10),
    // cid: too few reviews to say.
    pair('ann', 'cid', 5),
  ]

  test('the effective number of reviewers, the main ones and their share, the least spread first', () => {
    const [ann, ben] = reviewSpread(SPREAD)
    assert.equal(ann.author, 'ann')
    assert.equal(Math.round(ann.effective * 100) / 100, 1.22)
    assert.deepEqual(ann.main, [{ login: 'ben', share: 0.9 }, { login: 'cid', share: 0.1 }])
    assert.equal(ann.mainShare, 1)
    assert.equal(ben.effective, 4)
    assert.equal(ben.mainShare, 0.75)
  })

  test('an author with too few reviews is left out', () => {
    assert.deepEqual(reviewSpread(SPREAD).map((spread) => spread.author), ['ann', 'ben'])
  })

  test('each author against the median of their group: few reviewers are only narrow for those who have many', () => {
    const extra = [...SPREAD, pair('ann', 'dan', 10), pair('ben', 'dan', 10), pair('cid', 'dan', 10), pair('eve', 'dan', 10)]
    // ann alone in her group is its median; ben (4) and dan (4) are each other’s.
    const spread = reviewSpread(extra, (login) => (login === 'ann' ? 'front' : 'back'))
    assert.deepEqual(
      spread.map(({ author, groupMedian, narrow }) => [author, Math.round(groupMedian * 100) / 100, narrow]),
      [
        ['ann', 1.22, false],
        ['ben', 4, false],
        ['dan', 4, false],
      ],
    )
    // Together, ann is far under the median of everyone.
    assert.equal(reviewSpread(extra)[0].narrow, true)
  })
})
