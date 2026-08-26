// Serves ./out under the production basePath, so the deployed paths are the
// paths you test. No dependencies — node's own http server.
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname, normalize } from 'node:path'

const basePath = process.env.BASE_PATH ?? '/izin-cuti'
const root = new URL('../out/', import.meta.url).pathname
const port = Number(process.env.PORT ?? 4321)

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
}

/**
 * A URL path is percent-encoded and a file path is not.
 *
 * The route directory Next writes for `app/[locale]` is literally `[locale]`,
 * and a browser asks for it as `%5Blocale%5D`. GitHub Pages decodes that; this
 * server did not, so every chunk under a dynamic segment 404'd — which is the
 * whole fill screen, on the one command CLAUDE.md names as the check to run
 * before pushing.
 *
 * Decoding happens before `normalize`, so an encoded `%2e%2e` becomes `..` in
 * time for it to be collapsed, and the `startsWith(root)` guard below still
 * has the last word.
 */
async function resolve(encoded) {
  let pathname
  try {
    pathname = decodeURIComponent(encoded)
  } catch {
    return null // a malformed escape is not a file
  }
  const candidates = [pathname, join(pathname, 'index.html'), `${pathname}.html`]
  for (const c of candidates) {
    const file = join(root, normalize(c))
    if (!file.startsWith(root)) continue
    try {
      const s = await stat(file)
      if (s.isFile()) return file
    } catch {
      /* try the next candidate */
    }
  }
  return null
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (url.pathname === '/' || url.pathname === basePath) {
    res.writeHead(302, { Location: `${basePath}/` })
    return res.end()
  }
  if (!url.pathname.startsWith(basePath)) {
    res.writeHead(404, { 'content-type': 'text/plain' })
    return res.end('404 — outside basePath ' + basePath)
  }
  const file = await resolve(url.pathname.slice(basePath.length) || '/')
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain' })
    return res.end('404')
  }
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' })
  res.end(await readFile(file))
}).listen(port, () => {
  console.log(`out/ served at http://localhost:${port}${basePath}/`)
})
