// Where the page reads the published stats, and the time of the server that serves them.

export const DATA_URL = 'data/stats.enc.json'
export const VERSION_URL = 'data/version.json'

// The time a proof of the full sync password is dated with, in seconds: that of the server serving the page (its Date
// header, to the second), which the runner checking the proof shares; the browser's clock, which may be off, only when
// the server does not tell.
export async function serverNow() {
  try {
    const response = await fetch(`${VERSION_URL}?t=${Date.now()}`, { method: 'HEAD', cache: 'no-store' })
    const date = Date.parse(response.headers.get('date'))
    if (Number.isFinite(date)) {
      return Math.floor(date / 1000)
    }
  } catch {
    // Unreachable: the browser's clock.
  }

  return Math.floor(Date.now() / 1000)
}

export async function fetchJson(url, options) {
  const response = await fetch(url, options)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  return response.json()
}
