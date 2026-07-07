import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import monkey from 'vite-plugin-monkey';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Serves the repo `static/` folder at `/static/*` during `npm run dev`, so the
 * code can fetch its DB assets from the dev server instead of the remote host.
 * In production the `static/` folder is deployed to `/larkinor/static/` by
 * `scripts/deploy.sh` (a dedicated scp), so no build-time copy is needed.
 */
function staticAssets(): Plugin {
  const root = process.cwd();
  return {
    name: 'lc-static-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (!url.startsWith('/static/')) return next();
        const filePath = path.join(root, url);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          if (filePath.endsWith('.json')) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
          }
          res.setHeader('Access-Control-Allow-Origin', '*');
          fs.createReadStream(filePath).pipe(res);
          return;
        }
        res.statusCode = 404;
        res.end('Not found');
      });
    },
  };
}

export default defineConfig({
  resolve: {
    alias: { '@': '/src' },
  },
  plugins: [
    staticAssets(),
    preact(),
    monkey({
      entry: 'src/main.ts',
      userscript: {
        name: 'Larkinor UI',
        namespace: 'https://lcenter.local/',
        version: '0.1.0',
        description: 'Mobile-friendly UI for Larkinor browser RPG',
        match: ['https://larkinor.hu/*', 'https://l2.larkinor.hu/*'],
        grant: [
          'GM_addStyle',
          'GM_getValue',
          'GM_setValue',
          'GM_xmlhttpRequest',
        ],
        connect: ['l2.larkinor.hu', 'example.invalid', 'localhost', '127.0.0.1'],
        'run-at': 'document-end',
      },
      build: {
        fileName: 'larkinor-ui.user.js',
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    globals: true,
  },
});
