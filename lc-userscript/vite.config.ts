import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import monkey from 'vite-plugin-monkey';

export default defineConfig({
  resolve: {
    alias: { '@': '/src' },
  },
  plugins: [
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
        connect: ['l2.larkinor.hu'],
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
