// The card of a project and its dialog: its life, who took part, its figures, each in the dialog over the median of the
// projects of the period.

import { formatLines, formatNumber, formatSpan, plural } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { isCurrent } from '../../model/people.js'
import { projectOf } from '../../model/projects.js'
import { periodTitle } from '../../model/selection.js'
import { state } from '../../model/state.js'
import { dialogSection, showCardDialog, statList, topList } from '../../ui/dialogs/card-dialog.js'
import { el } from '../../ui/dom.js'
import { githubPill, OPEN_PROJECT, personLink, pullRequestLink, repoLink } from '../../ui/links.js'
import { STAGGER_SPREAD_MS, STAGGERED_ROWS } from '../../ui/motion.js'
import { avatarStack } from '../../ui/people.js'
import { repoFilterLabel, repoOptions } from '../../ui/repo-filter.js'
import { formatDay, PROJECT_STATUSES, projectLabel, projectMergeLink, projectMergeOf, statusTag } from '../../ui/projects.js'
import { namesakesText, projectFigures } from './figures.js'

const PROJECT_CARD_STATS = projectFigures('code', 'merged', 'lines', 'reviewers', 'medianTimeToMergeHours', 'perWeek')
const PROJECT_LIFE = projectFigures('start', 'lastMerge', 'lastActivity', 'days', 'integrationHours')
const PROJECT_CODE = projectFigures('code', 'merged', 'open', 'added', 'deleted', 'medianTimeToMergeHours', 'perWeek')
const PROJECT_PEOPLE = projectFigures('people', 'teamShare', 'reviewers')
// The avatars a card shows, the last one a « +N » beyond.
const CARD_AVATARS = 8

// From its start to its end, and how long: « Du 3 mars 2026 au 5 mai 2026 · 9 semaines ».
const datesText = (row) => `${t('Du {start} au {end}', { start: formatDay(row.start), end: formatDay(row.end) })} · ${formatSpan(row.days)}`

// The repositories of a project, each opening its own dialog, with the pull request that merges the branch of the
// project there, on GitHub, in the color of its state.
const repoLinks = (row) =>
  el('p', { className: 'project-repos' }, ...row.repos.map(([repo]) => el('span', { className: 'project-repo' }, repoLink(repo), projectMergeLink(row, repo))))

// The same in the dialog: a GitHub pill per repository, in the color of the state of its merge.
function mergePill(row, repo) {
  const { path, state, title } = projectMergeOf(row, repo)
  const pill = githubPill(path, repo)
  pill.classList.add(`is-${state}`)
  pill.title = title

  return pill
}

export function projectCard(row, index, rows) {
  const label = projectLabel(row)
  // The whole card opens the project's dialog: the button of its head stretches over it.
  const open = el(
    'button',
    { type: 'button', className: 'repo-card-head project-card-head' },
    el('strong', { className: 'repo-card-name', textContent: label, title: label }),
    statusTag(row.status),
  )
  open.setAttribute('aria-haspopup', 'dialog')
  open.addEventListener('click', () => openProjectDialog(row, rows, open))
  const card = el(
    'article',
    { className: 'repo-card project-card' },
    open,
    el('p', { className: 'project-dates', textContent: datesText(row) }),
    avatarStack(row.authors.map((author) => author.login), { max: CARD_AVATARS }),
    repoLinks(row),
    statList(PROJECT_CARD_STATS, row),
  )
  card.setAttribute('aria-label', label)
  card.style.setProperty('--delay', `${Math.round((Math.min(index, STAGGERED_ROWS) / STAGGERED_ROWS) * STAGGER_SPREAD_MS)}ms`)

  return card
}

// A list of the dialog: each item a name that opens its own dialog, and what it did; else what says why it is empty.
function detailList(title, items, empty = '–') {
  const list = items.length
    ? el('ul', { className: 'person-dialog-list' }, ...items.map(([name, detail]) => el('li', {}, name, el('span', { className: 'pair-count', textContent: detail }))))
    : el('p', { className: 'muted', textContent: empty })

  return el('div', {}, el('p', { className: 'person-dialog-list-title', textContent: title }), list)
}

// When the branch of the project was merged into a long-lived branch, the latest first, each with its pull request.
const mergeList = (row) =>
  detailList(
    t('Ses merges dans une branche principale'),
    row.merges.toReversed().map((merge) => [pullRequestLink(merge.repo, merge.number), formatDay(merge.at)]),
    row.mergeOpen ? t('Une PR de merge est ouverte') : t('Pas encore mergée'),
  )

// The dialog of a project, like those of a person, a repository or a squad: its life, and the other projects of its
// name, then its figures, each set against the median of the projects of the period, then who wrote and reviewed it,
// where, and when its branch was merged. Opened from another page (projectLink()), it counts every repository; for a
// project the period misses, the whole data (whole).
export function openProjectDialog(row, rows, opener, { fromPage = true, whole = false } = {}) {
  const peers = rows.filter((other) => other.code > 0)
  const writers = row.authors.filter((author) => isCurrent(author.login))
  const readers = row.reviewers.filter((reviewer) => isCurrent(reviewer.login))
  const label = projectLabel(row)
  const namesakes = namesakesText(row)
  const scope = whole
    ? t('Toutes les données synchronisées')
    : fromPage && state.repos.projects
      ? `${periodTitle()} · ${repoFilterLabel('projects', repoOptions('projects'))}`
      : periodTitle()

  showCardDialog(
    [
      el(
        'header',
        { className: 'person-dialog-head' },
        el(
          'div',
          { className: 'person-dialog-identity' },
          el('div', { className: 'person-dialog-title' }, el('h2', { id: 'person-dialog-name', textContent: label, title: label }), statusTag(row.status)),
          el('p', { className: 'person-dialog-meta', textContent: `${datesText(row)} · ${PROJECT_STATUSES[row.status].hint}` }),
          ...(namesakes ? [el('p', { className: 'person-dialog-meta project-namesakes', textContent: namesakes })] : []),
          // The pull request that merges the branch of the project in each of its repositories, on GitHub.
          el('p', { className: 'project-branches' }, ...row.repos.map(([repo]) => mergePill(row, repo))),
          avatarStack(row.authors.map((author) => author.login), { size: 36 }),
        ),
      ),
      el('p', {
        className: 'person-dialog-scope',
        textContent: t('{scope} · sous chaque chiffre, la médiane (méd.) des {count} {people}', {
          scope,
          count: formatNumber(peers.length),
          people: t('projets'),
        }),
      }),
      dialogSection(t('Sa vie'), statList(PROJECT_LIFE, row)),
      dialogSection(t('Son code, sur la période'), statList(PROJECT_CODE, row, peers)),
      dialogSection(t('Ses personnes'), statList(PROJECT_PEOPLE, row, peers)),
      dialogSection(
        t('Qui, et où'),
        el(
          'div',
          { className: 'person-dialog-columns is-pair' },
          detailList(
            t('Ses auteurs, PR de code et lignes'),
            writers.map((author) => [
              personLink(author.login),
              `${plural(author.code, 'PR', 'PR')} · +${formatLines(author.added)} −${formatLines(author.deleted)}`,
            ]),
          ),
          detailList(
            t('Ses relecteurs, PR relues'),
            readers.map((reviewer) => [personLink(reviewer.login), `${plural(reviewer.prs, 'PR', 'PR')} · ${plural(reviewer.comments, 'commentaire')}`]),
          ),
          topList(t('Ses dépôts, PR de code'), row.repos, false),
          mergeList(row),
        ),
      ),
    ],
    opener,
  )
}

// A project named on another page (projectLink() of ui/projects.js) opens its dialog, in place of the one shown if any.
export function setupProjectDialog() {
  document.addEventListener(OPEN_PROJECT, (event) => {
    const found = projectOf(/** @type {CustomEvent} */ (event).detail)
    if (found) {
      openProjectDialog(found.row, found.rows, event.target, { fromPage: false, whole: found.whole })
    }
  })
}
