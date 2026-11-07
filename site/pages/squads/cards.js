// The card of a squad and its dialog, each figure over the median of the squads.

import { formatNumber, plural } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { displayName, isCurrent } from '../../model/people.js'
import { periodTitle } from '../../model/selection.js'
import { state } from '../../model/state.js'
import { dialogSection, showCardDialog, statList, topList } from '../../ui/dialogs/card-dialog.js'
import { el } from '../../ui/dom.js'
import { avatarUrl, personLink } from '../../ui/links.js'
import { STAGGER_SPREAD_MS, STAGGERED_ROWS } from '../../ui/motion.js'
import { squadFigures } from './figures.js'

const SQUAD_CARD_STATS = squadFigures('code', 'merged', 'reviews', 'medianTimeToFirstReviewHours', 'medianTimeToMergeHours', 'open')
const SQUAD_WRITTEN = squadFigures('code', 'merged', 'lines', 'unreviewedRate', 'hotfixShare')
const SQUAD_REVIEWED = squadFigures('reviews', 'comments', 'commentsPerPr', 'insideReviewRate', 'medianTimeToFirstReviewHours', 'medianTimeToMergeHours')
const SQUAD_DELIVERED = squadFigures('medianLeadTimeHours', 'reworkRate', 'open')

// The readers and repositories listed on a squad's dialog.
const SQUAD_TOP = 5

// The avatars of the members still in the team, overlapping, as on a team photo.
// The head of the squad comes first, ringed.
function squadAvatars(members, size = 28, lead = null) {
  const current = members.filter(isCurrent).sort((a, b) => Number(b === lead) - Number(a === lead))

  return el(
    'span',
    { className: 'squad-avatars', title: current.map(displayName).join(', ') },
    ...current.map((login) =>
      el('img', { className: login === lead ? 'is-lead' : '', src: avatarUrl(login, size * 2), alt: '', loading: 'lazy', width: size, height: size }),
    ),
  )
}

// « Chef de squad », and who, on the card and the dialog of a squad that has one.
const squadLead = (row, className) =>
  row.lead ? [el('p', { className }, el('span', { className: 'squad-lead-label', textContent: t('Chef de squad') }), personLink(row.lead))] : []

const membersText = (count) => plural(count, 'membre')

export function squadCard(row, index, rows) {
  // The whole card opens the squad's dialog: the button of its head stretches over it.
  const open = el(
    'button',
    { type: 'button', className: 'repo-card-head squad-card-head' },
    el('strong', { className: 'repo-card-name', textContent: row.name, title: row.name }),
    el('span', { className: 'squad-card-size', textContent: membersText(row.size) }),
  )
  open.setAttribute('aria-haspopup', 'dialog')
  open.addEventListener('click', () => openSquadDialog(row, rows, open))
  const card = el(
    'article',
    { className: `repo-card squad-card${row.name === state.squad ? ' is-selected' : ''}` },
    open,
    ...squadLead(row, 'squad-lead'),
    squadAvatars(row.members, 28, row.lead),
    statList(SQUAD_CARD_STATS, row),
  )
  card.setAttribute('aria-label', row.name)
  card.style.setProperty('--delay', `${Math.round((Math.min(index, STAGGERED_ROWS) / STAGGERED_ROWS) * STAGGER_SPREAD_MS)}ms`)

  return card
}

// The dialog of a squad, like those of a person or a repository: its figures, each set against the median of the
// squads, then who it is, who reads its code and where it writes.
export function openSquadDialog(row, rows, opener) {
  const peers = rows.filter((other) => other.code > 0)

  showCardDialog(
    [
      el(
        'header',
        { className: 'person-dialog-head' },
        el(
          'div',
          { className: 'person-dialog-identity' },
          el('div', { className: 'person-dialog-title' }, el('h2', { id: 'person-dialog-name', textContent: row.name, title: row.name })),
          el('p', { className: 'person-dialog-meta', textContent: membersText(row.size) }),
          ...squadLead(row, 'squad-lead'),
          squadAvatars(row.members, 36, row.lead),
        ),
      ),
      el('p', {
        className: 'person-dialog-scope',
        textContent: t('{scope} · sous chaque chiffre, la médiane (méd.) des {count} {people}', {
          scope: periodTitle(),
          count: formatNumber(peers.length),
          people: t('squads'),
        }),
      }),
      dialogSection(t('Ce que la squad écrit'), statList(SQUAD_WRITTEN, row, peers)),
      dialogSection(t('La revue'), statList(SQUAD_REVIEWED, row, peers.filter((other) => other.reviews > 0))),
      dialogSection(t('La mise en prod'), statList(SQUAD_DELIVERED, row, peers)),
      dialogSection(
        t('Qui, et où'),
        el(
          'div',
          { className: 'person-dialog-columns' },
          topList(t('Ses membres, PR mergées'), row.writers.filter(([login]) => isCurrent(login)), true),
          topList(t('Son code est relu par'), row.readers.slice(0, SQUAD_TOP), true),
          topList(t('Ses dépôts'), row.repos.slice(0, SQUAD_TOP), false),
        ),
      ),
    ],
    opener,
  )
}
