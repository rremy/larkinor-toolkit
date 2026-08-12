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

/**
 * Public deployment root, without a trailing slash. Overridden by the
 * `LC_PUBLIC_BASE_URL` environment variable — the GitHub Pages workflow passes
 * the URL it was actually deployed to, so a fork needs no code change. The
 * default matches the upstream Pages deployment.
 *
 * Everything the built userscript needs to reach at runtime derives from this:
 * the data URL (via `__PUBLIC_BASE_URL__`, see src/shared/publicUrl.ts), the
 * `@connect` grant, and the update/download URLs.
 */
const PUBLIC_BASE_URL = (
  process.env.LC_PUBLIC_BASE_URL ?? 'https://rremy.github.io/larkinor-toolkit'
).replace(/\/+$/, '');

const PUBLIC_HOST = new URL(PUBLIC_BASE_URL).hostname;
const REPO_URL = 'https://github.com/rremy/larkinor-toolkit';

export default defineConfig(({ mode }) => ({
  // Build-time constants. Omitted under `test`: the data-version define would
  // break the loader's exact-URL unit test, and src/shared/publicUrl.ts guards
  // the absent identifier with `typeof`.
  define: mode === 'test'
    ? {}
    : {
        __DATA_VERSION__: JSON.stringify(String(Date.now())),
        __PUBLIC_BASE_URL__: JSON.stringify(PUBLIC_BASE_URL),
      },
  resolve: {
    alias: { '@': '/src' },
  },
  plugins: [
    staticAssets(),
    preact(),
    monkey({
      entry: 'src/main.ts',
      userscript: {
        name: 'Larkinor Toolkit',
        namespace: REPO_URL,
        version: '0.1.0',
        author: 'rremy',
        description: 'Mobile-friendly UI and desktop companion dock for the Larkinor browser RPG',
        homepage: REPO_URL,
        supportURL: `${REPO_URL}/issues`,
        match: ['https://larkinor.hu/*', 'https://l2.larkinor.hu/*'],
        grant: [
          'GM_addStyle',
          'GM_getValue',
          'GM_setValue',
          'GM_xmlhttpRequest',
        ],
        // The game host serves images; the public host serves static/db JSON.
        connect: ['l2.larkinor.hu', PUBLIC_HOST, 'localhost', '127.0.0.1'],
        // Lets the userscript manager update itself from the deployed build, so
        // a direct install stays current without the dev loader.
        downloadURL: `${PUBLIC_BASE_URL}/larkinor-ui.user.js`,
        updateURL: `${PUBLIC_BASE_URL}/larkinor-ui.user.js`,
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
}));
