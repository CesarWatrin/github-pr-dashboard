// Dépôts: a card per repository, and those that rest on a single person.

import { formatNumber, formatShare } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { inTeam, isFormer } from '../model/people.js'
import { repositoryRows } from '../model/repository-rows.js'
import { matchesQuery } from '../model/selection.js'
import { state } from '../model/state.js'
import { statList } from '../ui/dialogs/card-dialog.js'
import { busFactorTag, openRepoDialog, repositoryFigures } from '../ui/dialogs/repository-dialog.js'
import { $, el } from '../ui/dom.js'
import { personLink, repoLink } from '../ui/links.js'
import { STAGGER_SPREAD_MS, STAGGERED_ROWS } from '../ui/motion.js'
import { repoTypeTag, technologyLogos } from '../ui/tables/cells.js'

const REPOSITORY_STATS = repositoryFigures(
  'code',
  'authors',
  'reviewers',
  'medianTimeToFirstReviewHours',
  'medianTimeToMergeHours',
  'unreviewedRate',
  'deployments',
  'medianLeadTimeHours',
  'ciFailureRate',
)

// Fewest code pull requests for a repository to be listed among those that rest on a single person: under it, one
// author is no sign of anything.
const FRAGILE_MIN_PRS = 10
// The people listed on a repository's card, those who wrote the most first.
const REPOSITORY_TOP_AUTHORS = 3

// The share of a repository's code pull requests written by some of its writers.
const writtenShare = (row, writers) => writers.reduce((total, [, code]) => total + code, 0) / row.code

// The mark of someone who left the team, next to their name in the repositories that rest on a single person: when its
// authors left, the one who wrote the most still shows there, their code is still there.
function formerMark(login) {
  return isFormer(login) ? [el('span', { className: 'former-tag is-small', textContent: t('hors équipe'), title: t('Ne fait plus partie de l’équipe') })] : []
}

function repositoryCard(row, index) {
  const writers = row.writers.filter(inTeam).slice(0, REPOSITORY_TOP_AUTHORS)
  const people = writers.length
    ? el(
        'ul',
        {},
        ...writers.map(([login, code]) =>
          el(
            'li',
            {},
            personLink(login),
            el('span', {
              className: 'repo-card-share',
              textContent: formatShare(code / row.code),
              title: t('{count} PR de code sur {total}', { count: formatNumber(code), total: formatNumber(row.code) }),
            }),
          ),
        ),
      )
    : el('p', { className: 'muted', textContent: t('Plus personne de l’équipe') })
  // The whole card opens the repository's dialog: the button of its head stretches over it, under the people.
  const open = el(
    'button',
    { type: 'button', className: 'repo-card-head' },
    el('strong', { className: 'repo-card-name', textContent: row.repo, title: row.repo }),
    repoTypeTag(row.category),
    technologyLogos(row.technologies),
  )
  open.setAttribute('aria-haspopup', 'dialog')
  open.addEventListener('click', () => openRepoDialog(row, open))
  const card = el(
    'article',
    { className: 'repo-card' },
    open,
    el(
      'div',
      { className: 'repo-card-people' },
      el('div', { className: 'repo-card-people-head' }, el('span', { textContent: t('Qui l’écrit') }), ...busFactorTag(row.busFactor)),
      people,
    ),
    statList(REPOSITORY_STATS, row),
  )
  card.setAttribute('aria-label', row.repo)
  card.style.setProperty('--delay', `${Math.round((Math.min(index, STAGGERED_ROWS) / STAGGERED_ROWS) * STAGGER_SPREAD_MS)}ms`)

  return card
}

// The busy repositories that rest on a single person of the team, or on people who left, the busiest first.
function renderFragile(rows) {
  const fragile = rows.filter((row) => row.busFactor <= 1 && row.code >= FRAGILE_MIN_PRS)
  $('[data-repositories-fragile-card]').hidden = fragile.length === 0
  $('[data-repositories-fragile-sub]').textContent =
    t(
      'Au moins {count} PR de code sur la période, dont au moins la moitié écrites par une seule personne de l’équipe, ou plus de la moitié par des personnes parties',
      { count: FRAGILE_MIN_PRS },
    )
  // The person it rests on: the one of the team who wrote the most, or, when its authors left, the one who wrote the most.
  $('[data-repositories-fragile]').replaceChildren(
    ...fragile.map((row) => {
      const team = row.writers.filter(inTeam)
      const [login, code] = row.busFactor === 1 ? team[0] : row.writers[0]
      const share = t('{share} des {count} PR de code', { share: formatShare(code / row.code), count: formatNumber(row.code) })

      return el(
        'li',
        {},
        el('span', { className: 'fragile-repo' }, repoLink(row.repo), repoTypeTag(row.category)),
        el('span', { className: 'fragile-person' }, personLink(login), ...formerMark(login)),
        el('span', {
          className: 'fragile-share',
          textContent: row.busFactor === 1 ? share : t('{share}, l’équipe actuelle {team}', { share, team: formatShare(writtenShare(row, team)) }),
        }),
      )
    }),
  )
}

export function renderRepositories() {
  const rows = repositoryRows().filter((row) => matchesQuery(row.repo, ...row.technologies.map(([name]) => name)))
  renderFragile(rows)
  const container = $('[data-repositories]')
  if (rows.length === 0) {
    const filtered = state.query || state.repos.repositories
    container.replaceChildren(
      el('p', { className: 'feed-empty', textContent: filtered ? t('Aucun dépôt ne correspond à ces filtres') : t('Aucun dépôt sur la période') }),
    )

    return
  }
  container.replaceChildren(...rows.map(repositoryCard))
}
