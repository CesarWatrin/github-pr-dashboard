// The sync started from the page (quick, full with its password, or on its own once the data gets old), and its
// status.

import { ACTIVE_RUN_STATUSES, AUTO_SYNC_AFTER_MS, autoSyncAction, dataStale } from '../domain/auto-sync.js'
import { deriveFullSyncKey, fullSyncProof, fullSyncVerifier } from '../domain/full-sync.js'
import { dateTimeFormat, formatRelative } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { state } from '../model/state.js'
import { dispatchSync, recentRuns } from '../services/github.js'
import { notificationsOn } from '../services/notifications.js'
import { fromBase64 } from '../services/stats-key.js'
import { serverNow } from '../services/stats-source.js'
import { $, $$ } from '../ui/dom.js'

const STALE_AFTER_MS = 2 * 60 * 60_000

// The two syncs the page can start: the workflow's incremental one, or a full refetch of the rolling window. The page
// starts the quick one on its own too, once its data gets old (autoSync()).
const SYNC_KINDS = {
  quick: { full: false, label: t('Synchro rapide en cours…'), timeoutMs: 6 * 60_000 },
  auto: { full: false, label: t('Synchro automatique en cours…'), timeoutMs: 6 * 60_000 },
  // Up to the workflow's own timeout.
  full: { full: true, label: t('Synchro complète en cours, 15 à 20 min…'), timeoutMs: 45 * 60_000 },
  running: { label: t('Une synchro est déjà en cours…'), timeoutMs: 45 * 60_000 },
}

// The status shows in the sidebar, and in the bar on top of narrower screens: both say the same.
export function renderSyncStatus() {
  for (const status of $$('[data-sync]')) {
    renderSyncStatusIn(status, status.querySelector('[data-sync-label]'))
  }
}

function renderSyncStatusIn(status, label) {
  status.classList.remove('is-live', 'is-stale', 'is-error')
  if (!state.stats) {
    status.classList.add('is-error')
    label.textContent = state.fetchFailed ? t('Données indisponibles') : t('Chargement…')

    return
  }

  const { generatedAt } = state.stats
  const stale = Date.now() - Date.parse(generatedAt) > STALE_AFTER_MS
  status.classList.add(state.fetchFailed ? 'is-error' : stale ? 'is-stale' : 'is-live')
  status.classList.toggle('is-syncing', state.syncStarting !== null || state.syncRequest !== null)
  status.title = t('Données générées le {date}', { date: dateTimeFormat.format(new Date(generatedAt)) })
  label.textContent = state.syncStarting
    ? t('Lancement de la synchro…')
    : state.syncRequest
      ? SYNC_KINDS[state.syncRequest.kind].label
      : `${state.fetchFailed ? `${t('Hors ligne')} · ` : ''}${t('Mis à jour {when}', { when: formatRelative(generatedAt) })}`
}

export function renderSyncMenu() {
  const menu = $('[data-sync-menu]', HTMLDetailsElement)
  menu.hidden = !state.stats?.syncTrigger
  menu.classList.toggle('is-starting', state.syncStarting !== null)
  for (const button of /** @type {NodeListOf<HTMLButtonElement>} */ (menu.querySelectorAll('[data-sync-kind]'))) {
    button.disabled = state.syncStarting !== null || state.syncRequest !== null
    button.classList.toggle('is-starting', button.dataset.syncKind === state.syncStarting)
  }
}

// A sync already queued or running is waited for rather than doubled. A full sync carries the proof of its password,
// when it has one.
async function startSync(kind, proof = null) {
  const menu = $('[data-sync-menu]', HTMLDetailsElement)
  const error = $('[data-sync-error]')
  error.hidden = true
  // Reading the recent runs then starting one takes a few seconds: the menu and the status show it meanwhile, and
  // the buttons wait.
  state.syncStarting = kind
  renderSyncMenu()
  renderSyncStatus()
  try {
    const running = (await recentRuns()).some((run) => ACTIVE_RUN_STATUSES.includes(run.status))
    if (!running) {
      await dispatchSync(SYNC_KINDS[kind].full, proof)
      // Its stats will say whether the run refused it (checkFullSyncRefused()).
      state.fullSyncAsked = proof !== null
    }
    state.syncRequest = { kind: running ? 'running' : kind, at: Date.now() }
    menu.open = false
  } catch {
    error.textContent = t('La synchro n’a pas pu être lancée : le token est peut-être expiré.')
    error.hidden = false
    menu.open = true
  }
  state.syncStarting = null
  renderSyncMenu()
  renderSyncStatus()
}

// A full sync the run refused tells so in the stats it publishes, a quick sync done in its place (fullSyncRefused): the
// first new stats after a full sync the page started say whether it was. The run started is the first of the queue,
// since the page only starts one when none is going.
export function checkFullSyncRefused(stats) {
  if (!state.fullSyncAsked) {
    return
  }
  state.fullSyncAsked = false
  if (stats.fullSyncRefused) {
    const error = $('[data-sync-error]')
    error.textContent = t(
      'La synchro complète a été refusée (mot de passe changé depuis la dernière synchro, ou demande expirée) : une synchro rapide a été faite à la place.',
    )
    error.hidden = false
    $('[data-sync-menu]', HTMLDetailsElement).open = true
  }
}

// The full sync may have a password of its own (syncTrigger.fullSync). The page checks it against the verifier the stats
// carry, then signs the request with the key derived from it, kept nowhere: the dispatch token alone could start a full
// sync, so the workflow run checks that proof again. A wrong password keeps the dialog open and starts nothing.
async function confirmFullSync() {
  const dialog = $('[data-full-sync-dialog]', HTMLDialogElement)
  const button = $('[data-full-sync-confirm]', HTMLButtonElement)
  const { fullSync, repository } = state.stats.syncTrigger
  if (!fullSync) {
    dialog.close()
    startSync('full')

    return
  }
  // Already checking the password.
  if (button.disabled) {
    return
  }
  const password = $('[data-full-sync-password]', HTMLInputElement)
  const error = $('[data-full-sync-error]')
  error.hidden = true
  button.disabled = true
  try {
    const key = await deriveFullSyncKey(password.value, fromBase64(fullSync.salt), fullSync.iterations)
    if ((await fullSyncVerifier(key)) !== fullSync.verifier) {
      error.textContent = t('Mot de passe incorrect.')
      error.hidden = false
      password.select()

      return
    }
    const proof = await fullSyncProof(key, repository, await serverNow())
    // Closed meanwhile: cancelled.
    if (dialog.open) {
      dialog.close()
      startSync('full', proof)
    }
  } catch {
    error.textContent = t('Le mot de passe n’a pas pu être vérifié, réessaie dans un instant.')
    error.hidden = false
  } finally {
    button.disabled = false
  }
}

// The request ends with the next data, or after a while if the run failed.
export function settleSyncRequest(newData) {
  if (!state.syncRequest) {
    return
  }
  if (newData || Date.now() - state.syncRequest.at > SYNC_KINDS[state.syncRequest.kind].timeoutMs) {
    state.syncRequest = null
    renderSyncMenu()
  }
}

// Once its data is older than AUTO_SYNC_AFTER_MS, a page that shows (not one in a background tab, unless it notifies the
// reviews asked: they would come late) starts a quick sync on its own, as the sync button would (site/domain/auto-sync.js): a
// page left open keeps fresh data, and pages opened at once
// start a single run. Never while a sync of the page is starting or awaited, and one try every AUTO_SYNC_AFTER_MS at
// most, whatever the answer. Data old by the browser's clock is checked against the server's, as a clock that runs
// ahead would find every run old. A failure goes unnoticed: the sync button tells it when used.
export async function autoSync() {
  const local = Date.now()
  if (
    !state.stats?.syncTrigger ||
    (document.visibilityState !== 'visible' && !notificationsOn()) ||
    state.autoSyncing ||
    state.syncStarting !== null ||
    state.syncRequest !== null ||
    local - state.autoSyncTriedAt < AUTO_SYNC_AFTER_MS ||
    !dataStale(state.stats.generatedAt, local)
  ) {
    return
  }
  state.autoSyncing = true
  try {
    const now = (await serverNow()) * 1000
    if (!dataStale(state.stats.generatedAt, now) || state.syncStarting !== null || state.syncRequest !== null) {
      return
    }
    state.autoSyncTriedAt = local
    const action = autoSyncAction(await recentRuns(), now)
    if (action === 'start') {
      await dispatchSync(SYNC_KINDS.auto.full)
    }
    if (action !== 'skip' && state.syncRequest === null) {
      state.syncRequest = { kind: action === 'start' ? 'auto' : 'running', at: Date.now() }
    }
  } catch {
    // Expired token, GitHub unreachable: the next try comes AUTO_SYNC_AFTER_MS later.
  } finally {
    state.autoSyncing = false
  }
  renderSyncMenu()
  renderSyncStatus()
}

export function refreshClock() {
  renderSyncStatus()
  for (const time of $$('[data-relative]')) {
    time.textContent = formatRelative(time.dataset.relative)
  }
}

// Listens to the sync menu and to the confirmation of a full sync.
export function setupSync() {
  // The full sync is heavy: it is only started once confirmed, with a password of its own when the stats carry one.
  for (const button of $$('[data-sync-kind]')) {
    button.addEventListener('click', () => {
      if (button.dataset.syncKind !== 'full') {
        startSync(button.dataset.syncKind)

        return
      }
      const dialog = $('[data-full-sync-dialog]', HTMLDialogElement)
      const password = $('[data-full-sync-password]', HTMLInputElement)
      const asksPassword = Boolean(state.stats.syncTrigger.fullSync)
      $('[data-sync-menu]', HTMLDetailsElement).open = false
      $('[data-full-sync-field]').hidden = !asksPassword
      $('[data-full-sync-error]').hidden = true
      password.disabled = !asksPassword
      password.required = asksPassword
      dialog.returnValue = ''
      dialog.showModal()
      if (asksPassword) {
        password.focus()
      }
    })
  }
  $('[data-full-sync-form]').addEventListener('submit', (event) => {
    if (/** @type {HTMLButtonElement | null} */ (event.submitter)?.value === 'confirm') {
      event.preventDefault()
      confirmFullSync()
    }
  })
  // Enter in the password confirms: the first button of the form, the one the browser would take, cancels.
  $('[data-full-sync-password]').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      $('[data-full-sync-form]', HTMLFormElement).requestSubmit($('[data-full-sync-confirm]'))
    }
  })
  // The password typed does not stay in the page.
  $('[data-full-sync-dialog]').addEventListener('close', () => {
    $('[data-full-sync-form]', HTMLFormElement).reset()
    $('[data-full-sync-error]').hidden = true
  })
  $('[data-sync-menu]').addEventListener('keydown', (event) => {
    const menu = /** @type {HTMLDetailsElement} */ (event.currentTarget)
    if (event.key === 'Escape' && menu.open) {
      menu.open = false
      menu.querySelector('summary').focus()
    }
  })
}
