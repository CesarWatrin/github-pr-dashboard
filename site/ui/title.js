// The title of the tab and the badges of the menu: what waits for the person of « Mes PR » comes first.

import { formatNumber, plural } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { currentRoute, ROUTES } from '../model/routes.js'
import { state } from '../model/state.js'
import { $$ } from './dom.js'

// The tab counts what the person picked on « Mes PR » has to act on, whichever page it shows: (5) Stats PR. So does a
// red badge, as on the icon of a phone app: on « Mes PR » in the menu, and on the button that opens the menu on narrower
// screens. The notifications count the same. A grey badge, right after the name of « Mes PR » in the menu, counts all
// their own open pull requests, drafts included.
export function renderTitle() {
  const route = currentRoute()
  const title = route === 'overview' ? t('Stats PR') : `${ROUTES[route].title} · ${t('Stats PR')}`
  const count = state.forMe?.length ?? 0
  document.title = count ? `(${formatNumber(count)}) ${title}` : title
  for (const badge of $$('[data-reviews-badge]')) {
    badge.hidden = count === 0
    badge.textContent = formatNumber(count)
    badge.title = t('{count} : les reviews qu’on m’a demandées, et mes PR prêtes à merger, à corriger ou oubliées', {
      count: plural(count, 'PR à traiter', 'PR à traiter'),
    })
  }
  const own = state.meOwn
  for (const badge of $$('[data-own-badge]')) {
    badge.hidden = own === 0
    badge.textContent = formatNumber(own)
    badge.title = t('{count} à moi : toutes mes PR ouvertes, brouillons compris', { count: plural(own, 'PR', 'PR') })
  }
}
