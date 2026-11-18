// The annual review the page shows: worked out once per stats (site/domain/review.js).

import { teamReview } from '../domain/review.js'
import { loadedStats, state } from './state.js'

/** @returns {import('../domain/review.js').TeamReview} */
export function currentReview() {
  const stats = loadedStats()
  if (state.reviewCache?.stats !== stats) {
    state.reviewCache = { stats, review: teamReview(stats) }
  }

  return state.reviewCache.review
}
