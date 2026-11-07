// Browser notifications of the reviews newly asked of the person of « Pour moi ».

import { formatNumber } from '../lib/format.js'
import { displayName } from '../model/people.js'
import { currentRoute, ROUTES } from '../model/routes.js'
import { state } from '../model/state.js'

// The reviews already asked of that person when the tab last looked (sessionStorage): a reload for a new build notifies
// those asked meanwhile, a new tab none of those already there.
const KNOWN_REVIEWS_STORAGE_KEY = 'github-pr-dashboard:known-reviews'

// Notifications of the reviews newly asked of the person picked on « Pour moi », once turned on in this browser and
// allowed by it. Some browsers, on phones, have the API without the constructor: they show none.
export const notificationsSupported = () => 'Notification' in window
export const notificationsOn = () => state.notify && notificationsSupported() && Notification.permission === 'granted'

const reviewKey = (pr) => `${pr.repo}#${pr.number}`

function readKnownReviews() {
  try {
    return JSON.parse(sessionStorage.getItem(KNOWN_REVIEWS_STORAGE_KEY))
  } catch {
    return null
  }
}

function storeKnownReviews(known) {
  try {
    sessionStorage.setItem(KNOWN_REVIEWS_STORAGE_KEY, JSON.stringify(known))
  } catch {
    // Without storage, the reviews of the next stats are set against none: they notify only from the following ones.
  }
}

// The reviews asked of the person that the tab did not know yet notify, unless « Pour moi » is on screen, where they
// show: one notification for several. The first stats of a tab, or a person picked anew, notify nothing.
export function notifyNewReviews(me) {
  const reviews = state.reviewsAsked ?? []
  const known = readKnownReviews()
  const fresh = known?.me === me ? reviews.filter((pr) => !known.reviews.includes(reviewKey(pr))) : []
  storeKnownReviews({ me, reviews: reviews.map(reviewKey) })
  if (!fresh.length || !notificationsOn() || (document.visibilityState === 'visible' && currentRoute() === 'me')) {
    return
  }
  const [first] = fresh
  const shown = fresh.slice(0, 3).map(reviewKey).join(', ')
  try {
    const notification = new Notification(fresh.length > 1 ? `${formatNumber(fresh.length)} reviews demandées` : 'Review demandée', {
      body: fresh.length > 1 ? `${shown}${fresh.length > 3 ? '…' : ''}` : `${reviewKey(first)} de ${displayName(first.author)}`,
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
