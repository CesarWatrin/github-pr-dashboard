// Browser notifications of what is new for the person of « Mes PR »: a pull request in any of the lists they have to act on.

import { plural } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { displayName } from '../model/people.js'
import { currentRoute, ROUTES } from '../model/routes.js'
import { state } from '../model/state.js'

// What the lists of that person held when the tab last looked (sessionStorage): a reload for a new build notifies what
// came meanwhile, a new tab nothing of what was already there.
const KNOWN_ITEMS_STORAGE_KEY = 'github-pr-dashboard:known-items'

// Notifications of what is new for the person picked on « Mes PR », once turned on in this browser and allowed by
// it. Some browsers, on phones, have the API without the constructor: they show none.
export const notificationsSupported = () => 'Notification' in window
export const notificationsOn = () => state.notify && notificationsSupported() && Notification.permission === 'granted'

/** @param {{ repo: string, number: number }} pr */
const pullRequestKey = (pr) => `${pr.repo}#${pr.number}`
// A pull request in a list: one that moves to another list, ready to merge say, is new there.
/** @param {{ list: string, pr: { repo: string, number: number } }} item */
const itemKey = ({ list, pr }) => `${list}:${pullRequestKey(pr)}`

function readKnownItems() {
  try {
    return JSON.parse(sessionStorage.getItem(KNOWN_ITEMS_STORAGE_KEY) ?? 'null')
  } catch {
    return null
  }
}

/** @param {{ me: string | null, items: string[] }} known */
function storeKnownItems(known) {
  try {
    sessionStorage.setItem(KNOWN_ITEMS_STORAGE_KEY, JSON.stringify(known))
  } catch {
    // Without storage, the lists of the next stats are set against none: they notify only from the following ones.
  }
}

// The pull requests of the lists of the person that the tab did not know yet notify, unless « Mes PR » is on screen,
// where they show: one notification for several, counting all that waits, as the tab and the badge do. The first stats
// of a tab, or a person picked anew, notify nothing.
/** @param {string | null} me */
export function notifyNewItems(me) {
  const items = state.forMe ?? []
  const known = readKnownItems()
  const fresh = known?.me === me && Array.isArray(known.items) ? items.filter((item) => !known.items.includes(itemKey(item))) : []
  storeKnownItems({ me, items: items.map(itemKey) })
  if (!fresh.length || !notificationsOn() || (document.visibilityState === 'visible' && currentRoute() === 'me')) {
    return
  }
  const [first] = fresh
  const shown = fresh.slice(0, 3).map(({ pr }) => pullRequestKey(pr)).join(', ')
  try {
    const notification = new Notification(plural(items.length, 'PR à traiter', 'PR à traiter'), {
      body:
        fresh.length > 1
          ? `${shown}${fresh.length > 3 ? '…' : ''}`
          : t('{pullRequest} de {author}', { pullRequest: pullRequestKey(first.pr), author: displayName(first.pr.author) }),
    })
    notification.addEventListener('click', () => {
      window.focus()
      location.hash = ROUTES.me.hash
      notification.close()
    })
  } catch {
    // A browser that only notifies through a service worker: the tab title still counts them.
  }
}
