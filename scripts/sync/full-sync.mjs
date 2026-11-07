// The full sync and its password: what the stats carry for the page to check it, and whether a run may sync in full.

import {
  checkFullSyncProof,
  deriveFullSyncKey,
  FULL_SYNC_ITERATIONS,
  fullSyncSalt,
  fullSyncVerifier,
} from '../../site/domain/full-sync.js'

// The full sync asks for a password of its own (FULL_SYNC_PASSWORD), see site/domain/full-sync.js: its key, and what the page
// checks a password against, published inside syncTrigger. Null without it: no password asked, as before.
export async function fullSyncSettings(password, org, iterations = FULL_SYNC_ITERATIONS) {
  if (!password) {
    return null
  }
  const salt = await fullSyncSalt(org)
  const key = await deriveFullSyncKey(password, salt, iterations)
  const verifier = await fullSyncVerifier(key)

  return { key, published: { salt: Buffer.from(salt).toString('base64'), iterations, verifier } }
}

// What the page gets to start a sync: the trigger, with what checks the full sync password when there is one.
export function publishedSyncTrigger(trigger, fullSync) {
  if (!trigger?.repository) {
    return null
  }

  return fullSync ? { ...trigger, fullSync } : trigger
}

// Whether this sync is a full one. On the command line, --full is enough: whoever runs it holds the .env. The full input
// of the workflow is not: anyone with the dashboard password holds the dispatch token, so once the full sync has a
// password of its own, the run also needs a proof of it, signed for this repository by the page. Without one, the run
// syncs as usual, incrementally: refused, but the deployment goes on.
export async function chooseFullSync({ commandLine, requested, key, proof, repository, now }) {
  if (commandLine || (requested && !key)) {
    return { full: true, refused: false }
  }
  if (!requested) {
    return { full: false, refused: false }
  }
  const proven = Boolean(repository) && (await checkFullSyncProof(proof, key, repository, now))

  return { full: proven, refused: !proven }
}
