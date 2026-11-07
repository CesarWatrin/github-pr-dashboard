// The title of the tab and the badges of the menu: the reviews asked of the person of « Pour moi » come first.

import { formatNumber } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { currentRoute, ROUTES } from '../model/routes.js'
import { state } from '../model/state.js'
import { $$ } from './dom.js'

// The tab counts the reviews asked of the person picked on « Pour moi », whichever page it shows: (3) Stats PR. So does
// a red badge, as on the icon of a phone app: on « Pour moi » in the menu, and on the button that opens the menu on
// narrower screens.
export function renderTitle() {
  const route = currentRoute()
  const title = route === 'overview' ? t('Stats PR') : `${ROUTES[route].title} · ${t('Stats PR')}`
  const count = state.reviewsAsked?.length ?? 0
  document.title = count ? `(${formatNumber(count)}) ${title}` : title
  for (const badge of $$('[data-reviews-badge]')) {
    badge.hidden = count === 0
    badge.textContent = formatNumber(count)
    badge.title = count > 1 ? t('{count} reviews demandées', { count: formatNumber(count) }) : t('Review demandée')
  }
}
