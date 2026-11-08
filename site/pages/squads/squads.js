// Squads: the page, drawn when it shows: the cards, then the ranking on the column picked.

import { isMissing } from '../../domain/math.js'
import { capitalize, formatNumber } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { periodTitle } from '../../model/selection.js'
import { squadsOf } from '../../model/squads.js'
import { state } from '../../model/state.js'
import { $, $$, el } from '../../ui/dom.js'
import { OPEN_SQUAD } from '../../ui/links.js'
import { linesCell } from '../../ui/tables/cells.js'
import { openSquadDialog, squadCard } from './cards.js'
import { renderSquadCharts } from './charts.js'
import { rankedSquads, rankingFormat, rankingValue, SQUAD_FIGURES, squadFigures, squadRows } from './figures.js'

// The columns of the ranking, in order.
const SQUAD_RANKING = squadFigures(
  'members',
  'code',
  'merged',
  'reviews',
  'comments',
  'added',
  'medianTimeToFirstReviewHours',
  'medianTimeToMergeHours',
  'medianLeadTimeHours',
  'unreviewedRate',
  'hotfixShare',
  'open',
)
const SQUAD_MEDALS = ['🥇', '🥈', '🥉']

// The ranking: a row per squad, ranked on the column picked (a click on its head, a second one reverses it), the first
// three with a medal and the best of each column marked; the whole organization under them, out of the ranking.
function renderSquadRanking(rows, organization) {
  const ranked = rankedSquads(rows)
  const sorted = SQUAD_FIGURES[state.squadSort.key]
  const best = new Map(
    SQUAD_RANKING.filter((figure) => figure.better).map((figure) => {
      const values = rows.map((row) => rankingValue(row, figure)).filter((value) => !isMissing(value))

      return [figure.key, values.length > 1 ? (figure.better === 'down' ? Math.min(...values) : Math.max(...values)) : null]
    }),
  )
  const head = el(
    'tr',
    {},
    el('th', { scope: 'col', className: 'text squad-rank', textContent: '#' }),
    el('th', { scope: 'col', className: 'text', textContent: t('Squad') }),
    ...SQUAD_RANKING.map((figure) => {
      const descending = (figure.better !== 'down') !== state.squadSort.reversed
      const button = el(
        'button',
        { type: 'button', title: figure.hint },
        document.createTextNode(figure.label),
        el('span', { className: 'sort-icon', textContent: figure === sorted ? (descending ? '↓' : '↑') : '' }),
      )
      button.addEventListener('click', () => {
        state.squadSort = { key: figure.key, reversed: state.squadSort.key === figure.key && !state.squadSort.reversed }
        renderSquads()
      })
      const cell = el('th', { scope: 'col' }, button)
      if (figure === sorted) {
        cell.setAttribute('aria-sort', descending ? 'descending' : 'ascending')
      }

      return cell
    }),
  )
  const cells = (row, ranked) =>
    SQUAD_RANKING.map((figure) => {
      if (figure.key === 'added') {
        const size = state.squadPerMember ? row.size : 1

        return linesCell({ added: row.added / size, deleted: row.deleted / size })
      }
      const value = rankingValue(row, figure)
      const format = figure.key === 'members' ? formatNumber : rankingFormat(figure)
      const isBest = ranked && !isMissing(value) && best.get(figure.key) === value

      return el('td', { className: isBest ? 'is-best' : '', textContent: format(value) })
    })
  const body = ranked.map((row, index) => {
    const medal = !state.squadSort.reversed && !isMissing(rankingValue(row, sorted)) ? (SQUAD_MEDALS[index] ?? '') : ''
    const pick = el('button', { type: 'button', className: 'squad-pick', textContent: row.name })
    pick.setAttribute('aria-haspopup', 'dialog')
    pick.addEventListener('click', () => openSquadDialog(row, rows, pick))

    return el(
      'tr',
      { className: row.name === state.squad ? 'is-selected' : '' },
      el('td', { className: 'text squad-rank', textContent: medal || formatNumber(index + 1) }),
      el('th', { scope: 'row', className: 'text' }, pick),
      ...cells(row, true),
    )
  })
  const total = el(
    'tr',
    { className: 'squad-total' },
    el('td', { className: 'text squad-rank' }),
    el('th', { scope: 'row', className: 'text', textContent: t('Toute l’organisation') }),
    ...cells(organization, false),
  )
  $('[data-squads-ranking]').replaceChildren(el('table', { className: 'squad-ranking' }, el('thead', {}, head), el('tbody', {}, ...body, total)))
  for (const button of $$('[data-squad-measure]')) {
    button.setAttribute('aria-checked', String((button.dataset.squadMeasure === 'member') === state.squadPerMember))
  }
}

export function renderSquads() {
  const any = squadsOf().length > 0
  $('[data-squads-empty]').hidden = any
  $('[data-squads-content]').hidden = !any
  if (!any || $('[data-route="squads"]').hidden) {
    return
  }
  const { squads, organization } = squadRows()
  $('[data-squads]').replaceChildren(...squads.map((row, index) => squadCard(row, index, squads)))
  $('[data-squads-ranking-sub]').textContent = t('{period}, {measure}. Un clic sur une colonne classe les squads sur elle, un second inverse le classement.', {
    period: capitalize(periodTitle()),
    measure: t(state.squadPerMember ? 'les volumes divisés par le nombre de membres de chaque squad' : 'en totaux'),
  })
  renderSquadRanking(squads, organization)
  renderSquadCharts({ squads, organization })
}

// Listens to « Total / Par personne » of the ranking, and to a squad named elsewhere (the address of the page) to open.
export function setupSquads() {
  document.addEventListener(OPEN_SQUAD, (event) => {
    const { squads } = squadRows()
    const row = squads.find((other) => other.name === /** @type {CustomEvent} */ (event).detail)
    if (row) {
      openSquadDialog(row, squads, event.target)
    }
  })
  for (const button of $$('[data-squad-measure]')) {
    button.addEventListener('click', () => {
      state.squadPerMember = button.dataset.squadMeasure === 'member'
      renderSquads()
    })
  }
}
