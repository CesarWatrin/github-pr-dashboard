// One page per hash, and the sidebar that opens as a drawer over the page below 1280 px.

import { COMPARED_ROUTES, currentRoute, ROUTES } from '../model/routes.js'
import { squadKey } from '../model/squads.js'
import { state } from '../model/state.js'
import { renderAnalysis } from '../pages/analysis/analysis.js'
import { renderSquads } from '../pages/squads/squads.js'
import { $, $$ } from '../ui/dom.js'
import { playEntrance } from '../ui/motion.js'
import { renderTitle } from '../ui/title.js'
import { render, renderCharts } from './render.js'

export function renderRoute() {
  const route = currentRoute()
  for (const page of $$('[data-route]')) {
    page.hidden = page.dataset.route !== route
  }
  for (const link of $$('[data-route-link]')) {
    if (link.dataset.routeLink === route) {
      link.setAttribute('aria-current', 'page')
    } else {
      link.removeAttribute('aria-current')
    }
  }
  $('[data-route-title]').textContent = ROUTES[route].title
  $('[data-route-subtitle]').textContent = ROUTES[route].subtitle
  $('[data-filters]').hidden = ROUTES[route].filters === false
  // A page about what stands now has the search, not the period.
  $('[data-periods]').hidden = ROUTES[route].period === false
  $('[data-date-range]').hidden = ROUTES[route].period === false
  $('[data-search]').hidden = ROUTES[route].search === false
  $('[data-compare-field]').hidden = !COMPARED_ROUTES.has(route)
  renderTitle()
  // A squad scopes the pages with filters only: going to or from one without them draws everything again.
  if (state.stats && squadKey() !== state.renderedSquad) {
    render(false)
  }
  // The charts of a hidden page cannot be measured: they are drawn when their page shows. So are the analysis, which
  // takes a moment to work out, and the squads.
  renderCharts()
  renderAnalysis()
  if (state.stats) {
    renderSquads()
  }
  playEntrance()
}

// Below 1280 px the sidebar opens as a drawer over the page (styles/shell/sidebar.css): the page behind is out of reach meanwhile, and
// the focus goes into it: on the page shown when opened from the keyboard, else on the drawer itself, without a ring
// around a link just tapped. Closing gives it back to the menu button, unless a page was picked.
export function setNavOpen(open, { focus = true, keyboard = false } = {}) {
  const app = $('[data-page]')
  if (app.classList.contains('is-nav-open') === open) {
    return
  }
  app.classList.toggle('is-nav-open', open)
  const toggle = $('[data-nav-toggle]')
  toggle.setAttribute('aria-expanded', String(open))
  $('.page').inert = open
  $('[data-topbar]').inert = open
  if (open) {
    const target = keyboard ? ($('[data-sidebar] [aria-current="page"]') ?? $('[data-nav-close]')) : $('[data-sidebar]')
    target.focus()
  } else if (focus) {
    toggle.focus()
  }
}

// Listens to the changes of page and to the drawer of the sidebar.
export function setupNavigation() {
  // Whatever changes the page (a link, the browser's back button, a notification clicked) closes the drawer over it.
  window.addEventListener('hashchange', () => {
    setNavOpen(false, { focus: false })
    renderRoute()
    window.scrollTo(0, 0)
  })

  // A click the keyboard made (Enter or Space on the button) has no detail.
  $('[data-nav-toggle]').addEventListener('click', (event) => setNavOpen(true, { keyboard: event.detail === 0 }))
  $('[data-nav-close]').addEventListener('click', () => setNavOpen(false))
  $('[data-nav-backdrop]').addEventListener('click', () => setNavOpen(false))
  // The link of the page already shown changes nothing: it closes the drawer all the same.
  for (const link of $$('[data-sidebar] a')) {
    link.addEventListener('click', () => setNavOpen(false, { focus: false }))
  }
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && $('[data-page]').classList.contains('is-nav-open')) {
      setNavOpen(false)
    }
  })
  // Wide enough for the sidebar beside the page: no drawer to close.
  window.matchMedia('(max-width: 1279px)').addEventListener('change', (event) => {
    if (!event.matches) {
      setNavOpen(false, { focus: false })
    }
  })
}
