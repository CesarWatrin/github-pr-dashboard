// The figures of each squad and of the whole organization over the period, and how the ranking reads them.

import { isMissing, median } from '../../domain/math.js'
import { openPullRequests } from '../../domain/open-pull-requests.js'
import { formatDecimal, formatDuration, formatLines, formatNumber, formatShare } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { isCurrent, mePeople } from '../../model/people.js'
import { squadProjects } from '../../model/projects.js'
import { requiredApprovals } from '../../model/pull-requests.js'
import { periodRange } from '../../model/selection.js'
import { squadPeriod, squadRecords, squadsOf } from '../../model/squads.js'
import { state } from '../../model/state.js'

// The figures of a squad over the period: those of the pull requests its members opened (squadRecords()), and what its
// members did on any pull request of the organization, reviews and comments. perMember: a volume, divided by the number
// of members when the ranking compares squads per person; better: the way that ranks a squad first.
export const SQUAD_FIGURES = {
  members: { key: 'members', label: t('Membres'), hint: t('Personnes de la squad, parties comprises.') },
  code: { key: 'code', label: t('PR de code'), perMember: true, better: 'up', hint: t('PR de code ouvertes sur la période par les membres.') },
  merged: { key: 'merged', label: t('Mergées'), perMember: true, better: 'up', hint: t('Parmi ces PR, celles qui ont été mergées.') },
  reviews: {
    key: 'reviews',
    label: t('Relectures'),
    perMember: true,
    better: 'up',
    hint: t('PR relues par les membres, dans toute l’organisation : une par personne et par PR, review ou commentaire.'),
  },
  comments: {
    key: 'comments',
    label: t('Commentaires'),
    perMember: true,
    better: 'up',
    hint: t('Commentaires et reviews « commentaire » des membres, sur toutes les PR de l’organisation.'),
  },
  lines: { key: 'lines', label: t('Lignes'), perMember: true, format: formatLines, hint: t('Lignes ajoutées et supprimées par les PR mergées de la squad.') },
  // The ranking shows them one above the other, in green and red, as the other tables: sorted on the lines added.
  added: {
    key: 'added',
    label: t('Lignes'),
    chartLabel: t('Lignes ajoutées'),
    perMember: true,
    format: formatLines,
    hint: t('Lignes ajoutées (+) et supprimées (−) par les PR mergées de la squad, au total, arrondies (k : milliers, M : millions). Le tri suit les lignes ajoutées.'),
  },
  medianTimeToFirstReviewHours: {
    key: 'medianTimeToFirstReviewHours',
    label: t('1re review'),
    format: formatDuration,
    better: 'down',
    hint: t('Médiane, de la création d’une PR de la squad à la première review ou au premier commentaire d’une autre personne.'),
  },
  medianTimeToMergeHours: { key: 'medianTimeToMergeHours', label: t('Merge en'), format: formatDuration, better: 'down', hint: t('Médiane, de la création au merge.') },
  medianLeadTimeHours: {
    key: 'medianLeadTimeHours',
    label: t('Jusqu’en prod'),
    format: formatDuration,
    better: 'down',
    hint: t('Médiane, de la création d’une PR de la squad à son arrivée en production.'),
  },
  unreviewedRate: {
    key: 'unreviewedRate',
    label: t('Sans review'),
    format: formatShare,
    better: 'down',
    hint: t('Part des PR mergées sans review ni commentaire d’une autre personne que l’auteur.'),
  },
  insideReviewRate: {
    key: 'insideReviewRate',
    label: t('Relu en interne'),
    format: formatShare,
    hint: t('Part des relectures des PR de la squad faites par ses membres ; le reste vient d’autres personnes.'),
  },
  commentsPerPr: { key: 'commentsPerPr', label: t('Comm. / PR'), format: formatDecimal, hint: t('Commentaires et reviews « commentaire », par PR relue.') },
  hotfixShare: { key: 'hotfixShare', label: t('Hotfix'), format: formatShare, better: 'down', hint: t('Part des PR de code ouvertes depuis une branche hotfix.') },
  reworkRate: {
    key: 'reworkRate',
    label: t('Reprise'),
    format: formatShare,
    better: 'down',
    hint: t('Part des mises en production de la squad suivies d’un correctif.'),
  },
  projects: {
    key: 'projects',
    label: t('Projets'),
    value: (row) => row.projects.length,
    hint: t('Projets sur lesquels les membres ont ouvert des PR de code sur la période.'),
  },
  projectShare: {
    key: 'projectShare',
    label: t('Part projets'),
    format: formatShare,
    hint: t('Part des PR de code de la squad ouvertes sur des projets.'),
  },
  open: {
    key: 'open',
    label: t('En attente'),
    perMember: true,
    better: 'down',
    hint: t('PR de code des membres encore ouvertes à la dernière synchro, hors brouillons.'),
  },
}
export const squadFigures = (...keys) => keys.map((key) => SQUAD_FIGURES[key])

const repoTotal = (rows, field) => rows.reduce((total, row) => total + Object.values(row.repos).reduce((sum, stats) => sum + stats[field], 0), 0)
const byRepoTotal = (rows, field) =>
  rows
    .map((row) => [row.login, Object.values(row.repos).reduce((sum, stats) => sum + stats[field], 0)])
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))

// One squad over the period, or the whole organization ('*', without members): its figures (SQUAD_FIGURES), its members
// by pull requests merged, who reads its code, its repositories, and the projects its members wrote code for.
function squadRow(name, members, range, organization) {
  const records = members ? squadRecords({ name, members }) : state.stats.pullRequests
  const period = name === '*' ? organization : squadPeriod(name, records, range)
  const inside = members ? new Set(members) : null
  const own = (rows) => (inside ? rows.filter((row) => inside.has(row.login)) : rows)
  const readers = byRepoTotal(period.reviewers.filter((row) => isCurrent(row.login)), 'prs')
  const read = readers.reduce((total, [, prs]) => total + prs, 0)
  const readInside = inside ? readers.filter(([login]) => inside.has(login)).reduce((total, [, prs]) => total + prs, 0) : read
  const repos = new Map()
  for (const author of period.authors) {
    for (const [repo, stats] of Object.entries(author.repos)) {
      repos.set(repo, (repos.get(repo) ?? 0) + stats.code)
    }
  }
  const writers = new Map(byRepoTotal(period.authors, 'merged'))
  const code = repoTotal(period.authors, 'code')
  const projects = members ? squadProjects({ name, members }) : []

  return {
    name,
    members: members ?? [],
    size: members ? members.length : mePeople().length,
    period,
    code,
    merged: period.totals.merged,
    reviews: repoTotal(own(organization.reviewers), 'prs'),
    comments: repoTotal(own(organization.reviewers), 'comments'),
    lines: period.totals.added + period.totals.deleted,
    added: period.totals.added,
    deleted: period.totals.deleted,
    medianTimeToFirstReviewHours: median(period.authors.flatMap((row) => Object.values(row.repos).flatMap((stats) => stats.timesToFirstReviewHours))),
    medianTimeToMergeHours: period.totals.medianTimeToMergeHours,
    medianLeadTimeHours: period.delivery.medianLeadTimeHours,
    unreviewedRate: period.totals.unreviewedShare,
    insideReviewRate: read ? readInside / read : null,
    commentsPerPr: period.totals.commentsPerPr,
    hotfixShare: period.totals.hotfixShare,
    reworkRate: period.delivery.reworkRate,
    open: openPullRequests(records, { requiredApprovals: requiredApprovals() }).filter((pr) => isCurrent(pr.author)).length,
    projects,
    projectShare: members && code ? projects.reduce((total, share) => total + share.code, 0) / code : null,
    writers: (members ?? []).map((login) => [login, writers.get(login) ?? 0]).sort((a, b) => b[1] - a[1]),
    readers,
    repos: [...repos].filter(([, code]) => code > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  }
}

// Every squad over the period, in the order of SQUADS, and the whole organization.
export function squadRows() {
  const range = periodRange()
  const organization = squadPeriod('*', state.stats.pullRequests, range)

  return {
    squads: squadsOf().map((squad) => ({ ...squadRow(squad.name, squad.members, range, organization), lead: squad.lead ?? null })),
    organization: squadRow('*', null, range, organization),
  }
}

// A figure of the ranking: per member when asked, for the volumes.
export function rankingValue(row, figure) {
  const value = row[figure.key === 'members' ? 'size' : figure.key]

  return state.squadPerMember && figure.perMember && !isMissing(value) ? value / row.size : value
}

// Per member, a count reads with a decimal; the lines keep their rounding.
export const rankingFormat = (figure) => (state.squadPerMember && figure.perMember ? (figure.format ?? formatDecimal) : (figure.format ?? formatNumber))

// The squads in the order of the ranking: best first on the figure picked, missing figures last; reversed on demand.
export function rankedSquads(rows) {
  const figure = SQUAD_FIGURES[state.squadSort.key]
  const direction = figure.better === 'down' ? 1 : -1
  const ranked = rows.toSorted((a, b) => {
    const [x, y] = [rankingValue(a, figure), rankingValue(b, figure)]
    if (isMissing(x) || isMissing(y)) {
      return Number(isMissing(x)) - Number(isMissing(y))
    }

    return (x - y) * direction || a.name.localeCompare(b.name)
  })

  return state.squadSort.reversed ? ranked.toReversed() : ranked
}
