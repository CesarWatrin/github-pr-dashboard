// Tests of the rules of the analysis page. Every repository, person and figure here is made up.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { RULES, analyze } from '../site/analysis.js'
import { parisMidnight } from '../site/period.js'

const at = (iso) => Date.parse(iso) / 60_000
const HOUR = 60

// March 2026: Monday the 2nd at 10:00 Paris time, a working hour.
const MONDAY = at('2026-03-02T09:00:00Z')
const MARCH = { start: parisMidnight('2026-03-01'), end: parisMidnight('2026-04-01') }

let number = 0
function record(fields) {
  return {
    repo: 'web',
    number: ++number,
    author: 'alice',
    bot: false,
    kind: 'code',
    hotfix: false,
    production: false,
    createdAt: MONDAY,
    mergedAt: null,
    closed: false,
    lines: 10,
    mergedBy: null,
    interventions: [],
    ...fields,
  }
}

// count pull requests alike, merged the given number of hours after their opening.
function merged(count, { hours = 1, ...fields } = {}) {
  return Array.from({ length: count }, () => record({ mergedAt: MONDAY + hours * HOUR, ...fields }))
}

// A review of someone, the given number of hours after the opening on Monday.
const review = (login, hours, state = 'COMMENTED', comments = 1) => [login, MONDAY + hours * HOUR, state, comments]

const findingOf = (result, key) => result.findings.find((finding) => finding.key === key)

describe('analyze', () => {
  test('without any pull request or run, every rule has too little to go on', () => {
    assert.deepEqual(analyze([], [], MARCH), { findings: [], clear: [], few: RULES.map((rule) => rule.key) })
  })

  test('findings come most urgent first, then those to watch, then progress', () => {
    const records = [
      // Big pull requests take five times as long as small ones, and Bob reviews them all: both urgent.
      ...merged(20, { hours: 1, lines: 50, interventions: [review('bob', 0.5)] }),
      ...merged(20, { hours: 5, lines: 600, interventions: [review('bob', 0.5)] }),
      // A repository merged without any review: to watch.
      ...merged(10, { repo: 'tools' }),
    ]
    const { findings } = analyze(records, [], MARCH)

    // Of the same level, in the order of the rules.
    assert.deepEqual(
      findings.map((finding) => [finding.key, finding.level]),
      [
        ['size', 'high'],
        ['mainReviewer', 'high'],
        ['unreviewedRepositories', 'watch'],
      ],
    )
  })
})

describe('size', () => {
  const small = merged(20, { hours: 1, lines: 50, interventions: [review('bob', 0.5, 'COMMENTED', 2)] })

  test('reviewed big pull requests that take twice as long to merge as small ones', () => {
    const big = merged(20, { hours: 3, lines: 600, interventions: [review('bob', 1, 'COMMENTED', 2)] })
    const finding = findingOf(analyze([...small, ...big], [], MARCH), 'size')

    assert.equal(finding.level, 'watch')
    assert.equal(finding.ratio, 3)
    assert.deepEqual(finding.small, { prs: 20, timeToMergeHours: 1, pickupHours: 0.5, commentsPer100Lines: 4 })
    assert.deepEqual(finding.big, { prs: 20, timeToMergeHours: 3, pickupHours: 1, commentsPer100Lines: 0.33 })
    assert.equal(finding.bigShare, 0.5)
    // The size buckets of the dashboard: 10 to 100 lines, then 500 to 1 000.
    assert.deepEqual(
      finding.buckets.map((bucket) => bucket.prs),
      [0, 20, 0, 20, 0],
    )
  })

  test('nothing when they merge almost as fast, too little under twenty of a size', () => {
    const big = merged(20, { hours: 1.5, lines: 600, interventions: [review('bob', 0.5)] })
    assert.ok(analyze([...small, ...big], [], MARCH).clear.includes('size'))
    assert.ok(analyze([...small, ...big.slice(1)], [], MARCH).few.includes('size'))
  })
})

describe('huge pull requests without review', () => {
  // Forty others, one in ten merged without review.
  const others = [...merged(36, { interventions: [review('bob', 0.5)] }), ...merged(4)]

  test('merged without review at least twice as often as the others', () => {
    const huge = [...merged(12, { lines: 2000, interventions: [review('bob', 0.5)] }), ...merged(8, { lines: 2000 })]
    const finding = findingOf(analyze([...others, ...huge], [], MARCH), 'hugeUnreviewed')

    assert.equal(finding.level, 'high')
    const { prs, share, othersShare, ratio, lines } = finding
    assert.deepEqual(
      { prs, share, othersShare, ratio, lines },
      { prs: 8, share: 0.4, othersShare: 0.1, ratio: 4, lines: 16_000 },
    )
    assert.deepEqual(finding.repositories, [{ repo: 'web', prs: 8 }])
  })

  test('nothing when the others go without review almost as often', () => {
    const huge = [...merged(17, { lines: 2000, interventions: [review('bob', 0.5)] }), ...merged(3, { lines: 2000 })]
    assert.ok(analyze([...others, ...huge], [], MARCH).clear.includes('hugeUnreviewed'))
  })
})

describe('bottleneck', () => {
  test('the stage before the merge that takes most of the time, when merging takes half a day or more', () => {
    // Five hours before anyone looks, then approved and merged within the hour.
    const slow = merged(20, { hours: 6, interventions: [review('bob', 5), review('bob', 5.5, 'APPROVED', 0)] })
    const finding = findingOf(analyze(slow, [], MARCH), 'bottleneck')

    assert.equal(finding.stage, 'pickup')
    assert.equal(finding.level, 'high')
    assert.deepEqual(finding.shares, { pickup: 0.833, review: 0.083, merge: 0.083 })
    assert.deepEqual([finding.stageHours, finding.toMergeHours], [5, 6])
  })

  test('nothing when pull requests merge within a few hours', () => {
    const fast = merged(20, { hours: 2, interventions: [review('bob', 1.5), review('bob', 1.8, 'APPROVED', 0)] })
    assert.ok(analyze(fast, [], MARCH).clear.includes('bottleneck'))
  })
})

describe('reviewers and repositories', () => {
  // Twenty reviewed pull requests of one repository, Bob on sixteen of them.
  const records = [
    ...merged(16, { interventions: [review('bob', 0.5)] }),
    ...merged(4, { interventions: [review('carol', 0.5)] }),
  ]

  test('a repository where one person takes part in most reviews', () => {
    const finding = findingOf(analyze(records, [], MARCH), 'mainReviewer')

    assert.equal(finding.level, 'high')
    assert.deepEqual(finding.repositories, [{ repo: 'web', reviewer: 'bob', reviewed: 20, share: 0.8 }])
    assert.deepEqual(finding.people, [{ reviewer: 'bob', repositories: 1 }])
  })

  test('the reviewers who left the team do not count', () => {
    assert.ok(analyze(records, [], { ...MARCH, isCurrent: (login) => login !== 'bob' }).clear.includes('mainReviewer'))
  })

  test('repositories that merge most of their pull requests without review', () => {
    const tools = [
      ...merged(7, { repo: 'tools', author: 'dan' }),
      ...merged(3, { repo: 'tools', interventions: [review('bob', 0.5)] }),
    ]
    const finding = findingOf(analyze([...records, ...tools], [], MARCH), 'unreviewedRepositories')

    assert.deepEqual(finding.repositories, [{ repo: 'tools', merged: 10, unreviewed: 7, share: 0.7, authors: 2 }])
  })
})

describe('workflows', () => {
  // Runs per Paris day, as [runs, failed, rerun, durations in seconds].
  const workflow = (name, runs, failed, seconds) => ({
    repo: 'web',
    workflow: name,
    days: { '2026-03-03': [runs, failed, 0, Array(runs).fill(seconds)] },
  })

  test('those that fail a run in five or more, and those whose median run takes ten minutes or more', () => {
    const result = analyze([], [workflow('tests', 40, 12, 700), workflow('lint', 40, 0, 30)], MARCH)

    assert.deepEqual(findingOf(result, 'failingWorkflows').workflows, [
      { repo: 'web', workflow: 'tests', runs: 40, failureRate: 0.3, failed: 12 },
    ])
    assert.deepEqual(findingOf(result, 'slowWorkflows').workflows, [
      { repo: 'web', workflow: 'tests', runs: 40, medianSeconds: 700 },
    ])
    // Out of the two busy enough to tell.
    assert.equal(findingOf(result, 'failingWorkflows').checked, 2)
  })

  test('too little under thirty runs', () => {
    assert.ok(analyze([], [workflow('tests', 29, 29, 3000)], MARCH).few.includes('failingWorkflows'))
  })
})

describe('abandoned work', () => {
  test('a tenth or more of the code pull requests closed without merge', () => {
    const closed = Array.from({ length: 20 }, () => record({ closed: true, lines: 900 }))
    const records = [...merged(80, { lines: 100 }), ...closed]
    const finding = findingOf(analyze(records, [], MARCH), 'abandoned')

    assert.deepEqual(finding, {
      key: 'abandoned',
      level: 'watch',
      prs: 20,
      share: 0.2,
      medianLines: 900,
      mergedMedianLines: 100,
    })
  })
})

describe('halves of the range', () => {
  // Four weeks from Monday 2 March: halves of ten and a half days, the last week aside.
  const range = { start: parisMidnight('2026-03-02'), end: parisMidnight('2026-03-30') }
  const half = (iso, lines) =>
    Array.from({ length: 50 }, () => record({ createdAt: at(iso), mergedAt: at(iso) + HOUR, lines }))
  const firstHalf = '2026-03-03T09:00:00Z'
  const secondHalf = '2026-03-17T09:00:00Z'
  // Opened in the last week: left out of both halves.
  const lastWeek = half('2026-03-24T09:00:00Z', 5000)

  test('what got worse from the first half to the second', () => {
    const result = analyze([...half(firstHalf, 50), ...half(secondHalf, 200), ...lastWeek], [], range)

    assert.deepEqual(findingOf(result, 'drift').metrics, [{ key: 'medianSize', before: 50, after: 200 }])
    assert.equal(findingOf(result, 'drift').level, 'watch')
    assert.ok(result.clear.includes('progress'))
  })

  test('what got better, apart', () => {
    const result = analyze([...half(firstHalf, 200), ...half(secondHalf, 50), ...lastWeek], [], range)

    assert.deepEqual(findingOf(result, 'progress'), {
      key: 'progress',
      level: 'good',
      middle: findingOf(result, 'progress').middle,
      metrics: [{ key: 'medianSize', before: 200, after: 50 }],
    })
    assert.ok(result.clear.includes('drift'))
  })

  test('a change too small to tell, or halves under fifty merged pull requests, say nothing', () => {
    assert.ok(analyze([...half(firstHalf, 50), ...half(secondHalf, 60)], [], range).clear.includes('drift'))
    assert.ok(analyze([...half(firstHalf, 50), ...half(secondHalf, 200).slice(1)], [], range).few.includes('drift'))
  })
})
