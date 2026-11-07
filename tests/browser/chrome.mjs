// Drives a headless Chrome through the DevTools protocol, with the WebSocket of Node: no dependency. Chrome comes from
// CHROME_PATH, else from where it usually lives (macOS, Linux); without it, browserPath() is null and the tests of the
// page are skipped, except in CI, where they fail.

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
]

export function browserPath() {
  return [process.env.CHROME_PATH, ...CANDIDATES].find((path) => path && existsSync(path)) ?? null
}

// A browser, and one page in it. page.send(method, params) calls the protocol; page.on(event, listener) listens.
export async function launch() {
  const profile = await mkdtemp(join(tmpdir(), 'dashboard-chrome-'))
  const chrome = spawn(
    browserPath(),
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--disable-extensions',
      '--hide-scrollbars',
      '--mute-audio',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  )
  const endpoint = await new Promise((resolve, reject) => {
    let output = ''
    chrome.stderr.on('data', (chunk) => {
      output += chunk
      const match = output.match(/DevTools listening on (ws:\/\/\S+)/)
      if (match) {
        resolve(match[1])
      }
    })
    chrome.on('exit', (code) => reject(new Error(`Chrome exited (${code}): ${output.slice(-500)}`)))
  })
  const { port } = new URL(endpoint)
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json()
  const page = await connect(target.webSocketDebuggerUrl)

  return {
    page,
    async close() {
      page.close()
      chrome.kill()
      await /** @type {Promise<void>} */ (new Promise((resolve) => (chrome.exitCode === null ? chrome.on('exit', () => resolve()) : resolve())))
      await rm(profile, { recursive: true, force: true })
    },
  }
}

async function connect(url) {
  const socket = new WebSocket(url)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let lastId = 0
  const pending = new Map()
  const listeners = new Map()
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data)
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, method } = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) {
        reject(new Error(`${method}: ${message.error.message}`))
      } else {
        resolve(message.result)
      }
    } else if (message.method) {
      for (const listener of listeners.get(message.method) ?? []) {
        listener(message.params)
      }
    }
  })

  const page = {
    send(method, params = {}) {
      const id = ++lastId
      socket.send(JSON.stringify({ id, method, params }))

      return new Promise((resolve, reject) => pending.set(id, { resolve, reject, method }))
    },
    on(method, listener) {
      listeners.set(method, [...(listeners.get(method) ?? []), listener])
    },
    // The value of an expression of the page, awaited when it is a promise.
    async evaluate(expression) {
      const { result, exceptionDetails } = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (exceptionDetails) {
        throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text)
      }

      return result.value
    },
    // Waits until an expression of the page is true.
    async waitFor(expression, timeoutMs = 15_000) {
      const until = Date.now() + timeoutMs
      while (!(await page.evaluate(`Boolean(${expression})`))) {
        if (Date.now() > until) {
          throw new Error(`Timed out waiting for ${expression}`)
        }
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
    },
    close: () => socket.close(),
  }

  return page
}
