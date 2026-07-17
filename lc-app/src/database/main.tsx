import { h, render } from 'preact';
import { createDataLoader, httpSource } from '@/shared/data';
import { DatabaseApp } from './DatabaseApp';
import theme from '@/shared/styles/theme.css?raw';

// In dev, `publicDir` (static/) content is served straight off the server
// root by Vite's own static middleware, so static/db/*.json is reachable at
// /db/*.json — NOT /static/db/*.json (that path 404s through to the SPA
// fallback HTML). In production the DB is served at <host>/larkinor/ and its
// data is deployed alongside at <host>/larkinor/static/db/ (same origin), so a
// plain fetch of that absolute path works regardless of domain.
const DATA_BASE_URL = import.meta.env.DEV
  ? '/db'
  : '/larkinor/static/db';

const style = document.createElement('style');
style.textContent = theme;
document.head.appendChild(style);

const loader = createDataLoader(httpSource(), DATA_BASE_URL);
render(<DatabaseApp loader={loader} />, document.getElementById('lc-db-root')!);
