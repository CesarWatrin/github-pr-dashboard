// Unlocking with the password, locking, and the new stats the page polls for.

import { t } from '../lib/i18n.js'
import { state } from '../model/state.js'
import { reloadForNewBuild } from '../services/build.js'
import { decryptStats, deriveKey, KEY_STORAGE_KEY, storeKey } from '../services/stats-key.js'
import { DATA_URL, fetchJson, VERSION_URL } from '../services/stats-source.js'
import { $, $$ } from '../ui/dom.js'
import { playEntrance } from '../ui/motion.js'
import { renderTitle } from '../ui/title.js'
import { render } from './render.js'
import { setNavOpen } from './router.js'
import { autoSync, checkFullSyncRefused, renderSyncStatus, settleSyncRequest } from './sync.js'

export function showLock(message = '') {
  setNavOpen(false, { focus: false })
  $('[data-page]').hidden = true
  $('[data-lock]').hidden = false
  const error = $('[data-lock-error]')
  error.textContent = message
  error.hidden = !message
  $('[data-lock-password]').focus()
}

export function showDashboard() {
  $('[data-lock]').hidden = true
  $('[data-page]').hidden = false
}

function lock(message) {
  try {
    localStorage.removeItem(KEY_STORAGE_KEY)
  } catch {
    // Nothing was stored.
  }
  state.key = null
  state.stats = null
  state.forMe = null
  renderTitle()
  showLock(message)
}

// Browsers offer to save a password when a login navigates away. The page unlocks in place, so it hands the password
// to the browser's password manager itself, once it is known to be right (Chrome and Edge only).
function offerToSavePassword(form) {
  if (!('PasswordCredential' in window)) {
    return
  }
  const { username, password } = form.elements
  navigator.credentials.store(new PasswordCredential({ id: username.value, password: password.value })).catch(() => {
    // Refused or unavailable: the password is simply typed again next time.
  })
}

async function unlock(form) {
  const button = form.querySelector('button')
  button.disabled = true
  try {
    const payload = await fetchJson(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' })
    const key = await deriveKey(form.elements.password.value, payload)
    const stats = await decryptStats(payload, key)
    if (!stats) {
      showLock(t('Mot de passe incorrect.'))

      return
    }
    state.key = key
    state.keyExpiresAt = await storeKey(key)
    offerToSavePassword(form)
    form.reset()
    if (reloadForNewBuild(stats.build)) {
      return
    }
    showDashboard()
    applyStats(stats)
    renderSyncStatus()
    autoSync()
  } catch {
    showLock(t('Données indisponibles pour le moment, réessaie dans un instant.'))
  } finally {
    button.disabled = false
  }
}

function applyStats(stats) {
  const isUpdate = state.stats !== null
  state.stats = stats
  checkFullSyncRefused(stats)
  render(isUpdate)
  if (!isUpdate) {
    playEntrance()
  }
  if (isUpdate) {
    for (const status of $$('[data-sync]')) {
      status.classList.remove('is-pulsing')
      void status.offsetWidth
      status.classList.add('is-pulsing')
    }
  }
}

// Only the small version file is polled: the stats, much larger, are downloaded when they change.
export async function refresh() {
  if (!state.key) {
    return
  }
  if (Date.now() > state.keyExpiresAt) {
    lock(t('L’accès dure 30 jours : saisis à nouveau le mot de passe.'))

    return
  }
  let stats = null
  try {
    const version = await fetchJson(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' })
    if (reloadForNewBuild(version.build)) {
      return
    }
    if (version.generatedAt !== state.stats?.generatedAt) {
      const payload = await fetchJson(`${DATA_URL}?v=${encodeURIComponent(version.generatedAt)}`)
      stats = await decryptStats(payload, state.key)
      if (!stats) {
        lock(t('Le mot de passe a changé : saisis le nouveau.'))

        return
      }
    }
    state.fetchFailed = false
  } catch {
    state.fetchFailed = true
    if (!state.stats) {
      $('[data-empty]').hidden = false
    }
  }

  if (stats) {
    applyStats(stats)
  }
  settleSyncRequest(stats !== null)
  renderSyncStatus()
  autoSync()
}

// Listens to the lock screen and the lock button, and looks for new stats whenever the page shows again.
export function setupSession() {
  $('[data-lock-form]').addEventListener('submit', (event) => {
    event.preventDefault()
    unlock(event.currentTarget)
  })
  // Locking forgets the key on this device: it is only done once confirmed.
  $('[data-lock-now]').addEventListener('click', () => {
    const dialog = $('[data-lock-dialog]', HTMLDialogElement)
    dialog.returnValue = ''
    dialog.showModal()
  })
  $('[data-lock-dialog]').addEventListener('close', (event) => {
    if (/** @type {HTMLDialogElement} */ (event.currentTarget).returnValue === 'confirm') {
      lock()
    }
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refresh()
    }
  })
}
