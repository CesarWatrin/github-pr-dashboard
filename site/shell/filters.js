// The filters: period (presets or picked days), comparison, squad and search.

import { overlapsPeriod, sameDays } from '../domain/comparison.js'
import { parisDay } from '../domain/time.js'
import { dayDate } from '../lib/dates.js'
import { dateFormat, rangeShortFormat } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { COMPARISONS, CUSTOM_PERIOD, NO_COMPARISON, NO_COMPARISON_LABEL } from '../model/periods.js'
import { comparedRange, dateBounds, periodAvailable, periodRange } from '../model/selection.js'
import { squadsOf } from '../model/squads.js'
import { state, storePeriod, storeSquad } from '../model/state.js'
import { renderCollaboration } from '../pages/collaboration.js'
import { renderCycleTiles } from '../pages/cycle.js'
import { renderDevopsTiles } from '../pages/devops.js'
import { renderFeed, renderTotals } from '../pages/overview/overview.js'
import { renderProjects } from '../pages/projects/projects.js'
import { renderRepositories } from '../pages/repositories.js'
import { renderTeam } from '../pages/team.js'
import { renderTmaTiles } from '../pages/tma.js'
import { renderUnapproved, renderUnblock } from '../pages/unblock.js'
import { $, $$ } from '../ui/dom.js'
import { playEntrance } from '../ui/motion.js'
import { renderTables } from '../ui/tables/table.js'

// The squad picker of the filters, with the squads of the stats; hidden without any, as is the squads page's link. A
// squad no longer in the stats is forgotten.
export function renderSquadFilter() {
  const squads = squadsOf()
  if (state.squad && !squads.some((squad) => squad.name === state.squad)) {
    state.squad = ''
    storeSquad()
  }
  const picker = $('[data-squad-filter]', HTMLSelectElement)
  picker.replaceChildren(new Option(t('Toutes les squads'), ''), ...squads.map((squad) => new Option(squad.name, squad.name)))
  picker.value = state.squad
  picker.hidden = squads.length === 0
  picker.classList.toggle('is-active', Boolean(state.squad))
  $('[data-route-link="squads"]').hidden = squads.length === 0
}

// A comparison the synced data does not cover for the period shown is marked so, and cannot be picked. The same period
// last year is left out when it is the period before, as for 12 months, or when it takes back part of the period, as
// for 24 months. Picking a period changes the comparison picked accordingly: to the period before when last year is
// the same, to none when the data no longer covers it (36 months) or when it is left out. Called before the tiles are
// drawn. Under the picker, the days compared to.
function renderComparePicker() {
  const picker = $('[data-compare]', HTMLSelectElement)
  const sameAsBefore = state.stats !== null && sameDays(comparedRange('previous'), comparedRange('year'))
  const offered = (mode) =>
    state.stats === null || (!(sameAsBefore && mode === 'year') && !overlapsPeriod(periodRange(), comparedRange(mode)))
  const compare = sameAsBefore && state.compare === 'year' ? 'previous' : state.compare
  const shown =
    state.stats && compare !== NO_COMPARISON && (!offered(compare) || comparedRange(compare) === null) ? NO_COMPARISON : compare
  if (shown !== state.compare) {
    state.compare = shown
    storePeriod()
  }
  const modes = Object.keys(COMPARISONS).filter(offered)
  picker.replaceChildren(
    new Option(NO_COMPARISON_LABEL, NO_COMPARISON),
    ...modes.map((mode) => {
      const option = new Option(COMPARISONS[mode], mode)
      if (state.stats && comparedRange(mode) === null) {
        option.disabled = true
        option.textContent = t('{comparison} (hors données)', { comparison: COMPARISONS[mode] })
        option.title = t('Les données synchronisées ne remontent pas jusque-là pour cette période.')
      }

      return option
    }),
  )
  picker.value = state.compare
  const range = state.stats && state.compare !== NO_COMPARISON ? comparedRange() : null
  const note = $('[data-compare-note]')
  note.hidden = range === null
  if (range) {
    note.textContent = t('Comparé au {range}', {
      range: rangeShortFormat.formatRange(dayDate(parisDay(range.start)), dayDate(parisDay(range.end - 1))),
    })
  }
}

// The two days of the date picker.
function dateFields() {
  const { elements } = $('[data-date-range-form]', HTMLFormElement)

  return {
    from: /** @type {HTMLInputElement} */ (elements.namedItem('from')),
    to: /** @type {HTMLInputElement} */ (elements.namedItem('to')),
  }
}

export function renderPeriodSelector() {
  renderComparePicker()
  for (const button of $$('[data-period]')) {
    button.setAttribute('aria-checked', String(button.dataset.period === state.period))
  }
  // Also shown before the stats arrive: the stored days are only checked against the synced data once they do.
  const custom = state.period === CUSTOM_PERIOD && state.range !== null
  $('[data-date-range]').classList.toggle('is-active', custom)
  $('[data-date-range-label]').textContent = custom
    ? rangeShortFormat.formatRange(dayDate(state.range.from), dayDate(state.range.to))
    : t('Dates')
  if (!state.stats) {
    return
  }
  for (const button of $$('[data-period]', HTMLButtonElement)) {
    button.disabled = !periodAvailable(button.dataset.period)
    button.title = button.disabled ? t('Historique en cours de synchronisation : un mois de plus à chaque synchro') : ''
  }
  const { min, max } = dateBounds()
  $('[data-date-range-note]').textContent = t('Du {day} à la dernière synchro.', { day: dateFormat.format(dayDate(min)) })
  const { from, to } = dateFields()
  from.min = min
  from.max = max
  to.min = from.value || min
  to.max = max
}

// The filters draw every page again with render() (shell/render.js), given by app.js: render() draws the filters too.
export function setupFilters({ render }) {
  // An open repository or status list, date picker or sync menu closes when clicking anywhere else.
  document.addEventListener('click', (event) => {
    for (const filter of $$('[data-repo-filter][open], [data-status-filter][open], [data-date-range][open], [data-sync-menu][open]', HTMLDetailsElement)) {
      if (!filter.contains(/** @type {Node} */ (event.target))) {
        filter.open = false
      }
    }
  })

  for (const button of $$('[data-period]')) {
    button.addEventListener('click', () => {
      if (!state.stats || button.dataset.period === state.period) {
        return
      }
      state.period = button.dataset.period
      storePeriod()
      render(false)
      playEntrance()
    })
  }

  $('[data-squad-filter]').addEventListener('change', (event) => {
    state.squad = /** @type {HTMLSelectElement} */ (event.target).value
    storeSquad()
    if (state.stats) {
      render(false)
      playEntrance()
    }
  })

  // Picked dates: the form opens on the days of the period shown, and applies once both are valid.
  const datePicker = $('[data-date-range]', HTMLDetailsElement)
  const dateForm = $('[data-date-range-form]', HTMLFormElement)
  datePicker.addEventListener('toggle', () => {
    if (!datePicker.open || !state.stats) {
      return
    }
    const { from, to } = dateFields()
    const range = state.period === CUSTOM_PERIOD ? state.range : { from: parisDay(periodRange().start), to: dateBounds().max }
    from.value = range.from
    to.value = range.to
    to.min = range.from
  })
  dateFields().from.addEventListener('input', (event) => {
    dateFields().to.min = /** @type {HTMLInputElement} */ (event.target).value || dateBounds().min
  })
  dateForm.addEventListener('submit', (event) => {
    event.preventDefault()
    if (!state.stats) {
      return
    }
    const { from, to } = dateFields()
    state.period = CUSTOM_PERIOD
    state.range = { from: from.value, to: to.value }
    storePeriod()
    datePicker.open = false
    render(false)
    playEntrance()
  })
  datePicker.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && datePicker.open) {
      datePicker.open = false
      datePicker.querySelector('summary').focus()
    }
  })

  // A comparison only changes the tiles of the period.
  $('[data-compare]').addEventListener('change', (event) => {
    state.compare = /** @type {HTMLSelectElement} */ (event.target).value
    storePeriod()
    if (state.stats) {
      renderComparePicker()
      renderTotals('enter')
      renderCycleTiles('enter')
      renderTmaTiles('enter')
      renderDevopsTiles('enter')
    }
  })

  $('[data-search]').addEventListener('input', (event) => {
    state.query = /** @type {HTMLInputElement} */ (event.target).value.trim().toLowerCase()
    if (state.stats) {
      renderTables(false)
      renderCollaboration()
      renderTeam()
      renderRepositories()
      renderProjects('update')
      renderFeed(false)
      renderUnblock('enter')
      renderUnapproved(false)
    }
  })

  // The filters tell when they stick to the top of the window (styles/shell/filters.css, between 1280 and 1535 px): their top, one
  // pixel above it, is then cut off.
  new IntersectionObserver(
    ([entry]) => {
      entry.target.classList.toggle('is-stuck', entry.intersectionRatio < 1 && entry.boundingClientRect.top < 0)
    },
    { threshold: [1] },
  ).observe($('[data-filters]'))
}
