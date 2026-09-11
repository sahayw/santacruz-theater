// @ts-check
import { defineConfig } from 'astro/config'

// Local dev runs through `netlify dev` (`npm run dev`), which serves the real
// Netlify Functions — see netlify/functions/data.mjs and upload-image.mjs for
// their `NETLIFY_DEV` local-filesystem mode.
export default defineConfig({
  vite: {
    plugins: [
      {
        // Redirect /admin → /admin/ so the SPA's relative ES module imports
        // (`import './api.js'` etc. in public/admin/index.html) resolve against
        // /admin/ rather than /. Production does this automatically; the Astro
        // dev server that `netlify dev` proxies to does not.
        name: 'admin-trailing-slash',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url === '/admin') {
              res.writeHead(301, { Location: '/admin/' })
              return res.end()
            }
            next()
          })
        }
      }
    ]
  }
})
