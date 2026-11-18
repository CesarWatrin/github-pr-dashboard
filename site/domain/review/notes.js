// What stands out of each person of the annual review, against the team: their strengths and what they should work on,
// each a key and the figures it says, which the page words. A note only shows when the gap is clear.

import { median } from '../math.js'

// The medians of the team the notes compare with, over the people evaluated.
/** @param {import('./scores.js').ScoredPerson[]} people */
export function teamMedians(people) {
  /** @param {(person: import('./scores.js').ScoredPerson) => number | null} read */
  const of = (read) => median(people.flatMap((person) => {
    const value = read(person)
    return typeof value === 'number' ? [value] : []
  })) ?? 0

  return {
    mergeHours: of((person) => person.mergeHours),
    hotfixMergeHours: of((person) => person.hotfixMergeHours),
    firstReviewHours: of((person) => person.firstReviewHours),
    reviewHours: of((person) => person.reviewHours),
    reviewsMean: of((person) => person.reviewsMean),
    commentsPerReview: of((person) => person.commentsPerReview),
    remarkedShare: of((person) => person.remarkedShare),
    size: of((person) => person.size),
    closedShare: of((person) => person.closedShare),
    variation: of((person) => person.variation),
    work: of((person) => person.rhythm.work),
  }
}

/** @typedef {ReturnType<typeof teamMedians>} TeamMedians */
/** @typedef {{ key: string, values: Record<string, number | string> }} Note */

// Thresholds of the notes: how far from the median of the team a figure must be to say something.
export const NOTE_LIMITS = {
  pillar: 1.5,
  fewReviews: 0.6,
  dependents: 4,
  deepReviews: 2,
  minReviewed: 50,
  silent: 0.85,
  owner: 3,
  unreviewed: 0.15,
  closed: 0.14,
  slowFactor: 2,
  fastFactor: 0.5,
  bigSize: 300,
  irregular: 0.7,
  regular: 0.35,
  failed: 0.08,
  builder: 40,
  merger: 50,
  presence: 0.6,
  offHours: 0.08,
  calmWork: 0.97,
  // Reviews focused on a few people: their three most reviewed authors take at least this share of them.
  focused: 0.5,
  // Reviews that almost never leave a remark nor ask for changes.
  fewRemarks: 0.05,
}

/**
 * @param {import('./scores.js').ScoredPerson} person
 * @param {TeamMedians} team
 * @param {{ requiredApprovals: number, profile: { delivered: number, hotfixes: number }, squad: import('./scores.js').SquadResult | null }} context
 * @returns {{ strengths: Note[], weaknesses: Note[] }}
 */
export function notesOf(person, team, { requiredApprovals, profile, squad }) {
  const L = NOTE_LIMITS
  /** @type {Note[]} */
  const strengths = []
  /** @type {Note[]} */
  const weaknesses = []
  const tma = person.profile === 'TMA'
  const offHours = person.rhythm.night + person.rhythm.weekend

  if (squad && squad.mark >= 60) {
    strengths.push({ key: 'squadLeads', values: { mark: squad.mark, units: squad.unitsPerMember, reviews: squad.reviewsPerMember } })
  }
  if (squad && squad.mark < 40) {
    weaknesses.push({ key: 'squadLags', values: { mark: squad.mark, units: squad.unitsPerMember, reviews: squad.reviewsPerMember } })
  }
  if (person.presence < L.presence) {
    weaknesses.push({ key: 'presence', values: { share: person.presence, days: person.activeDays, available: person.availableDays } })
  }
  if (person.standing === 'above') {
    strengths.push({ key: 'delivers', values: { profile: person.comparison, times: person.deliveredVsProfile } })
  }
  if (person.standing === 'below') {
    weaknesses.push(
      tma
        ? { key: 'fewHotfixes', values: { mine: person.hotfixesMean, profile: profile.hotfixes } }
        : { key: 'delivery', values: { profile: person.comparison, share: person.deliveredVsProfile } },
    )
  }
  if (person.reviewsInterval[0] > team.reviewsMean * L.pillar) {
    strengths.push({ key: 'pillar', values: { mine: person.reviewsMean, team: team.reviewsMean } })
  } else if (person.reviewsInterval[1] < team.reviewsMean * L.fewReviews) {
    weaknesses.push({ key: 'fewReviews', values: { mine: person.reviewsMean, team: team.reviewsMean } })
  }
  if (person.dependents.length >= L.dependents) {
    strengths.push({ key: 'dependents', values: { count: person.dependents.length } })
  }
  if (person.reviewed >= L.minReviewed && person.commentsPerReview >= team.commentsPerReview * L.deepReviews) {
    strengths.push({ key: 'deepReviews', values: { mine: person.commentsPerReview, team: team.commentsPerReview } })
  }
  if (person.reviewed >= L.minReviewed && typeof person.silentShare === 'number' && person.silentShare >= L.silent && person.commentsPerReview < team.commentsPerReview) {
    weaknesses.push({ key: 'silent', values: { share: person.silentShare } })
  }
  if (person.reviewed >= L.minReviewed && person.reviewFocus >= L.focused) {
    weaknesses.push({ key: 'focused', values: { share: person.reviewFocus, logins: person.reviewedMost.map(({ login }) => login).join(',') } })
  }
  if (person.reviewed >= L.minReviewed && person.remarkedShare < L.fewRemarks) {
    weaknesses.push({ key: 'fewRemarks', values: { share: person.remarkedShare, reviewed: person.reviewed } })
  }
  if (person.owned.length >= L.owner) {
    weaknesses.push({ key: 'busFactor', values: { count: person.owned.length } })
  } else if (person.owned.length > 0) {
    strengths.push({ key: 'owner', values: { repos: person.owned.map(({ repo }) => repo).join(', ') } })
  }
  if (person.unreviewedShare >= L.unreviewed) {
    weaknesses.push({ key: 'unreviewed', values: { share: person.unreviewedShare, approvals: requiredApprovals } })
  }
  if (person.closedShare >= L.closed) {
    weaknesses.push({ key: 'closed', values: { share: person.closedShare } })
  }
  if (typeof person.mergeHours === 'number' && person.mergeHours > team.mergeHours * L.slowFactor && person.mergeHours > 9) {
    weaknesses.push({ key: 'slow', values: { mine: person.mergeHours, team: team.mergeHours } })
  } else if (typeof person.mergeHours === 'number' && person.mergeHours < team.mergeHours * L.fastFactor && person.unreviewedShare < L.unreviewed) {
    strengths.push({ key: 'fast', values: { mine: person.mergeHours } })
  }
  if (typeof person.size === 'number' && person.size > L.bigSize) {
    weaknesses.push({ key: 'big', values: { mine: person.size, team: team.size } })
  }
  if (person.variation >= L.irregular) {
    weaknesses.push({ key: 'irregular', values: {} })
  } else if (person.variation <= L.regular) {
    strengths.push({ key: 'regular', values: {} })
  }
  if (person.failedShare >= L.failed) {
    weaknesses.push({ key: 'failed', values: { share: person.failedShare } })
  }
  if (tma && typeof person.hotfixMergeHours === 'number' && person.hotfixMergeHours < team.hotfixMergeHours) {
    strengths.push({ key: 'fixesFast', values: { mine: person.hotfixMergeHours } })
  }
  if (tma && typeof person.hotfixMergeHours === 'number' && person.hotfixMergeHours > team.hotfixMergeHours * L.slowFactor) {
    weaknesses.push({ key: 'fixesSlow', values: { mine: person.hotfixMergeHours, team: team.hotfixMergeHours } })
  }
  if (person.projects + person.acs >= L.builder) {
    strengths.push({ key: 'builder', values: { projects: person.projects, acs: person.acs } })
  }
  if (person.mergesOfOthers >= L.merger) {
    strengths.push({ key: 'merger', values: { count: person.mergesOfOthers } })
  }
  if (person.reviewed >= L.minReviewed && typeof person.reviewHours === 'number' && person.reviewHours <= team.reviewHours * 0.5) {
    strengths.push({ key: 'reactive', values: { mine: person.reviewHours } })
  }
  if (person.rhythm.work >= L.calmWork && person.marks.productivity >= 70) {
    strengths.push({ key: 'calm', values: { share: person.rhythm.work } })
  }
  if (offHours >= L.offHours) {
    weaknesses.push({ key: 'offHours', values: { share: offHours } })
  }

  return { strengths, weaknesses }
}
