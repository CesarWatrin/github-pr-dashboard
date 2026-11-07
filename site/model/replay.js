// The replay of the map page: the code pull requests of the period as the events of a film, opened, reviewed and
// merged, and what the team looks like at any moment of it: the repositories growing with the lines merged into them,
// the people who acted lately, and who worked where. People who left show too: it is the history.

import { DAY_MS } from '../domain/time.js'

/**
 * One thing that happened: a pull request opened by its author, reviewed or commented by someone else, or merged, at
 * a time in minutes since the epoch; added: the lines it added, once merged.
 * @typedef {{ at: number, kind: 'opened' | 'reviewed' | 'merged', login: string, repo: string, number: number, added: number }} ReplayEvent
 */
/**
 * What the team looks like at a moment: each repository with the pull requests opened in it so far and the lines
 * merged into it; each person and each link between a person and a repository with when they last acted; the totals
 * so far; how many events it played, and the last of them, for the film to show those new since the frame before.
 * @typedef {{
 *   at: number,
 *   played: number,
 *   repos: Map<string, { opened: number, added: number }>,
 *   people: Map<string, number>,
 *   links: Map<string, { login: string, repo: string, lastAt: number, kind: ReplayEvent['kind'] }>,
 *   totals: { opened: number, merged: number, added: number },
 *   recent: ReplayEvent[],
 * }} ReplayFrame
 */

// A person, and their links, stay on screen this long after they last acted.
export const REPLAY_TRAIL_DAYS = 30
// The events a frame keeps for the film to show, at most.
const RECENT_EVENTS = 40

/**
 * The events of the code pull requests of records within a range (milliseconds), in time order. Bots aside.
 * @param {PullRequestRecord[]} records
 * @param {TimeRange} range
 * @returns {ReplayEvent[]}
 */
export function replayEvents(records, { start, end }) {
  const [from, to] = [start / 60_000, end / 60_000]
  const within = (/** @type {number} */ at) => at >= from && at < to
  /** @type {ReplayEvent[]} */
  const events = []
  for (const pr of records) {
    if (pr.bot || pr.kind !== 'code') {
      continue
    }
    const base = { repo: pr.repo, number: pr.number, added: 0 }
    if (within(pr.createdAt)) {
      events.push({ ...base, at: pr.createdAt, kind: 'opened', login: pr.author })
    }
    // Each reviewer once, at their first review or comment.
    /** @type {Set<string>} */
    const reviewers = new Set()
    for (const [login, at] of pr.interventions) {
      if (login !== pr.author && !reviewers.has(login) && within(at)) {
        reviewers.add(login)
        events.push({ ...base, at, kind: 'reviewed', login })
      }
    }
    if (pr.mergedAt !== null && within(pr.mergedAt)) {
      events.push({ ...base, at: pr.mergedAt, kind: 'merged', login: pr.author, added: pr.lines - (pr.deleted ?? 0) })
    }
  }

  return events.sort((a, b) => a.at - b.at || a.repo.localeCompare(b.repo) || a.number - b.number)
}

/**
 * A replay of events: frame(at) tells what the team looks like at a moment (minutes since the epoch). Moving forward
 * only adds the events since the last frame; going back starts again from the first.
 * @param {ReplayEvent[]} events
 */
export function createReplay(events) {
  let next = 0
  /** @type {ReplayFrame} */
  let frame = emptyFrame(-Infinity)

  /** @param {number} at */
  function seek(at) {
    if (at < frame.at) {
      next = 0
      frame = emptyFrame(at)
    }
    frame.at = at
    const recent = frame.recent
    while (next < events.length && events[next].at <= at) {
      const event = events[next]
      next += 1
      const repo = frame.repos.get(event.repo) ?? { opened: 0, added: 0 }
      frame.repos.set(event.repo, repo)
      if (event.kind === 'opened') {
        repo.opened += 1
        frame.totals.opened += 1
      } else if (event.kind === 'merged') {
        repo.added += event.added
        frame.totals.merged += 1
        frame.totals.added += event.added
      }
      frame.people.set(event.login, event.at)
      frame.links.set(`${event.login}\n${event.repo}`, { login: event.login, repo: event.repo, lastAt: event.at, kind: event.kind })
      recent.push(event)
    }
    frame.recent = recent.slice(-RECENT_EVENTS)
    frame.played = next
    const trailStart = at - (REPLAY_TRAIL_DAYS * DAY_MS) / 60_000
    for (const [login, lastAt] of frame.people) {
      if (lastAt < trailStart) {
        frame.people.delete(login)
      }
    }
    for (const [key, link] of frame.links) {
      if (link.lastAt < trailStart) {
        frame.links.delete(key)
      }
    }

    return frame
  }

  return { frame: seek }
}

/**
 * @param {number} at
 * @returns {ReplayFrame}
 */
function emptyFrame(at) {
  return { at, played: 0, repos: new Map(), people: new Map(), links: new Map(), totals: { opened: 0, merged: 0, added: 0 }, recent: [] }
}
