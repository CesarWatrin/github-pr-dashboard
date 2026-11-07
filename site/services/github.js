// The GitHub API, with the dispatch token of the stats: the runs of the sync workflow, and starting one.

import { state } from '../model/state.js'

function githubApi(path, options = {}) {
  const { repository, token } = state.stats.syncTrigger

  return fetch(`https://api.github.com/repos/${repository}${path}`, {
    ...options,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    },
  })
}

// The last runs of the workflow, newest first.
export async function recentRuns() {
  const response = await githubApi(`/actions/workflows/${state.stats.syncTrigger.workflow}/runs?per_page=5`)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  return (await response.json()).workflow_runs
}

export async function dispatchSync(full, proof = null) {
  const { workflow, ref } = state.stats.syncTrigger
  const response = await githubApi(`/actions/workflows/${workflow}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ ref, inputs: { full: String(full), ...(proof ? { proof } : {}) } }),
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
}
