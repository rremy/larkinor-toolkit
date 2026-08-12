/**
 * Where the deployed site lives, and the data URLs derived from it.
 *
 * The base URL is injected at build time from the `LC_PUBLIC_BASE_URL`
 * environment variable (see `vite.config.ts`) rather than written into source,
 * so that:
 *   - the GitHub Pages workflow can pass its own URL, whoever owns the fork;
 *   - a private deployment can point elsewhere without editing code;
 *   - no personal host is committed to the repository.
 *
 * Absent the define (unit tests), the guard below yields an empty string —
 * `typeof` on an undeclared identifier is safe, unlike reading it.
 */
declare const __PUBLIC_BASE_URL__: string | undefined;

/** Deployment root, without a trailing slash. Empty in tests. */
export const PUBLIC_BASE_URL =
  typeof __PUBLIC_BASE_URL__ === 'string' ? __PUBLIC_BASE_URL__ : '';

/**
 * Where the userscript fetches `static/db/*.json` from.
 *
 * The path is `static/db` in both dev and production — only the origin differs.
 * Under `npm run dev` the folder is served by the Vite dev server (see the
 * `lc-static-assets` plugin in `vite.config.ts`), so we resolve against this
 * module's own URL; in a production build the dead dev branch is stripped and
 * we fetch from the deployment host over `GM_xmlhttpRequest`.
 */
export const USERSCRIPT_DATA_BASE_URL = import.meta.env.DEV
  ? new URL('/static/db', import.meta.url).href
  : `${PUBLIC_BASE_URL}/static/db`;
