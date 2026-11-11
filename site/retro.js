// The composition root of the year in review (retro.html), a page apart from the dashboard: the only module of it that
// runs anything when loaded, and nothing of the dashboard loads with it. It translates the page, reads the key the link
// brings after the # (then leaves it out of the address) or the one this browser kept, opens the year in review the
// sync publishes apart (data/retro.enc.json), and shows the story the address asks for, else the picker; without a key
// that opens it, the screen that says how to get the link.
//
// Layers, as for the dashboard (app.js): domain/, model/, services/, ui/, then the page itself (pages/wrapped/).

import { RETRO_YEAR } from './domain/wrapped.js'
import { readRetroAddress, retroAddress } from './model/retro-address.js'
import { renderLocked } from './pages/wrapped/locked.js'
import { setupWrapped, showRetro } from './pages/wrapped/wrapped.js'
import { forgetRetroKey, importRetroKey, loadRetro, readRetroKey, storeRetroKey } from './services/retro-source.js'
import { translatePage } from './ui/translate.js'

async function start() {
  const { key: linked, who } = readRetroAddress(location.hash)
  if (linked !== null) {
    // The key leaves the address at once: a copy of it, a screenshot or the history never show it again.
    history.replaceState(null, '', `${location.pathname}${location.search}${retroAddress(who)}`)
  }
  const text = linked ?? readRetroKey()
  const key = await importRetroKey(text)
  if (!text || !key) {
    renderLocked(text ? 'wrong' : 'none', RETRO_YEAR)

    return
  }
  const result = await loadRetro(key)
  if ('error' in result) {
    if (result.error === 'wrong' && linked === null) {
      // A key kept here that no longer opens it: the new link is needed.
      forgetRetroKey()
    }
    renderLocked(result.error, RETRO_YEAR, result.error === 'unavailable' ? start : undefined)

    return
  }
  storeRetroKey(text)
  showRetro(result.retro, who)
}

translatePage()
setupWrapped()
// A link pasted in the tab: its key, or its story.
addEventListener('hashchange', start)
await start()
