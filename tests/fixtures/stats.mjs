// Made-up stats shaped like those the sync publishes (scripts/sync/publish.mjs): every person, repository, squad and
// figure here is invented. Drawn from a seeded generator, so that the same `now` always gives the same stats, with
// enough of everything for each page to show all it can: three years of pull requests of every kind, open ones in
// every stance, reviews and comments, deployments, hotfixes, reverts, Dependabot updates, CI runs, squads, a person who
// left and one who just arrived.

import { monthlyActivity } from '../../site/domain/months.js'
import { DAY_MS, parisDay } from '../../site/domain/time.js'

export const ORG = 'example-org'

const PEOPLE = {
  'ada-l': 'Ada Lune',
  'ben-k': 'Ben Kerr',
  'cleo-m': 'Cléo Marin',
  'dev-o': 'Dev Orla',
  'eli-p': 'Éli Prat',
  'fay-r': 'Fay Roux',
  'gus-t': 'Gus Tani',
  'hana-v': 'Hana Vey',
  'ivo-w': 'Ivo Wen',
  'jo-former': 'Jo Ancien',
  'kim-new': 'Kim Neuve',
}
const ACTIVE = ['ada-l', 'ben-k', 'cleo-m', 'dev-o', 'eli-p', 'fay-r', 'gus-t', 'hana-v', 'ivo-w']

const REPOS = {
  'web-shop': { category: 'front', technologies: [['Vue', 0.82], ['TypeScript', 0.15]] },
  'back-office': { category: 'front', technologies: [['React', 0.9]] },
  'core-api': { category: 'back', technologies: [['Laravel', 0.88], ['Shell', 0.05]] },
  'billing': { category: 'back', technologies: [['Go', 1]] },
  'mobile-app': { category: 'mobile', technologies: [['Flutter', 0.95]] },
  'infra': { category: 'other', technologies: [['HCL', 0.7], ['Shell', 0.3]] },
}
// Who works mostly where: a full-stack person, front and back specialists, a mobile one.
const HOMES = {
  'ada-l': ['web-shop', 'core-api'],
  'ben-k': ['core-api', 'billing'],
  'cleo-m': ['web-shop', 'back-office'],
  'dev-o': ['mobile-app'],
  'eli-p': ['core-api'],
  'fay-r': ['back-office', 'web-shop'],
  'gus-t': ['billing', 'infra'],
  'hana-v': ['mobile-app', 'core-api'],
  'ivo-w': ['web-shop'],
  'jo-former': ['billing'],
  'kim-new': ['core-api'],
}
const SQUADS = [
  { name: 'Boutique', members: ['ada-l', 'cleo-m', 'ivo-w', 'fay-r'], lead: 'ada-l' },
  { name: 'Paiement', members: ['ben-k', 'gus-t', 'eli-p'], lead: 'ben-k' },
  { name: 'Mobile', members: ['dev-o', 'hana-v', 'eli-p'] },
]
const WORKFLOWS = ['ci.yml', 'deploy.yml']
const WINDOW_DAYS = 1095
const CI_DAYS = 400
const MINUTE_MS = 60_000

// A small seeded generator (mulberry32): the same seed, the same stats.
function generator(seed) {
  let state = seed >>> 0

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)

    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }

  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (values) => values[Math.floor(next() * values.length)],
    chance: (probability) => next() < probability,
  }
}

const toMinutes = (ms) => Math.round(ms / MINUTE_MS)

// A time of a working day, at least `after`, `hours` of work later or so.
function later(random, after, hours) {
  let time = after + hours * 3_600_000 + random.int(0, 50) * MINUTE_MS
  const day = new Date(time).getUTCDay()
  if (day === 6) {
    time += 2 * DAY_MS
  } else if (day === 0) {
    time += DAY_MS
  }

  return time
}

export function madeUpStats({ now = Date.parse('2026-06-15T10:00:00Z'), seed = 7 } = {}) {
  const random = generator(seed)
  const windowStart = now - WINDOW_DAYS * DAY_MS
  const pullRequests = []
  const numbers = Object.fromEntries(Object.keys(REPOS).map((repo) => [repo, 1]))
  const add = (record) => {
    const pr = { number: numbers[record.repo]++, bot: false, hotfix: false, production: false, closed: false, mergedBy: null, ...record }
    pullRequests.push(pr)

    return pr
  }
  const reviewersOf = (author) => ACTIVE.filter((login) => login !== author)
  const isActive = (login, time) =>
    (login !== 'jo-former' || time < now - 200 * DAY_MS) && (login !== 'kim-new' || time > now - 45 * DAY_MS)

  // Code pull requests, every working day or so, by the people around at the time.
  for (let time = windowStart + DAY_MS; time < now - 2 * DAY_MS; time += random.int(2, 9) * 3_600_000) {
    const author = random.pick(Object.keys(PEOPLE))
    if (!isActive(author, time)) {
      continue
    }
    const repo = random.pick(HOMES[author])
    const hotfix = random.chance(0.06)
    const reviewer = random.pick(reviewersOf(author))
    const firstLook = later(random, time, random.int(1, 30))
    const approval = later(random, firstLook, random.int(0, 20))
    const merged = later(random, approval, random.int(0, 6))
    const lines = random.pick([4, 12, 40, 90, 160, 420, 800, 1600])
    const interventions = [[reviewer, toMinutes(firstLook), random.chance(0.2) ? 'CHANGES_REQUESTED' : 'COMMENTED', random.int(1, 6)]]
    if (random.chance(0.3)) {
      interventions.push([random.pick(reviewersOf(author)), toMinutes(firstLook + 3_600_000), null, 1])
    }
    const unreviewed = random.chance(0.04)
    if (!unreviewed) {
      interventions.push([reviewer, toMinutes(approval), 'APPROVED', 0])
    }
    add({
      repo,
      author,
      kind: 'code',
      hotfix,
      createdAt: toMinutes(time),
      mergedAt: toMinutes(merged),
      lines,
      deleted: Math.round(lines * random.next() * 0.6),
      mergedBy: random.chance(0.8) ? author : reviewer,
      interventions: unreviewed ? [] : interventions,
      deployedAt: toMinutes(hotfix ? merged : later(random, merged, random.int(2, 60))),
      ...(random.chance(0.05) && { checksFailed: true }),
      ...(now - merged < 30 * DAY_MS && { title: `Amélioration ${numbers[repo]} de ${repo}`, checks: 'SUCCESS' }),
    })
  }

  // Releases into main every week or so per repository, sometimes reverted; integrations back into develop.
  for (const repo of Object.keys(REPOS)) {
    for (let time = windowStart + DAY_MS * random.int(1, 6); time < now - DAY_MS; time += random.int(4, 10) * DAY_MS) {
      const author = random.pick(ACTIVE)
      const merged = later(random, time, random.int(1, 8))
      add({
        repo,
        author,
        kind: 'release',
        production: true,
        deployment: true,
        createdAt: toMinutes(time),
        mergedAt: toMinutes(merged),
        lines: random.int(50, 3000),
        mergedBy: author,
        interventions: [[random.pick(reviewersOf(author)), toMinutes(later(random, time, 1)), 'APPROVED', 0]],
      })
      if (random.chance(0.05)) {
        add({
          repo,
          author,
          kind: 'code',
          hotfix: false,
          production: false,
          deployment: true,
          revert: true,
          createdAt: toMinutes(merged + 3_600_000),
          mergedAt: toMinutes(merged + 2 * 3_600_000),
          lines: 30,
          deleted: 20,
          mergedBy: author,
          interventions: [],
          deployedAt: toMinutes(merged + 2 * 3_600_000),
        })
      }
      if (random.chance(0.3)) {
        add({
          repo,
          author,
          kind: 'integration',
          createdAt: toMinutes(merged + DAY_MS),
          mergedAt: toMinutes(merged + DAY_MS + 3_600_000),
          lines: 10,
          mergedBy: author,
          interventions: [],
        })
      }
    }
  }

  // Dependabot updates, merged or left open.
  for (let time = windowStart + 10 * DAY_MS; time < now - DAY_MS; time += random.int(5, 15) * DAY_MS) {
    const repo = random.pick(['web-shop', 'core-api', 'mobile-app'])
    const merged = random.chance(0.7) ? toMinutes(later(random, time, random.int(2, 80))) : null
    add({
      repo,
      author: 'dependabot',
      bot: true,
      kind: 'code',
      createdAt: toMinutes(time),
      mergedAt: merged,
      closed: !merged && time < now - 60 * DAY_MS,
      lines: 6,
      interventions: [],
      dependency: { 'web-shop': 'npm_and_yarn', 'core-api': 'composer', 'mobile-app': 'pub' }[repo],
    })
  }

  // Open pull requests in every stance: waiting for a first look, discussed, changes asked, approved, blocked by code
  // owners, a draft, one forgotten for weeks; some ask for reviews, and one is a release.
  const open = (author, daysAgo, fields) =>
    add({
      repo: HOMES[author][0],
      author,
      kind: 'code',
      createdAt: toMinutes(now - daysAgo * DAY_MS),
      mergedAt: null,
      lines: 120,
      interventions: [],
      title: `Travail en cours de ${PEOPLE[author]}`,
      checks: 'SUCCESS',
      ...fields,
    })
  const ago = (days) => toMinutes(now - days * DAY_MS)
  open('ada-l', 6, { requestedReviewers: ['ben-k', 'cleo-m'], checks: 'PENDING' })
  open('ben-k', 9, { interventions: [['cleo-m', ago(8), 'COMMENTED', 2]], requestedReviewers: ['ada-l'] })
  open('cleo-m', 12, { interventions: [['ada-l', ago(10), 'CHANGES_REQUESTED', 4]], checks: 'FAILURE' })
  open('dev-o', 4, { interventions: [['hana-v', ago(3), 'APPROVED', 0]] })
  open('eli-p', 8, { codeOwners: ['ben-k', '@example-org/back'], requestedReviewers: ['ben-k'] })
  open('fay-r', 3, { draft: true, checks: null })
  open('gus-t', 40, { checks: 'ERROR' })
  open('hana-v', 2, { kind: 'release', requestedReviewers: ['ada-l'] })
  open('ivo-w', 1, { requestedReviewers: ['ada-l', 'dev-o'], checks: 'EXPECTED' })
  open('kim-new', 5, { interventions: [['eli-p', ago(4), 'COMMENTED', 1]] })
  // Merged without approval, recently, on a main repository.
  add({
    repo: 'web-shop',
    author: 'ivo-w',
    kind: 'code',
    createdAt: ago(5),
    mergedAt: ago(4),
    lines: 60,
    deleted: 10,
    mergedBy: 'ivo-w',
    interventions: [['cleo-m', ago(4.5), 'COMMENTED', 1]],
    deployedAt: ago(3),
    title: 'Correction rapide',
    checks: 'SUCCESS',
  })
  pullRequests.sort((a, b) => a.createdAt - b.createdAt)

  // CI runs per workflow and Paris day, since the snapshot kept them.
  const ciStart = now - CI_DAYS * DAY_MS
  const ci = []
  for (const repo of Object.keys(REPOS)) {
    for (const workflow of WORKFLOWS) {
      const days = {}
      for (let time = ciStart; time < now; time += DAY_MS) {
        if (random.chance(0.35)) {
          continue
        }
        const runs = random.int(1, 6)
        days[parisDay(time)] = [
          runs,
          random.chance(0.15) ? random.int(1, runs) : 0,
          random.chance(0.1) ? 1 : 0,
          Array.from({ length: runs }, () => random.int(40, workflow === 'deploy.yml' ? 900 : 400)),
        ]
      }
      ci.push({ repo, workflow, days })
    }
  }

  // The monthly history, as the sync keeps it: the whole months of the data, each person's figures.
  const activity = monthlyActivity(pullRequests)
  const months = [...new Set([...activity.values()].flatMap((perMonth) => [...perMonth.keys()]))].sort()
  const currentMonth = parisDay(now).slice(0, 7)
  const monthly = Object.fromEntries(
    months
      .filter((month) => month < currentMonth && month > parisDay(windowStart).slice(0, 7))
      .map((month) => [
        month,
        Object.fromEntries(
          [...activity]
            .filter(([, perMonth]) => perMonth.has(month))
            .map(([login, perMonth]) => [login, perMonth.get(month)])
            .sort(([a], [b]) => a.localeCompare(b)),
        ),
      ]),
  )

  // The feed of the last week, newest first.
  const events = []
  for (const pr of pullRequests.filter((record) => !record.bot)) {
    const push = (type, at, actor) => {
      if (at && at * MINUTE_MS >= now - 7 * DAY_MS && at * MINUTE_MS <= now) {
        events.push({ type, at: new Date(at * MINUTE_MS).toISOString(), actor, author: pr.author, repo: pr.repo, number: pr.number })
      }
    }
    push('opened', pr.createdAt, pr.author)
    push('merged', pr.mergedAt, pr.mergedBy ?? pr.author)
    for (const [login, at, state] of pr.interventions) {
      push({ APPROVED: 'approved', CHANGES_REQUESTED: 'changes_requested' }[state] ?? 'commented', at, login)
    }
  }
  events.sort((a, b) => b.at.localeCompare(a.at))

  const generatedAt = new Date(now).toISOString()

  return {
    org: ORG,
    build: null,
    generatedAt,
    timezone: 'Europe/Paris',
    syncTrigger: { repository: 'example-owner/example-dashboard', workflow: 'deploy.yml', ref: 'main', token: 'made-up-token' },
    requiredApprovals: 1,
    squads: SQUADS,
    people: PEOPLE,
    repos: REPOS,
    today: { date: parisDay(now), opened: 2, merged: 1, reviews: 3 },
    windowStart: new Date(windowStart).toISOString(),
    pullRequests,
    firstPullRequests: Object.fromEntries(
      Object.keys(PEOPLE).map((login) => [login, Math.min(...pullRequests.filter((pr) => pr.author === login).map((pr) => pr.createdAt))]),
    ),
    monthly,
    monthlyRevision: 3,
    ci,
    ciStart: new Date(ciStart).toISOString(),
    events: events.slice(0, 50),
  }
}
