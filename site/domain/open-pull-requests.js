// Where the open pull requests stand now: for the unblock page, and for one person (« Mes PR »), their drafts too.

// The open pull requests of people of the kinds asked for (code only by default: the unblock page; releases and
// integrations wait for their reviews too, for the « Mes PR » page), drafts aside, each with its kind, and where each
// one stands after the latest decision of each reviewer, as GitHub reckons it: changes requested by someone (changes), else blocked by code owners who have not
// reviewed it yet (owners), else approved by as many people as merging needs (approved), else approved by fewer
// (approving), else reviewed or commented without a decision (discussed), else waiting for a first look (waiting).
// since: when it got there, in minutes since the epoch (the latest of these decisions, the opening for the code owners,
// the latest intervention, or the opening); by: who decided, or the code owners it waits for; lastAt: its latest review
// or comment, else its opening; requestedReviewers: the people still asked to review it; counterparts: the pull
// requests of its branch in other repositories, as [repository, number] (see counterpartStates()).
/**
 * @param {PullRequestRecord[]} records
 * @param {{ requiredApprovals?: number, kinds?: PullRequestKind[] }} [options]
 */
export function openPullRequests(records, { requiredApprovals = 1, kinds = ['code'] } = {}) {
  return records
    .filter((pr) => !pr.bot && kinds.includes(pr.kind) && pr.mergedAt === null && !pr.closed && !pr.draft)
    .map((pr) => {
      /** @type {Map<string, { state: ReviewState, at: number }>} */
      const decisions = new Map()
      for (const [login, at, state] of pr.interventions) {
        if (state === 'APPROVED' || state === 'CHANGES_REQUESTED') {
          decisions.set(login, { state, at })
        }
      }
      /** @param {ReviewState} state */
      const decided = (state) => [...decisions].filter(([, decision]) => decision.state === state)
      const requested = decided('CHANGES_REQUESTED')
      const approved = decided('APPROVED')
      const owners = !requested.length && (pr.codeOwners?.length ?? 0) > 0
      const deciders = requested.length ? requested : owners ? [] : approved
      const stance = requested.length
        ? 'changes'
        : owners
          ? 'owners'
          : approved.length >= requiredApprovals
          ? 'approved'
          : approved.length
            ? 'approving'
            : pr.interventions.length
              ? 'discussed'
              : 'waiting'

      return {
        repo: pr.repo,
        number: pr.number,
        author: pr.author,
        kind: pr.kind,
        createdAt: pr.createdAt,
        lines: pr.lines,
        stance,
        since: owners
          ? pr.createdAt
          : deciders.length
            ? Math.max(...deciders.map(([, decision]) => decision.at))
            : (pr.interventions.at(-1)?.[1] ?? pr.createdAt),
        by: owners ? pr.codeOwners : deciders.map(([login]) => login).sort(),
        lastAt: pr.interventions.at(-1)?.[1] ?? pr.createdAt,
        requestedReviewers: pr.requestedReviewers ?? [],
        counterparts: pr.counterparts ?? [],
      }
    })
}

// Where the counterparts of an open pull request stand (counterparts of the records: the pull requests of its branch
// in other repositories, such as the back end of a front-end feature): merged, ready (approved by as many people as
// merging needs, as for the pull request itself), or waiting (open otherwise, drafts included). One closed without a
// merge, or missing from the records, is left out. Worked out once per records: the function it gives looks each one up.
/**
 * @param {PullRequestRecord[]} records
 * @param {{ requiredApprovals?: number }} [options]
 * @returns {(pr: { counterparts: [repo: string, number: number][] }) => { repo: string, number: number, state: 'merged' | 'ready' | 'waiting' }[]}
 */
export function counterpartStates(records, { requiredApprovals = 1 } = {}) {
  /** @type {(pr: { repo: string, number: number }) => string} */
  const key = (pr) => `${pr.repo}#${pr.number}`
  const byKey = new Map(records.map((pr) => [key(pr), pr]))
  const ready = new Set(
    openPullRequests(records, { requiredApprovals, kinds: ['code', 'integration', 'release'] })
      .filter((pr) => pr.stance === 'approved')
      .map(key),
  )

  return ({ counterparts }) =>
    counterparts.flatMap(([repo, number]) => {
      const record = byKey.get(key({ repo, number }))
      if (!record || record.closed) {
        return []
      }
      /** @type {'merged' | 'ready' | 'waiting'} */
      const state = record.mergedAt !== null ? 'merged' : ready.has(key(record)) ? 'ready' : 'waiting'

      return [{ repo, number, state }]
    })
}

// An open pull request, where it stands.
/** @typedef {ReturnType<typeof openPullRequests>[number]} OpenPullRequest */

// Where a person's own open pull request goes when it is not forgotten, by where it stands; the others go to open.
/** @type {Partial<Record<string, 'ready' | 'changes' | 'owners'>>} */
const OWN_LISTS = { approved: 'ready', changes: 'changes', owners: 'owners' }

// What stands for one person among the open pull requests of openPullRequests(): those of other people still asking
// for their review (toReview), the oldest first; and theirs, each in one list only. Forgotten when nothing was
// reviewed or commented since forgottenBefore (minutes since the epoch), whatever it stands, the longest forgotten
// first; else after where it stands: approved by as many people as merging needs (ready), changes requested (changes),
// blocked by code owners (owners), or any other stance (open), the longest where they stand first.
/**
 * @param {OpenPullRequest[]} open
 * @param {string} login
 * @param {{ forgottenBefore?: number }} [options]
 */
export function personalQueue(open, login, { forgottenBefore = -Infinity } = {}) {
  const own = open.filter((pr) => pr.author === login)
  /** @type {Record<'ready' | 'changes' | 'owners' | 'open', OpenPullRequest[]>} */
  const lists = { ready: [], changes: [], owners: [], open: [] }
  for (const pr of own.filter((other) => other.lastAt > forgottenBefore).sort((a, b) => a.since - b.since)) {
    lists[OWN_LISTS[pr.stance] ?? 'open'].push(pr)
  }

  return {
    toReview: open
      .filter((pr) => pr.author !== login && pr.requestedReviewers.includes(login))
      .sort((a, b) => a.createdAt - b.createdAt),
    ...lists,
    forgotten: own.filter((pr) => pr.lastAt <= forgottenBefore).sort((a, b) => a.lastAt - b.lastAt),
  }
}

// The open drafts of one person among the records, of the kinds asked for, the oldest first: they wait for no one yet,
// so openPullRequests() leaves them out.
/**
 * @param {PullRequestRecord[]} records
 * @param {string} login
 * @param {{ kinds?: PullRequestKind[] }} [options]
 */
export function ownDrafts(records, login, { kinds = ['code'] } = {}) {
  return records
    .filter((pr) => pr.author === login && !pr.bot && kinds.includes(pr.kind) && pr.mergedAt === null && !pr.closed && pr.draft)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(({ repo, number, author, kind, createdAt }) => ({ repo, number, author, kind, createdAt }))
}
