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
    ],
  },
});
