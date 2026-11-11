// The address of the year in review (retro.html), after the #: the key of its link (k), and whose story shows, a person's
// (for, their login), a squad's (squad, its name) or the team's (team). The key only comes in with the link: the page
// keeps it and leaves it out of the address it shows, so that a story shared by its address never gives the key away.
// No DOM.

/** @typedef {{ login: string } | { squad: string } | 'team' | null} RetroWho */

/**
 * @param {string} hash
 * @returns {{ key: string | null, who: RetroWho }}
 */
export function readRetroAddress(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const login = params.get('for')
  const squad = params.get('squad')

  return { key: params.get('k'), who: login ? { login } : squad ? { squad } : params.has('team') ? 'team' : null }
}

// The address of a story, without the key: '' for the picker.
/** @type {(who: RetroWho) => string} */
export function retroAddress(who) {
  if (who === null) {
    return ''
  }
  if (who === 'team') {
    return '#team'
  }

  return 'login' in who ? `#for=${encodeURIComponent(who.login)}` : `#squad=${encodeURIComponent(who.squad)}`
}
