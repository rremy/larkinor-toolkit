import { h, render } from 'preact';
import { createDataLoader, httpSource } from '@/shared/data';
import { DatabaseApp } from './DatabaseApp';
import theme from '@/shared/styles/theme.css?raw';

// In dev, `publicDir` (static/) content is served straight off the server
// root by Vite's own static middleware, so static/db/*.json is reachable at
// /db/*.json — NOT /static/db/*.json (that path 404s through to the SPA
// fallback HTML). Production fetches from the deployed static host instead.
const DATA_BASE_URL = import.meta.env.DEV
  ? '/db'
  : 'https://example.invalid/larkinor/static/db';

const style = document.createElement('style');
style.textContent = theme;
document.head.appendChild(style);

const loader = createDataLoader(httpSource(), DATA_BASE_URL);
render(<DatabaseApp loader={loader} />, document.getElementById('lc-db-root')!);
