// À débloquer: the open pull requests waiting for someone, and those merged without approval.

import { openPullRequests } from '../domain/open-pull-requests.js'
import { DAY_MS, WORK_DAY_HOURS, workHoursBetween } from '../domain/time.js'
import { formatNumber } from '../lib/format.js'
import { displayName, isCurrent } from '../model/people.js'
import { pullRequestId, requiredApprovals } from '../model/pull-requests.js'
import { repoInfo } from '../model/repositories.js'
import { matchesQuery } from '../model/selection.js'
import { scopedRecords } from '../model/squads.js'
import { state } from '../model/state.js'
import { $, el } from '../ui/dom.js'
import { personLink, pullRequestLink } from '../ui/links.js'
import { listItem, renderList } from '../ui/list.js'
import { FORGOTTEN, FORGOTTEN_AFTER_DAYS, reviewerName, UNBLOCK_STANCES } from '../ui/stances.js'
import { renderTiles } from '../ui/tiles.js'

// Pull requests their author merged without approval: over a fixed month, like the activity feed over a week, on the
// main repositories, the front, back and mobile ones. Docs, infrastructure and tooling are left out.
const UNAPPROVED_DAYS = 30
const UNAPPROVED_CATEGORIES = ['front', 'back', 'mobile']
// What the pull request got from others before its merge, when it was not an approval.
const UNAPPROVED_TAGS = { none: 'sans review', commented: 'commentée', changes: 'changements demandés' }

const UNBLOCK_TILES = [
  ...[...UNBLOCK_STANCES, FORGOTTEN].map(({ key, label }) => ({ key, label })),
  { key: 'open', label: 'PR de code ouvertes' },
]

// Code pull requests of the main repositories that their author merged over the last month with no approval from
// someone else before, latest first.
function mergedWithoutApproval() {
  const since = (Date.parse(state.stats.generatedAt) - UNAPPROVED_DAYS * DAY_MS) / 60_000

  return scopedRecords()
    .filter((pr) => !pr.bot && pr.kind === 'code' && pr.mergedAt !== null && pr.mergedAt >= since)
    .filter((pr) => pr.mergedBy === pr.author)
    .filter((pr) => UNAPPROVED_CATEGORIES.includes(repoInfo(pr.repo).category))
    .map((pr) => ({ ...pr, before: pr.interventions.filter(([, at]) => at <= pr.mergedAt) }))
    .filter((pr) => !pr.before.some(([, , reviewState]) => reviewState === 'APPROVED'))
    .sort((a, b) => b.mergedAt - a.mergedAt)
}

function unapprovedTag(pr) {
  if (pr.before.length === 0) {
    return UNAPPROVED_TAGS.none
  }

  return pr.before.some(([, , reviewState]) => reviewState === 'CHANGES_REQUESTED')
    ? UNAPPROVED_TAGS.changes
    : UNAPPROVED_TAGS.commented
}

export function renderUnapproved(highlight) {
  const prs = mergedWithoutApproval()
  const previous = state.seenUnapproved
  $('[data-unapproved-title]').textContent = `Mergées par leur auteur sans approbation (${formatNumber(prs.length)})`
  const items = prs
    .filter((pr) => matchesQuery(pr.author, displayName(pr.author), pr.repo))
    .map((pr) => {
      const text = el(
        'p',
        { className: 'feed-text' },
        personLink(pr.author, { withAvatar: false }),
        document.createTextNode(' a mergé sa PR '),
        pullRequestLink(pr.repo, pr.number),
        ...[unapprovedTag(pr), pr.hotfix ? 'hotfix' : null]
          .filter(Boolean)
          .map((tag) => el('span', { className: 'feed-tag', textContent: tag })),
      )
      const item = listItem(pr.author, text, new Date(pr.mergedAt * 60_000).toISOString(), 'mergée ')
      if (highlight && previous && !previous.has(pullRequestId(pr))) {
        item.classList.add('is-new')
      }

      return item
    })

  state.seenUnapproved = new Set(prs.map(pullRequestId))
  renderList($('[data-unapproved]'), items, 'Aucune PR mergée sans approbation')
}

// The open code pull requests of the people of the team, drafts aside, as of the last sync: those that have waited too
// long for someone, by where they stand, the oldest first, those forgotten apart, and how many are open.
function blockedPullRequests() {
  const now = Date.now() / 60_000
  const open = openPullRequests(scopedRecords(), { requiredApprovals: requiredApprovals() }).filter((pr) => isCurrent(pr.author))
  const forgotten = (pr) => now - pr.lastAt >= FORGOTTEN_AFTER_DAYS * 24 * 60
  const recent = open.filter((pr) => !forgotten(pr))

  return {
    open: open.length,
    forgotten: open.filter(forgotten).sort((a, b) => a.lastAt - b.lastAt),
    ...Object.fromEntries(
      UNBLOCK_STANCES.map((stance) => [
        stance.key,
        recent
          .filter((pr) => pr.stance === stance.key && workHoursBetween(pr.since, now) >= stance.afterDays * WORK_DAY_HOURS)
          .sort((a, b) => a.since - b.since),
      ]),
    ),
  }
}

export function renderUnblock(mode) {
  const blocked = blockedPullRequests()
  const required = requiredApprovals()
  renderTiles(
    $('[data-unblock-tiles]'),
    UNBLOCK_TILES,
    Object.fromEntries(UNBLOCK_TILES.map(({ key }) => [key, Array.isArray(blocked[key]) ? blocked[key].length : blocked[key]])),
    mode,
  )
  for (const stance of [...UNBLOCK_STANCES, FORGOTTEN]) {
    const prs = blocked[stance.key]
    $(`[data-unblock-title="${stance.key}"]`).textContent = `${stance.label} (${formatNumber(prs.length)})`
    $(`[data-unblock-sub="${stance.key}"]`).textContent = typeof stance.hint === 'function' ? stance.hint(required) : stance.hint
    const items = prs
      .filter((pr) => matchesQuery(pr.author, displayName(pr.author), pr.repo, ...pr.by.filter(Boolean).flatMap((login) => [login, displayName(login)])))
      .map((pr) => {
        const text = el(
          'p',
          { className: 'feed-text' },
          pullRequestLink(pr.repo, pr.number),
          document.createTextNode(' de '),
          personLink(pr.author, { withAvatar: false }),
        )
        // A forgotten pull request says where it stood; the others are listed by it.
        if (stance === FORGOTTEN) {
          const where = UNBLOCK_STANCES.find((other) => other.key === pr.stance)
          text.append(el('span', { className: 'feed-tag', textContent: where.tag }))
        } else if (pr.by.length) {
          text.append(
            el(
              'span',
              { className: 'feed-by' },
              document.createTextNode(` · ${stance.by} `),
              ...pr.by.flatMap((login, index) => [...(index ? [document.createTextNode(', ')] : []), reviewerName(login)]),
            ),
          )
        }

        const at = stance === FORGOTTEN ? pr.lastAt : pr.since

        return listItem(pr.author, text, new Date(at * 60_000).toISOString(), `${stance.since} `)
      })
    renderList($(`[data-unblock="${stance.key}"]`), items, stance.empty)
  }
}
