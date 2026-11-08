// Équipe: a card per person, and the people who left.

import { dateFormat } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { SHOWN_BADGES } from '../model/badges.js'
import { activities, displayName, isFormer } from '../model/people.js'
import { personAcs } from '../model/acs.js'
import { personProjects } from '../model/projects.js'
import { matchesQuery } from '../model/selection.js'
import { inSquad } from '../model/squads.js'
import { state } from '../model/state.js'
import { teamRows } from '../model/team.js'
import { badgeRow } from '../ui/badges.js'
import { statList } from '../ui/dialogs/card-dialog.js'
import { openPersonDialog, TEAM_STATS } from '../ui/dialogs/person-dialog.js'
import { $, el } from '../ui/dom.js'
import { avatarUrl, personLink } from '../ui/links.js'
import { STAGGER_SPREAD_MS, STAGGERED_ROWS } from '../ui/motion.js'
import { seniorityText, squadTags, stackLine } from '../ui/people.js'
import { projectLine } from '../ui/projects.js'
import { workLine } from '../ui/work-line.js'

const nameLines = (name, login) => [
  el('strong', { textContent: name, title: name }),
  // The login is only worth showing when the display name differs from it.
  ...(name === login ? [] : [el('span', { textContent: login })]),
]

function personCard(row, index) {
  const name = displayName(row.login)
  // The whole card opens the person's details: the button of its head stretches over it.
  const open = el(
    'button',
    { type: 'button', className: 'person-card-head' },
    el('img', { className: 'person-card-avatar', src: avatarUrl(row.login, 112), alt: '', loading: 'lazy', width: 56, height: 56 }),
    el('span', { className: 'person-card-name' }, ...nameLines(name, row.login), ...seniorityText('span', 'person-seniority', row.login)),
  )
  open.setAttribute('aria-haspopup', 'dialog')
  open.addEventListener('click', () => openPersonDialog(row, open))
  const badges = badgeRow(row.login, 'person-badges', 'small', SHOWN_BADGES)
  // Above the button of the card for their hover, the badges still open the dialog.
  badges[0]?.addEventListener('click', () => open.click())
  const card = el(
    'article',
    { className: 'person-card' },
    open,
    stackLine(row.stack),
    ...squadTags(row.login),
    ...badges,
    ...projectLine(personProjects(row.login)),
    ...workLine({ acs: personAcs(row.login).delivered, hotfixes: row.hotfixes }),
    statList(TEAM_STATS, row),
  )
  card.setAttribute('aria-label', name)
  card.style.setProperty('--delay', `${Math.round((Math.min(index, STAGGERED_ROWS) / STAGGERED_ROWS) * STAGGER_SPREAD_MS)}ms`)

  return card
}

// The people who left the team, the latest to leave first, whatever the period: when they were last active, and nothing
// else.
function renderFormer() {
  const former = [...activities()]
    .filter(([login]) => isFormer(login) && matchesQuery(login, displayName(login)))
    .sort((a, b) => b[1].last - a[1].last)
  $('[data-team-former-card]').hidden = former.length === 0
  $('[data-team-former]').replaceChildren(
    ...former.map(([login, { last }]) =>
      el(
        'li',
        {},
        personLink(login),
        el('span', { className: 'former-last', textContent: t('dernière activité le {date}', { date: dateFormat.format(last * 60_000) }) }),
      ),
    ),
  )
}

export function renderTeam() {
  renderFormer()
  // With a squad, the cards of its members only: the reviewers of its pull requests from elsewhere have theirs without it.
  const rows = teamRows().filter((row) => inSquad(row.login) && matchesQuery(row.login, displayName(row.login)))
  const container = $('[data-team]')
  if (rows.length === 0) {
    const filtered = state.query || state.repos.team
    container.replaceChildren(
      el('p', { className: 'feed-empty', textContent: filtered ? t('Personne ne correspond à ces filtres') : t('Personne sur la période') }),
    )

    return
  }
  container.replaceChildren(...rows.map(personCard))
}
