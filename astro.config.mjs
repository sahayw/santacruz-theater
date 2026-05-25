// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  vite: {
    plugins: [
      {
        name: 'public-dir-index',
        configureServer(server) {
          server.middlewares.use((req, _res, next) => {
            if (req.url === '/admin' || req.url === '/admin/') {
              req.url = '/admin/index.html';
            }
            next();
          });
        },
      },
      {
        // Dev-mode mirror of the /.netlify/functions/fetch-page Netlify Function,
        // so the admin editor's "Fetch description" button works without netlify dev.
        name: 'fetch-page-dev-proxy',
        configureServer(server) {
          server.middlewares.use('/.netlify/functions/fetch-page', async (req, res) => {
            const qs = req.url?.split('?')[1] ?? '';
            const urlParam = new URLSearchParams(qs).get('url');
            if (!urlParam) {
              res.statusCode = 400;
              return res.end('Missing url parameter');
            }
            let parsed;
            try { parsed = new URL(urlParam); } catch {
              res.statusCode = 400;
              return res.end('Invalid URL');
            }
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
              res.statusCode = 400;
              return res.end('Only http/https URLs are supported');
            }
            try {
              const upstream = await fetch(urlParam, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SCTheaterAdmin/1.0)', 'Accept': 'text/html' },
                signal: AbortSignal.timeout(8000),
                redirect: 'follow',
              });
              const html = await upstream.text();
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.statusCode = upstream.status;
              res.end(html);
            } catch (e) {
              res.statusCode = 502;
              res.end(`Fetch failed: ${e.message}`);
            }
          });
        },
      },
    ],
  },
});
