// The story of one pull request, step by step, for its timeline (the records of period.js).

import { getOrCreate, isMissing } from './math.js'
import { workHoursBetween } from './time.js'

/** @type {Partial<Record<ReviewState, string>>} */
const DECISIONS = { APPROVED: 'approved', CHANGES_REQUESTED: 'changes' }

// A step of a timeline: what happened (key), when (minutes since the epoch), and who.
/** @typedef {{ key: string, at: number, login: string | null }} Step */
// What a person did on a pull request.
/** @typedef {{ login: string, approved: number, changes: number, comments: number, first: number, last: number }} Participant */

// The story of one pull request, for its timeline. steps, oldest first, each with when (at), who (login, null when
// unknown) and the working hours since the step before (wait, null for the first): opened by its author; the first
// review (reviewed) or comment (commented) of someone else, unless it is a decision itself; every decision before the
// merge, changes requested (changes) or approval (approved); the merge (merged, by mergedBy); the arrival in production
// of a code pull request (deployed). One closed without a merge ends with closed, at null: the records do not keep
// when. pending: what a pull request still waits for at now (minutes since the epoch), since its last step: a review
// or a merge (open), its author (draft), or production for a merged code pull request (production); null otherwise.
// Interventions after the merge are no steps, as for the cycle: the pull request was already in. people: who
// intervened, in the order of their first intervention, with their decisions and comments, those after the merge
// included. durations: from the opening to the first intervention before the merge (pickup), to the merge (toMerge) and
// to production (toProduction), null when it did not get there. Every time is in working hours, unrounded: one pull
// request is read to the minute, where the cycle page rounds its medians.
/**
 * @param {PullRequestRecord} pr
 * @param {number} now
 */
export function pullRequestTimeline(pr, now) {
  const mergedAt = pr.mergedAt
  const merged = mergedAt !== null
  const hours = workHoursBetween
  /** @type {Step[]} */
  const steps = [{ key: 'opened', at: pr.createdAt, login: pr.author }]
  const before = merged ? pr.interventions.filter(([, at]) => at <= mergedAt) : pr.interventions
  before.forEach(([login, at, state], index) => {
    const decision = state && DECISIONS[state]
    if (decision) {
      steps.push({ key: decision, at, login })
    } else if (index === 0) {
      steps.push({ key: state === null ? 'commented' : 'reviewed', at, login })
    }
  })
  if (merged) {
    steps.push({ key: 'merged', at: mergedAt, login: pr.mergedBy })
    if (!isMissing(pr.deployedAt)) {
      steps.push({ key: 'deployed', at: pr.deployedAt, login: null })
    }
  }
  /** @type {(Omit<Step, 'at'> & { at: number | null, wait: number | null })[]} */
  const timed = steps.map((step, index) => ({ ...step, wait: index === 0 ? null : hours(steps[index - 1].at, step.at) }))
  if (pr.closed && !merged) {
    timed.push({ key: 'closed', at: null, login: null, wait: null })
  }

  const since = /** @type {Step} */ (steps.at(-1)).at
  const waitsFor = merged
    ? pr.kind === 'code' && !pr.bot && isMissing(pr.deployedAt) && 'production'
    : !pr.closed && (pr.draft ? 'draft' : 'open')

  /** @type {Map<string, Participant>} */
  const people = new Map()
  for (const [login, at, state, comments] of pr.interventions) {
    const person = getOrCreate(people, login, () => ({ login, approved: 0, changes: 0, comments: 0, first: at, last: at }))
    person.approved += state === 'APPROVED' ? 1 : 0
    person.changes += state === 'CHANGES_REQUESTED' ? 1 : 0
    person.comments += comments
    person.last = at
  }

  const deployedAt = merged ? pr.deployedAt : null

  return {
    steps: timed,
    pending: waitsFor ? { key: waitsFor, since, wait: hours(since, now) } : null,
    people: [...people.values()],
    durations: {
      pickup: before.length ? hours(pr.createdAt, before[0][1]) : null,
      toMerge: merged ? hours(pr.createdAt, mergedAt) : null,
      toProduction: isMissing(deployedAt) ? null : hours(pr.createdAt, deployedAt),
    },
  }
}
