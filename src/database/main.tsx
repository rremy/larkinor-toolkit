import { h, render } from 'preact';
import { createDataLoader, httpSource } from '@/shared/data';
import { DatabaseApp, type PrefStore } from './DatabaseApp';
import theme from '@/shared/styles/theme.css?raw';

// In dev, `publicDir` (static/) content is served straight off the server
// root by Vite's own static middleware, so static/db/*.json is reachable at
// /db/*.json — NOT /static/db/*.json (that path 404s through to the SPA
// fallback HTML).
//
// In production the data is deployed alongside the app at `static/db/`, so we
// resolve *relative to the page* rather than hardcoding a mount path. That
// keeps one build working wherever the site is served from — the repository
// subpath on GitHub Pages (`/<repo>/`), or any other prefix on a private host.
const DATA_BASE_URL = import.meta.env.DEV
  ? '/db'
  : new URL('static/db', document.baseURI).href;

const style = document.createElement('style');
style.textContent = theme;
document.head.appendChild(style);

const loader = createDataLoader(httpSource(), DATA_BASE_URL);

// The standalone page has no GM_* storage, but a real browser `localStorage`
// to keep preferences in — e.g. the quest maze's zoom (see PrefStore's doc
// comment in DatabaseApp.tsx for why this is a keyed store rather than a
// dedicated prop).
const prefStore: PrefStore = {
  read: (key) => localStorage.getItem(key),
  write: (key, value) => localStorage.setItem(key, value),
};

render(<DatabaseApp loader={loader} prefStore={prefStore} />, document.getElementById('lc-db-root')!);
