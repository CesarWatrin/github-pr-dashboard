// The title of the tab: the reviews asked of the person of « Pour moi » come first.

import { formatNumber } from '../lib/format.js'
import { currentRoute, ROUTES } from '../model/routes.js'
import { state } from '../model/state.js'

// The tab counts the reviews asked of the person picked on « Pour moi », whichever page it shows: (3) Stats PR.
export function renderTitle() {
  const route = currentRoute()
  const title = route === 'overview' ? 'Stats PR' : `${ROUTES[route].title} · Stats PR`
  const count = state.reviewsAsked?.length ?? 0
  document.title = count ? `(${formatNumber(count)}) ${title}` : title
}
