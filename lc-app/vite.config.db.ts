import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import path from 'node:path';

// Standalone DB site build. Kept separate from the vite-plugin-monkey config so
// the two targets never share plugins. Outputs to dist/db so the userscript
// build (which empties dist/) must run FIRST — see package.json `build`.
export default defineConfig({
  root: path.resolve(__dirname, 'src/database'),
  base: './',
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  publicDir: path.resolve(__dirname, 'static'),
  plugins: [preact()],
  build: {
    outDir: path.resolve(__dirname, 'dist/db'),
    emptyOutDir: true,
  },
});
