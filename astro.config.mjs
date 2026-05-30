// @ts-check
import { defineConfig } from 'astro/config'
import fs from 'node:fs'
import path from 'node:path'

export default defineConfig({
  vite: {
    plugins: [
      {
        name: 'public-dir-index',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url === '/admin') {
              // Redirect to trailing-slash URL so relative ES module imports
              // resolve to /admin/api.js etc. rather than /api.js.
              res.writeHead(302, { Location: '/admin/' })
              return res.end()
            }
            if (req.url === '/admin/') {
              req.url = '/admin/index.html'
            }
            next()
          })
        }
      },
      {
        // Serve public/admin/*.js as static files before Vite's transform
        // pipeline intercepts them. Vite's transform looks in src/, not public/,
        // so module imports from the admin SPA would 404 without this.
        name: 'public-admin-modules',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            const url = req.url?.split('?')[0]
            if (!url?.startsWith('/admin/') || !url.endsWith('.js')) return next()
            const absPath = path.join(process.cwd(), 'public', url)
            const safeRoot = path.join(process.cwd(), 'public', 'admin') + path.sep
            if (!path.resolve(absPath).startsWith(safeRoot)) return next()
            try {
              const content = fs.readFileSync(absPath, 'utf-8')
              res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
              return res.end(content)
            } catch {
              return next()
            }
          })
        }
      },
      {
        // Dev-mode mirror of /.netlify/functions/data — reads/writes local data/ files.
        // In production the real Netlify Function commits via GitHub API.
        name: 'data-dev-proxy',
        configureServer(server) {
          server.middlewares.use('/.netlify/functions/data', (req, res) => {
            const qs = req.url?.split('?')[1] ?? ''
            const params = new URLSearchParams(qs)

            // ── directory listing ──
            if (params.get('dir') === 'shows') {
              try {
                const showsDir = path.join(process.cwd(), 'data', 'shows')
                const result = []
                for (const yearEntry of fs.readdirSync(showsDir, { withFileTypes: true })) {
                  if (!yearEntry.isDirectory()) continue
                  const year = parseInt(yearEntry.name, 10)
                  if (!year) continue
                  const yearPath = path.join(showsDir, yearEntry.name)
                  for (const file of fs.readdirSync(yearPath)) {
                    const m = file.match(/^(.+)-(\d{4})\.json$/)
                    if (m) result.push({ companyId: m[1], year: parseInt(m[2], 10) })
                  }
                }
                res.setHeader('Content-Type', 'application/json')
                return res.end(JSON.stringify(result))
              } catch (e) {
                res.statusCode = 500
                return res.end('Directory listing failed')
              }
            }

            const fileParam = params.get('file')
            if (!fileParam || !/^[\w-]+(\/[\w-]+)*\.json$/.test(fileParam)) {
              res.statusCode = 400
              return res.end('Invalid or missing file parameter')
            }
            const dataDir = path.join(process.cwd(), 'data')
            const filePath = path.resolve(dataDir, fileParam)
            if (!filePath.startsWith(dataDir + path.sep)) {
              res.statusCode = 403
              return res.end('Forbidden')
            }
            if (req.method === 'GET') {
              try {
                const content = fs.readFileSync(filePath, 'utf-8')
                res.setHeader('Content-Type', 'application/json')
                res.end(content)
              } catch {
                res.statusCode = 404
                res.end('Not found')
              }
            } else if (req.method === 'PUT') {
              let body = ''
              req.on('data', (chunk) => {
                body += chunk
              })
              req.on('end', () => {
                try {
                  JSON.parse(body)
                  fs.mkdirSync(path.dirname(filePath), { recursive: true })
                  fs.writeFileSync(filePath, body, 'utf-8')
                  res.statusCode = 200
                  res.end('OK')
                } catch (e) {
                  res.statusCode = 400
                  res.end('Invalid JSON')
                }
              })
            } else {
              res.statusCode = 405
              res.end('Method not allowed')
            }
          })
        }
      },
      {
        // so the admin editor's "Fetch description" button works without netlify dev.
        name: 'fetch-page-dev-proxy',
        configureServer(server) {
          server.middlewares.use('/.netlify/functions/fetch-page', async (req, res) => {
            const qs = req.url?.split('?')[1] ?? ''
            const urlParam = new URLSearchParams(qs).get('url')
            if (!urlParam) {
              res.statusCode = 400
              return res.end('Missing url parameter')
            }
            let parsed
            try {
              parsed = new URL(urlParam)
            } catch {
              res.statusCode = 400
              return res.end('Invalid URL')
            }
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
              res.statusCode = 400
              return res.end('Only http/https URLs are supported')
            }
            try {
              const upstream = await fetch(urlParam, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (compatible; SCTheaterAdmin/1.0)',
                  'Accept': 'text/html'
                },
                signal: AbortSignal.timeout(8000),
                redirect: 'follow'
              })
              const html = await upstream.text()
              res.setHeader('Content-Type', 'text/html; charset=utf-8')
              res.statusCode = upstream.status
              res.end(html)
            } catch (e) {
              res.statusCode = 502
              res.end(`Fetch failed: ${e.message}`)
            }
          })
        }
      }
    ]
  }
})
