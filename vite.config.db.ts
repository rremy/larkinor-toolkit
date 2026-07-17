import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import path from 'node:path';

// Standalone DB site build. Kept separate from the vite-plugin-monkey config so
// the two targets never share plugins.
//
// Outputs to dist/ ROOT (not dist/db) so the DB is the site entry point:
//   <host>/larkinor/                    -> dist/index.html (this app)
//   <host>/larkinor/larkinor-ui.user.js -> the userscript (monkey build)
// The userscript build empties dist/ and runs FIRST (see package.json `build`);
// this build must therefore NOT empty dist/ or it would delete the .user.js.
//
// publicDir (static/) is served only in `dev` so the app can fetch its JSON
// locally; in `build` it's disabled — production data ships separately via
// scripts/deploy.sh (static/ -> <host>/larkinor/static/), so copying it into
// dist/ here would just be dead weight.
export default defineConfig(({ command }) => ({
  root: path.resolve(__dirname, 'src/database'),
  base: './',
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  publicDir: command === 'serve' ? path.resolve(__dirname, 'static') : false,
  plugins: [preact()],
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: false,
  },
}));
