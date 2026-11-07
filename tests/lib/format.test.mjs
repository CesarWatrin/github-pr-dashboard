// Tests of how the page writes figures (site/lib/format.js): French formats, working time.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  capitalize,
  formatDuration,
  formatLines,
  formatNumber,
  formatRelative,
  formatSeconds,
  formatShare,
  plural,
} from '../../site/lib/format.js'

// Intl separates thousands and units with narrow no-break spaces: compared as plain ones.
const text = (value) => value.replace(/\s/g, ' ')

describe('formatDuration', () => {
  test('minutes under an hour, hours under two working days, then working days of nine hours', () => {
    assert.equal(formatDuration(0.5), '30 min')
    assert.equal(text(formatDuration(3.25)), '3,3 h')
    assert.equal(text(formatDuration(12.4)), '12 h')
    assert.equal(text(formatDuration(18)), '2 j')
    assert.equal(text(formatDuration(22.5)), '2,5 j')
  })

  test('a missing value shows as a dash', () => {
    assert.equal(formatDuration(null), '–')
    assert.equal(formatDuration(undefined), '–')
  })
})

describe('formatSeconds', () => {
  test('CI durations: to the second under ten minutes, then in working time', () => {
    assert.equal(formatSeconds(42), '42 s')
    assert.equal(formatSeconds(125), '2 min 05')
    assert.equal(formatSeconds(1800), '30 min')
    assert.equal(formatSeconds(null), '–')
  })
})

describe('numbers', () => {
  test('French separators, shares in whole percents, lines rounded', () => {
    assert.equal(text(formatNumber(12345)), '12 345')
    assert.equal(text(formatShare(0.426)), '43 %')
    assert.equal(text(formatLines(12_345)), '12 k')
    assert.equal(text(formatLines(1_234_567)), '1,2 M')
    assert.equal(formatNumber(null), '–')
  })

  test('plural and capitals', () => {
    assert.equal(plural(1, 'personne'), '1 personne')
    assert.equal(plural(3, 'personne'), '3 personnes')
    assert.equal(plural(2, 'travail', 'travaux'), '2 travaux')
    assert.equal(capitalize('déploiements'), 'Déploiements')
  })
})

describe('formatRelative', () => {
  test('from the clock of the page: now, minutes, hours, then days', (context) => {
    context.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-06-15T10:00:00Z') })
    assert.equal(formatRelative('2026-06-15T09:59:30Z'), 'à l’instant')
    assert.equal(text(formatRelative('2026-06-15T09:55:00Z')), 'il y a 5 minutes')
    assert.equal(text(formatRelative('2026-06-15T07:00:00Z')), 'il y a 3 heures')
    assert.equal(formatRelative('2026-06-13T10:00:00Z'), 'avant-hier')
  })
})
