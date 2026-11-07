// Syncs the pull requests of a GitHub organization and writes, encrypted, what the dashboard computes its stats from.
//
// The raw pull requests are kept in a local snapshot: the first run fetches the last year repository by repository,
// the next runs only fetch the pull requests updated since the last sync, and each reads back one older slice until the
// snapshot covers the whole rolling window, three years. A monthly history of each person's figures, for the badges of
// the page, outlasts the window: it goes back to the first sync. The parts live in scripts/sync/.
//
// Usage: node scripts/sync.mjs [--full] [--watch]

import { DASHBOARD_REPOSITORY, ORG } from './sync/config.mjs'
import { chooseFullSync, fullSyncSettings } from './sync/full-sync.mjs'
import { wait } from './sync/github.mjs'
import { sync, WATCH_INTERVAL_MS } from './sync/run.mjs'

const args = new Set(process.argv.slice(2))
const fullSync = await fullSyncSettings(process.env.FULL_SYNC_PASSWORD, ORG)
const { full, refused } = await chooseFullSync({
  commandLine: args.has('--full'),
  requested: process.env.FULL_SYNC === 'true',
  key: fullSync?.key,
  proof: process.env.FULL_SYNC_PROOF,
  repository: DASHBOARD_REPOSITORY,
  now: Math.floor(Date.now() / 1000),
})
if (refused) {
  // Never the proof nor why it failed: the logs are public.
  console.warn('full sync refused: no valid proof of the full sync password, incremental sync instead')
}

await sync({ full, fullSync: fullSync?.published, refused })
while (args.has('--watch')) {
  await wait(WATCH_INTERVAL_MS)
  await sync({ full: false, fullSync: fullSync?.published }).catch((error) => console.error(error))
}
