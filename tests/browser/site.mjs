// A copy of the page to test, in a temporary folder: the files of site/ linked, and stats of the test's own published
// in data/, encrypted as the sync does (scripts/sync/publish.mjs) with a test password. Served on a free port.

import { createCipheriv, createHash, pbkdf2Sync, randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

import { serve } from '../../scripts/serve.mjs'

export const TEST_PASSWORD = 'test-password'
// Far fewer than the sync's: the page reads them from the file, and unlocking stays quick.
const TEST_ITERATIONS = 1000

export function encryptStats(stats, password = TEST_PASSWORD) {
  const salt = createHash('sha256').update(`github-pr-dashboard:${stats.org}`).digest().subarray(0, 16)
  const key = pbkdf2Sync(password, salt, TEST_ITERATIONS, 32, 'sha256')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(gzipSync(JSON.stringify(stats))), cipher.final(), cipher.getAuthTag()])

  return { iterations: TEST_ITERATIONS, salt: salt.toString('base64'), iv: iv.toString('base64'), data: data.toString('base64') }
}

// Serves `source` (site/ by default) with these stats; resolves with its address and a way to stop.
export async function serveSite(stats, { source = join(import.meta.dirname, '..', '..', 'site') } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dashboard-site-'))
  for (const entry of await readdir(source)) {
    if (entry !== 'data') {
      await symlink(resolve(source, entry), join(root, entry))
    }
  }
  await mkdir(join(root, 'data'))
  await writeFile(join(root, 'data', 'stats.enc.json'), JSON.stringify(encryptStats(stats)))
  await writeFile(join(root, 'data', 'version.json'), JSON.stringify({ build: null, generatedAt: stats.generatedAt }))
  const server = await serve(root, 0)

  return {
    url: `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}/`,
    async close() {
      // The browser keeps its connections open: closed with the server, or the server would wait for them.
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
      await rm(root, { recursive: true, force: true })
    },
  }
}
