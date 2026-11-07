// Serves the static site locally, without caching so that a new sync shows up on the next poll. Also used by the tests
// of the page, on a folder of their own.

import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
}

// Starts serving `root` on `port` (0 for any free one); resolves with the server once it listens.
export function serve(root, port) {
  const server = createServer(async (request, response) => {
    const path = normalize(decodeURIComponent(new URL(request.url, 'http://localhost').pathname))
    const file = join(root, path.endsWith('/') ? `${path}index.html` : path)
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
  })

  return new Promise((resolve) => server.listen(port, () => resolve(server)))
}

if (import.meta.main) {
  const server = await serve('site', Number(process.env.PORT ?? 4173))
  console.log(`Dashboard available on http://localhost:${server.address().port}`)
}
