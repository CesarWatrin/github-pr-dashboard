// The repository filter of the pages that have one: presets by type, and the repositories one by one.

import { formatNumber } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { inSelection } from '../model/contributors.js'
import { CATEGORIES, repoInfo, reposOfCategory } from '../model/repositories.js'
import { currentPeriod } from '../model/selection.js'
import { state } from '../model/state.js'
import { $, el } from './dom.js'
import { renderTable, TABLES } from './tables/table.js'

// The repository filters, by name: registered by shell/tables.js with the tables.
export const REPO_FILTERS = {}
export const repoFilterNames = () => Object.keys(REPO_FILTERS)

// Repositories with activity in the table over the period, busiest first: those of its people (source, else the table's
// name, in the stats of the period), or those a filter lists itself (repos), such as the repositories of the projects.
/**
 * @param {string} name
 * @returns {[repo: string, count: number][]}
 */
export function repoOptions(name) {
  const counts = REPO_FILTERS[name].repoCounts()
  const repos = new Set(REPO_FILTERS[name].repos?.() ?? currentPeriod()[REPO_FILTERS[name].source ?? name].flatMap((person) => Object.keys(person.repos)))

  return [...repos]
    .map((repo) => /** @type {[string, number]} */ ([repo, counts.get(repo) ?? 0]))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

// Shortcuts of the list: every repository, one type of repository, or none.
function presetSelection(preset, options) {
  if (preset === 'all') {
    return null
  }

  return new Set(preset === 'none' ? [] : reposOfCategory(options, preset))
}

// The selection restricted to the repositories listed for the period.
function listedSelection(name, options) {
  const selection = state.repos[name]

  return selection && new Set(options.map(([repo]) => repo).filter((repo) => selection.has(repo)))
}

const sameSelection = (a, b) => (a === null || b === null ? a === b : a.size === b.size && [...a].every((repo) => b.has(repo)))

export function repoFilterLabel(name, options) {
  const selected = listedSelection(name, options)
  if (!selected) {
    return t('Tous les dépôts')
  }
  if (selected.size === 0) {
    return t('Aucun dépôt')
  }
  // A selection made of whole types of repositories is named after them.
  const types = CATEGORIES.map((category) => reposOfCategory(options, category.key)).map((repos, index) => ({
    label: CATEGORIES[index].label,
    repos,
  }))
  const whole = types.filter(({ repos }) => repos.length > 0 && repos.every((repo) => selected.has(repo)))
  if (whole.reduce((total, { repos }) => total + repos.length, 0) === selected.size) {
    return whole.map(({ label }) => label).join(' + ')
  }

  return selected.size === 1 ? [...selected][0] : t('{count} dépôts sur {total}', { count: selected.size, total: options.length })
}

// Checkboxes and shortcuts are updated in place so that keyboard focus stays where it is.
function renderRepoFilterState(name, options = repoOptions(name)) {
  const filter = $(`[data-repo-filter="${name}"]`, HTMLDetailsElement)
  const selection = state.repos[name]
  filter.classList.toggle('is-filtered', selection !== null)
  filter.querySelector('[data-repo-label]').textContent = repoFilterLabel(name, options)
  for (const input of /** @type {NodeListOf<HTMLInputElement>} */ (filter.querySelectorAll('input[data-repo]'))) {
    input.checked = inSelection(selection, input.dataset.repo)
  }
  for (const input of /** @type {NodeListOf<HTMLInputElement>} */ (filter.querySelectorAll('input[data-category]'))) {
    const repos = reposOfCategory(options, input.dataset.category)
    const checked = repos.filter((repo) => inSelection(selection, repo)).length
    input.checked = checked === repos.length
    input.indeterminate = checked > 0 && checked < repos.length
  }
  const selected = listedSelection(name, options)
  for (const button of /** @type {NodeListOf<HTMLButtonElement>} */ (filter.querySelectorAll('[data-preset]'))) {
    button.setAttribute('aria-pressed', String(sameSelection(selected, presetSelection(button.dataset.preset, options))))
  }
}

function repoCheckbox(label, count, data) {
  const input = el('input', { type: 'checkbox' })
  Object.assign(input.dataset, data)

  return el(
    'label',
    {},
    input,
    el('span', { className: 'repo-name', textContent: label, title: label }),
    el('span', { className: 'repo-count', textContent: formatNumber(count) }),
  )
}

// The list groups the repositories by type, each type with a checkbox of its own.
export function renderRepoFilter(name) {
  const filter = $(`[data-repo-filter="${name}"]`, HTMLDetailsElement)
  const list = filter.querySelector('[data-repo-list]')
  const options = repoOptions(name)
  const groups = CATEGORIES.map((category) => ({
    category,
    repos: options.filter(([repo]) => repoInfo(repo).category === category.key),
  })).filter(({ repos }) => repos.length > 0)

  const preset = (key, label) => {
    const button = el('button', { type: 'button', textContent: label })
    button.dataset.preset = key

    return button
  }
  filter
    .querySelector('[data-repo-presets]')
    .replaceChildren(
      preset('all', t('Tous')),
      ...groups.map(({ category }) => preset(category.key, category.label)),
      preset('none', t('Aucun')),
    )

  const scrollTop = list.scrollTop
  list.replaceChildren(
    ...groups.flatMap(({ category, repos }) => [
      el(
        'li',
        { className: 'repo-group' },
        repoCheckbox(category.label, repos.reduce((total, [, count]) => total + count, 0), { category: category.key }),
      ),
      ...repos.map(([repo, count]) => el('li', {}, repoCheckbox(repo, count, { repo }))),
    ]),
  )
  list.scrollTop = scrollTop
  renderRepoFilterState(name, options)
}

// Builds the repository filter of a table or a page once, and listens to it: presets, checkboxes, search.
export function setupRepoFilter(name) {
  const filter = $(`[data-repo-filter="${name}"]`, HTMLDetailsElement)
  const presets = el('div', { className: 'repo-presets' })
  presets.dataset.repoPresets = ''
  const list = el('ul', { className: 'repo-filter-list' })
  list.dataset.repoList = ''
  list.setAttribute('aria-label', t('Dépôts'))
  const label = el('span', { className: 'repo-filter-label', textContent: t('Tous les dépôts') })
  label.dataset.repoLabel = ''
  filter.append(
    el('summary', { className: 'search' }, label),
    el(
      'div',
      { className: 'repo-filter-panel' },
      presets,
      el('p', { className: 'repo-filter-note', textContent: REPO_FILTERS[name].repoCountsLabel }),
      list,
    ),
  )

  const apply = (selection) => {
    state.repos[name] = selection
    renderRepoFilterState(name)
    if (name in TABLES) {
      renderTable(name, false)
    }
    REPO_FILTERS[name].onFilter?.()
  }
  presets.addEventListener('click', (event) => {
    const button = event.target.closest('[data-preset]')
    if (button) {
      apply(presetSelection(button.dataset.preset, repoOptions(name)))
    }
  })
  list.addEventListener('change', (event) => {
    const repoInputs = [...list.querySelectorAll('input[data-repo]')]
    const { category } = event.target.dataset
    if (category) {
      for (const input of repoInputs) {
        if (repoInfo(input.dataset.repo).category === category) {
          input.checked = event.target.checked
        }
      }
    }
    const checked = repoInputs.filter((input) => input.checked).map((input) => input.dataset.repo)
    apply(checked.length === repoInputs.length ? null : new Set(checked))
  })
  filter.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && filter.open) {
      filter.open = false
      filter.querySelector('summary').focus()
    }
  })
}
