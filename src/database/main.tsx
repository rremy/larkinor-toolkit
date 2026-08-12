import { h, render } from 'preact';
import { createDataLoader, httpSource } from '@/shared/data';
import { DatabaseApp } from './DatabaseApp';
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
render(<DatabaseApp loader={loader} />, document.getElementById('lc-db-root')!);
