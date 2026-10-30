// Serves the static site locally, without caching so that a new sync shows up on the next poll.

import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

const ROOT = 'site'
const PORT = Number(process.env.PORT ?? 4173)

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
}

createServer(async (request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url, 'http://localhost').pathname))
  const file = join(ROOT, path.endsWith('/') ? `${path}index.html` : path)
  try {
    const body = await readFile(file)
    response.writeHead(200, {
      'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    })
    response.end(body)
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Not found')
  }
}).listen(PORT, () => console.log(`Dashboard available on http://localhost:${PORT}`))
